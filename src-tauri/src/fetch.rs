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
use reqwest::header::ACCEPT;
use reqwest::{redirect, Url};

use crate::ingest::{ErrorCode, IngestError, MAX_PLAYLIST_BYTES};

const MAX_URL: usize = 2048;

#[derive(Debug, Clone)]
pub struct Policy {
    pub max_bytes: usize,
    pub max_redirects: usize,
    pub connect_timeout: Duration,
    pub total_timeout: Duration,
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
            #[cfg(test)]
            allow_loopback: false,
            #[cfg(test)]
            fake_dns: None,
        }
    }
}

impl Policy {
    fn permits(&self, ip: IpAddr) -> bool {
        #[cfg(test)]
        if self.allow_loopback && ip.to_canonical().is_loopback() {
            return true;
        }
        !is_prohibited(ip)
    }
}

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

fn blocked(host: &str) -> IngestError {
    IngestError::new(ErrorCode::Blocked, format!("{host} is a local, private or reserved network address. Kinora only fetches playlists from public internet addresses."))
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
        return Err(invalid(
            "Only http:// and https:// playlist addresses are supported.",
        ));
    }
    if !url.username().is_empty() || url.password().is_some() {
        return Err(invalid("Remove the username and password from the address. Kinora does not use sign-in details embedded in addresses."));
    }
    let host = url
        .host_str()
        .ok_or_else(|| invalid("The address has no host name."))?;
    // The url crate has already normalised numeric forms (2130706433, 0x7f.1) to dotted IPv4.
    if let Ok(ip) = host
        .trim_start_matches('[')
        .trim_end_matches(']')
        .parse::<IpAddr>()
    {
        return if policy.permits(ip) {
            Ok(url)
        } else {
            Err(blocked(host))
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
        return Err(blocked(host));
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
                return Err(blocked(&host).into());
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
fn from_reqwest(e: &reqwest::Error, host: &str) -> IngestError {
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
            format!("{host} did not send the playlist in time."),
        )
    } else if e.is_redirect() {
        network(format!("{host} sent an invalid redirect."))
    } else if e.is_connect() {
        network(format!("Could not connect to {host}."))
    } else {
        network(format!("The download from {host} failed."))
    }
}

/// Downloads playlist text. Returns the text and the host it was requested from.
pub async fn download(raw_url: &str, policy: &Policy) -> Result<(String, String), IngestError> {
    let url = check_url(raw_url, policy)?;
    let host = url.host_str().unwrap_or_default().to_owned();

    let hop_policy = policy.clone();
    let redirects = redirect::Policy::custom(move |attempt| {
        // `previous` holds every address already requested, starting with the original.
        if attempt.previous().len() > hop_policy.max_redirects {
            let limit = hop_policy.max_redirects;
            return attempt.error(IngestError::new(
                ErrorCode::TooManyRedirects,
                format!("The playlist address redirected more than {limit} times."),
            ));
        }
        match check_url(attempt.url().as_str(), &hop_policy) {
            Ok(_) => attempt.follow(),
            Err(e) => attempt.error(e),
        }
    });
    let client = reqwest::Client::builder()
        .no_proxy()
        .referer(false) // a Referer header would forward the previous address, query tokens included
        .redirect(redirects)
        .dns_resolver(Arc::new(GuardedResolver {
            policy: policy.clone(),
        }))
        .connect_timeout(policy.connect_timeout)
        .timeout(policy.total_timeout)
        .user_agent(concat!("Kinora/", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|_| network("Could not start the download.".into()))?;

    let mut response = client
        .get(url)
        .header(
            ACCEPT,
            "audio/x-mpegurl, application/vnd.apple.mpegurl, text/plain;q=0.9, */*;q=0.1",
        )
        .send()
        .await
        .map_err(|e| from_reqwest(&e, &host))?;

    if let Some(peer) = response.remote_addr() {
        if !policy.permits(peer.ip()) {
            return Err(blocked(&host));
        }
    }
    let status = response.status();
    if !status.is_success() {
        let code = status.as_u16();
        let message = if matches!(code, 401 | 403) {
            format!("{host} refused access (HTTP {code}). Kinora does not bypass sign-in or access controls.")
        } else {
            format!("{host} answered with HTTP {code} instead of a playlist.")
        };
        return Err(IngestError::new(ErrorCode::HttpStatus, message));
    }
    let too_large = || {
        IngestError::new(
            ErrorCode::TooLarge,
            format!(
                "The playlist from {host} is larger than the {} MB limit.",
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
        .map_err(|e| from_reqwest(&e, &host))?
    {
        if body.len() + chunk.len() > policy.max_bytes {
            return Err(too_large());
        }
        body.extend_from_slice(&chunk);
    }
    Ok((String::from_utf8_lossy(&body).into_owned(), host))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ingest;
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::sync::atomic::{AtomicUsize, Ordering};

    const PLAYLIST: &str = "#EXTM3U\n#EXTINF:-1 tvg-id=\"one\" group-title=\"News\",One\nhttps://s.example/1.m3u8\n#EXTINF:-1,Two\nhttps://s.example/2.m3u8\n";

    fn run<T>(f: impl std::future::Future<Output = T>) -> T {
        tauri::async_runtime::block_on(f)
    }

    /// The explicit test-only network policy: loopback allowed (for the local server), small limits.
    fn local() -> Policy {
        Policy {
            max_bytes: 4096,
            total_timeout: Duration::from_millis(1500),
            allow_loopback: true,
            ..Policy::default()
        }
    }

    fn http(status: &str, headers: &str, body: &str) -> Vec<u8> {
        format!(
            "HTTP/1.1 {status}\r\nContent-Length: {}\r\nConnection: close\r\n{headers}\r\n{body}",
            body.len()
        )
        .into_bytes()
    }

    /// Minimal local HTTP server on 127.0.0.1. `respond` gets the path, port and raw request head.
    /// Returns the port and a count of connections accepted.
    fn server(
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
}
