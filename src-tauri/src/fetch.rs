//! Bounded download of a user-supplied playlist address, guarded against requests to local,
//! private or reserved networks (SSRF).
//!
//! How the destination stays checked (verified against reqwest 0.13.5 / hyper-util 0.1.21):
//! - Host names go through `GuardedResolver`. hyper-util connects to exactly the addresses a
//!   resolver returns, with no second lookup, so the checked address is the connected address.
//! - IP-literal hosts skip the resolver, so `check_url` checks them, on the first request and on
//!   every redirect hop (the redirect policy calls `check_url` before following).
//! - Proxies are disabled with `no_proxy()`. reqwest honours HTTP_PROXY / HTTPS_PROXY / ALL_PROXY
//!   even without its `system-proxy` feature, and a proxy would connect on our behalf and bypass
//!   both checks. Playlist fetches therefore need a direct internet connection.
//! - The peer address of the final response is checked once more after connecting.

use std::error::Error as StdError;
use std::net::{IpAddr, Ipv4Addr, Ipv6Addr, SocketAddr};
use std::sync::Arc;
use std::time::Duration;

use reqwest::dns::{Addrs, Name, Resolve, Resolving};
use reqwest::header::{ACCEPT, CONTENT_RANGE, CONTENT_TYPE, RANGE};
use reqwest::{redirect, Url};
use serde::{Deserialize, Serialize};
use tokio::sync::{OwnedSemaphorePermit, Semaphore};

use crate::ingest::{ErrorCode, IngestError, MAX_PLAYLIST_BYTES};

const MAX_URL: usize = 2048;
/// Upper bound for a downloaded (usually gzip-compressed) XMLTV guide. Mirrored in `src/lib/native.ts`.
pub const MAX_GUIDE_BYTES: usize = 64 * 1024 * 1024;

#[derive(Debug, Clone)]
pub struct Policy {
    pub max_bytes: usize,
    pub max_redirects: usize,
    pub connect_timeout: Duration,
    pub total_timeout: Duration,
    /// Longest wait for the next bytes of a response. `None` for playlists (the total timeout
    /// covers them); set for media, where a stalled live stream must not hold a request open.
    pub read_timeout: Option<Duration>,
    /// What is being fetched, for error messages: "playlist", "guide", "logo", "catalogue" or "provider catalogue".
    pub noun: &'static str,
    /// When not empty, the only host names this policy fetches from, on every request and redirect
    /// hop. Narrows the destination checks; it never replaces them.
    pub only_hosts: &'static [&'static str],
    /// Refuse plain http, on every request and redirect hop.
    pub https_only: bool,
    /// Test-only: lets the local test server on 127.0.0.1 be reached. Not compiled into the app.
    #[cfg(test)]
    pub allow_loopback: bool,
    /// Test-only: answers every DNS lookup with these addresses. Not compiled into the app.
    #[cfg(test)]
    pub fake_dns: Option<Vec<IpAddr>>,
}

impl Default for Policy {
    fn default() -> Self {
        Self {
            max_bytes: MAX_PLAYLIST_BYTES,
            max_redirects: 5,
            connect_timeout: Duration::from_secs(10),
            total_timeout: Duration::from_secs(30),
            read_timeout: None,
            noun: "playlist",
            only_hosts: &[],
            https_only: false,
            #[cfg(test)]
            allow_loopback: false,
            #[cfg(test)]
            fake_dns: None,
        }
    }
}

impl Policy {
    /// Small channel logos use the same destination and redirect guards as every remote fetch.
    pub fn logo() -> Self {
        Self {
            max_bytes: 256 * 1024,
            max_redirects: 3,
            connect_timeout: Duration::from_secs(5),
            total_timeout: Duration::from_secs(10),
            noun: "logo",
            ..Self::default()
        }
    }

    /// Movie, series and programme artwork: posters, backdrops, episode stills.
    pub fn artwork() -> Self {
        Self {
            max_bytes: 4 * 1024 * 1024,
            max_redirects: 3,
            connect_timeout: Duration::from_secs(8),
            total_timeout: Duration::from_secs(20),
            noun: "artwork",
            ..Self::default()
        }
    }

    /// XMLTV guides: larger and slower than playlists, with the same destination checks. Only the
    /// size and time limits differ, so playlist and stream limits are unchanged.
    pub fn guide() -> Self {
        Self {
            max_bytes: MAX_GUIDE_BYTES,
            total_timeout: Duration::from_secs(90),
            noun: "guide",
            ..Self::default()
        }
    }

    /// The public source catalogue (catalogue.rs): one fixed https address on one host. Every
    /// destination check still applies; this policy only narrows them.
    pub fn catalogue() -> Self {
        Self {
            max_bytes: 2 * 1024 * 1024,
            max_redirects: 3,
            total_timeout: Duration::from_secs(20),
            noun: "catalogue",
            only_hosts: &[crate::catalogue::HOST],
            https_only: true,
            ..Self::default()
        }
    }

    /// User-selected Xtream-compatible provider API data, bounded independently from playlists.
    pub fn xtream() -> Self {
        Self {
            max_bytes: 32 * 1024 * 1024,
            max_redirects: 3,
            connect_timeout: Duration::from_secs(8),
            total_timeout: Duration::from_secs(45),
            noun: "provider catalogue",
            ..Self::default()
        }
    }

    /// Safe connection testing policy: bounded connect and total timeouts, small byte limit.
    pub fn connection_test() -> Self {
        Self {
            max_bytes: 64 * 1024,
            max_redirects: 3,
            connect_timeout: Duration::from_secs(5),
            total_timeout: Duration::from_secs(10),
            noun: "source",
            ..Self::default()
        }
    }

    /// Approved metadata provider APIs: The Movie Database and TVmaze.
    pub fn metadata() -> Self {
        Self {
            max_bytes: 512 * 1024,
            max_redirects: 3,
            connect_timeout: Duration::from_secs(5),
            total_timeout: Duration::from_secs(10),
            noun: "metadata",
            only_hosts: &["api.themoviedb.org", "api.tvmaze.com"],
            https_only: true,
            ..Self::default()
        }
    }

    /// Official application update manifest policy: bounded to 64 KB, HTTPS only, 10s timeout.
    pub fn updater() -> Self {
        Self {
            max_bytes: 64 * 1024,
            max_redirects: 3,
            connect_timeout: Duration::from_secs(5),
            total_timeout: Duration::from_secs(10),
            noun: "updater",
            https_only: true,
            ..Self::default()
        }
    }

    fn permits(&self, ip: IpAddr) -> bool {
        #[cfg(test)]
        if self.allow_loopback && ip.to_canonical().is_loopback() {
            return true;
        }
        // Native smoke tests serve local fixtures on 127.0.0.1. Only in dev builds; see below.
        #[cfg(all(feature = "loopback-fixtures", dev))]
        if ip.to_canonical().is_loopback() {
            return true;
        }
        !is_prohibited(ip)
    }
}

// `dev` is set by tauri-build for `tauri dev` builds only; bundled and release apps never have it.
#[cfg(all(feature = "loopback-fixtures", not(dev)))]
compile_error!("`loopback-fixtures` opens loopback to fetches and is for local dev-build smoke tests only; it must never be built into a release or bundled app.");

