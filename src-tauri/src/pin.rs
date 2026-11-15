// Parental PIN cryptographic hashing and verification using PKCS#5 PBKDF2-HMAC-SHA256.
// Replaces single-round SHA-256 with a deliberately expensive, salted key derivation
// function (100,000 iterations) to resist offline dictionary and brute-force attacks.

use openssl::hash::MessageDigest;
use openssl::memcmp::eq as constant_time_eq;
use openssl::pkcs5::pbkdf2_hmac;
use openssl::rand::rand_bytes;
use serde::{Deserialize, Serialize};

/// Number of PBKDF2-HMAC-SHA256 iterations.
/// 100,000 iterations provides robust resistance against brute-force searches on 4-digit PINs
/// while executing in ~50ms on modern CPUs, maintaining responsive UI interaction.
pub const PBKDF2_ITERATIONS: usize = 100_000;

/// Length of the cryptographic salt in bytes.
pub const SALT_LEN_BYTES: usize = 16;

/// Length of the derived key output in bytes.
pub const KEY_LEN_BYTES: usize = 32;

/// Validates that a candidate PIN is strictly four ASCII decimal digits.
pub fn validate_pin_format(pin: &str) -> Result<(), &'static str> {
    if pin.len() != 4 || !pin.chars().all(|c| c.is_ascii_digit()) {
        return Err("Parental PIN must consist of exactly four decimal digits (0000-9999)");
    }
    Ok(())
}

/// Persistent, versioned record of a parental PIN hash.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct StoredPin {
    pub algorithm: String,
    pub salt: String,
    pub hash: String,
    pub iterations: u32,
    pub version: u32,
}

/// Result returned from verification, indicating match success and optional upgraded hash.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct VerifyPinResponse {
    pub valid: bool,
    pub upgraded_pin: Option<StoredPin>,
}

/// Derives a PBKDF2-HMAC-SHA256 key from a 4-digit PIN and salt.
fn derive_key(pin: &str, salt: &[u8], iterations: usize) -> Result<[u8; KEY_LEN_BYTES], String> {
    let mut key = [0u8; KEY_LEN_BYTES];
    pbkdf2_hmac(
        pin.as_bytes(),
        salt,
        iterations,
        MessageDigest::sha256(),
        &mut key,
    )
    .map_err(|e| format!("PBKDF2 key derivation failed: {e}"))?;
    Ok(key)
}

/// Generates a new StoredPin with a cryptographically secure random salt and PBKDF2 derivation.
pub fn hash_pin(pin: &str) -> Result<StoredPin, String> {
    validate_pin_format(pin)?;

    let mut salt_bytes = [0u8; SALT_LEN_BYTES];
    rand_bytes(&mut salt_bytes)
        .map_err(|e| format!("Cryptographic random salt generation failed: {e}"))?;

    let derived_key = derive_key(pin, &salt_bytes, PBKDF2_ITERATIONS)?;

    Ok(StoredPin {
        algorithm: "pbkdf2-sha256".to_string(),
        salt: hex_encode(&salt_bytes),
        hash: hex_encode(&derived_key),
        iterations: PBKDF2_ITERATIONS as u32,
        version: 2,
    })
}

/// Verifies a candidate PIN against a stored PIN value.
/// Automatically handles legacy Version 1 (single-round salted SHA-256) and plaintext PIN migration.
pub fn verify_pin(
    candidate: &str,
    stored_val: &serde_json::Value,
) -> Result<VerifyPinResponse, String> {
    validate_pin_format(candidate)?;

    // Case 1: Stored representation is a structured JSON object
    if let Ok(stored) = serde_json::from_value::<StoredPin>(stored_val.clone()) {
        if stored.version == 2 && stored.algorithm == "pbkdf2-sha256" {
            let salt_bytes = hex_decode(&stored.salt)
                .map_err(|_| "Malformed salt in stored PIN record".to_string())?;
            let expected_hash_bytes = hex_decode(&stored.hash)
                .map_err(|_| "Malformed hash in stored PIN record".to_string())?;

            if salt_bytes.len() != SALT_LEN_BYTES || expected_hash_bytes.len() != KEY_LEN_BYTES {
                return Err("Invalid stored PIN cryptographic parameters".to_string());
            }

            let candidate_key = derive_key(candidate, &salt_bytes, stored.iterations as usize)?;
            let valid = constant_time_eq(&candidate_key, &expected_hash_bytes);

            return Ok(VerifyPinResponse {
                valid,
                upgraded_pin: None,
            });
        }
    }

    // Case 2: Legacy Version 1 salted SHA-256 object ({ salt, hash, version: 1 })
    if let Some(obj) = stored_val.as_object() {
        if obj.get("version").and_then(|v| v.as_u64()) == Some(1) {
            let legacy_salt = obj.get("salt").and_then(|s| s.as_str()).unwrap_or("");
            let legacy_hash = obj.get("hash").and_then(|h| h.as_str()).unwrap_or("");

            let candidate_legacy_hash = compute_legacy_sha256(legacy_salt, candidate);
            let valid = constant_time_eq(candidate_legacy_hash.as_bytes(), legacy_hash.as_bytes());

            if valid {
                // Automatically upgrade to PBKDF2 Version 2 on successful authentication
                let upgraded = hash_pin(candidate)?;
                return Ok(VerifyPinResponse {
                    valid: true,
                    upgraded_pin: Some(upgraded),
                });
            } else {
                return Ok(VerifyPinResponse {
                    valid: false,
                    upgraded_pin: None,
                });
            }
        }
    }

    // Case 3: Legacy plaintext PIN string
    if let Some(plaintext) = stored_val.as_str() {
        let valid = constant_time_eq(candidate.as_bytes(), plaintext.as_bytes());
        if valid {
            let upgraded = hash_pin(candidate)?;
            return Ok(VerifyPinResponse {
                valid: true,
                upgraded_pin: Some(upgraded),
            });
        } else {
            return Ok(VerifyPinResponse {
                valid: false,
                upgraded_pin: None,
            });
        }
    }

    Err("Unrecognized or missing stored PIN structure".to_string())
}

