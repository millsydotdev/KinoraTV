//! DASH manifest rewriting for the stream protocol (`stream.rs`), the counterpart of `hls.rs`. DASH
//! names segments with templates (`$Number$.m4s`) relative to a base address, so instead of one handle
//! per segment it uses a *prefix handle*: `kstream://localhost/<handle>/` stands for one upstream
//! directory, and `stream.rs` resolves what follows it on the same host. No upstream host, directory
//! or query reaches the webview. Pure: no I/O.
//!
//! Fails closed: DRM (`ContentProtection`), remote manifest parts (`xlink:href`), and any address that
//! cannot be routed refuse the whole manifest. Parts the player would otherwise fetch on its own (time
//! servers, manifest relocation, reporting, content steering) are removed: live timing then uses the
//! system clock, which is the player's documented fallback.

use quick_xml::events::{BytesStart, BytesText, Event};
use quick_xml::{Reader, Writer, XmlVersion};
use reqwest::Url;

use crate::hls::{Kind, MintError, RewriteError, HANDLE_BASE};

const MAX_REFERENCE: usize = 4096;
/// Attributes holding a segment address or template.
const URL_ATTRIBUTES: &[&str] = &[
    "media",
    "initialization",
    "index",
    "sourceURL",
    "bitstreamSwitching",
];
/// Elements dropped with their contents, because the player would fetch them itself.
const REMOVED: &[&str] = &[
    "UTCTiming",
    "Location",
    "PatchLocation",
    "Metrics",
    "ContentSteering",
    "ProgramInformation",
];

fn invalid(_: impl std::fmt::Debug) -> RewriteError {
    RewriteError::NotHls // reported to the user as "not a stream Kinora can read"
}

fn has_scheme(reference: &str) -> bool {
    reference.starts_with("//")
        || reference.split_once(':').is_some_and(|(s, rest)| {
            rest.starts_with("//")
                && s.bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b"+.-".contains(&b))
        })
}

/// A prefix handle for the directory of `reference` (resolved against `base`), plus what comes after
/// that directory. A query moves into the handle, so a token never reaches the page; it is the
/// query for everything fetched under that handle.
fn route(
    reference: &str,
    base: &Url,
    uris: &mut usize,
    max_uris: usize,
    mint: &mut dyn FnMut(Url, Kind) -> Result<String, MintError>,
) -> Result<String, RewriteError> {
    if reference.len() > MAX_REFERENCE {
        return Err(RewriteError::Unsupported("an address that is too long"));
    }
    let (path, query) = match reference.split_once('?') {
        Some((p, q)) => (p, Some(q)),
        None => (reference, None),
    };
    let (directory, file) = match path.rfind('/') {
        Some(i) => path.split_at(i + 1),
        None => ("", path),
    };
    let mut target = base
        .join(directory)
        .map_err(|_| RewriteError::Unsupported("an unreadable address"))?;
    target.set_fragment(None);
    target.set_query(query);
    *uris += 1;
    if *uris > max_uris {
        return Err(RewriteError::TooMany("addresses"));
    }
    let handle = mint(target, Kind::Prefix).map_err(RewriteError::Mint)?;
    Ok(format!("{HANDLE_BASE}{handle}/{file}"))
}

/// True if the attribute needs a handle: absolute, or carrying a query the page must not see.
fn must_route(value: &str) -> bool {
    has_scheme(value) || value.contains('?')
}

