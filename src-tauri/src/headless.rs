//! Headless Kinora Media Server runtime and source hydration.
//!
//! Runs the central Kinora server without initializing WebKitGTK, GTK, or any desktop window,
//! suitable for Linux home servers, Raspberry Pi, NAS devices, and Docker containers.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use crate::{fetch, guides, ingest, remote_server, sources};

const REFRESH_INTERVAL: Duration = Duration::from_secs(30 * 60);

/// Resolves the default server data directory for headless / daemon operation.
pub fn default_server_data_dir() -> PathBuf {
    if let Ok(path) = std::env::var("KINORA_DATA_DIR") {
        let trimmed = path.trim();
        if !trimmed.is_empty() {
            return PathBuf::from(trimmed);
        }
    }
    if let Ok(xdg) = std::env::var("XDG_DATA_HOME") {
        let trimmed = xdg.trim();
        if !trimmed.is_empty() {
            return PathBuf::from(trimmed).join("kinora");
        }
    }
    if let Ok(home) = std::env::var("HOME") {
        let trimmed = home.trim();
        if !trimmed.is_empty() {
            return PathBuf::from(trimmed).join(".local/share/kinora");
        }
    }
    PathBuf::from("./.kinora-server-data")
}

/// Loads saved sources metadata synchronously so clients see channels immediately on startup,
/// before remote playlists finish refreshing.
pub async fn load_cached_sources_into_server(
    sources_dir: &Path,
    manager: &remote_server::RemoteServerManager,
) -> (usize, usize) {
    let store = sources::Store::new(Some(sources_dir.to_path_buf()));
    let loaded = store.load();
    let mut remote_sources = Vec::new();
    let mut remote_channels = Vec::new();

    for src in loaded.saved.sources {
        remote_sources.push(remote_server::RemoteSourceSummary {
            id: src.id.clone(),
            label: src.label,
            origin: match src.origin {
                sources::Origin::Url => "url".to_string(),
                sources::Origin::File => "file".to_string(),
            },
            channel_count: src.channels.len(),
            kind: "playlist".to_string(),
        });

        for ch in src.channels {
            remote_channels.push(remote_server::RemoteChannelSummary {
                id: format!("{}~{}", src.id, ch.key),
                name: ch.name,
                number: ch.chno,
                group: ch.group,
                logo: ch.logo,
                current_programme: None,
                stream_url: None,
            });
        }
    }

    let source_count = remote_sources.len();
    let channel_count = remote_channels.len();

    if !remote_sources.is_empty() {
        manager.update_sources(remote_sources).await;
    }
    if !remote_channels.is_empty() {
        manager.update_channels(remote_channels).await;
    }

    (source_count, channel_count)
}

/// Refreshes saved URL playlists through `fetch.rs` and populates playable in-memory stream URLs
/// on the `RemoteServerManager` so paired LAN clients can play streams through the guarded proxy.
/// Returns `(total_channels, playable_channels)`.
pub async fn hydrate_headless_sources(
    sources_dir: &Path,
    manager: &remote_server::RemoteServerManager,
    policy: &fetch::Policy,
) -> (usize, usize) {
    let store = sources::Store::new(Some(sources_dir.to_path_buf()));
    let loaded = store.load();
    hydrate_sources_list(loaded.saved.sources, manager, policy).await
}

