//! Holds at most one parked stream response or buffer when switching player engines
//! (for instance, when an address advertised as HLS answers with raw transport stream bytes).
//!
//! Many IPTV providers enforce a single-connection limit per account. When the player
//! attempts HLS on a `.m3u8` feed and discovers raw MPEG-TS or direct media, the native
//! proxy parks the already-read buffer here. When the direct player engine requests the
//! stream a moment later, it claims the parked bytes, preventing redundant connections.

use reqwest::Url;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

#[derive(Debug, Clone)]
pub struct ParkedBuffer {
    pub target: Url,
    pub body: Vec<u8>,
    pub content_type: Option<String>,
    pub parked_at: Instant,
}

struct Slot {
    _id: u64,
    stream: ParkedBuffer,
}

pub struct StreamParking {
    slot: Arc<Mutex<Option<Slot>>>,
    next_id: AtomicU64,
    ttl: Duration,
}

impl StreamParking {
    pub fn new(ttl: Duration) -> Self {
        Self {
            slot: Arc::new(Mutex::new(None)),
            next_id: AtomicU64::new(0),
            ttl,
        }
    }

    /// Parks `buffer`, closing and evicting any previously parked buffer.
    pub fn park(&self, target: Url, body: Vec<u8>, content_type: Option<String>) {
        let id = self.next_id.fetch_add(1, Ordering::Relaxed);
        let parked = ParkedBuffer {
            target,
            body,
            content_type,
            parked_at: Instant::now(),
        };
        let mut guard = self.slot.lock().unwrap_or_else(|p| p.into_inner());
        *guard = Some(Slot {
            _id: id,
            stream: parked,
        });
    }

    /// Takes the parked buffer if it matches `target` and has not expired past `ttl`.
    pub fn claim(&self, target: &Url) -> Option<ParkedBuffer> {
        let mut guard = self.slot.lock().unwrap_or_else(|p| p.into_inner());
        let slot = guard.take()?;
        if slot.stream.target == *target && slot.stream.parked_at.elapsed() <= self.ttl {
            Some(slot.stream)
        } else {
            None
        }
    }

    /// Clears any currently parked buffer.
    pub fn clear(&self) {
        let mut guard = self.slot.lock().unwrap_or_else(|p| p.into_inner());
        *guard = None;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parks_and_claims_buffer_for_same_target() {
        let parking = StreamParking::new(Duration::from_secs(5));
        let url = Url::parse("http://example.com/live.ts").unwrap();
        let payload = vec![0x47, 0x01, 0x02, 0x03];

        parking.park(url.clone(), payload.clone(), Some("video/mp2t".into()));

        let claimed = parking.claim(&url);
        assert!(claimed.is_some());
        let claimed = claimed.unwrap();
        assert_eq!(claimed.target, url);
        assert_eq!(claimed.body, payload);
        assert_eq!(claimed.content_type.as_deref(), Some("video/mp2t"));

        // Second claim attempt should return None (already claimed)
        assert!(parking.claim(&url).is_none());
    }

    #[test]
    fn refuses_claim_for_different_target() {
        let parking = StreamParking::new(Duration::from_secs(5));
        let url1 = Url::parse("http://example.com/live1.ts").unwrap();
        let url2 = Url::parse("http://example.com/live2.ts").unwrap();

        parking.park(url1, vec![1, 2, 3], None);

        // Asking for url2 should not claim url1 and should clear slot
        assert!(parking.claim(&url2).is_none());
    }

    #[test]
    fn parked_stream_expires_after_ttl() {
        let parking = StreamParking::new(Duration::from_millis(50));
        let url = Url::parse("http://example.com/live.ts").unwrap();

        parking.park(url.clone(), vec![1, 2, 3], None);
        std::thread::sleep(Duration::from_millis(60));

        assert!(parking.claim(&url).is_none());
    }
}