/// True for every address a playlist fetch must never reach.
pub fn is_prohibited(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => prohibited_v4(v4),
        IpAddr::V6(v6) => prohibited_v6(v6),
    }
}

fn prohibited_v4(ip: Ipv4Addr) -> bool {
    let [a, b, c, _] = ip.octets();
    a == 0                                            // 0.0.0.0/8 "this network"
        || a == 10                                    // private
        || a == 127                                   // loopback
        || (a == 100 && (64..128).contains(&b))       // 100.64.0.0/10 carrier-grade NAT
        || (a == 169 && b == 254)                     // link-local, cloud metadata services
        || (a == 172 && (16..32).contains(&b))        // private
        || (a == 192 && b == 0 && (c == 0 || c == 2)) // IETF assignments, TEST-NET-1
        || (a == 192 && b == 88 && c == 99)           // deprecated 6to4 relay
        || (a == 192 && b == 168)                     // private
        || (a == 198 && (b == 18 || b == 19))         // benchmarking
        || (a == 198 && b == 51 && c == 100)          // TEST-NET-2
        || (a == 203 && b == 0 && c == 113)           // TEST-NET-3
        || a >= 224 // multicast, reserved 240/4, broadcast
}

fn prohibited_v6(ip: Ipv6Addr) -> bool {
    if let Some(v4) = ip.to_ipv4_mapped() {
        return prohibited_v4(v4);
    }
    let s = ip.segments();
    let embedded = |hi: u16, lo: u16| Ipv4Addr::from((u32::from(hi) << 16) | u32::from(lo));
    // NAT64 (64:ff9b::/96) carries a real IPv4 destination on IPv6-only networks: judge that.
    if s[..6] == [0x64, 0xff9b, 0, 0, 0, 0] {
        return prohibited_v4(embedded(s[6], s[7]));
    }
    // Allow only global unicast (2000::/3). Rejects ::, ::1, IPv4-compatible, fc00::/7,
    // fe80::/10, fec0::/10, ff00::/8, 100::/64, 64:ff9b:1::/48 and everything unassigned.
    if s[0] & 0xe000 != 0x2000 {
        return true;
    }
    match s[0] {
        0x2001 => s[1] < 0x0200 || s[1] == 0x0db8, // 2001::/23 IETF special (incl. Teredo), documentation
        0x2002 => prohibited_v4(embedded(s[1], s[2])), // 6to4 carries an IPv4 address
        0x3fff => s[1] < 0x1000,                   // 3fff::/20 documentation
        _ => false,
    }
}

fn blocked(host: &str, noun: &str) -> IngestError {
    IngestError::new(ErrorCode::Blocked, format!("{host} is a local, private or reserved network address. Kinora only fetches {noun}s from public internet addresses."))
}

fn network(message: String) -> IngestError {
    IngestError::new(ErrorCode::Network, message)
}

/// Validates a playlist address: http(s) only, no embedded credentials, no local names or
/// prohibited IP literals. Runs for the address the user typed and for every redirect target.
pub fn check_url(raw: &str, policy: &Policy) -> Result<Url, IngestError> {
    let invalid = |m: &str| IngestError::new(ErrorCode::InvalidUrl, m);
    let raw = raw.trim();
    if raw.len() > MAX_URL {
        return Err(invalid("That address is too long."));
    }
    let url = Url::parse(raw)
        .map_err(|_| invalid("Use a full address starting with http:// or https://"))?;
    if !matches!(url.scheme(), "http" | "https") {
        return Err(invalid(&format!(
            "Only http:// and https:// {} addresses are supported.",
            policy.noun
        )));
    }
    if policy.https_only && url.scheme() != "https" {
        return Err(invalid(&format!(
            "Kinora only fetches the {} over https://.",
            policy.noun
        )));
    }
    if !url.username().is_empty() || url.password().is_some() {
        return Err(invalid("Remove the username and password from the address. Kinora does not use sign-in details embedded in addresses."));
    }
    let host = url
        .host_str()
        .ok_or_else(|| invalid("The address has no host name."))?;
    if !policy.only_hosts.is_empty()
        && !policy
            .only_hosts
            .contains(&host.trim_end_matches('.').to_ascii_lowercase().as_str())
    {
        return Err(IngestError::new(
            ErrorCode::Blocked,
            format!(
                "Kinora only fetches the {} from {}.",
                policy.noun,
                policy.only_hosts.join(", ")
            ),
        ));
    }
    // The url crate has already normalised numeric forms (2130706433, 0x7f.1) to dotted IPv4.
    if let Ok(ip) = host
        .trim_start_matches('[')
        .trim_end_matches(']')
        .parse::<IpAddr>()
    {
        return if policy.permits(ip) {
            Ok(url)
        } else {
            Err(blocked(host, policy.noun))
        };
    }
    let name = host.trim_end_matches('.').to_ascii_lowercase();
    let local = ["localhost", "home.arpa"].contains(&name.as_str())
        || [
            ".localhost",
            ".local",
            ".localdomain",
            ".internal",
            ".home.arpa",
        ]
        .iter()
        .any(|s| name.ends_with(s));
    if local {
        return Err(blocked(host, policy.noun));
    }
    Ok(url)
}

/// Resolves host names and refuses the whole answer if any address is prohibited, so a mixed
/// answer cannot be used to reach the forbidden one.
struct GuardedResolver {
    policy: Policy,
}

impl Resolve for GuardedResolver {
    fn resolve(&self, name: Name) -> Resolving {
        let policy = self.policy.clone();
        let host = name.as_str().to_owned();
        Box::pin(async move {
            let addrs = lookup(&policy, &host)
                .await
                .map_err(|_| network(format!("Could not find {host}.")))?;
            if addrs.is_empty() {
                return Err(network(format!("Could not find {host}.")).into());
            }
            if addrs.iter().any(|a| !policy.permits(a.ip())) {
                return Err(blocked(&host, policy.noun).into());
            }
            Ok(Box::new(addrs.into_iter()) as Addrs)
        })
    }
}

async fn lookup(policy: &Policy, host: &str) -> std::io::Result<Vec<SocketAddr>> {
    #[cfg(test)]
    if let Some(ips) = &policy.fake_dns {
        return Ok(ips.iter().map(|ip| SocketAddr::new(*ip, 0)).collect());
    }
    let _ = policy;
    Ok(tokio::net::lookup_host((host, 0)).await?.collect())
}