/// Computes legacy Version 1 single-round salted SHA-256 for backward compatibility.
fn compute_legacy_sha256(salt: &str, pin: &str) -> String {
    use openssl::hash::hash;
    let input = format!("kinora:{salt}:{pin}");
    let digest =
        hash(MessageDigest::sha256(), input.as_bytes()).expect("SHA-256 computation failed");
    hex_encode(&digest)
}

fn hex_encode(data: &[u8]) -> String {
    let mut s = String::with_capacity(data.len() * 2);
    for b in data {
        s.push_str(&format!("{b:02x}"));
    }
    s
}

fn hex_decode(s: &str) -> Result<Vec<u8>, ()> {
    if !s.len().is_multiple_of(2) {
        return Err(());
    }
    (0..s.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&s[i..i + 2], 16).map_err(|_| ()))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_four_digit_format_strictly() {
        assert!(validate_pin_format("1234").is_ok());
        assert!(validate_pin_format("0000").is_ok());
        assert!(validate_pin_format("9999").is_ok());

        assert!(validate_pin_format("123").is_err());
        assert!(validate_pin_format("12345").is_err());
        assert!(validate_pin_format("12a4").is_err());
        assert!(validate_pin_format("").is_err());
        assert!(validate_pin_format("    ").is_err());
        assert!(validate_pin_format("12-4").is_err());
    }

    #[test]
    fn derives_and_verifies_pbkdf2_pin() {
        let pin = "4826";
        let stored = hash_pin(pin).expect("Failed to hash PIN");

        assert_eq!(stored.version, 2);
        assert_eq!(stored.algorithm, "pbkdf2-sha256");
        assert_eq!(stored.iterations, PBKDF2_ITERATIONS as u32);
        assert_eq!(stored.salt.len(), SALT_LEN_BYTES * 2);
        assert_eq!(stored.hash.len(), KEY_LEN_BYTES * 2);

        let stored_json = serde_json::to_value(&stored).expect("JSON serialize failed");

        // Valid candidate verifies successfully
        let res_good = verify_pin(pin, &stored_json).expect("Verify failed");
        assert!(res_good.valid);
        assert!(res_good.upgraded_pin.is_none());

        // Incorrect candidate fails
        let res_bad = verify_pin("9999", &stored_json).expect("Verify failed");
        assert!(!res_bad.valid);
        assert!(res_bad.upgraded_pin.is_none());
    }

    #[test]
    fn random_salts_produce_distinct_hashes_for_same_pin() {
        let pin = "1234";
        let stored1 = hash_pin(pin).unwrap();
        let stored2 = hash_pin(pin).unwrap();

        assert_ne!(stored1.salt, stored2.salt);
        assert_ne!(stored1.hash, stored2.hash);

        let json1 = serde_json::to_value(&stored1).unwrap();
        let json2 = serde_json::to_value(&stored2).unwrap();

        assert!(verify_pin(pin, &json1).unwrap().valid);
        assert!(verify_pin(pin, &json2).unwrap().valid);
    }

    #[test]
    fn migrates_legacy_version_1_salted_sha256_safely() {
        let pin = "5678";
        let salt = "a1b2c3d4e5f607182930415263748596";
        let legacy_hash = compute_legacy_sha256(salt, pin);

        let legacy_record = serde_json::json!({
            "salt": salt,
            "hash": legacy_hash,
            "version": 1
        });

        // Verification of legacy record succeeds AND returns an upgraded PBKDF2 hash
        let result = verify_pin(pin, &legacy_record).expect("Migration verify failed");
        assert!(result.valid);
        assert!(result.upgraded_pin.is_some());

        let upgraded = result.upgraded_pin.unwrap();
        assert_eq!(upgraded.version, 2);
        assert_eq!(upgraded.algorithm, "pbkdf2-sha256");

        // The upgraded hash now independently verifies with the same PIN
        let upgraded_json = serde_json::to_value(&upgraded).unwrap();
        let res2 = verify_pin(pin, &upgraded_json).unwrap();
        assert!(res2.valid);
        assert!(res2.upgraded_pin.is_none());

        // Wrong PIN against legacy record fails without upgrading
        let bad_result = verify_pin("0000", &legacy_record).unwrap();
        assert!(!bad_result.valid);
        assert!(bad_result.upgraded_pin.is_none());
    }

    #[test]
    fn migrates_legacy_plaintext_pin_safely() {
        let pin = "9012";
        let plaintext_val = serde_json::Value::String(pin.to_string());

        let result = verify_pin(pin, &plaintext_val).expect("Plaintext migration failed");
        assert!(result.valid);
        assert!(result.upgraded_pin.is_some());

        let upgraded = result.upgraded_pin.unwrap();
        assert_eq!(upgraded.version, 2);
        assert_eq!(upgraded.algorithm, "pbkdf2-sha256");

        let upgraded_json = serde_json::to_value(&upgraded).unwrap();
        assert!(verify_pin(pin, &upgraded_json).unwrap().valid);
    }

    #[test]
    fn malformed_stored_record_fails_safely_without_panic() {
        let malformed = serde_json::json!({
            "algorithm": "pbkdf2-sha256",
            "salt": "invalid-hex",
            "hash": "invalid-hex",
            "iterations": 100000,
            "version": 2
        });

        assert!(verify_pin("1234", &malformed).is_err());
    }
}
