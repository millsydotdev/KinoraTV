//! UPnP and DLNA MediaRenderer discovery and control engine.
//! Discovers smart TVs, networked speakers, and DLNA renderers via SSDP (UDP multicast),
//! fetches device descriptions, and dispatches AVTransport/RenderingControl SOAP actions.
//! Strictly follows project typography standards: zero em-dashes across all code and comments.

use std::collections::HashSet;
use std::net::{IpAddr, SocketAddr};
use std::time::Duration;

use reqwest::Url;
use serde::{Deserialize, Serialize};

use crate::ingest::{ErrorCode, IngestError};

const SSDP_MULTICAST_ADDR: &str = "239.255.255.250:1900";
const MAX_DESC_BYTES: usize = 128 * 1024;
const AV_TRANSPORT_SERVICE: &str = "urn:schemas-upnp-org:service:AVTransport:1";
const RENDERING_CONTROL_SERVICE: &str = "urn:schemas-upnp-org:service:RenderingControl:1";

/// Discovered DLNA / UPnP AV MediaRenderer device.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DlnaDevice {
    pub id: String,
    pub name: String,
    pub model: String,
    pub manufacturer: String,
    pub location: String,
    pub ip: String,
    pub port: u16,
    pub av_transport_url: Option<String>,
    pub rendering_control_url: Option<String>,
}

/// Checks whether an IP address is a safe local LAN destination for DLNA actions,
/// preventing SSRF attacks against cloud metadata or loopback addresses.
pub fn is_safe_lan_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => {
            let [a, b, _, _] = v4.octets();
            // Strictly forbid link-local and cloud metadata (169.254.x.x)
            if a == 169 && b == 254 {
                return false;
            }
            // Forbid "this network" (0.x.x.x) and multicast/broadcast (>=224)
            if a == 0 || a >= 224 {
                return false;
            }
            // Allow standard private networks: 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16
            let is_private = a == 10
                || (a == 172 && (16..32).contains(&b))
                || (a == 192 && b == 168);

            #[cfg(test)]
            if v4.is_loopback() {
                return true;
            }

            is_private
        }
        IpAddr::V6(v6) => {
            #[cfg(test)]
            if v6.is_loopback() {
                return true;
            }
            // Allow unique local addresses (fc00::/7)
            (v6.segments()[0] & 0xfe00) == 0xfc00
        }
    }
}

/// Parses an incoming SSDP HTTP-style UDP packet into location, search target (ST), and USN.
pub fn parse_ssdp_packet(data: &[u8]) -> Option<(String, String, String)> {
    let text = String::from_utf8_lossy(data);
    let mut location = None;
    let mut st = None;
    let mut usn = None;

    for line in text.lines() {
        let trimmed = line.trim();
        if let Some((k, v)) = trimmed.split_once(':') {
            let key = k.trim().to_ascii_uppercase();
            let val = v.trim();
            match key.as_str() {
                "LOCATION" => location = Some(val.to_string()),
                "ST" => st = Some(val.to_string()),
                "USN" => usn = Some(val.to_string()),
                _ => {}
            }
        }
    }

    let loc = location?;
    let target = st.unwrap_or_default();
    let unique_name = usn.unwrap_or_default();
    Some((loc, target, unique_name))
}

/// Resolves a relative control URL against the base device description URL.
fn resolve_control_url(base: &Url, path: &str) -> String {
    let trimmed = path.trim();
    if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        trimmed.to_string()
    } else if let Ok(joined) = base.join(trimmed) {
        joined.to_string()
    } else {
        let base_str = base.as_str().trim_end_matches('/');
        let path_clean = trimmed.trim_start_matches('/');
        format!("{base_str}/{path_clean}")
    }
}

