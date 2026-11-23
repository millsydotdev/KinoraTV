//! Encrypted credential storage for external metadata providers (TMDB, TVDB).
//!
//! Stores API keys and optional subscriber PINs in `<app data>/sources/.metadata.vault`
//! with `0700` directory / `0600` file permissions using PBKDF2-HMAC-SHA256 key derivation
//! and AES-256-GCM authenticated encryption. Credentials are never logged or echoed in errors.

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use openssl::hash::MessageDigest;
use openssl::pkcs5::pbkdf2_hmac;
use openssl::rand::rand_bytes;
use openssl::symm::{decrypt_aead, encrypt_aead, Cipher};
use serde::{Deserialize, Serialize};

use crate::ingest::{ErrorCode, IngestError};
use crate::sources;

const VAULT_FILE: &str = ".metadata.vault";
const SALT_FILE: &str = ".metadata.salt";
const VAULT_VERSION: u32 = 1;
const VAULT_ITERATIONS: usize = 100_000;
const NONCE_LEN: usize = 12;
const TAG_LEN: usize = 16;
const AAD_BYTES: &[u8] = b"kinora-metadata-credentials-v1";

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MetadataCredentials {
    #[serde(default)]
    pub tmdb_api_key: String,
    #[serde(default)]
    pub tvdb_api_key: String,
    #[serde(default)]
    pub tvdb_pin: String,
}

#[derive(Serialize, Deserialize)]
struct VaultPayload {
    version: u32,
    nonce: String,
    ciphertext: String,
    tag: String,
}

fn hex_encode(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

fn hex_decode(s: &str) -> Result<Vec<u8>, &'static str> {
    if !s.len().is_multiple_of(2) {
        return Err("Hex string length must be even");
    }
    (0..s.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&s[i..i + 2], 16).map_err(|_| "Invalid hex digit"))
        .collect()
}

fn get_machine_identifier() -> Vec<u8> {
    for path in ["/etc/machine-id", "/var/lib/dbus/machine-id"] {
        if let Ok(content) = fs::read_to_string(path) {
            let trimmed = content.trim();
            if !trimmed.is_empty() {
                return trimmed.as_bytes().to_vec();
            }
        }
    }
    let user = std::env::var("USER")
        .or_else(|_| std::env::var("USERNAME"))
        .unwrap_or_else(|_| "kinora-user".into());
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .unwrap_or_else(|_| "kinora-home".into());
    format!("kinora-meta-machine-{user}-{home}").into_bytes()
}

fn get_or_create_salt(dir: &Path) -> Result<Vec<u8>, IngestError> {
    let salt_path = dir.join(SALT_FILE);
    if let Ok(raw) = fs::read_to_string(&salt_path) {
        if let Ok(decoded) = hex_decode(raw.trim()) {
            if decoded.len() == 32 {
                return Ok(decoded);
            }
        }
    }
    let mut salt = [0u8; 32];
    rand_bytes(&mut salt).map_err(|_| {
        IngestError::new(
            ErrorCode::Network,
            "Failed to generate random salt for metadata credentials vault.",
        )
    })?;
    let hex = hex_encode(&salt);
    let _ = fs::create_dir_all(dir);
    #[cfg(unix)]
    let _ = sources::private(dir, 0o700);
    sources::write_atomically(dir, SALT_FILE, hex.as_bytes()).map_err(|_| {
        IngestError::new(
            ErrorCode::Network,
            "Failed to persist metadata credentials salt.",
        )
    })?;
    Ok(salt.to_vec())
}

fn derive_key(dir: &Path) -> Result<[u8; 32], IngestError> {
    let machine_id = get_machine_identifier();
    let salt = get_or_create_salt(dir)?;
    let mut key = [0u8; 32];
    pbkdf2_hmac(
        &machine_id,
        &salt,
        VAULT_ITERATIONS,
        MessageDigest::sha256(),
        &mut key,
    )
    .map_err(|_| {
        IngestError::new(
            ErrorCode::Network,
            "Failed to derive metadata encryption key.",
        )
    })?;
    Ok(key)
}

pub struct MetadataVault {
    dir: Option<PathBuf>,
    cached: Mutex<Option<MetadataCredentials>>,
}

impl MetadataVault {
    pub fn new(app_dir: Option<PathBuf>) -> Self {
        let dir = app_dir.map(|d| d.join("sources"));
        if let Some(ref path) = dir {
            let _ = fs::create_dir_all(path);
            #[cfg(unix)]
            let _ = sources::private(path, 0o700);
        }
        Self {
            dir,
            cached: Mutex::new(None),
        }
    }