/// Maps a reqwest failure to a message that names the host only. reqwest's own `Display`
/// includes the full URL (and so any query tokens), so it is never shown or logged.
fn from_reqwest(e: &reqwest::Error, host: &str, noun: &str) -> IngestError {
    // Refusals from the resolver or redirect policy travel inside reqwest's error chain.
    let mut source: Option<&(dyn StdError + 'static)> = Some(e);
    while let Some(s) = source {
        if let Some(own) = s.downcast_ref::<IngestError>() {
            return own.clone();
        }
        source = s.source();
    }
    if e.is_timeout() {
        IngestError::new(
            ErrorCode::Timeout,
            format!("{host} did not send the {noun} in time."),
        )
    } else if e.is_redirect() {
        network(format!("{host} sent an invalid redirect."))
    } else if e.is_connect() {
        network(format!("Could not connect to {host}."))
    } else {
        network(format!("The download from {host} failed."))
    }
}

/// The only HTTP client Kinora uses. Every request it makes is checked: guarded resolver, IP-literal
/// and per-redirect `check_url`, no proxy, no Referer, bounded connect/total (and optional idle) time.
pub fn guarded_client(policy: &Policy) -> Result<reqwest::Client, IngestError> {
    let hop_policy = policy.clone();
    let redirects = redirect::Policy::custom(move |attempt| {
        // `previous` holds every address already requested, starting with the original.
        if attempt.previous().len() > hop_policy.max_redirects {
            let limit = hop_policy.max_redirects;
            return attempt.error(IngestError::new(
                ErrorCode::TooManyRedirects,
                format!(
                    "The {} address redirected more than {limit} times.",
                    hop_policy.noun
                ),
            ));
        }
        match check_url(attempt.url().as_str(), &hop_policy) {
            Ok(_) => attempt.follow(),
            Err(e) => attempt.error(e),
        }
    });
    let mut builder = reqwest::Client::builder()
        .no_proxy()
        .referer(false) // a Referer header would forward the previous address, query tokens included
        .redirect(redirects)
        .dns_resolver(Arc::new(GuardedResolver {
            policy: policy.clone(),
        }))
        .connect_timeout(policy.connect_timeout)
        .timeout(policy.total_timeout)
        .user_agent(concat!("Kinora/", env!("CARGO_PKG_VERSION")));
    if let Some(idle) = policy.read_timeout {
        builder = builder.read_timeout(idle);
    }
    builder
        .build()
        .map_err(|_| network("Could not start the download.".into()))
}

/// Downloads playlist text. Returns the text and the host it was requested from.
pub async fn download(raw_url: &str, policy: &Policy) -> Result<(String, String), IngestError> {
    let accept = "audio/x-mpegurl, application/vnd.apple.mpegurl, text/plain;q=0.9, */*;q=0.1";
    let (body, host) = download_bytes(raw_url, policy, accept).await?;
    Ok((String::from_utf8_lossy(&body).into_owned(), host))
}

/// Downloads a body of at most `policy.max_bytes`, unchanged (a guide may be gzip-compressed).
/// Returns the bytes and the host they were requested from.
pub async fn download_bytes(
    raw_url: &str,
    policy: &Policy,
    accept: &str,
) -> Result<(Vec<u8>, String), IngestError> {
    let url = check_url(raw_url, policy)?;
    let host = url.host_str().unwrap_or_default().to_owned();
    let client = guarded_client(policy)?;
    let noun = policy.noun;

    let mut response = client
        .get(url)
        .header(ACCEPT, accept)
        .send()
        .await
        .map_err(|e| from_reqwest(&e, &host, noun))?;

    if let Some(peer) = response.remote_addr() {
        if !policy.permits(peer.ip()) {
            return Err(blocked(&host, noun));
        }
    }
    let status = response.status();
    if !status.is_success() {
        let code = status.as_u16();
        let message = if matches!(code, 401 | 403) {
            format!("{host} refused access (HTTP {code}). Kinora does not bypass sign-in or access controls.")
        } else {
            format!("{host} answered with HTTP {code} instead of a {noun}.")
        };
        return Err(IngestError::new(ErrorCode::HttpStatus, message));
    }
    let too_large = || {
        IngestError::new(
            ErrorCode::TooLarge,
            format!(
                "The {noun} from {host} is larger than the {} MB limit.",
                policy.max_bytes / (1024 * 1024)
            ),
        )
    };
    if response
        .content_length()
        .is_some_and(|n| n > policy.max_bytes as u64)
    {
        return Err(too_large());
    }
    let mut body = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|e| from_reqwest(&e, &host, noun))?
    {
        if body.len() + chunk.len() > policy.max_bytes {
            return Err(too_large());
        }
        body.extend_from_slice(&chunk);
    }
    Ok((body, host))
}

/// Queries an approved metadata provider API (The Movie Database or TVmaze).
pub async fn fetch_metadata(
    raw_url: &str,
    auth_header: Option<&str>,
) -> Result<String, IngestError> {
    let policy = Policy::metadata();
    let url = check_url(raw_url, &policy)?;
    let host = url.host_str().unwrap_or_default().to_owned();
    let client = guarded_client(&policy)?;
    let noun = policy.noun;

    let mut req = client.get(url).header(ACCEPT, "application/json");

    if let Some(auth) = auth_header {
        req = req.header(reqwest::header::AUTHORIZATION, auth);
    }

    let mut response = req
        .send()
        .await
        .map_err(|e| from_reqwest(&e, &host, noun))?;

    if let Some(peer) = response.remote_addr() {
        if !policy.permits(peer.ip()) {
            return Err(blocked(&host, noun));
        }
    }
    let status = response.status();
    if !status.is_success() {
        let code = status.as_u16();
        let message = if matches!(code, 401 | 403) {
            format!("{host} refused metadata access (HTTP {code}). Check API credentials.")
        } else {
            format!("{host} answered with HTTP {code} instead of metadata.")
        };
        return Err(IngestError::new(ErrorCode::HttpStatus, message));
    }

    let mut body = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|e| from_reqwest(&e, &host, noun))?
    {
        if body.len() + chunk.len() > policy.max_bytes {
            return Err(IngestError::new(
                ErrorCode::TooLarge,
                format!("Metadata response from {host} exceeded maximum size limit."),
            ));
        }
        body.extend_from_slice(&chunk);
    }

    Ok(String::from_utf8_lossy(&body).into_owned())
}

/// Fetches an official update manifest JSON through the guarded network client.
pub async fn fetch_updater_manifest(raw_url: &str) -> Result<String, IngestError> {
    let policy = Policy::updater();
    let url = check_url(raw_url, &policy)?;
    let host = url.host_str().unwrap_or_default().to_owned();
    let client = guarded_client(&policy)?;
    let noun = policy.noun;

    let req = client.get(url).header(ACCEPT, "application/json");

    let mut response = req
        .send()
        .await
        .map_err(|e| from_reqwest(&e, &host, noun))?;

    if let Some(peer) = response.remote_addr() {
        if !policy.permits(peer.ip()) {
            return Err(blocked(&host, noun));
        }
    }
    let status = response.status();
    if !status.is_success() {
        let code = status.as_u16();
        let message = format!("{host} answered with HTTP {code} instead of update manifest.");
        return Err(IngestError::new(ErrorCode::HttpStatus, message));
    }

    let mut body = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|e| from_reqwest(&e, &host, noun))?
    {
        if body.len() + chunk.len() > policy.max_bytes {
            return Err(IngestError::new(
                ErrorCode::TooLarge,
                format!("Update manifest from {host} exceeded maximum size limit."),
            ));
        }
        body.extend_from_slice(&chunk);
    }

    String::from_utf8(body).map_err(|_| {
        IngestError::new(
            ErrorCode::Network,
            format!("Update manifest from {host} is not valid UTF-8."),
        )
    })
}

/// A media resource fetched for the stream protocol.
pub struct Fetched {
    /// 200, or 206 when the upstream answered a byte range.
    pub status: u16,
    pub content_type: Option<String>,
    pub content_range: Option<String>,
    /// Address after redirects; relative references in a playlist resolve against this.
    pub final_url: Url,
    pub body: Vec<u8>,
    /// Holds `body.len()` bytes of the session's memory budget until dropped.
    pub budget: OwnedSemaphorePermit,
}