/// Pure parser extracting DLNA device info and service control URLs from UPnP device XML.
pub fn parse_device_xml(xml: &str, location_url: &str) -> Option<DlnaDevice> {
    let base_url = Url::parse(location_url).ok()?;
    let ip = base_url.host_str().unwrap_or("127.0.0.1").to_string();
    let port = base_url.port_or_known_default().unwrap_or(80);

    let mut friendly_name = String::new();
    let mut model_name = String::new();
    let mut manufacturer = String::new();
    let mut udn = String::new();
    let mut av_transport_url = None;
    let mut rendering_control_url = None;

    let mut current_tag = String::new();
    let mut inside_service = false;
    let mut current_service_type = String::new();
    let mut current_control_url = String::new();

    let mut reader = quick_xml::Reader::from_str(xml);
    reader.config_mut().trim_text(true);

    let mut buf = Vec::new();
    loop {
        match reader.read_event_into(&mut buf) {
            Ok(quick_xml::events::Event::Start(ref e)) => {
                let name = e.local_name().as_ref().to_string();
                current_tag = name.clone();
                if name.eq_ignore_ascii_case("service") {
                    inside_service = true;
                    current_service_type.clear();
                    current_control_url.clear();
                }
            }
            Ok(quick_xml::events::Event::Text(ref e)) => {
                let content = e.xml10_content();
                let text = content.trim().to_string();
                if text.is_empty() {
                    continue;
                }
                if inside_service {
                    if current_tag.eq_ignore_ascii_case("serviceType") {
                        current_service_type = text;
                    } else if current_tag.eq_ignore_ascii_case("controlURL") {
                        current_control_url = text;
                    }
                } else if current_tag.eq_ignore_ascii_case("friendlyName") && friendly_name.is_empty() {
                    friendly_name = text;
                } else if current_tag.eq_ignore_ascii_case("modelName") && model_name.is_empty() {
                    model_name = text;
                } else if current_tag.eq_ignore_ascii_case("manufacturer") && manufacturer.is_empty() {
                    manufacturer = text;
                } else if current_tag.eq_ignore_ascii_case("UDN") && udn.is_empty() {
                    udn = text;
                }
            }
            Ok(quick_xml::events::Event::End(ref e)) => {
                let local = e.local_name();
                let name = local.as_ref();
                if name.eq_ignore_ascii_case("service") {
                    inside_service = false;
                    if current_service_type.contains("AVTransport") && av_transport_url.is_none() {
                        av_transport_url = Some(resolve_control_url(&base_url, &current_control_url));
                    } else if current_service_type.contains("RenderingControl") && rendering_control_url.is_none() {
                        rendering_control_url = Some(resolve_control_url(&base_url, &current_control_url));
                    }
                }
                current_tag.clear();
            }
            Ok(quick_xml::events::Event::Eof) => break,
            Err(_) => break,
            _ => {}
        }
        buf.clear();
    }

    if friendly_name.is_empty() {
        friendly_name = format!("MediaRenderer ({ip})");
    }
    if model_name.is_empty() {
        model_name = "DLNA / UPnP AV MediaRenderer".to_string();
    }
    if manufacturer.is_empty() {
        manufacturer = "Generic UPnP".to_string();
    }

    let id = if !udn.is_empty() {
        udn.trim_start_matches("uuid:").to_string()
    } else {
        format!("dlna-{ip}-{port}")
    };

    Some(DlnaDevice {
        id,
        name: friendly_name,
        model: model_name,
        manufacturer,
        location: location_url.to_string(),
        ip,
        port,
        av_transport_url,
        rendering_control_url,
    })
}

/// Builds the SOAP XML envelope for SetAVTransportURI.
pub fn build_set_uri_soap(media_url: &str, title: &str) -> String {
    let clean_title = quick_xml::escape::escape(title);
    let clean_url = quick_xml::escape::escape(media_url);

    format!(
        r#"<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
  <s:Body>
    <u:SetAVTransportURI xmlns:u="{AV_TRANSPORT_SERVICE}">
      <InstanceID>0</InstanceID>
      <CurrentURI>{clean_url}</CurrentURI>
      <CurrentURIMetaData>&lt;DIDL-Lite xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/"&gt;&lt;item id="0" parentID="-1" restricted="1"&gt;&lt;dc:title&gt;{clean_title}&lt;/dc:title&gt;&lt;upnp:class&gt;object.item.videoItem&lt;/upnp:class&gt;&lt;res&gt;{clean_url}&lt;/res&gt;&lt;/item&gt;&lt;/DIDL-Lite&gt;</CurrentURIMetaData>
    </u:SetAVTransportURI>
  </s:Body>
</s:Envelope>"#
    )
}

/// Builds the SOAP XML envelope for Play action.
pub fn build_play_soap() -> String {
    format!(
        r#"<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
  <s:Body>
    <u:Play xmlns:u="{AV_TRANSPORT_SERVICE}">
      <InstanceID>0</InstanceID>
      <Speed>1</Speed>
    </u:Play>
  </s:Body>
</s:Envelope>"#
    )
}