/// Rewrites `text`, fetched from `base`, so every upstream address is behind a handle from `mint`.
pub fn rewrite(
    text: &str,
    base: &Url,
    max_uris: usize,
    mint: &mut dyn FnMut(Url, Kind) -> Result<String, MintError>,
) -> Result<String, RewriteError> {
    let mut reader = Reader::from_str(text);
    let mut writer = Writer::new(Vec::with_capacity(text.len()));
    let mut uris = 0usize;
    let mut stack: Vec<String> = Vec::new();
    let mut saw_root = false;
    // The base every relative reference ends up under, written once right after <MPD>.
    let mut root_base: Option<String> = None;
    let mut wrote_base = false;
    // Levels (stack depth) that already have a BaseURL: alternates are mirrors, the first is enough.
    let mut based: Vec<usize> = Vec::new();
    let mut in_base_url = false;
    let mut base_text = String::new();

    // Everything before the first child of <MPD> needs the root base decided up front.
    let root_ref = find_root_base(text)?;
    let root_url = match &root_ref {
        Some(r) if has_scheme(r) => None,
        Some(r) => Some(
            base.join(r)
                .map_err(|_| RewriteError::Unsupported("an unreadable address"))?,
        ),
        None => Some(base.clone()),
    };

    loop {
        let event = reader.read_event().map_err(invalid)?;
        match event {
            Event::Eof => break,
            Event::DocType(_) => {
                return Err(RewriteError::Unsupported("a document type declaration"))
            }
            Event::Start(ref e) | Event::Empty(ref e) => {
                let empty = matches!(event, Event::Empty(_));
                let name = e.local_name().as_ref().to_owned();
                if !saw_root {
                    if name != "MPD" {
                        return Err(RewriteError::NotHls);
                    }
                    saw_root = true;
                }
                if name == "ContentProtection" {
                    return Err(RewriteError::Drm);
                }
                if REMOVED.contains(&name.as_str()) {
                    if !empty {
                        reader.read_to_end(e.name()).map_err(invalid)?;
                    }
                    continue;
                }
                let out = rewrite_attributes(e, &name, base, &mut uris, max_uris, mint)?;
                if name == "BaseURL" {
                    if empty {
                        continue;
                    }
                    if based.contains(&stack.len()) {
                        reader.read_to_end(e.name()).map_err(invalid)?;
                        continue;
                    }
                    based.push(stack.len());
                    in_base_url = true;
                    base_text.clear();
                    stack.push(name);
                    continue;
                }
                let is_root = stack.is_empty();
                if empty {
                    writer.write_event(Event::Empty(out)).map_err(invalid)?;
                } else {
                    writer.write_event(Event::Start(out)).map_err(invalid)?;
                    stack.push(name);
                }
                if is_root && !wrote_base {
                    wrote_base = true;
                    let routed = match (&root_url, &root_ref) {
                        (Some(u), _) => route("./", u, &mut uris, max_uris, mint)?,
                        (None, Some(r)) => route(&dir_of(r), base, &mut uris, max_uris, mint)?,
                        (None, None) => unreachable!("no root reference means root_url is set"),
                    };
                    root_base = Some(routed.clone());
                    write_base(&mut writer, &routed)?;
                }
            }
            Event::Text(t) if in_base_url => base_text.push_str(&t.xml10_content()),
            Event::GeneralRef(r) if in_base_url => {
                if &*r != "amp" {
                    return Err(RewriteError::Unsupported("an unreadable address"));
                }
                base_text.push('&');
            }
            Event::End(e) => {
                let name = e.local_name().as_ref().to_owned();
                stack.pop();
                if in_base_url && name == "BaseURL" {
                    in_base_url = false;
                    let value = base_text.trim().to_owned();
                    // The root base was already written; lower levels stay relative unless absolute.
                    if stack.len() > 1 {
                        let routed = if must_route(&value) {
                            route(&dir_of(&value), base, &mut uris, max_uris, mint)?
                        } else {
                            value
                        };
                        write_base(&mut writer, &routed)?;
                    }
                    continue;
                }
                writer.write_event(Event::End(e)).map_err(invalid)?;
            }
            other => writer.write_event(other).map_err(invalid)?,
        }
    }
    if root_base.is_none() {
        return Err(RewriteError::NotHls);
    }
    String::from_utf8(writer.into_inner()).map_err(invalid)
}

/// `a/b/c.mpd` to `a/b/`; a value already ending in `/` is unchanged. Keeps any query.
fn dir_of(reference: &str) -> String {
    let (path, query) = match reference.split_once('?') {
        Some((p, q)) => (p, Some(q)),
        None => (reference, None),
    };
    let dir = path.rfind('/').map_or("", |i| &path[..=i]);
    match query {
        Some(q) => format!("{dir}?{q}"),
        None => dir.to_owned(),
    }
}

fn write_base(writer: &mut Writer<Vec<u8>>, value: &str) -> Result<(), RewriteError> {
    writer
        .write_event(Event::Start(BytesStart::new("BaseURL")))
        .and_then(|()| writer.write_event(Event::Text(BytesText::new(value))))
        .and_then(|()| writer.write_event(Event::End(quick_xml::events::BytesEnd::new("BaseURL"))))
        .map_err(invalid)
}

/// The first BaseURL directly under <MPD>, if any.
fn find_root_base(text: &str) -> Result<Option<String>, RewriteError> {
    let mut reader = Reader::from_str(text);
    let mut depth = 0usize;
    let mut capture = false;
    let mut value = String::new();
    loop {
        match reader.read_event().map_err(invalid)? {
            Event::Eof => return Ok(None),
            Event::Start(e) => {
                if depth == 1 && e.local_name().as_ref() == "BaseURL" {
                    capture = true;
                }
                depth += 1;
            }
            Event::Text(t) if capture => value.push_str(&t.xml10_content()),
            Event::GeneralRef(r) if capture && &*r == "amp" => value.push('&'),
            Event::End(_) => {
                depth = depth.saturating_sub(1);
                if capture {
                    return Ok(Some(value.trim().to_owned()));
                }
                if depth == 0 {
                    return Ok(None);
                }
            }
            _ => {}
        }
    }
}