/// Fetches one playlist, segment or key through `client` (built by `guarded_client`). The body is
/// capped at `max_bytes`, and every chunk is charged to `budget` as it arrives: when the session's
/// in-flight bytes would exceed the budget the request fails with `Busy` instead of buffering more.
pub async fn fetch_media(
    client: &reqwest::Client,
    url: &Url,
    policy: &Policy,
    range: Option<&str>,
    total: Duration,
    max_bytes: usize,
    budget: &Arc<Semaphore>,
) -> Result<Fetched, IngestError> {
    let url = check_url(url.as_str(), policy)?;
    let host = url.host_str().unwrap_or_default().to_owned();
    let mut request = client.get(url).timeout(total).header(ACCEPT, "*/*");
    if let Some(range) = range {
        request = request.header(RANGE, range);
    }
    let mut response = request
        .send()
        .await
        .map_err(|e| from_reqwest(&e, &host, policy.noun))?;
    if let Some(peer) = response.remote_addr() {
        if !policy.permits(peer.ip()) {
            return Err(blocked(&host, policy.noun));
        }
    }
    let status = response.status().as_u16();
    if !matches!(status, 200 | 206) {
        return Err(IngestError::new(
            ErrorCode::HttpStatus,
            format!("{host} answered with HTTP {status}."),
        ));
    }
    let too_large = || {
        IngestError::new(
            ErrorCode::TooLarge,
            format!("A resource from {host} is larger than the limit."),
        )
    };
    if response
        .content_length()
        .is_some_and(|n| n > max_bytes as u64)
    {
        return Err(too_large());
    }
    let header = |name| {
        response
            .headers()
            .get(name)
            .and_then(|v: &reqwest::header::HeaderValue| v.to_str().ok())
            .map(str::to_owned)
    };
    let content_type = header(CONTENT_TYPE);
    let content_range = header(CONTENT_RANGE);
    let final_url = response.url().clone();
    let busy = || {
        IngestError::new(
            ErrorCode::Busy,
            "Too much stream data is in flight; try again shortly.",
        )
    };
    let mut held = budget
        .clone()
        .try_acquire_many_owned(0)
        .map_err(|_| busy())?;
    let mut body = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|e| from_reqwest(&e, &host, policy.noun))?
    {
        if body.len() + chunk.len() > max_bytes {
            return Err(too_large());
        }
        let n = u32::try_from(chunk.len()).map_err(|_| too_large())?;
        held.merge(
            budget
                .clone()
                .try_acquire_many_owned(n)
                .map_err(|_| busy())?,
        );
        body.extend_from_slice(&chunk);
    }
    Ok(Fetched {
        status,
        content_type,
        content_range,
        final_url,
        body,
        budget: held,
    })
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionTestResult {
    pub ok: bool,
    pub status: Option<u16>,
    pub host: String,
    pub round_trip_ms: u64,
    pub message: String,
    pub category: ConnectionResultCategory,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum ConnectionResultCategory {
    Success,
    AuthRequired,
    HttpError,
    DnsFailure,
    ConnectionRefused,
    Timeout,
    InvalidUrl,
    SecurityBlocked,
    NetworkUnavailable,
    Unknown,
}

/// Safely tests connectivity to a remote source URL.
/// Validates the destination, checks DNS, inspects status headers, and drops the response
/// without buffering or downloading the full playlist or guide body.
pub async fn test_connection(raw_url: &str, policy: &Policy) -> ConnectionTestResult {
    let start = std::time::Instant::now();
    let url = match check_url(raw_url, policy) {
        Ok(u) => u,
        Err(e) => {
            let cat = if e.code == ErrorCode::Blocked {
                ConnectionResultCategory::SecurityBlocked
            } else {
                ConnectionResultCategory::InvalidUrl
            };
            return ConnectionTestResult {
                ok: false,
                status: None,
                host: extract_host_display(raw_url),
                round_trip_ms: 0,
                message: e.to_string(),
                category: cat,
            };
        }
    };

    let host = url.host_str().unwrap_or("unknown").to_owned();
    let client = match guarded_client(policy) {
        Ok(c) => c,
        Err(e) => {
            return ConnectionTestResult {
                ok: false,
                status: None,
                host,
                round_trip_ms: start.elapsed().as_millis() as u64,
                message: e.to_string(),
                category: ConnectionResultCategory::NetworkUnavailable,
            };
        }
    };

    // Range header requests up to the first 1KB so remote servers supporting Range do not stream large bodies.
    // Even if the server ignores Range, we only read response headers and drop the response stream immediately.
    let response_res = client
        .get(url)
        .header(RANGE, "bytes=0-1024")
        .header(ACCEPT, "audio/x-mpegurl, application/vnd.apple.mpegurl, application/xml, text/xml, text/plain;q=0.9, */*;q=0.1")
        .send()
        .await;

    let round_trip_ms = start.elapsed().as_millis() as u64;

    let response = match response_res {
        Ok(resp) => resp,
        Err(err) => {
            let mut source: Option<&(dyn StdError + 'static)> = Some(&err);
            let mut category = ConnectionResultCategory::Unknown;
            let mut msg = format!("Failed to reach {host}.");

            while let Some(s) = source {
                if let Some(own) = s.downcast_ref::<IngestError>() {
                    if own.code == ErrorCode::Blocked {
                        category = ConnectionResultCategory::SecurityBlocked;
                        msg = own.to_string();
                        break;
                    }
                    if own.code == ErrorCode::TooManyRedirects {
                        category = ConnectionResultCategory::HttpError;
                        msg = own.to_string();
                        break;
                    }
                }
                source = s.source();
            }

            if category == ConnectionResultCategory::Unknown {
                if err.is_timeout() {
                    category = ConnectionResultCategory::Timeout;
                    msg = format!(
                        "{host} did not respond within {} seconds.",
                        policy.total_timeout.as_secs()
                    );
                } else if err.is_connect() {
                    let err_str = err.to_string().to_lowercase();
                    if err_str.contains("dns")
                        || err_str.contains("resolve")
                        || err_str.contains("not find")
                    {
                        category = ConnectionResultCategory::DnsFailure;
                        msg = format!("Could not resolve host name: {host}");
                    } else {
                        category = ConnectionResultCategory::ConnectionRefused;
                        msg = format!("Connection refused or host unreachable: {host}");
                    }
                } else {
                    let ing = from_reqwest(&err, &host, policy.noun);
                    if ing.code == ErrorCode::Blocked {
                        category = ConnectionResultCategory::SecurityBlocked;
                    } else {
                        category = ConnectionResultCategory::NetworkUnavailable;
                    }
                    msg = ing.to_string();
                }
            }

            return ConnectionTestResult {
                ok: false,
                status: None,
                host,
                round_trip_ms,
                message: msg,
                category,
            };
        }
    };

    // Check final peer IP address
    if let Some(peer) = response.remote_addr() {
        if !policy.permits(peer.ip()) {
            return ConnectionTestResult {
                ok: false,
                status: None,
                host: host.clone(),
                round_trip_ms,
                message: format!("Connection to {host} refused: destination IP is prohibited by security policy."),
                category: ConnectionResultCategory::SecurityBlocked,
            };
        }
    }

    let status = response.status();
    let code = status.as_u16();

    // Drop response body immediately without buffering or downloading!
    drop(response);

    if status.is_success() {
        ConnectionTestResult {
            ok: true,
            status: Some(code),
            host: host.clone(),
            round_trip_ms,
            message: format!("Host reachable (HTTP {code} OK, {round_trip_ms}ms)"),
            category: ConnectionResultCategory::Success,
        }
    } else if code == 401 || code == 403 {
        ConnectionTestResult {
            ok: false,
            status: Some(code),
            host: host.clone(),
            round_trip_ms,
            message: format!("{host} refused access (HTTP {code}). Authentication required."),
            category: ConnectionResultCategory::AuthRequired,
        }
    } else {
        ConnectionTestResult {
            ok: false,
            status: Some(code),
            host: host.clone(),
            round_trip_ms,
            message: format!("{host} returned HTTP {code}."),
            category: ConnectionResultCategory::HttpError,
        }
    }
}

fn extract_host_display(raw: &str) -> String {
    if let Ok(u) = Url::parse(raw.trim()) {
        if let Some(h) = u.host_str() {
            return h.to_owned();
        }
    }
    "unknown".to_owned()
}

/// Local HTTP test server shared by the fetch and stream tests. Test builds only.
#[cfg(test)]
pub(crate) mod test_support {
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;
    use std::time::Duration;

    pub fn run<T>(f: impl std::future::Future<Output = T>) -> T {
        tauri::async_runtime::block_on(f)
    }

    pub fn http(status: &str, headers: &str, body: &str) -> Vec<u8> {
        http_bytes(status, headers, body.as_bytes())
    }

    pub fn http_bytes(status: &str, headers: &str, body: &[u8]) -> Vec<u8> {
        let mut out = format!(
            "HTTP/1.1 {status}\r\nContent-Length: {}\r\nConnection: close\r\n{headers}\r\n",
            body.len()
        )
        .into_bytes();
        out.extend_from_slice(body);
        out
    }

    /// Minimal local HTTP server on 127.0.0.1. `respond` gets the path, port and raw request head.
    /// Paths starting `/slow` wait 3 s before answering. Returns the port and connections accepted.
    pub fn server(
        respond: impl Fn(&str, u16, &str) -> Vec<u8> + Send + Sync + 'static,
    ) -> (u16, Arc<AtomicUsize>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let hits = Arc::new(AtomicUsize::new(0));
        let counter = hits.clone();
        let respond = Arc::new(respond);
        std::thread::spawn(move || {
            for stream in listener.incoming() {
                let Ok(mut stream) = stream else { break };
                counter.fetch_add(1, Ordering::SeqCst);
                let respond = respond.clone();
                // One thread per connection so a deliberately slow reply cannot stall other requests.
                std::thread::spawn(move || {
                    let mut request = Vec::new();
                    let mut buf = [0u8; 1024];
                    while !request.windows(4).any(|w| w == b"\r\n\r\n") && request.len() < 16 * 1024
                    {
                        match stream.read(&mut buf) {
                            Ok(0) | Err(_) => break,
                            Ok(n) => request.extend_from_slice(&buf[..n]),
                        }
                    }
                    let text = String::from_utf8_lossy(&request);
                    let path = text.split_whitespace().nth(1).unwrap_or("/").to_owned();
                    if path.starts_with("/slow") {
                        std::thread::sleep(Duration::from_secs(3));
                    }
                    let _ = stream.write_all(&respond(&path, port, &text));
                });
            }
        });
        (port, hits)
    }
}

#[cfg(test)]
mod tests {
    use super::test_support::{http, run, server};
    use super::*;
    use crate::ingest;
    use std::sync::atomic::{AtomicUsize, Ordering};

    const PLAYLIST: &str = "#EXTM3U\n#EXTINF:-1 tvg-id=\"one\" group-title=\"News\",One\nhttps://s.example/1.m3u8\n#EXTINF:-1,Two\nhttps://s.example/2.m3u8\n";

    /// The explicit test-only network policy: loopback allowed (for the local server), small limits.
    fn local() -> Policy {
        Policy {
            max_bytes: 4096,
            total_timeout: Duration::from_millis(1500),
            allow_loopback: true,
            ..Policy::default()
        }
    }

    fn playlist_server() -> (u16, Arc<AtomicUsize>) {
        server(|path, port, _| match path {
            "/list.m3u" => http("200 OK", "Content-Type: audio/x-mpegurl\r\n", PLAYLIST),
            p if p.starts_with("/r/") => {
                let n: u32 = p[3..].parse().unwrap();
                if n == 0 {
                    http("200 OK", "", PLAYLIST)
                } else {
                    http("302 Found", &format!("Location: /r/{}\r\n", n - 1), "")
                }
            }
            "/to-private" => http("302 Found", "Location: http://10.0.0.1/list.m3u\r\n", ""),
            "/to-metadata" => http(
                "301 Moved",
                "Location: http://169.254.169.254/latest/meta-data/\r\n",
                "",
            ),
            "/to-localhost" => http(
                "302 Found",
                &format!("Location: http://localhost:{port}/list.m3u\r\n"),
                "",
            ),
            "/to-file" => http("302 Found", "Location: file:///etc/passwd\r\n", ""),
            "/to-creds" => http(
                "302 Found",
                &format!("Location: http://user:pw@127.0.0.1:{port}/list.m3u\r\n"),
                "",
            ),
            "/big-declared" => http("200 OK", "", &"#".repeat(5000)),
            "/big-streamed" => {
                // No Content-Length: the body runs until the connection closes.
                let mut r = b"HTTP/1.1 200 OK\r\nConnection: close\r\n\r\n".to_vec();
                r.extend(std::iter::repeat_n(b'#', 5000));
                r
            }
            p if p.starts_with("/slow") => http("200 OK", "", PLAYLIST),
            p if p.starts_with("/missing") => http("404 Not Found", "", "nope"),
            "/forbidden" => http("403 Forbidden", "", "no"),
            "/unauthorized" => http(
                "401 Unauthorized",
                "WWW-Authenticate: Basic\r\n",
                "auth required",
            ),
            "/server-error" => http("500 Internal Server Error", "", "internal error"),
            "/login" => http(
                "200 OK",
                "Content-Type: text/html\r\n",
                "<!doctype html><html><body>Sign in</body></html>",
            ),
            "/hls" => http(
                "200 OK",
                "",
                "#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXTINF:6,\nseg.ts\n",
            ),
            _ => http("404 Not Found", "", ""),
        })
    }

    fn fetch(url: String, policy: &Policy) -> Result<ingest::Report, IngestError> {
        run(ingest::from_url(&url, policy))
    }
    fn code(url: String, policy: &Policy) -> ErrorCode {
        fetch(url, policy).expect_err("fetch should fail").code
    }

    #[test]
    fn prohibited_addresses() {
        for ip in [
            "0.0.0.0",
            "0.1.2.3",
            "10.1.2.3",
            "127.0.0.1",
            "127.255.0.9",
            "100.64.0.1",
            "100.127.255.254",
            "169.254.169.254",
            "172.16.0.1",
            "172.31.255.255",
            "192.0.0.8",
            "192.0.2.1",
            "192.88.99.1",
            "192.168.1.20",
            "198.18.0.1",
            "198.19.255.1",
            "198.51.100.7",
            "203.0.113.9",
            "224.0.0.1",
            "239.255.255.250",
            "240.0.0.1",
            "255.255.255.255",
            "::",
            "::1",
            "::127.0.0.1",
            "::ffff:127.0.0.1",
            "::ffff:10.0.0.1",
            "::ffff:169.254.169.254",
            "64:ff9b::7f00:1",
            "64:ff9b::a00:1",
            "64:ff9b:1::1",
            "100::1",
            "fc00::1",
            "fd12:3456::1",
            "fe80::1",
            "fec0::1",
            "ff02::1",
            "2001::1",
            "2001:0:4136:e378::1",
            "2001:db8::1",
            "2002:7f00:1::1",
            "2002:c0a8:101::1",
            "3fff::1",
        ] {
            assert!(is_prohibited(ip.parse().unwrap()), "{ip} must be blocked");
        }
        for ip in [
            "1.1.1.1",
            "8.8.8.8",
            "93.184.215.14",
            "100.63.255.255",
            "100.128.0.1",
            "172.15.0.1",
            "172.32.0.1",
            "192.169.0.1",
            "2606:4700:4700::1111",
            "2a00:1450:4009:81f::200e",
            "64:ff9b::808:808",
            "2002:808:808::1",
            "2001:4860:4860::8888",
        ] {
            assert!(!is_prohibited(ip.parse().unwrap()), "{ip} must be allowed");
        }
    }

    #[test]
    #[cfg_attr(
        feature = "loopback-fixtures",
        ignore = "loopback-fixtures opens 127.0.0.1, which this test checks is refused"
    )]
    fn address_validation() {
        let p = Policy::default();
        let c = |u: &str| check_url(u, &p).map(|_| ()).map_err(|e| e.code);
        assert_eq!(
            c("https://playlists.example.com/list.m3u?token=abc"),
            Ok(())
        );
        assert_eq!(c("http://93.184.215.14:8080/get.php"), Ok(()));
        for bad in [
            "ftp://x.example/a",
            "file:///etc/passwd",
            "javascript:alert(1)",
            "data:text/plain,x",
            "not a url",
            "//x.example/a",
            "",
        ] {
            assert_eq!(c(bad), Err(ErrorCode::InvalidUrl), "{bad}");
        }
        assert_eq!(
            c("https://user:pass@x.example/a"),
            Err(ErrorCode::InvalidUrl)
        );
        assert_eq!(c("https://user@x.example/a"), Err(ErrorCode::InvalidUrl));
        assert_eq!(
            c(&format!("https://x.example/{}", "a".repeat(MAX_URL))),
            Err(ErrorCode::InvalidUrl)
        );
        for bad in [
            "http://localhost/a",
            "http://LOCALHOST./a",
            "http://tv.localhost/a",
            "http://nas.local/a",
            "http://router.home.arpa/a",
            "http://box.localdomain/a",
            "http://metadata.google.internal/a",
            "http://127.0.0.1/a",
            "http://2130706433/a",
            "http://0x7f.1/a",
            "http://017700000001/a",
            "http://[::1]/a",
            "http://[::ffff:7f00:1]/a",
            "http://169.254.169.254/latest",
            "http://192.168.1.20/lineup.m3u",
            "http://[fe80::1]/a",
            "http://0/a",
        ] {
            assert_eq!(c(bad), Err(ErrorCode::Blocked), "{bad}");
        }
    }

    #[test]
    #[cfg_attr(
        feature = "loopback-fixtures",
        ignore = "loopback-fixtures opens 127.0.0.1, which this test checks is refused"
    )]
    fn production_policy_never_connects_to_loopback() {
        let (port, hits) = playlist_server();
        assert_eq!(
            code(
                format!("http://127.0.0.1:{port}/list.m3u"),
                &Policy::default()
            ),
            ErrorCode::Blocked
        );
        assert_eq!(
            code(
                format!("http://[::ffff:127.0.0.1]:{port}/list.m3u"),
                &Policy::default()
            ),
            ErrorCode::Blocked
        );
        assert_eq!(
            hits.load(Ordering::SeqCst),
            0,
            "a refused address must never be contacted"
        );
    }

    #[test]
    #[cfg_attr(
        feature = "loopback-fixtures",
        ignore = "loopback-fixtures opens 127.0.0.1, which this test checks is refused"
    )]
    fn resolved_addresses_are_checked_and_are_the_ones_connected_to() {
        let (port, hits) = playlist_server();
        let url = format!("http://playlist.test:{port}/list.m3u");
        let resolving_to = |ips: &[&str], allow_loopback| Policy {
            fake_dns: Some(ips.iter().map(|i| i.parse().unwrap()).collect()),
            allow_loopback,
            ..local()
        };

        // A public-looking name that resolves to loopback or private space is refused before connecting.
        assert_eq!(
            code(url.clone(), &resolving_to(&["127.0.0.1"], false)),
            ErrorCode::Blocked
        );
        assert_eq!(
            code(
                url.clone(),
                &resolving_to(&["93.184.215.14", "10.9.9.9"], true)
            ),
            ErrorCode::Blocked
        );
        assert_eq!(hits.load(Ordering::SeqCst), 0);

        // When the answer is allowed, the connection goes to exactly that address (our server).
        let report =
            fetch(url, &resolving_to(&["127.0.0.1"], true)).expect("allowed answer should fetch");
        assert_eq!(
            (report.channels.len(), report.host.as_deref()),
            (2, Some("playlist.test"))
        );
        assert_eq!(hits.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn fetches_and_parses_a_playlist() {
        let (port, _) = playlist_server();
        let report = fetch(format!("http://127.0.0.1:{port}/list.m3u"), &local()).unwrap();
        assert_eq!(
            report
                .channels
                .iter()
                .map(|c| c.name.as_str())
                .collect::<Vec<_>>(),
            ["One", "Two"]
        );
        assert_eq!(report.channels[0].group.as_deref(), Some("News"));
        assert_eq!(report.host.as_deref(), Some("127.0.0.1"));
    }

    #[test]
    fn redirects_are_limited_and_every_hop_is_rechecked() {
        let (port, hits) = playlist_server();
        let at = |p: &str| format!("http://127.0.0.1:{port}{p}");
        assert_eq!(
            fetch(at("/r/5"), &local()).unwrap().channels.len(),
            2,
            "five redirects are allowed"
        );
        assert_eq!(code(at("/r/6"), &local()), ErrorCode::TooManyRedirects);
        let before = hits.load(Ordering::SeqCst);
        assert_eq!(code(at("/to-private"), &local()), ErrorCode::Blocked);
        assert_eq!(code(at("/to-metadata"), &local()), ErrorCode::Blocked);
        assert_eq!(code(at("/to-localhost"), &local()), ErrorCode::Blocked);
        assert_eq!(code(at("/to-creds"), &local()), ErrorCode::InvalidUrl);
        // reqwest only follows http(s) locations, so a file: redirect stops at the 3xx itself.
        assert_eq!(code(at("/to-file"), &local()), ErrorCode::HttpStatus);
        // Each refused redirect cost exactly one request: the hop itself was never contacted.
        assert_eq!(hits.load(Ordering::SeqCst) - before, 5);
    }

    #[test]
    fn proxy_environment_variables_are_ignored() {
        // reqwest reads these variables even without its `system-proxy` feature; only `no_proxy()`
        // stops it. A decoy proxy that would happily answer must never see a request.
        let (proxy_port, proxy_hits) = server(|_, _, _| http("200 OK", "", PLAYLIST));
        let proxy = format!("http://127.0.0.1:{proxy_port}");
        let mut child = std::process::Command::new(std::env::current_exe().unwrap());
        child.args([
            "--exact",
            "fetch::tests::direct_connection_child",
            "--ignored",
            "--quiet",
        ]);
        for var in [
            "HTTP_PROXY",
            "http_proxy",
            "HTTPS_PROXY",
            "https_proxy",
            "ALL_PROXY",
            "all_proxy",
        ] {
            child.env(var, &proxy);
        }
        let status = child
            .env_remove("NO_PROXY")
            .env_remove("no_proxy")
            .status()
            .unwrap();
        assert!(status.success(), "the fetch in the child process failed");
        assert_eq!(
            proxy_hits.load(Ordering::SeqCst),
            0,
            "the playlist request went through the proxy"
        );
    }

    #[test]
    #[ignore = "run by proxy_environment_variables_are_ignored in a child process with proxy variables set"]
    fn direct_connection_child() {
        assert!(
            std::env::var_os("HTTP_PROXY").is_some(),
            "run through proxy_environment_variables_are_ignored"
        );
        let (port, hits) = playlist_server();
        let policy = Policy {
            fake_dns: Some(vec!["127.0.0.1".parse().unwrap()]),
            ..local()
        };
        fetch(format!("http://playlist.test:{port}/list.m3u"), &policy).unwrap();
        assert_eq!(
            hits.load(Ordering::SeqCst),
            1,
            "the target must be reached directly"
        );
    }

    #[test]
    fn redirects_do_not_forward_the_previous_address() {
        let seen = Arc::new(std::sync::Mutex::new(Vec::new()));
        let log = seen.clone();
        let (port, _) = server(move |path, _, head| {
            log.lock().unwrap().push(head.to_owned());
            if path.starts_with("/start") {
                http("302 Found", "Location: /list.m3u\r\n", "")
            } else {
                http("200 OK", "", PLAYLIST)
            }
        });
        fetch(
            format!("http://127.0.0.1:{port}/start?token=SECRET123"),
            &local(),
        )
        .unwrap();
        let seen = seen.lock().unwrap();
        assert_eq!(seen.len(), 2);
        let hop = seen[1].to_ascii_lowercase();
        assert!(
            !hop.contains("secret123") && !hop.contains("referer"),
            "redirect hop leaked the previous address: {hop}"
        );
    }

    #[test]
    fn oversized_responses_are_cut_off() {
        let (port, _) = playlist_server();
        assert_eq!(
            code(format!("http://127.0.0.1:{port}/big-declared"), &local()),
            ErrorCode::TooLarge
        );
        assert_eq!(
            code(format!("http://127.0.0.1:{port}/big-streamed"), &local()),
            ErrorCode::TooLarge
        );
    }

    #[test]
    fn slow_servers_time_out() {
        let (port, _) = playlist_server();
        assert_eq!(
            code(format!("http://127.0.0.1:{port}/slow"), &local()),
            ErrorCode::Timeout
        );
    }

    #[test]
    fn http_errors_web_pages_and_hls_are_reported() {
        let (port, _) = playlist_server();
        let at = |p: &str| format!("http://127.0.0.1:{port}{p}");
        assert_eq!(code(at("/missing"), &local()), ErrorCode::HttpStatus);
        let forbidden = fetch(at("/forbidden"), &local()).unwrap_err();
        assert_eq!(forbidden.code, ErrorCode::HttpStatus);
        assert!(
            forbidden.message.contains("does not bypass"),
            "{}",
            forbidden.message
        );
        assert_eq!(code(at("/login"), &local()), ErrorCode::WebPage);
        assert_eq!(code(at("/hls"), &local()), ErrorCode::HlsMedia);
    }

    #[test]
    fn errors_never_echo_paths_queries_or_tokens() {
        let (port, _) = playlist_server();
        let secret = "?username=alice&password=hunter2&token=SECRET123";
        for path in ["/missing", "/slow", "/r/9", "/big-declared", "/to-private"] {
            let e = fetch(format!("http://127.0.0.1:{port}{path}{secret}"), &local()).unwrap_err();
            for leak in ["hunter2", "SECRET123", "alice", path] {
                assert!(
                    !e.message.contains(leak),
                    "{path}: message leaks {leak:?}: {}",
                    e.message
                );
            }
        }
        let e = fetch(format!("http://127.0.0.1:1/x{secret}"), &local()).unwrap_err();
        assert!(
            e.code == ErrorCode::Network && !e.message.contains("hunter2"),
            "{e:?}"
        );
    }
    /// The guide policy as the app uses it, with only loopback opened for the local test server.
    fn local_guide(max_bytes: usize) -> Policy {
        Policy {
            max_bytes,
            total_timeout: Duration::from_millis(1500),
            allow_loopback: true,
            ..Policy::guide()
        }
    }

    fn guide_bytes(url: String, policy: &Policy) -> Result<Vec<u8>, IngestError> {
        run(download_bytes(&url, policy, "application/xml")).map(|(b, _)| b)
    }

    #[test]
    fn the_guide_policy_only_changes_size_and_time_limits() {
        let (guide, playlist) = (Policy::guide(), Policy::default());
        assert_eq!(guide.max_bytes, MAX_GUIDE_BYTES);
        assert_eq!(guide.total_timeout, Duration::from_secs(90));
        assert_eq!(
            playlist.max_bytes, MAX_PLAYLIST_BYTES,
            "playlist limits unchanged"
        );
        assert_eq!(playlist.total_timeout, Duration::from_secs(30));
        assert_eq!(guide.max_redirects, playlist.max_redirects);
        assert_eq!(guide.connect_timeout, playlist.connect_timeout);
        assert_eq!(guide.read_timeout, playlist.read_timeout);
        assert!(!guide.allow_loopback && guide.fake_dns.is_none());
    }

    #[test]
    #[cfg_attr(
        feature = "loopback-fixtures",
        ignore = "loopback-fixtures opens 127.0.0.1, which this test checks is refused"
    )]
    fn guides_are_fetched_with_the_same_destination_checks() {
        let (port, hits) = playlist_server();
        let production = Policy::guide();
        for url in [
            format!("http://127.0.0.1:{port}/list.m3u"),
            "http://10.0.0.5/epg.xml".into(),
            "http://169.254.169.254/latest/meta-data/".into(),
            "http://localhost/epg.xml".into(),
            "http://[::1]/epg.xml".into(),
        ] {
            let e = guide_bytes(url, &production).unwrap_err();
            assert_eq!(e.code, ErrorCode::Blocked);
            assert!(
                e.message.contains("Kinora only fetches guides"),
                "{}",
                e.message
            );
        }
        assert_eq!(hits.load(Ordering::SeqCst), 0, "nothing was reached");
        let creds =
            guide_bytes("https://u:p@guides.example/epg.xml".into(), &production).unwrap_err();
        assert_eq!(creds.code, ErrorCode::InvalidUrl);
        assert_eq!(
            guide_bytes("file:///etc/passwd".into(), &production)
                .unwrap_err()
                .code,
            ErrorCode::InvalidUrl
        );
        // Every redirect hop is checked again, as for playlists.
        let at = |p: &str| format!("http://127.0.0.1:{port}{p}");
        for p in [
            "/to-private",
            "/to-metadata",
            "/to-localhost",
            "/to-file",
            "/to-creds",
        ] {
            assert!(guide_bytes(at(p), &local_guide(4096)).is_err(), "{p}");
        }
        let e = guide_bytes(at("/r/9"), &local_guide(4096)).unwrap_err();
        assert!(
            e.message.contains("The guide address redirected"),
            "{}",
            e.message
        );
        assert_eq!(
            guide_bytes(at("/r/2"), &local_guide(4096)).unwrap(),
            PLAYLIST.as_bytes()
        );
    }

    #[test]
    fn guide_bodies_are_bytes_with_their_own_size_limit() {
        let (port, _) = playlist_server();
        let at = |p: &str| format!("http://127.0.0.1:{port}{p}");
        for p in ["/big-declared", "/big-streamed"] {
            let e = guide_bytes(at(p), &local_guide(4096)).unwrap_err();
            assert_eq!(e.code, ErrorCode::TooLarge);
            assert!(
                e.message.starts_with("The guide from 127.0.0.1"),
                "{}",
                e.message
            );
        }
        assert_eq!(
            guide_bytes(at("/big-declared"), &local_guide(8192))
                .unwrap()
                .len(),
            5000
        );
        let secret = "?token=SECRET123";
        for p in ["/missing", "/slow", "/big-declared", "/to-private"] {
            let e = guide_bytes(format!("{}{secret}", at(p)), &local_guide(4096)).unwrap_err();
            assert!(
                !e.message.contains("SECRET123") && !e.message.contains(p),
                "{}",
                e.message
            );
        }
        let slow = guide_bytes(at("/slow"), &local_guide(4096)).unwrap_err();
        assert!(
            slow.message.contains("did not send the guide in time"),
            "{}",
            slow.message
        );
    }

    #[test]
    fn connection_test_success_200() {
        let (port, _) = playlist_server();
        let url = format!("http://127.0.0.1:{port}/list.m3u");
        let res = run(test_connection(&url, &local()));
        assert!(res.ok, "Expected ok to be true, got: {:?}", res);
        assert_eq!(res.status, Some(200));
        assert_eq!(res.category, ConnectionResultCategory::Success);
        assert_eq!(res.host, "127.0.0.1");
        assert!(res.message.contains("HTTP 200 OK"));
    }

    #[test]
    fn connection_test_auth_required_401_and_403() {
        let (port, _) = playlist_server();
        let at = |p: &str| format!("http://127.0.0.1:{port}{p}");

        let res401 = run(test_connection(&at("/unauthorized"), &local()));
        assert!(!res401.ok);
        assert_eq!(res401.status, Some(401));
        assert_eq!(res401.category, ConnectionResultCategory::AuthRequired);
        assert!(res401.message.contains("Authentication required"));

        let res403 = run(test_connection(&at("/forbidden"), &local()));
        assert!(!res403.ok);
        assert_eq!(res403.status, Some(403));
        assert_eq!(res403.category, ConnectionResultCategory::AuthRequired);
        assert!(res403.message.contains("Authentication required"));
    }

    #[test]
    fn connection_test_http_errors_404_and_500() {
        let (port, _) = playlist_server();
        let at = |p: &str| format!("http://127.0.0.1:{port}{p}");

        let res404 = run(test_connection(&at("/missing"), &local()));
        assert!(!res404.ok);
        assert_eq!(res404.status, Some(404));
        assert_eq!(res404.category, ConnectionResultCategory::HttpError);
        assert!(res404.message.contains("HTTP 404"));

        let res500 = run(test_connection(&at("/server-error"), &local()));
        assert!(!res500.ok);
        assert_eq!(res500.status, Some(500));
        assert_eq!(res500.category, ConnectionResultCategory::HttpError);
        assert!(res500.message.contains("HTTP 500"));
    }

    #[test]
    fn connection_test_invalid_url_and_credentials() {
        let res_scheme = run(test_connection("ftp://example.com/playlist.m3u", &local()));
        assert!(!res_scheme.ok);
        assert_eq!(res_scheme.category, ConnectionResultCategory::InvalidUrl);

        let res_invalid = run(test_connection("not-a-valid-url", &local()));
        assert!(!res_invalid.ok);
        assert_eq!(res_invalid.category, ConnectionResultCategory::InvalidUrl);

        let res_creds = run(test_connection(
            "http://user:supersecretpass@example.com/test",
            &local(),
        ));
        assert!(!res_creds.ok);
        assert_eq!(res_creds.category, ConnectionResultCategory::InvalidUrl);
        assert!(!res_creds.message.contains("supersecretpass"));
    }

    #[test]
    #[cfg_attr(
        feature = "loopback-fixtures",
        ignore = "loopback-fixtures opens 127.0.0.1, which this test checks is refused"
    )]
    fn connection_test_security_blocked() {
        let prod_policy = Policy::connection_test();
        for addr in [
            "http://127.0.0.1:8080/list.m3u",
            "http://10.0.0.1/test.m3u",
            "http://192.168.1.1/test.m3u",
            "http://169.254.169.254/latest/meta-data/",
            "http://localhost:5000/playlist.m3u",
        ] {
            let res = run(test_connection(addr, &prod_policy));
            assert!(!res.ok, "Expected {} to be blocked", addr);
            assert_eq!(
                res.category,
                ConnectionResultCategory::SecurityBlocked,
                "Expected {} to be blocked",
                addr
            );
        }
    }

    #[test]
    fn connection_test_redacts_tokens_and_paths_in_errors() {
        let (port, _) = playlist_server();
        let token_url = format!("http://127.0.0.1:{port}/missing?token=VERY_SECRET_AUTH_TOKEN_999");
        let res = run(test_connection(&token_url, &local()));
        assert!(!res.ok);
        assert!(!res.message.contains("VERY_SECRET_AUTH_TOKEN_999"));
        assert!(!res.message.contains("/missing"));
    }

    #[test]
    fn metadata_policy_allows_tmdb_and_tvmaze() {
        let policy = Policy::metadata();
        assert!(check_url(
            "https://api.themoviedb.org/3/search/movie?query=Dune",
            &policy
        )
        .is_ok());
        assert!(check_url("https://api.tvmaze.com/search/shows?q=Doctor+Who", &policy).is_ok());
    }

    #[test]
    fn metadata_policy_rejects_insecure_or_disallowed_hosts() {
        let policy = Policy::metadata();
        // Insecure HTTP rejected
        assert!(check_url("http://api.themoviedb.org/3/search/movie", &policy).is_err());
        assert!(check_url("http://api.tvmaze.com/search/shows", &policy).is_err());
        // Unapproved hosts rejected
        assert!(check_url("https://example.com/api", &policy).is_err());
        assert!(check_url("https://google.com/", &policy).is_err());
        // Loopback / private rejected
        assert!(check_url("https://127.0.0.1:8080/api", &policy).is_err());
        assert!(check_url("https://10.0.0.1/api", &policy).is_err());
    }
}