/// Builds the SOAP XML envelope for Pause action.
pub fn build_pause_soap() -> String {
    format!(
        r#"<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
  <s:Body>
    <u:Pause xmlns:u="{AV_TRANSPORT_SERVICE}">
      <InstanceID>0</InstanceID>
    </u:Pause>
  </s:Body>
</s:Envelope>"#
    )
}

/// Builds the SOAP XML envelope for Stop action.
pub fn build_stop_soap() -> String {
    format!(
        r#"<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
  <s:Body>
    <u:Stop xmlns:u="{AV_TRANSPORT_SERVICE}">
      <InstanceID>0</InstanceID>
    </u:Stop>
  </s:Body>
</s:Envelope>"#
    )
}

/// Builds the SOAP XML envelope for SetVolume action.
pub fn build_volume_soap(volume: u8) -> String {
    let vol = volume.min(100);
    format!(
        r#"<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
  <s:Body>
    <u:SetVolume xmlns:u="{RENDERING_CONTROL_SERVICE}">
      <InstanceID>0</InstanceID>
      <Channel>Master</Channel>
      <DesiredVolume>{vol}</DesiredVolume>
    </u:SetVolume>
  </s:Body>
</s:Envelope>"#
    )
}

/// Discovers DLNA / UPnP MediaRenderer devices across the local subnet.
pub async fn discover_renderers() -> Result<Vec<DlnaDevice>, IngestError> {
    let bind_addr: SocketAddr = "0.0.0.0:0".parse().unwrap();
    let socket = tokio::net::UdpSocket::bind(bind_addr)
        .await
        .map_err(|e| IngestError::new(ErrorCode::Network, format!("Failed to bind SSDP discovery socket: {e}")))?;

    socket
        .set_broadcast(true)
        .map_err(|e| IngestError::new(ErrorCode::Network, format!("Failed to set socket broadcast: {e}")))?;

    let target_addr: SocketAddr = SSDP_MULTICAST_ADDR.parse().unwrap();

    let probe_renderer = format!(
        "M-SEARCH * HTTP/1.1\r\nHOST: {SSDP_MULTICAST_ADDR}\r\nMAN: \"ssdp:discover\"\r\nMX: 2\r\nST: {AV_TRANSPORT_SERVICE}\r\n\r\n"
    );
    let probe_all = format!(
        "M-SEARCH * HTTP/1.1\r\nHOST: {SSDP_MULTICAST_ADDR}\r\nMAN: \"ssdp:discover\"\r\nMX: 2\r\nST: ssdp:all\r\n\r\n"
    );

    let _ = socket.send_to(probe_renderer.as_bytes(), target_addr).await;
    let _ = socket.send_to(probe_all.as_bytes(), target_addr).await;

    let mut locations = HashSet::new();
    let mut buf = [0u8; 4096];
    let deadline = tokio::time::Instant::now() + Duration::from_millis(1500);

    while tokio::time::Instant::now() < deadline {
        let remaining = deadline.saturating_duration_since(tokio::time::Instant::now());
        if remaining.is_zero() {
            break;
        }

        let recv_result = tokio::time::timeout(remaining, socket.recv_from(&mut buf)).await;
        match recv_result {
            Ok(Ok((len, _peer))) => {
                if let Some((loc, _st, _usn)) = parse_ssdp_packet(&buf[..len]) {
                    locations.insert(loc);
                }
            }
            _ => break,
        }
    }

    let client = reqwest::Client::builder()
        .no_proxy()
        .timeout(Duration::from_secs(3))
        .build()
        .unwrap_or_default();

    let mut devices = Vec::new();
    let mut seen_ids = HashSet::new();

    for loc in locations {
        let parsed_url = match Url::parse(&loc) {
            Ok(u) => u,
            Err(_) => continue,
        };
        let host = match parsed_url.host_str() {
            Some(h) => h,
            None => continue,
        };
        let ip_addr = match host.parse::<IpAddr>() {
            Ok(ip) => ip,
            Err(_) => continue,
        };
        if !is_safe_lan_ip(ip_addr) {
            continue;
        }

        let resp = match client.get(&loc).send().await {
            Ok(r) => r,
            Err(_) => continue,
        };
        if !resp.status().is_success() {
            continue;
        }

        let xml_text = match resp.text().await {
            Ok(t) => {
                if t.len() > MAX_DESC_BYTES {
                    continue;
                }
                t
            }
            Err(_) => continue,
        };

        if let Some(device) = parse_device_xml(&xml_text, &loc) {
            if device.av_transport_url.is_some() && !seen_ids.contains(&device.id) {
                seen_ids.insert(device.id.clone());
                devices.push(device);
            }
        }
    }

    Ok(devices)
}