fn rewrite_attributes(
    e: &BytesStart<'_>,
    name: &str,
    base: &Url,
    uris: &mut usize,
    max_uris: usize,
    mint: &mut dyn FnMut(Url, Kind) -> Result<String, MintError>,
) -> Result<BytesStart<'static>, RewriteError> {
    let mut out = BytesStart::new(name.to_owned());
    for attribute in e.attributes() {
        let attribute = attribute.map_err(invalid)?;
        let key = attribute.key.as_ref();
        if key == "xlink:href" || attribute.key.local_name().as_ref() == "href" {
            return Err(RewriteError::Unsupported("manifest parts stored elsewhere"));
        }
        let raw = attribute
            .normalized_value(XmlVersion::Implicit1_0)
            .map_err(invalid)?;
        let local = attribute.key.local_name();
        if URL_ATTRIBUTES.contains(&local.as_ref()) && must_route(&raw) {
            let routed = route(&raw, base, uris, max_uris, mint)?;
            out.push_attribute((key, routed.as_str()));
        } else {
            out.push_attribute((key, raw.as_ref()));
        }
    }
    Ok(out)
}

/// Resolves what follows a prefix handle. The result stays on the prefix's scheme, host and port, and
/// takes the prefix's query unless the request has its own.
pub fn under_prefix(prefix: &Url, rest: &str) -> Option<Url> {
    if rest.is_empty()
        || rest.len() > MAX_REFERENCE
        || rest.contains('\\')
        || rest.contains('#')
        || rest.starts_with("//")
    {
        return None;
    }
    let mut out = prefix.join(rest).ok()?;
    let same = out.scheme() == prefix.scheme()
        && out.host_str() == prefix.host_str()
        && out.port_or_known_default() == prefix.port_or_known_default();
    if !same || !out.username().is_empty() || out.password().is_some() {
        return None;
    }
    if out.query().is_none() {
        out.set_query(prefix.query());
    }
    Some(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn run(text: &str, base: &str) -> Result<(String, Vec<Url>), RewriteError> {
        let mut minted = Vec::new();
        let base = Url::parse(base).unwrap();
        let mut mint = |u: Url, k: Kind| {
            assert_eq!(k, Kind::Prefix);
            minted.push(u);
            Ok(format!("h{}", minted.len()))
        };
        let out = rewrite(text, &base, 100, &mut mint)?;
        Ok((out, minted))
    }
    const BASE: &str = "https://cdn.example/live/ch1/manifest.mpd?token=SECRET";

    #[test]
    fn a_relative_manifest_gets_one_prefix_for_its_directory_and_no_upstream_address() {
        let (out, minted) = run(r#"<MPD type="dynamic"><Period><AdaptationSet><SegmentTemplate media="$RepresentationID$/$Number$.m4s" initialization="$RepresentationID$/init.mp4"/><Representation id="v"/></AdaptationSet></Period></MPD>"#, BASE).unwrap();
        assert_eq!(minted.len(), 1);
        assert_eq!(minted[0].as_str(), "https://cdn.example/live/ch1/");
        assert!(
            out.contains("<BaseURL>kstream://localhost/h1/</BaseURL>"),
            "{out}"
        );
        assert!(out.contains(r#"media="$RepresentationID$/$Number$.m4s""#));
        assert!(!out.contains("cdn.example") && !out.contains("SECRET"));
    }

    #[test]
    fn a_root_base_is_resolved_and_replaced() {
        let (out, minted) =
            run(r#"<MPD><BaseURL>./media/</BaseURL><Period/></MPD>"#, BASE).unwrap();
        assert_eq!(minted[0].as_str(), "https://cdn.example/live/ch1/media/");
        assert_eq!(out.matches("<BaseURL>").count(), 1);
        let (out, minted) = run(r#"<MPD><BaseURL>https://other.example/x/</BaseURL><BaseURL>https://mirror.example/x/</BaseURL><Period/></MPD>"#, BASE).unwrap();
        assert_eq!(minted[0].as_str(), "https://other.example/x/");
        assert_eq!(out.matches("<BaseURL>").count(), 1);
        assert!(!out.contains("other.example") && !out.contains("mirror.example"));
    }

    #[test]
    fn absolute_addresses_and_queries_in_templates_go_behind_handles() {
        let (out, minted) = run(r#"<MPD><Period><AdaptationSet><BaseURL>https://b.example/set/</BaseURL><SegmentTemplate media="https://c.example/v/$Number$.m4s" initialization="init.mp4?auth=TOK&amp;x=1"/></AdaptationSet></Period></MPD>"#, BASE).unwrap();
        for hidden in ["b.example", "c.example", "TOK"] {
            assert!(!out.contains(hidden), "{hidden} leaked: {out}");
        }
        assert!(minted
            .iter()
            .any(|u| u.as_str() == "https://b.example/set/"));
        assert!(minted.iter().any(|u| u.as_str() == "https://c.example/v/"));
        assert!(minted.iter().any(|u| u.query() == Some("auth=TOK&x=1")));
    }

    #[test]
    fn drm_and_remote_parts_are_refused() {
        assert_eq!(run(r#"<MPD><Period><AdaptationSet><ContentProtection schemeIdUri="urn:uuid:edef8ba9"/></AdaptationSet></Period></MPD>"#, BASE).unwrap_err(), RewriteError::Drm);
        assert!(matches!(
            run(
                r#"<MPD xmlns:xlink="http://www.w3.org/1999/xlink"><Period xlink:href="https://x.example/p.xml"/></MPD>"#,
                BASE
            ),
            Err(RewriteError::Unsupported(_))
        ));
        assert!(matches!(
            run(r#"<!DOCTYPE MPD [<!ENTITY a "b">]><MPD/>"#, BASE),
            Err(RewriteError::Unsupported(_))
        ));
    }

    #[test]
    fn what_the_player_would_fetch_on_its_own_is_removed() {
        let (out, minted) = run(r#"<MPD><ProgramInformation moreInformationURL="https://i.example/"><Title>x</Title></ProgramInformation><Location>https://l.example/m.mpd</Location><PatchLocation>https://p.example</PatchLocation><UTCTiming schemeIdUri="urn:mpeg:dash:utc:http-xsdate:2014" value="https://t.example/"/><Period/></MPD>"#, BASE).unwrap();
        for gone in [
            "i.example",
            "l.example",
            "p.example",
            "t.example",
            "UTCTiming",
        ] {
            assert!(!out.contains(gone), "{gone}: {out}");
        }
        assert_eq!(minted.len(), 1);
    }

    #[test]
    fn a_non_manifest_is_not_read() {
        assert_eq!(
            run("<html><body>Sign in</body></html>", BASE).unwrap_err(),
            RewriteError::NotHls
        );
        assert_eq!(run("#EXTM3U\n", BASE).unwrap_err(), RewriteError::NotHls);
    }

    #[test]
    fn too_many_routed_addresses_are_refused() {
        let many: String = (0..150)
            .map(|i| format!(r#"<SegmentURL media="https://h{i}.example/a.m4s"/>"#))
            .collect();
        let doc = format!("<MPD><Period><AdaptationSet><SegmentList>{many}</SegmentList></AdaptationSet></Period></MPD>");
        assert_eq!(
            run(&doc, BASE).unwrap_err(),
            RewriteError::TooMany("addresses")
        );
    }

    #[test]
    fn a_blocked_address_refuses_the_manifest() {
        let base = Url::parse(BASE).unwrap();
        let mut mint = |_: Url, _: Kind| Err(MintError::Blocked);
        assert_eq!(
            rewrite("<MPD/>", &base, 10, &mut mint).unwrap_err(),
            RewriteError::Mint(MintError::Blocked)
        );
    }

    #[test]
    fn under_a_prefix_only_the_same_host_is_reachable() {
        let p = Url::parse("https://cdn.example:8443/live/ch1/?token=T").unwrap();
        assert_eq!(
            under_prefix(&p, "v/1.m4s").unwrap().as_str(),
            "https://cdn.example:8443/live/ch1/v/1.m4s?token=T"
        );
        assert_eq!(
            under_prefix(&p, "v/1.m4s?own=1").unwrap().query(),
            Some("own=1")
        );
        assert_eq!(
            under_prefix(&p, "../other/1.m4s").unwrap().host_str(),
            Some("cdn.example")
        );
        for bad in [
            "https://evil.example/x",
            "//evil.example/x",
            "http://cdn.example:8443/x",
            "https://cdn.example:1/x",
            "https://user@cdn.example:8443/x",
            "",
            "a\\b",
            "a#b",
        ] {
            assert!(under_prefix(&p, bad).is_none(), "{bad}");
        }
    }
}
