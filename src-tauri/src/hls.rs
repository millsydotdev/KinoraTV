//! HLS playlist rewriting for the stream protocol (`stream.rs`). Every resource a playlist refers
//! to is resolved against the playlist's final address (after redirects) and replaced by an opaque
//! `kstream` handle, so no upstream address reaches the webview. Pure: no I/O.
//!
//! Fails closed: a tag that carries a resource address this module does not route makes the whole
//! playlist unsupported, rather than letting an upstream address through or quietly corrupting it.
//! The only tags removed are optional hints whose absence cannot break playback (low-latency
//! parts and preload hints, rendition reports, content steering, session data); full segments are
//! still listed, so such streams play at normal latency.

use reqwest::Url;

/// What a handle points at. Playlists carry their depth: the root is 0 and only it may be a master.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Kind {
    Playlist { depth: u8 },
    Segment,
    Init,
    Key,
}

/// Why a reference could not be given a handle.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MintError {
    /// The address is refused by the network policy (private, loopback, local name...).
    Blocked,
    /// The session ended while the playlist was being rewritten.
    Gone,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RewriteError {
    /// Not an HLS playlist (for example a channel list, a web page or media data).
    NotHls,
    /// A feature Kinora does not route; the text names it for the user.
    Unsupported(&'static str),
    /// Encryption other than plain AES-128: SAMPLE-AES, key formats, session keys.
    Drm,
    TooMany(&'static str),
    Mint(MintError),
}

#[derive(Debug, Clone, Copy)]
pub struct Limits {
    pub max_uris: usize,
    pub max_variants: usize,
}

const MAX_REFERENCE: usize = 4096;
/// `kstream://localhost/<handle>`: verified in the D4A spike as the address WebKitGTK serves.
pub const HANDLE_BASE: &str = "kstream://localhost/";

/// Rewrites `text` (fetched from `base`, at `depth`) so every reference is a handle from `mint`.
pub fn rewrite(
    text: &str,
    base: &Url,
    depth: u8,
    limits: Limits,
    mint: &mut dyn FnMut(Url, Kind) -> Result<String, MintError>,
) -> Result<String, RewriteError> {
    let text = text.strip_prefix('\u{feff}').unwrap_or(text);
    if !text.trim_start().starts_with("#EXTM3U") {
        return Err(RewriteError::NotHls);
    }
    let has = |tag: &str| text.lines().any(|l| l.trim_start().starts_with(tag));
    let master = has("#EXT-X-STREAM-INF");
    if !master && !has("#EXT-X-TARGETDURATION") {
        // An #EXTM3U channel list (or anything else) without media-playlist structure.
        return Err(RewriteError::NotHls);
    }
    if master && depth > 0 {
        return Err(RewriteError::Unsupported(
            "a master playlist nested inside another playlist",
        ));
    }
    let child = Kind::Playlist { depth: depth + 1 };
    let mut out = String::with_capacity(text.len() + 256);
    let mut uris = 0usize;
    let mut variants = 0usize;
    let mut handle = |raw: &str, kind: Kind, uris: &mut usize| -> Result<String, RewriteError> {
        *uris += 1;
        if *uris > limits.max_uris {
            return Err(RewriteError::TooMany("resources"));
        }
        let url = resolve(base, raw)?;
        mint(url, kind)
            .map(|h| format!("{HANDLE_BASE}{h}"))
            .map_err(RewriteError::Mint)
    };

    for raw in text.lines() {
        let line = raw.trim();
        if line.is_empty() {
            out.push('\n');
            continue;
        }
        let Some(tag) = line.strip_prefix('#') else {
            // A resource line: a variant playlist in a master, a media segment otherwise.
            out.push_str(&handle(
                line,
                if master { child } else { Kind::Segment },
                &mut uris,
            )?);
            out.push('\n');
            continue;
        };
        let name = tag.split(':').next().unwrap_or_default();
        let rewritten = match name {
            "EXT-X-STREAM-INF" => {
                variants += 1;
                if variants > limits.max_variants {
                    return Err(RewriteError::TooMany("variants"));
                }
                line.to_owned()
            }
            "EXT-X-KEY" => match attribute(line, "METHOD").as_deref() {
                Some("NONE") => line.to_owned(),
                Some("AES-128") => {
                    if attribute(line, "KEYFORMAT").is_some_and(|f| f != "identity") {
                        return Err(RewriteError::Drm);
                    }
                    replace_uri(line, |u| handle(u, Kind::Key, &mut uris))?.ok_or(
                        RewriteError::Unsupported("an AES-128 key without an address"),
                    )?
                }
                Some(m) if m.starts_with("SAMPLE-AES") => return Err(RewriteError::Drm),
                _ => return Err(RewriteError::Unsupported("an unknown encryption method")),
            },
            "EXT-X-SESSION-KEY" => return Err(RewriteError::Drm),
            "EXT-X-MAP" => replace_uri(line, |u| handle(u, Kind::Init, &mut uris))?.ok_or(
                RewriteError::Unsupported("an initialisation section without an address"),
            )?,
            "EXT-X-MEDIA" | "EXT-X-I-FRAME-STREAM-INF" => {
                if !master {
                    return Err(RewriteError::Unsupported(
                        "rendition tags outside a master playlist",
                    ));
                }
                match replace_uri(line, |u| handle(u, child, &mut uris))? {
                    Some(l) => l,
                    None if name == "EXT-X-MEDIA" => line.to_owned(), // a rendition muxed into the variant
                    None => {
                        return Err(RewriteError::Unsupported(
                            "an I-frame playlist without an address",
                        ))
                    }
                }
            }
            "EXT-X-DEFINE" => {
                return Err(RewriteError::Unsupported(
                    "variable substitution (EXT-X-DEFINE)",
                ))
            }
            // Optional hints; dropping them cannot break playback (see the module comment).
            "EXT-X-PART"
            | "EXT-X-PRELOAD-HINT"
            | "EXT-X-RENDITION-REPORT"
            | "EXT-X-CONTENT-STEERING" => continue,
            "EXT-X-SESSION-DATA" if has_uri_attribute(line) => continue,
            _ if has_uri_attribute(line) => {
                return Err(RewriteError::Unsupported(
                    "a tag that refers to a resource Kinora does not route",
                ))
            }
            _ => line.to_owned(),
        };
        out.push_str(&rewritten);
        out.push('\n');
    }
    Ok(out)
}

/// Resolves a reference against the playlist address; only plain http(s) without sign-in details.
fn resolve(base: &Url, raw: &str) -> Result<Url, RewriteError> {
    if raw.len() > MAX_REFERENCE {
        return Err(RewriteError::Unsupported("an over-long resource address"));
    }
    let url = base
        .join(raw)
        .map_err(|_| RewriteError::Unsupported("a resource address it could not read"))?;
    if !matches!(url.scheme(), "http" | "https") {
        return Err(RewriteError::Unsupported(
            "a resource that is not served over http(s)",
        ));
    }
    if !url.username().is_empty() || url.password().is_some() {
        return Err(RewriteError::Unsupported(
            "resource addresses with sign-in details",
        ));
    }
    Ok(url)
}

/// Attribute spans after the tag's `:`: (name, value start, value end), quotes excluded.
fn attributes(line: &str) -> Vec<(&str, usize, usize)> {
    let Some(colon) = line.find(':') else {
        return Vec::new();
    };
    let bytes = line.as_bytes();
    let mut out = Vec::new();
    let mut i = colon + 1;
    while i < bytes.len() {
        let Some(eq) = line[i..].find('=').map(|e| i + e) else {
            break;
        };
        let name = line[i..eq].trim();
        let (start, end, next) = if bytes.get(eq + 1) == Some(&b'"') {
            let close = line[eq + 2..].find('"').map_or(line.len(), |c| eq + 2 + c);
            (eq + 2, close, close + 1)
        } else {
            let end = line[eq + 1..].find(',').map_or(line.len(), |c| eq + 1 + c);
            (eq + 1, end, end)
        };
        out.push((name, start, end));
        // Skip to just past the next comma that separates attributes.
        i = line[next.min(line.len())..]
            .find(',')
            .map_or(line.len(), |c| next + c + 1);
    }
    out
}

fn attribute(line: &str, name: &str) -> Option<String> {
    attributes(line)
        .into_iter()
        .find(|(n, ..)| *n == name)
        .map(|(_, s, e)| line[s..e].to_owned())
}

/// `URI`, or any `...-URI` attribute (for example SERVER-URI): all of them carry an address.
fn has_uri_attribute(line: &str) -> bool {
    attributes(line)
        .iter()
        .any(|(n, ..)| *n == "URI" || n.ends_with("-URI"))
}

/// Replaces the quoted `URI` attribute with `f(value)`; `None` when the line has no URI.
fn replace_uri(
    line: &str,
    mut f: impl FnMut(&str) -> Result<String, RewriteError>,
) -> Result<Option<String>, RewriteError> {
    let attrs = attributes(line);
    if attrs
        .iter()
        .any(|(n, ..)| *n != "URI" && n.ends_with("-URI"))
    {
        return Err(RewriteError::Unsupported(
            "a tag that refers to a resource Kinora does not route",
        ));
    }
    let Some(&(_, start, end)) = attrs.iter().find(|(n, ..)| *n == "URI") else {
        return Ok(None);
    };
    if line.as_bytes().get(start - 1) != Some(&b'"') {
        return Err(RewriteError::Unsupported("an unquoted resource address"));
    }
    Ok(Some(format!(
        "{}{}{}",
        &line[..start],
        f(&line[start..end])?,
        &line[end..]
    )))
}

#[cfg(test)]
mod tests {
    use super::*;

    const LIMITS: Limits = Limits {
        max_uris: 100,
        max_variants: 4,
    };

    /// Rewrites with sequential handles; returns the text and every (url, kind) minted.
    fn run(
        text: &str,
        base: &str,
        depth: u8,
    ) -> Result<(String, Vec<(String, Kind)>), RewriteError> {
        let mut minted = Vec::new();
        let out = rewrite(
            text,
            &Url::parse(base).unwrap(),
            depth,
            LIMITS,
            &mut |url, kind| {
                minted.push((url.to_string(), kind));
                Ok(format!("h{}", minted.len()))
            },
        )?;
        Ok((out, minted))
    }

    #[test]
    fn master_playlist_variants_and_renditions_become_handles() {
        let (out, minted) = run(
            concat!(
            "#EXTM3U\n",
            "#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID=\"aud\",NAME=\"English\",URI=\"audio/en.m3u8\"\n",
            "#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID=\"aud\",NAME=\"Main\",DEFAULT=YES\n",
            "#EXT-X-STREAM-INF:BANDWIDTH=800000,CODECS=\"avc1.42c01e,mp4a.40.2\",AUDIO=\"aud\"\n",
            "low/index.m3u8?token=SECRET\n",
            "#EXT-X-I-FRAME-STREAM-INF:BANDWIDTH=90000,URI=\"iframes.m3u8\"\n",
        ),
            "https://cdn.example/live/master.m3u8",
            0,
        )
        .unwrap();
        assert_eq!(
            minted,
            vec![
                (
                    "https://cdn.example/live/audio/en.m3u8".into(),
                    Kind::Playlist { depth: 1 }
                ),
                (
                    "https://cdn.example/live/low/index.m3u8?token=SECRET".into(),
                    Kind::Playlist { depth: 1 }
                ),
                (
                    "https://cdn.example/live/iframes.m3u8".into(),
                    Kind::Playlist { depth: 1 }
                ),
            ]
        );
        assert!(out.contains("URI=\"kstream://localhost/h1\""));
        assert!(out.contains("\nkstream://localhost/h2\n"));
        assert!(out.contains("URI=\"kstream://localhost/h3\""));
        assert!(
            out.contains("CODECS=\"avc1.42c01e,mp4a.40.2\",AUDIO=\"aud\""),
            "other attributes untouched:\n{out}"
        );
        assert!(
            !out.contains("cdn.example") && !out.contains("SECRET"),
            "no upstream address may remain:\n{out}"
        );
    }

    #[test]
    fn media_playlist_segments_maps_keys_and_byte_ranges() {
        let (out, minted) = run(concat!(
            "#EXTM3U\n#EXT-X-VERSION:7\n#EXT-X-TARGETDURATION:6\n#EXT-X-MEDIA-SEQUENCE:42\n",
            "#EXT-X-MAP:URI=\"init.mp4\",BYTERANGE=\"720@0\"\n",
            "#EXT-X-KEY:METHOD=AES-128,URI=\"https://keys.example/k?id=7\",IV=0x0123456789abcdef0123456789abcdef\n",
            "#EXTINF:6.0,\n#EXT-X-BYTERANGE:1000@720\nmedia.mp4\n",
            "#EXTINF:6.0,\n/abs/seg2.ts\n",
            "#EXTINF:6.0,\nhttps://other.example/seg3.ts\n",
            "#EXT-X-KEY:METHOD=NONE\n#EXTINF:6.0,\nseg4.ts\n#EXT-X-ENDLIST\n",
        ), "https://cdn.example/a/b/media.m3u8", 1).unwrap();
        assert_eq!(
            minted,
            vec![
                ("https://cdn.example/a/b/init.mp4".into(), Kind::Init),
                ("https://keys.example/k?id=7".into(), Kind::Key),
                ("https://cdn.example/a/b/media.mp4".into(), Kind::Segment),
                ("https://cdn.example/abs/seg2.ts".into(), Kind::Segment),
                ("https://other.example/seg3.ts".into(), Kind::Segment),
                ("https://cdn.example/a/b/seg4.ts".into(), Kind::Segment),
            ]
        );
        assert!(out.contains("#EXT-X-MAP:URI=\"kstream://localhost/h1\",BYTERANGE=\"720@0\""));
        assert!(out.contains("#EXT-X-KEY:METHOD=AES-128,URI=\"kstream://localhost/h2\",IV=0x0123456789abcdef0123456789abcdef"));
        assert!(out.contains("#EXT-X-BYTERANGE:1000@720\nkstream://localhost/h3\n"));
        assert!(out.contains("#EXT-X-MEDIA-SEQUENCE:42") && out.contains("#EXT-X-ENDLIST"));
        assert!(!out.contains("example"));
    }

    #[test]
    fn relative_references_resolve_against_the_address_after_redirects() {
        let (_, minted) = run(
            "#EXTM3U\n#EXT-X-TARGETDURATION:2\n#EXTINF:2,\n../seg/1.ts\n",
            "https://edge7.cdn.example/path/x/live.m3u8",
            1,
        )
        .unwrap();
        assert_eq!(minted[0].0, "https://edge7.cdn.example/path/seg/1.ts");
    }

    #[test]
    fn drm_and_unknown_encryption_are_refused() {
        let media =
            |key: &str| format!("#EXTM3U\n#EXT-X-TARGETDURATION:6\n{key}\n#EXTINF:6,\na.ts\n");
        for key in [
            "#EXT-X-KEY:METHOD=SAMPLE-AES,URI=\"skd://key\",KEYFORMAT=\"com.apple.streamingkeydelivery\"",
            "#EXT-X-KEY:METHOD=SAMPLE-AES-CTR,URI=\"data:text/plain;base64,AAAA\",KEYFORMAT=\"urn:uuid:edef8ba9-79d6-4ace-a3c8-27dcd51d21ed\"",
            "#EXT-X-KEY:METHOD=AES-128,URI=\"k.bin\",KEYFORMAT=\"com.example.drm\"",
            "#EXT-X-SESSION-KEY:METHOD=AES-128,URI=\"k.bin\"",
        ] {
            assert_eq!(run(&media(key), "https://c.example/m.m3u8", 1).unwrap_err(), RewriteError::Drm, "{key}");
        }
        assert!(matches!(
            run(
                &media("#EXT-X-KEY:METHOD=CHACHA,URI=\"k\""),
                "https://c.example/m.m3u8",
                1
            ),
            Err(RewriteError::Unsupported(_))
        ));
        let ok = run(
            &media("#EXT-X-KEY:METHOD=AES-128,URI=\"k.bin\",KEYFORMAT=\"identity\""),
            "https://c.example/m.m3u8",
            1,
        )
        .unwrap();
        assert_eq!(ok.1[0], ("https://c.example/k.bin".into(), Kind::Key));
    }

    #[test]
    fn unknown_uri_bearing_tags_fail_closed() {
        for tag in [
            "#EXT-X-FUTURE-THING:URI=\"https://evil.example/x\"",
            "#EXT-X-DATERANGE:ID=\"ad\",START-DATE=\"2026-01-01T00:00:00Z\",X-ASSET-URI=\"https://ads.example/a.m3u8\"",
            "#EXT-X-MAP:URI=\"init.mp4\",X-OTHER-URI=\"https://evil.example/x\"",
        ] {
            let text = format!("#EXTM3U\n#EXT-X-TARGETDURATION:6\n{tag}\n#EXTINF:6,\na.ts\n");
            assert!(matches!(run(&text, "https://c.example/m.m3u8", 1), Err(RewriteError::Unsupported(_))), "{tag}");
        }
        assert!(matches!(run("#EXTM3U\n#EXT-X-DEFINE:NAME=\"t\",VALUE=\"x\"\n#EXT-X-TARGETDURATION:6\n#EXTINF:6,\n{$t}.ts\n", "https://c.example/m.m3u8", 1), Err(RewriteError::Unsupported(_))));
    }

    #[test]
    fn optional_low_latency_and_steering_hints_are_dropped_not_passed_through() {
        let (out, minted) = run(concat!(
            "#EXTM3U\n#EXT-X-TARGETDURATION:4\n#EXT-X-PART-INF:PART-TARGET=1.0\n",
            "#EXT-X-CONTENT-STEERING:SERVER-URI=\"https://steer.example/s\"\n",
            "#EXT-X-PART:DURATION=1.0,URI=\"part1.mp4\"\n#EXTINF:4,\nseg1.mp4\n",
            "#EXT-X-PRELOAD-HINT:TYPE=PART,URI=\"part2.mp4\"\n#EXT-X-RENDITION-REPORT:URI=\"../other.m3u8\",LAST-MSN=1\n",
        ), "https://c.example/ll.m3u8", 1).unwrap();
        assert_eq!(
            minted,
            vec![("https://c.example/seg1.mp4".into(), Kind::Segment)]
        );
        assert!(!out.contains("part") && !out.contains("steer") && !out.contains("other.m3u8"));
    }

    #[test]
    fn non_hls_inputs_are_recognised() {
        for text in [
            "",
            "<html>login</html>",
            "#EXTM3U\n#EXTINF:-1 tvg-id=\"a\",Channel\nhttps://c.example/a.m3u8\n",
            "\u{0}\u{0}\u{1}G binary ts",
        ] {
            assert_eq!(
                run(text, "https://c.example/x", 0).unwrap_err(),
                RewriteError::NotHls,
                "{text:?}"
            );
        }
    }

    #[test]
    fn nesting_and_count_limits() {
        let master = "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\na.m3u8\n";
        assert!(run(master, "https://c.example/m", 0).is_ok());
        assert!(
            matches!(
                run(master, "https://c.example/m", 1),
                Err(RewriteError::Unsupported(_))
            ),
            "a master may only be the root"
        );
        let many = format!(
            "#EXTM3U\n{}",
            "#EXT-X-STREAM-INF:BANDWIDTH=1\nv.m3u8\n".repeat(5)
        );
        assert_eq!(
            run(&many, "https://c.example/m", 0).unwrap_err(),
            RewriteError::TooMany("variants")
        );
        let long = format!(
            "#EXTM3U\n#EXT-X-TARGETDURATION:1\n{}",
            "#EXTINF:1,\ns.ts\n".repeat(101)
        );
        assert_eq!(
            run(&long, "https://c.example/m", 1).unwrap_err(),
            RewriteError::TooMany("resources")
        );
    }

    #[test]
    fn only_plain_http_resources_are_routed() {
        for reference in [
            "file:///etc/passwd",
            "data:video/mp2t;base64,AAAA",
            "ftp://c.example/a.ts",
            "https://user:pw@c.example/a.ts",
            "javascript:alert(1)",
        ] {
            let text = format!("#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXTINF:6,\n{reference}\n");
            assert!(
                matches!(
                    run(&text, "https://c.example/m", 1),
                    Err(RewriteError::Unsupported(_))
                ),
                "{reference}"
            );
        }
        let unquoted =
            "#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXT-X-MAP:URI=init.mp4\n#EXTINF:6,\na.ts\n";
        assert!(matches!(
            run(unquoted, "https://c.example/m", 1),
            Err(RewriteError::Unsupported(_))
        ));
    }

    #[test]
    fn mint_refusals_stop_the_rewrite() {
        let text = "#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXTINF:6,\nhttp://10.0.0.1/a.ts\n";
        let err = rewrite(
            text,
            &Url::parse("https://c.example/m").unwrap(),
            1,
            LIMITS,
            &mut |_, _| Err(MintError::Blocked),
        )
        .unwrap_err();
        assert_eq!(err, RewriteError::Mint(MintError::Blocked));
    }
}