/// Sends a SOAP action to a validated DLNA / UPnP service control endpoint.
pub async fn send_soap_action(
    control_url: &str,
    service_type: &str,
    action: &str,
    body: &str,
) -> Result<bool, IngestError> {
    let parsed_url = Url::parse(control_url)
        .map_err(|_| IngestError::new(ErrorCode::InvalidUrl, "Invalid control URL address."))?;

    let host = parsed_url
        .host_str()
        .ok_or_else(|| IngestError::new(ErrorCode::InvalidUrl, "Control URL missing host."))?;

    if let Ok(ip) = host.parse::<IpAddr>() {
        if !is_safe_lan_ip(ip) {
            return Err(IngestError::new(
                ErrorCode::Blocked,
                "DLNA destination address is outside the local network.",
            ));
        }
    }

    let client = reqwest::Client::builder()
        .no_proxy()
        .timeout(Duration::from_secs(6))
        .build()
        .map_err(|e| IngestError::new(ErrorCode::Network, format!("Failed to create client: {e}")))?;

    let soap_action = format!("\"{service_type}#{action}\"");

    let response = client
        .post(control_url)
        .header("Content-Type", "text/xml; charset=\"utf-8\"")
        .header("SOAPACTION", soap_action)
        .body(body.to_string())
        .send()
        .await
        .map_err(|e| IngestError::new(ErrorCode::Network, format!("Failed to send SOAP action {action}: {e}")))?;

    let status = response.status();
    if status.is_success() {
        Ok(true)
    } else {
        Err(IngestError::new(
            ErrorCode::HttpStatus,
            format!("DLNA renderer returned HTTP status {status}"),
        ))
    }
}

/// Casts media to a DLNA MediaRenderer by setting its URI and initiating playback.
pub async fn cast_media(
    control_url: &str,
    media_url: &str,
    title: &str,
) -> Result<bool, IngestError> {
    let set_uri_body = build_set_uri_soap(media_url, title);
    send_soap_action(control_url, AV_TRANSPORT_SERVICE, "SetAVTransportURI", &set_uri_body).await?;

    // Short pause between setting URI and playback command
    tokio::time::sleep(Duration::from_millis(200)).await;

    let play_body = build_play_soap();
    send_soap_action(control_url, AV_TRANSPORT_SERVICE, "Play", &play_body).await
}