    pub fn load(&self) -> MetadataCredentials {
        {
            let guard = self.cached.lock().unwrap_or_else(|p| p.into_inner());
            if let Some(ref c) = *guard {
                return c.clone();
            }
        }
        let Some(ref dir) = self.dir else {
            return MetadataCredentials::default();
        };
        let path = dir.join(VAULT_FILE);
        let Ok(raw) = fs::read_to_string(&path) else {
            return MetadataCredentials::default();
        };
        let Ok(payload) = serde_json::from_str::<VaultPayload>(&raw) else {
            return MetadataCredentials::default();
        };
        if payload.version != VAULT_VERSION {
            return MetadataCredentials::default();
        }
        let Ok(key) = derive_key(dir) else {
            return MetadataCredentials::default();
        };
        let (Ok(nonce), Ok(ciphertext), Ok(tag)) = (
            hex_decode(&payload.nonce),
            hex_decode(&payload.ciphertext),
            hex_decode(&payload.tag),
        ) else {
            return MetadataCredentials::default();
        };
        if nonce.len() != NONCE_LEN || tag.len() != TAG_LEN {
            return MetadataCredentials::default();
        }
        let Ok(plaintext) = decrypt_aead(
            Cipher::aes_256_gcm(),
            &key,
            Some(&nonce),
            AAD_BYTES,
            &ciphertext,
            &tag,
        ) else {
            return MetadataCredentials::default();
        };
        let creds = serde_json::from_slice::<MetadataCredentials>(&plaintext).unwrap_or_default();
        let mut guard = self.cached.lock().unwrap_or_else(|p| p.into_inner());
        *guard = Some(creds.clone());
        creds
    }

    pub fn save(&self, creds: MetadataCredentials) -> Result<(), IngestError> {
        let clean = MetadataCredentials {
            tmdb_api_key: creds.tmdb_api_key.trim().to_string(),
            tvdb_api_key: creds.tvdb_api_key.trim().to_string(),
            tvdb_pin: creds.tvdb_pin.trim().to_string(),
        };
        if let Some(ref dir) = self.dir {
            let _ = fs::create_dir_all(dir);
            #[cfg(unix)]
            let _ = sources::private(dir, 0o700);
            let key = derive_key(dir)?;
            let mut nonce = [0u8; NONCE_LEN];
            rand_bytes(&mut nonce).map_err(|_| {
                IngestError::new(
                    ErrorCode::Network,
                    "Failed to generate encryption nonce.",
                )
            })?;
            let plaintext = serde_json::to_vec(&clean).map_err(|_| {
                IngestError::new(ErrorCode::NotCatalogue, "Metadata credential encoding failed.")
            })?;
            let mut tag = [0u8; TAG_LEN];
            let ciphertext = encrypt_aead(
                Cipher::aes_256_gcm(),
                &key,
                Some(&nonce),
                AAD_BYTES,
                &plaintext,
                &mut tag,
            )
            .map_err(|_| {
                IngestError::new(ErrorCode::Network, "Failed to encrypt metadata credentials.")
            })?;
            let payload = VaultPayload {
                version: VAULT_VERSION,
                nonce: hex_encode(&nonce),
                ciphertext: hex_encode(&ciphertext),
                tag: hex_encode(&tag),
            };
            let encoded = serde_json::to_vec_pretty(&payload).map_err(|_| {
                IngestError::new(ErrorCode::NotCatalogue, "Vault encoding failed.")
            })?;
            sources::write_atomically(dir, VAULT_FILE, &encoded).map_err(|_| {
                IngestError::new(ErrorCode::Network, "Failed to write metadata vault.")
            })?;
        }
        let mut guard = self.cached.lock().unwrap_or_else(|p| p.into_inner());
        *guard = Some(clean);
        Ok(())
    }

    pub fn clear(&self) {
        if let Some(ref dir) = self.dir {
            let _ = fs::remove_file(dir.join(VAULT_FILE));
        }
        let mut guard = self.cached.lock().unwrap_or_else(|p| p.into_inner());
        *guard = Some(MetadataCredentials::default());
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(label: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "kinora-meta-vault-{label}-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn metadata_vault_roundtrip_and_clear() {
        let dir = temp_dir("roundtrip");
        let vault = MetadataVault::new(Some(dir.clone()));
        assert_eq!(vault.load(), MetadataCredentials::default());

        let creds = MetadataCredentials {
            tmdb_api_key: "tmdb-secret-123".into(),
            tvdb_api_key: "tvdb-secret-456".into(),
            tvdb_pin: "pin-789".into(),
        };
        vault.save(creds.clone()).unwrap();

        // Read with a fresh instance (simulates app restart)
        let fresh = MetadataVault::new(Some(dir.clone()));
        assert_eq!(fresh.load(), creds);

        // Verify file on disk does not contain plaintext key
        let raw = fs::read_to_string(dir.join("sources").join(VAULT_FILE)).unwrap();
        assert!(!raw.contains("tmdb-secret-123"));
        assert!(!raw.contains("tvdb-secret-456"));

        fresh.clear();
        let after_clear = MetadataVault::new(Some(dir.clone()));
        assert_eq!(after_clear.load(), MetadataCredentials::default());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn metadata_vault_tamper_fails_safely() {
        let dir = temp_dir("tamper");
        let vault = MetadataVault::new(Some(dir.clone()));
        vault
            .save(MetadataCredentials {
                tmdb_api_key: "valid-key".into(),
                ..Default::default()
            })
            .unwrap();

        let vault_path = dir.join("sources").join(VAULT_FILE);
        let tampered = fs::read_to_string(&vault_path)
            .unwrap()
            .replace("\"version\": 1", "\"version\": 1")
            .replace('a', "b");
        fs::write(&vault_path, tampered).unwrap();

        let fresh = MetadataVault::new(Some(dir.clone()));
        assert_eq!(fresh.load(), MetadataCredentials::default());
        let _ = fs::remove_dir_all(&dir);
    }
}