/// Refreshes a list of `SavedSource` entries into `manager`.
pub async fn hydrate_sources_list(
    saved_sources: Vec<sources::SavedSource>,
    manager: &remote_server::RemoteServerManager,
    policy: &fetch::Policy,
) -> (usize, usize) {
    if saved_sources.is_empty() {
        return (0, 0);
    }

    let mut remote_sources = Vec::new();
    let mut remote_channels = Vec::new();
    let mut playable_count = 0usize;

    for src in saved_sources {
        let mut hydrated_for_source = false;

        if src.origin == sources::Origin::Url {
            if let Some(ref url) = src.url {
                match ingest::from_url(url, policy).await {
                    Ok(report) => {
                        let count = report.channels.len();
                        remote_sources.push(remote_server::RemoteSourceSummary {
                            id: src.id.clone(),
                            label: src.label.clone(),
                            origin: "url".to_string(),
                            channel_count: count,
                            kind: "playlist".to_string(),
                        });
                        for ch in report.channels {
                            playable_count += 1;
                            remote_channels.push(remote_server::RemoteChannelSummary {
                                id: format!("{}~{}", src.id, ch.key),
                                name: ch.name,
                                number: ch.chno,
                                group: ch.group,
                                logo: ch.logo,
                                current_programme: None,
                                stream_url: Some(ch.stream_url),
                            });
                        }
                        hydrated_for_source = true;
                    }
                    Err(err) => {
                        // Never log source URLs or tokens: log only safe label and error text.
                        eprintln!(
                            "[Kinora Server] Refresh skipped for '{}': {}",
                            src.name, err.message
                        );
                    }
                }
            }
        }

        if !hydrated_for_source {
            remote_sources.push(remote_server::RemoteSourceSummary {
                id: src.id.clone(),
                label: src.label,
                origin: match src.origin {
                    sources::Origin::Url => "url".to_string(),
                    sources::Origin::File => "file".to_string(),
                },
                channel_count: src.channels.len(),
                kind: "playlist".to_string(),
            });
            for ch in src.channels {
                remote_channels.push(remote_server::RemoteChannelSummary {
                    id: format!("{}~{}", src.id, ch.key),
                    name: ch.name,
                    number: ch.chno,
                    group: ch.group,
                    logo: ch.logo,
                    current_programme: None,
                    stream_url: None,
                });
            }
        }
    }

    let total_channels = remote_channels.len();
    manager.update_sources(remote_sources).await;
    manager.update_channels(remote_channels).await;

    (total_channels, playable_count)
}

/// Loads cached XMLTV guides (`guide-<id>.json`) from `sources_dir`, matches them against
/// saved playlist channels and hand mappings, and populates the server's EPG cache for the
/// current 24-hour window so LAN clients and mobile remotes immediately receive guide data.
pub async fn hydrate_headless_epg(
    sources_dir: &Path,
    manager: &remote_server::RemoteServerManager,
) -> usize {
    let store = sources::Store::new(Some(sources_dir.to_path_buf()));
    let loaded = store.load();
    if loaded.saved.guides.is_empty() || loaded.saved.sources.is_empty() {
        return 0;
    }

    let guide_store = guides::GuideStore::new(Some(sources_dir.to_path_buf()));
    let mut queries = Vec::new();
    let mut lookup: HashMap<(String, String), Vec<String>> = HashMap::new();

    for guide in &loaded.saved.guides {
        if guide_store.load(&guide.id).ok().flatten().is_none() {
            continue;
        }
        let mut requested_ids = Vec::new();
        for src in &loaded.saved.sources {
            if !guide.playlists.is_empty() && !guide.playlists.iter().any(|p| p == &src.id) {
                continue;
            }
            for ch in &src.channels {
                let chan_id = format!("{}~{}", src.id, ch.key);
                let hand = loaded
                    .saved
                    .mappings
                    .iter()
                    .find(|m| m.channel == chan_id && m.guide == guide.id)
                    .map(|m| m.xmltv_id.clone());
                let ask_id = hand.or_else(|| ch.tvg_id.clone());
                if let Some(id_val) = ask_id {
                    requested_ids.push(id_val.clone());
                    lookup
                        .entry((guide.id.clone(), id_val))
                        .or_default()
                        .push(chan_id);
                }
            }
        }
        if !requested_ids.is_empty() {
            queries.push(guides::Query {
                guide: guide.id.clone(),
                ids: requested_ids,
            });
        }
    }

    if queries.is_empty() {
        return 0;
    }

    let now_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0);
    let from_ms = now_ms.saturating_sub(2 * 3_600_000);
    let to_ms = now_ms.saturating_add(24 * 3_600_000);

    let Ok(answers) = guide_store.query(&queries, from_ms, to_ms) else {
        return 0;
    };

    let mut remote_epg = Vec::new();
    for ans in answers {
        if !ans.loaded {
            continue;
        }
        let mut guide_chan_to_kinora: HashMap<String, Vec<String>> = HashMap::new();
        for m in ans.matches {
            if let Some(matched_guide_chan) = m.channel {
                if let Some(kinora_ids) = lookup.get(&(ans.guide.clone(), m.id)) {
                    guide_chan_to_kinora
                        .entry(matched_guide_chan)
                        .or_default()
                        .extend(kinora_ids.iter().cloned());
                }
            }
        }
        for listed in ans.programmes {
            if let Some(kinora_ids) = guide_chan_to_kinora.get(&listed.channel) {
                for chan_id in kinora_ids {
                    remote_epg.push(remote_server::RemoteEpgProgramme {
                        channel_id: chan_id.clone(),
                        title: listed.programme.title.clone(),
                        subtitle: listed.programme.subtitle.clone(),
                        description: listed.programme.desc.clone(),
                        start: listed.programme.start,
                        stop: listed.programme.stop,
                        category: listed.programme.category.clone(),
                        episode: listed.programme.episode.clone(),
                    });
                }
            }
        }
    }

    let count = remote_epg.len();
    if count > 0 {
        manager.update_epg(remote_epg).await;
    }
    count
}