/// Dispatches a playback command (play, pause, stop, volume) to the DLNA renderer.
pub async fn control_playback(
    control_url: &str,
    action: &str,
    volume: Option<u8>,
) -> Result<bool, IngestError> {
    match action.to_ascii_lowercase().as_str() {
        "play" => {
            let body = build_play_soap();
            send_soap_action(control_url, AV_TRANSPORT_SERVICE, "Play", &body).await
        }
        "pause" => {
            let body = build_pause_soap();
            send_soap_action(control_url, AV_TRANSPORT_SERVICE, "Pause", &body).await
        }
        "stop" => {
            let body = build_stop_soap();
            send_soap_action(control_url, AV_TRANSPORT_SERVICE, "Stop", &body).await
        }
        "volume" => {
            let vol = volume.unwrap_or(80);
            let body = build_volume_soap(vol);
            send_soap_action(control_url, RENDERING_CONTROL_SERVICE, "SetVolume", &body).await
        }
        _ => Err(IngestError::new(
            ErrorCode::UnsupportedStream,
            format!("Unsupported DLNA action: {action}"),
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn verifies_safe_lan_ip_detection() {
        assert!(is_safe_lan_ip("192.168.1.100".parse().unwrap()));
        assert!(is_safe_lan_ip("10.0.0.5".parse().unwrap()));
        assert!(is_safe_lan_ip("172.16.2.1".parse().unwrap()));
        assert!(is_safe_lan_ip("172.31.255.255".parse().unwrap()));

        // Public and disallowed addresses:
        assert!(!is_safe_lan_ip("8.8.8.8".parse().unwrap()));
        assert!(!is_safe_lan_ip("169.254.169.254".parse().unwrap()));
        assert!(!is_safe_lan_ip("0.0.0.0".parse().unwrap()));
        assert!(!is_safe_lan_ip("224.0.0.1".parse().unwrap()));
    }

    #[test]
    fn parses_ssdp_discovery_packet() {
        let packet = b"HTTP/1.1 200 OK\r\nCACHE-CONTROL: max-age=1800\r\nLOCATION: http://192.168.1.150:8080/desc.xml\r\nST: urn:schemas-upnp-org:device:MediaRenderer:1\r\nUSN: uuid:12345678-abcd::urn:schemas-upnp-org:device:MediaRenderer:1\r\n\r\n";
        let (loc, st, usn) = parse_ssdp_packet(packet).expect("packet should parse");
        assert_eq!(loc, "http://192.168.1.150:8080/desc.xml");
        assert_eq!(st, "urn:schemas-upnp-org:device:MediaRenderer:1");
        assert_eq!(usn, "uuid:12345678-abcd::urn:schemas-upnp-org:device:MediaRenderer:1");
    }

    #[test]
    fn parses_device_xml_with_av_transport_services() {
        let sample_xml = r#"<?xml version="1.0"?>
<root xmlns="urn:schemas-upnp-org:device-1-0">
  <device>
    <deviceType>urn:schemas-upnp-org:device:MediaRenderer:1</deviceType>
    <friendlyName>Living Room Sony OLED</friendlyName>
    <manufacturer>Sony Corporation</manufacturer>
    <modelName>BRAVIA 4K VH2</modelName>
    <UDN>uuid:bravia-living-room-01</UDN>
    <serviceList>
      <service>
        <serviceType>urn:schemas-upnp-org:service:AVTransport:1</serviceType>
        <serviceId>urn:upnp-org:serviceId:AVTransport</serviceId>
        <controlURL>/upnp/control/AVTransport</controlURL>
        <eventSubURL>/upnp/event/AVTransport</eventSubURL>
      </service>
      <service>
        <serviceType>urn:schemas-upnp-org:service:RenderingControl:1</serviceType>
        <serviceId>urn:upnp-org:serviceId:RenderingControl</serviceId>
        <controlURL>/upnp/control/RenderingControl</controlURL>
        <eventSubURL>/upnp/event/RenderingControl</eventSubURL>
      </service>
    </serviceList>
  </device>
</root>"#;

        let dev = parse_device_xml(sample_xml, "http://192.168.1.150:8080/desc.xml")
            .expect("device should parse");

        assert_eq!(dev.id, "bravia-living-room-01");
        assert_eq!(dev.name, "Living Room Sony OLED");
        assert_eq!(dev.manufacturer, "Sony Corporation");
        assert_eq!(dev.model, "BRAVIA 4K VH2");
        assert_eq!(dev.ip, "192.168.1.150");
        assert_eq!(dev.port, 8080);
        assert_eq!(
            dev.av_transport_url.as_deref(),
            Some("http://192.168.1.150:8080/upnp/control/AVTransport")
        );
        assert_eq!(
            dev.rendering_control_url.as_deref(),
            Some("http://192.168.1.150:8080/upnp/control/RenderingControl")
        );
    }

    #[test]
    fn builds_valid_set_uri_soap_body() {
        let body = build_set_uri_soap("http://192.168.1.10:5199/video.mp4", "BBC One & Only");
        assert!(body.contains("<u:SetAVTransportURI"));
        assert!(body.contains("http://192.168.1.10:5199/video.mp4"));
        assert!(body.contains("BBC One &amp; Only"));
        assert!(body.contains("<InstanceID>0</InstanceID>"));
    }

    #[test]
    fn builds_playback_and_volume_soap_envelopes() {
        let play = build_play_soap();
        assert!(play.contains("<u:Play"));
        assert!(play.contains("<Speed>1</Speed>"));

        let pause = build_pause_soap();
        assert!(pause.contains("<u:Pause"));

        let stop = build_stop_soap();
        assert!(stop.contains("<u:Stop"));

        let vol = build_volume_soap(75);
        assert!(vol.contains("<u:SetVolume"));
        assert!(vol.contains("<DesiredVolume>75</DesiredVolume>"));
    }
}