/// Runs Kinora in headless server mode without initializing WebKitGTK or GUI windows.
pub fn run_headless_server(port: Option<u16>, custom_pin: Option<String>) {
    let rt = match tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
    {
        Ok(r) => r,
        Err(e) => {
            eprintln!("Failed to initialize Tokio runtime: {e}");
            std::process::exit(1);
        }
    };

    rt.block_on(async {
        let data_dir = default_server_data_dir();
        let sources_dir = data_dir.join("sources");
        let manager = remote_server::RemoteServerManager::new(Some(data_dir.clone()));

        // Load cached metadata and cached XMLTV guides immediately so endpoints respond right away.
        let (cached_sources, cached_channels) =
            load_cached_sources_into_server(&sources_dir, &manager).await;
        let cached_epg = hydrate_headless_epg(&sources_dir, &manager).await;

        // Ensure platform mode is persisted as Server.
        manager
            .set_platform_mode(remote_server::PlatformMode::Server, None)
            .await;

        let status = match manager
            .start(port, custom_pin, |event| {
                println!("[Kinora Server] Dispatched remote event: {}", event.command);
            })
            .await
        {
            Ok(s) => s,
            Err(e) => {
                eprintln!("Kinora server failed to start: {e}");
                std::process::exit(1);
            }
        };

        println!("============================================================");
        println!("  Kinora Media Server v0.6.0 (Headless Mode)");
        println!("============================================================");
        println!("  Web Remote & Client API:  {}", status.server_url);
        println!("  UDP Discovery Beacon:     Port 5197 (Broadcast)");
        println!("  Pairing PIN:              {}", status.pairing_pin);
        println!("  Storage Directory:        {}", data_dir.display());
        println!(
            "  Cached Catalogue:         {} sources, {} channels, {} EPG entries",
            cached_sources, cached_channels, cached_epg
        );
        println!("============================================================");
        println!("  Ready for connections. Press Ctrl+C to stop.");
        println!("============================================================");

        // Hydrate URL playlists immediately in the background, then refresh periodically.
        let (refresh_stop_tx, mut refresh_stop_rx) = tokio::sync::oneshot::channel::<()>();
        let hydrate_mgr = manager.clone();
        let hydrate_dir = sources_dir.clone();
        tokio::spawn(async move {
            let policy = fetch::Policy::default();
            loop {
                let (total, playable) =
                    hydrate_headless_sources(&hydrate_dir, &hydrate_mgr, &policy).await;
                let epg_count = hydrate_headless_epg(&hydrate_dir, &hydrate_mgr).await;
                if total > 0 || epg_count > 0 {
                    println!(
                        "[Kinora Server] Catalogue hydrated: {} channels ({} playable via proxy), {} EPG entries",
                        total, playable, epg_count
                    );
                }
                tokio::select! {
                    _ = &mut refresh_stop_rx => break,
                    _ = tokio::time::sleep(REFRESH_INTERVAL) => {}
                }
            }
        });

        if let Err(e) = tokio::signal::ctrl_c().await {
            eprintln!("Error listening for shutdown signal: {e}");
        }

        let _ = refresh_stop_tx.send(());
        println!("\nShutting down Kinora Media Server...");
        manager.stop().await;
        println!("Server stopped cleanly.");
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::TcpListener;

    #[tokio::test]
    async fn hydrates_saved_url_playlist_into_playable_server_channels() {
        let m3u_body = "#EXTM3U\n#EXTINF:-1 tvg-id=\"bbc1.uk\" tvg-chno=\"101\" group-title=\"National\",BBC One HD\nhttps://stream.example.invalid/live/bbc1.m3u8\n";
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();

        tokio::spawn(async move {
            if let Ok((mut sock, _)) = listener.accept().await {
                let mut buf = [0u8; 2048];
                let _ = sock.read(&mut buf).await;
                let resp = format!(
                    "HTTP/1.1 200 OK\r\nContent-Type: audio/x-mpegurl\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                    m3u_body.len(),
                    m3u_body
                );
                let _ = sock.write_all(resp.as_bytes()).await;
            }
        });

        let playlist_url = format!("http://{addr}/uk.m3u");
        let saved_sources = vec![sources::SavedSource {
            id: "pl-uk".to_string(),
            name: "UK Playlist".to_string(),
            origin: sources::Origin::Url,
            url: Some(playlist_url),
            label: "127.0.0.1".to_string(),
            added_at: 1700000000000.0,
            last_success: Some(1700000000000.0),
            skipped: 0,
            duplicates: 0,
            channels: vec![sources::SavedChannel {
                key: "bbc1.uk".to_string(),
                tvg_id: Some("bbc1.uk".to_string()),
                name: "BBC One HD".to_string(),
                group: Some("National".to_string()),
                chno: Some(101),
                logo: None,
            }],
        }];

        let mut policy = fetch::Policy::default();
        policy.allow_loopback = true;

        let mgr = remote_server::RemoteServerManager::with_stream_policy(None, policy.clone());
        let (total, playable) = hydrate_sources_list(saved_sources, &mgr, &policy).await;
        assert_eq!(total, 1);
        assert_eq!(playable, 1);

        // Also verify load_cached_sources_into_server loads valid public-URL sources.json on boot.
        let temp_dir = std::env::temp_dir().join(format!(
            "kinora_headless_test_{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let sources_dir = temp_dir.join("sources");
        fs::create_dir_all(&sources_dir).unwrap();
        let saved_json = serde_json::json!({
            "version": 3,
            "sources": [{
                "id": "pl-public",
                "name": "Public Playlist",
                "origin": "url",
                "url": "https://example.com/uk.m3u",
                "label": "example.com",
                "addedAt": 1700000000000.0,
                "lastSuccess": 1700000000000.0,
                "skipped": 0,
                "duplicates": 0,
                "channels": [{
                    "key": "bbc1.uk",
                    "tvgId": "bbc1.uk",
                    "name": "BBC One HD",
                    "group": "National",
                    "chno": 101
                }]
            }],
            "guides": [],
            "mappings": [],
            "xtreamSources": []
        });
        fs::write(
            sources_dir.join("sources.json"),
            serde_json::to_vec(&saved_json).unwrap(),
        )
        .unwrap();

        let (src_count, ch_count) = load_cached_sources_into_server(&sources_dir, &mgr).await;
        assert_eq!(src_count, 1);
        assert_eq!(ch_count, 1);

        let _ = fs::remove_dir_all(&temp_dir);
    }
}
