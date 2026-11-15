//! Kinora native shell. The React UI owns presentation and demo state; Rust owns native concerns:
//! `app_info`, guarded M3U and Xtream catalogue ingestion, guarded artwork,
//! playlist ingestion
//! (`fetch_playlist`, `parse_playlist_text`), guarded HLS playback
//! (`open_stream`, `close_stream` and the `kstream` protocol, see `stream.rs`), saved sources
//! (`load_sources`, `save_sources`, see `sources.rs`) and XMLTV guides (`fetch_guide`,
//! `import_guide_file`, `load_guide`, `guide_channels`, `guide_programmes`, `remove_guide`, see
//! `guides.rs` and `xmltv.rs`) and the public source catalogue (`load_catalogue`,
//! `refresh_catalogue`, see `catalogue.rs`).

mod artwork;
mod catalogue;
mod dash;
mod dvr;
mod fetch;
mod guides;
mod hls;
mod ingest;
mod m3u;
mod pin;
mod sources;
mod stream;
mod updater;
mod xmltv;
mod xtream;

use serde::Serialize;
use tauri::Manager;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ChannelLogo {
    mime_type: &'static str,
    bytes: Vec<u8>,
}

#[cfg(test)]
use artwork::{detect_raster_mime as logo_mime, is_region_block};

/// Fetches a small raster playlist logo through the guarded artwork service.
#[tauri::command]
async fn fetch_channel_logo(
    url: Option<String>,
    channel_key: Option<String>,
    tvg_id: Option<String>,
    artwork: tauri::State<'_, artwork::ArtworkStore>,
) -> Result<Option<ChannelLogo>, ingest::IngestError> {
    let res = artwork
        .get_or_fetch_logo(url.as_deref(), channel_key.as_deref(), tvg_id.as_deref())
        .await?;
    Ok(res.map(|a| ChannelLogo {
        mime_type: a.mime_type,
        bytes: a.bytes,
    }))
}

/// Fetches a programme artwork image through the guarded artwork service.
#[tauri::command]
async fn fetch_programme_artwork(
    url: String,
    artwork: tauri::State<'_, artwork::ArtworkStore>,
) -> Result<Option<ChannelLogo>, ingest::IngestError> {
    let res = artwork
        .get_or_fetch_artwork(&format!("url:{url}"), Some(&url))
        .await?;
    Ok(res.map(|a| ChannelLogo {
        mime_type: a.mime_type,
        bytes: a.bytes,
    }))
}

/// Queries an approved metadata provider API (TMDB or TVmaze).
#[tauri::command]
async fn fetch_metadata(
    url: String,
    auth_header: Option<String>,
) -> Result<String, ingest::IngestError> {
    fetch::fetch_metadata(&url, auth_header.as_deref()).await
}

/// Checks for application updates from the official release manifest.
#[tauri::command]
async fn check_for_updates(
    endpoint: Option<String>,
    app: tauri::AppHandle,
) -> Result<updater::UpdateCheckResult, ingest::IngestError> {
    let current_version = app.package_info().version.to_string();
    updater::check_for_updates(endpoint, &current_version).await
}

#[tauri::command]
async fn connect_xtream(
    source_id: String,
    server: String,
    username: String,
    password: String,
    providers: tauri::State<'_, xtream::Providers>,
) -> Result<xtream::Catalogue, ingest::IngestError> {
    providers
        .connect(&source_id, &server, &username, &password)
        .await
}

#[tauri::command]
async fn refresh_xtream(
    source_id: String,
    providers: tauri::State<'_, xtream::Providers>,
) -> Result<xtream::Catalogue, ingest::IngestError> {
    providers.catalogue(&source_id).await
}

#[tauri::command]
async fn xtream_series_details(
    source_id: String,
    series_id: String,
    providers: tauri::State<'_, xtream::Providers>,
) -> Result<xtream::SeriesDetails, ingest::IngestError> {
    providers.series_details(&source_id, &series_id).await
}

#[tauri::command]
async fn xtream_artwork(
    artwork_key: String,
    providers: tauri::State<'_, xtream::Providers>,
    artwork: tauri::State<'_, artwork::ArtworkStore>,
) -> Result<Option<xtream::Artwork>, ingest::IngestError> {
    Ok(providers
        .artwork(&artwork_key, &artwork)
        .await?
        .map(|(mime_type, bytes)| xtream::Artwork { mime_type, bytes }))
}

#[tauri::command]
fn load_xtream_catalogue(
    source_id: String,
    providers: tauri::State<'_, xtream::Providers>,
) -> Option<xtream::Catalogue> {
    providers.load_cache(&source_id)
}

#[tauri::command]
fn disconnect_xtream(source_id: String, providers: tauri::State<'_, xtream::Providers>) {
    providers.disconnect(&source_id);
}

#[tauri::command]
fn is_xtream_connected(source_id: String, providers: tauri::State<'_, xtream::Providers>) -> bool {
    providers.is_connected(&source_id)
}

#[tauri::command]
async fn open_xtream_stream(
    source_id: String,
    stream_type: String,
    item_id: String,
    extension: Option<String>,
    providers: tauri::State<'_, xtream::Providers>,
    streams: tauri::State<'_, stream::Streams>,
) -> Result<stream::Opened, ingest::IngestError> {
    let url = providers.get_stream_url(&source_id, &stream_type, &item_id, extension.as_deref())?;
    streams.open(url.as_str())
}

#[tauri::command]
async fn open_xtream_catchup(
    source_id: String,
    stream_id: String,
    start_timestamp: i64,
    duration_mins: u32,
    providers: tauri::State<'_, xtream::Providers>,
    streams: tauri::State<'_, stream::Streams>,
) -> Result<stream::Opened, ingest::IngestError> {
    let url = providers.get_catchup_url(&source_id, &stream_id, start_timestamp, duration_mins)?;
    streams.open(url.as_str())
}

#[tauri::command]
fn dvr_get_recordings(dvr: tauri::State<'_, dvr::DvrEngine>) -> Vec<dvr::Recording> {
    dvr.get_recordings()
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
fn dvr_start_recording(
    channel_id: String,
    channel_name: String,
    channel_logo: Option<String>,
    programme_id: Option<String>,
    title: String,
    description: Option<String>,
    duration_secs: Option<u64>,
    dvr: tauri::State<'_, dvr::DvrEngine>,
) -> Result<dvr::Recording, ingest::IngestError> {
    dvr.start_manual_recording(
        channel_id,
        channel_name,
        channel_logo,
        programme_id,
        title,
        description,
        duration_secs,
    )
}

#[tauri::command]
fn dvr_stop_recording(
    recording_id: String,
    dvr: tauri::State<'_, dvr::DvrEngine>,
) -> Result<dvr::Recording, ingest::IngestError> {
    dvr.stop_recording(&recording_id)
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
fn dvr_schedule_recording(
    channel_id: String,
    channel_name: String,
    channel_logo: Option<String>,
    programme_id: Option<String>,
    title: String,
    description: Option<String>,
    start_time: i64,
    end_time: i64,
    padding_start: Option<u32>,
    padding_end: Option<u32>,
    series_rule_id: Option<String>,
    dvr: tauri::State<'_, dvr::DvrEngine>,
) -> Result<dvr::Recording, ingest::IngestError> {
    dvr.schedule_recording(
        channel_id,
        channel_name,
        channel_logo,
        programme_id,
        title,
        description,
        start_time,
        end_time,
        padding_start,
        padding_end,
        series_rule_id,
    )
}

#[tauri::command]
fn dvr_cancel_recording(
    recording_id: String,
    dvr: tauri::State<'_, dvr::DvrEngine>,
) -> Result<dvr::Recording, ingest::IngestError> {
    dvr.cancel_recording(&recording_id)
}

#[tauri::command]
fn dvr_delete_recording(
    recording_id: String,
    delete_files: bool,
    dvr: tauri::State<'_, dvr::DvrEngine>,
) -> Result<(), ingest::IngestError> {
    dvr.delete_recording(&recording_id, delete_files)
}

#[tauri::command]
fn dvr_protect_recording(
    recording_id: String,
    is_protected: bool,
    dvr: tauri::State<'_, dvr::DvrEngine>,
) -> Result<dvr::Recording, ingest::IngestError> {
    dvr.protect_recording(&recording_id, is_protected)
}

#[tauri::command]
fn dvr_open_recording(
    recording_id: String,
    dvr: tauri::State<'_, dvr::DvrEngine>,
) -> Result<stream::Opened, ingest::IngestError> {
    let recs = dvr.get_recordings();
    if recs.iter().any(|r| r.id == recording_id) {
        Ok(stream::Opened {
            url: format!("kstream://localhost/dvr/{}/playlist.m3u8", recording_id),
            session: 0,
            format: "hls",
        })
    } else {
        Err(ingest::IngestError::new(
            ingest::ErrorCode::Storage,
            "Recording not found.",
        ))
    }
}

#[tauri::command]
fn dvr_get_rules(dvr: tauri::State<'_, dvr::DvrEngine>) -> Vec<dvr::SeriesRule> {
    dvr.get_rules()
}

#[tauri::command]
fn dvr_save_rule(
    rule: dvr::SeriesRule,
    dvr: tauri::State<'_, dvr::DvrEngine>,
) -> Result<dvr::SeriesRule, ingest::IngestError> {
    dvr.save_rule(rule)
}

#[tauri::command]
fn dvr_delete_rule(
    rule_id: String,
    dvr: tauri::State<'_, dvr::DvrEngine>,
) -> Result<(), ingest::IngestError> {
    dvr.delete_rule(&rule_id)
}

#[tauri::command]
fn dvr_get_config(dvr: tauri::State<'_, dvr::DvrEngine>) -> dvr::DvrConfig {
    dvr.get_config()
}

#[tauri::command]
fn dvr_save_config(
    config: dvr::DvrConfig,
    dvr: tauri::State<'_, dvr::DvrEngine>,
) -> Result<dvr::DvrConfig, ingest::IngestError> {
    dvr.save_config(config)
}

#[tauri::command]
fn dvr_get_storage_info(dvr: tauri::State<'_, dvr::DvrEngine>) -> dvr::StorageInfo {
    dvr.get_storage_info()
}

#[tauri::command]
async fn test_xtream_connection(
    server: String,
    username: String,
    password: String,
    providers: tauri::State<'_, xtream::Providers>,
) -> Result<xtream::XtreamConnectionReport, ingest::IngestError> {
    providers
        .test_connection(&server, &username, &password)
        .await
}

#[tauri::command]
async fn xtream_vod_details(
    source_id: String,
    vod_id: String,
    providers: tauri::State<'_, xtream::Providers>,
) -> Result<xtream::MovieDetails, ingest::IngestError> {
    providers.vod_details(&source_id, &vod_id).await
}

#[tauri::command]
async fn xtream_epg(
    source_id: String,
    stream_id: String,
    providers: tauri::State<'_, xtream::Providers>,
) -> Result<Vec<xtream::EpgListing>, ingest::IngestError> {
    providers.channel_epg(&source_id, &stream_id).await
}

/// Facts about the running shell. Mirrored by `AppInfo` in `src/lib/native.ts`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub name: String,
    pub version: String,
    pub profile: &'static str,
    pub os: &'static str,
    pub arch: &'static str,
    pub tauri_version: &'static str,
}

fn build_info(name: &str, version: &str) -> AppInfo {
    AppInfo {
        name: name.to_owned(),
        version: version.to_owned(),
        profile: if cfg!(debug_assertions) {
            "debug"
        } else {
            "release"
        },
        os: std::env::consts::OS,
        arch: std::env::consts::ARCH,
        tauri_version: tauri::VERSION,
    }
}

/// Read-only: takes no input and touches no files, so there is nothing to validate on the way in.
#[tauri::command]
fn app_info(app: tauri::AppHandle) -> AppInfo {
    let package = app.package_info();
    build_info(&package.name, &package.version.to_string())
}

/// Downloads and parses an M3U channel list from a user-supplied http(s) address. The address is
/// validated in Rust (scheme, credentials, destination); the stream addresses inside are not fetched.
#[tauri::command]
async fn fetch_playlist(url: String) -> Result<ingest::Report, ingest::IngestError> {
    ingest::from_url(&url, &fetch::Policy::default()).await
}

/// Safely tests connectivity to a playlist or XMLTV guide address using Kinora's guarded network client.
/// URL is validated, private/loopback IPs are blocked, timeouts are bounded, and responses are inspected
/// without downloading or buffering full playlist or guide files.
#[tauri::command]
async fn test_source_connection(
    url: String,
) -> Result<fetch::ConnectionTestResult, ingest::IngestError> {
    Ok(fetch::test_connection(&url, &fetch::Policy::connection_test()).await)
}

/// Parses M3U text from a file the user picked in the webview. Rust receives text, never a path.
/// `async` so a large file is parsed off the main (UI) thread.
#[tauri::command]
async fn parse_playlist_text(text: String) -> Result<ingest::Report, ingest::IngestError> {
    ingest::from_text(&text)
}

/// Starts a playback session for an HLS stream address and returns only an opaque `kstream`
/// address for it. Ends the previous session. Nothing is fetched until the page asks for it.
#[tauri::command]
async fn open_stream(
    url: String,
    streams: tauri::State<'_, stream::Streams>,
) -> Result<stream::Opened, ingest::IngestError> {
    streams.open(&url)
}

/// Ends a playback session (if it is still the current one), cancelling its in-flight requests.
#[tauri::command]
fn close_stream(session: u64, streams: tauri::State<'_, stream::Streams>) {
    streams.close(session);
}

/// Reads the saved playlist sources (and why, if they could not be used as they were). When the file
/// was read cleanly, guide caches that no saved guide owns are deleted.
#[tauri::command]
async fn load_sources(
    store: tauri::State<'_, sources::Store>,
    guides: tauri::State<'_, guides::GuideStore>,
) -> Result<sources::Loaded, ingest::IngestError> {
    let loaded = store.load();
    if loaded.notice.is_none() {
        let keep: Vec<&str> = loaded.saved.guides.iter().map(|g| g.id.as_str()).collect();
        guides.prune(&keep);
    }
    Ok(loaded)
}

/// Replaces the saved playlist sources atomically. Validated in Rust; refused while read-only.
#[tauri::command]
async fn save_sources(
    saved: sources::Saved,
    store: tauri::State<'_, sources::Store>,
) -> Result<(), ingest::IngestError> {
    store.save(&saved)
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| i64::try_from(d.as_millis()).unwrap_or(i64::MAX))
}

/// Parses guide bytes off the async runtime (a large guide takes a while) and keeps the result if
/// no newer import or removal of the guide started since `generation`.
async fn finish_guide(
    app: tauri::AppHandle,
    id: String,
    generation: u64,
    bytes: Vec<u8>,
) -> Result<guides::Summary, ingest::IngestError> {
    tauri::async_runtime::spawn_blocking(move || {
        app.state::<guides::GuideStore>()
            .finish(&id, generation, bytes, now_ms())
    })
    .await
    .map_err(|_| {
        ingest::IngestError::new(
            ingest::ErrorCode::NotGuide,
            "Kinora could not read that guide.",
        )
    })?
}

/// Downloads an XMLTV guide (plain or gzip) from a user-supplied http(s) address through the guarded
/// client, with the guide policy's size and time limits. Nothing the guide refers to is fetched.
#[tauri::command]
async fn fetch_guide(
    id: String,
    url: String,
    app: tauri::AppHandle,
    guides: tauri::State<'_, guides::GuideStore>,
) -> Result<guides::Summary, ingest::IngestError> {
    let generation = guides.begin(&id)?;
    let accept = "application/xml, text/xml, application/gzip;q=0.9, */*;q=0.1";
    let (bytes, _host) = fetch::download_bytes(&url, &fetch::Policy::guide(), accept).await?;
    finish_guide(app, id, generation, bytes).await
}

/// Reads a guide file the user picked in the webview, sent as raw bytes (it may be gzip) with the
/// guide id in the `x-guide-id` header. Rust receives bytes, never a path.
#[tauri::command]
async fn import_guide_file(
    request: tauri::ipc::Request<'_>,
    app: tauri::AppHandle,
    guides: tauri::State<'_, guides::GuideStore>,
) -> Result<guides::Summary, ingest::IngestError> {
    let refused = || {
        ingest::IngestError::new(
            ingest::ErrorCode::NotGuide,
            "Kinora could not read that guide file.",
        )
    };
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err(refused());
    };
    if bytes.len() > fetch::MAX_GUIDE_BYTES {
        return Err(ingest::IngestError::new(
            ingest::ErrorCode::TooLarge,
            format!(
                "That file is larger than the {} MB guide limit.",
                fetch::MAX_GUIDE_BYTES / (1024 * 1024)
            ),
        ));
    }
    let id = request
        .headers()
        .get("x-guide-id")
        .and_then(|v| v.to_str().ok())
        .ok_or_else(refused)?
        .to_owned();
    let generation = guides.begin(&id)?;
    finish_guide(app, id, generation, bytes.clone()).await
}

/// The summary of a guide's programmes, read from its cache on first use. `None` when none are held.
#[tauri::command]
async fn load_guide(
    id: String,
    app: tauri::AppHandle,
) -> Result<Option<guides::Summary>, ingest::IngestError> {
    tauri::async_runtime::spawn_blocking(move || app.state::<guides::GuideStore>().load(&id))
        .await
        .map_err(|_| {
            ingest::IngestError::new(
                ingest::ErrorCode::NotGuide,
                "Kinora could not read that guide.",
            )
        })?
}

/// A guide's channel ids and names, for matching a playlist channel by hand.
#[tauri::command]
fn guide_channels(
    id: String,
    guides: tauri::State<'_, guides::GuideStore>,
) -> Vec<xmltv::GuideChannel> {
    guides.channels(&id).unwrap_or_default()
}

/// Programmes overlapping `[from, to)` (UTC ms) for the channel ids the page asks about.
#[tauri::command]
fn guide_programmes(
    queries: Vec<guides::Query>,
    from: f64,
    to: f64,
    guides: tauri::State<'_, guides::GuideStore>,
) -> Result<Vec<guides::Answer>, ingest::IngestError> {
    let ms = |t: f64| (t.is_finite() && t.abs() < 1e15).then_some(t as i64);
    let (Some(from), Some(to)) = (ms(from), ms(to)) else {
        return Err(ingest::IngestError::new(
            ingest::ErrorCode::Storage,
            "Kinora refused a guide request in an unexpected shape.",
        ));
    };
    guides.query(&queries, from, to)
}

/// Forgets a guide: its programmes and cache are deleted, and any import still running is dropped.
#[tauri::command]
fn remove_guide(
    id: String,
    guides: tauri::State<'_, guides::GuideStore>,
) -> Result<(), ingest::IngestError> {
    guides.remove(&id)
}

/// The cached public source catalogue, if there is a usable one. Reads only Kinora's own cache.
#[tauri::command]
async fn load_catalogue(
    catalogue: tauri::State<'_, catalogue::CatalogueStore>,
) -> Result<Option<catalogue::Catalogue>, ingest::IngestError> {
    Ok(catalogue.load())
}

/// Fetches the public source catalogue from its one fixed address (no input from the page) and
/// caches it. Importing an entry is a separate, ordinary `fetch_playlist`.
#[tauri::command]
async fn refresh_catalogue(
    catalogue: tauri::State<'_, catalogue::CatalogueStore>,
) -> Result<catalogue::Catalogue, ingest::IngestError> {
    catalogue
        .refresh(&fetch::Policy::catalogue(), now_ms())
        .await
}

/// Hashes a 4-digit parental PIN using PKCS#5 PBKDF2-HMAC-SHA256 (100,000 iterations).
#[tauri::command]
async fn hash_parental_pin(pin: String) -> Result<pin::StoredPin, String> {
    pin::hash_pin(&pin)
}

/// Verifies a 4-digit parental PIN against stored credentials with constant-time equality.
/// Automatically handles migration from legacy single-round SHA-256 and plaintext records.
#[tauri::command]
async fn verify_parental_pin(
    pin: String,
    stored: serde_json::Value,
) -> Result<pin::VerifyPinResponse, String> {
    pin::verify_pin(&pin, &stored)
}

/// The page origin allowed to read `kstream` responses: the dev server in `tauri dev`, otherwise
/// the bundled app's origin (verified as `tauri://localhost` on Linux in the D4A spike).
fn app_origin(config: &tauri::Config) -> String {
    if tauri::is_dev() {
        if let Some(dev) = &config.build.dev_url {
            return dev.origin().ascii_serialization();
        }
    }
    if cfg!(windows) {
        "http://tauri.localhost".into()
    } else {
        "tauri://localhost".into()
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let result = tauri::Builder::default()
        .setup(|app| {
            let origin = app_origin(app.config());
            // A private folder inside the app's data directory; without one, sources are not saved.
            let app_data = app.path().app_data_dir().ok();
            let dir = app_data.as_ref().map(|d| d.join("sources"));
            app.manage(dvr::DvrEngine::new(app_data));
            app.manage(guides::GuideStore::new(dir.clone()));
            app.manage(catalogue::CatalogueStore::new(dir.clone()));
            app.manage(sources::Store::new(dir.clone()));
            app.manage(artwork::ArtworkStore::new(dir.clone()));
            app.manage(xtream::Providers::new(dir));
            app.manage(stream::Streams::new(
                fetch::Policy::default(),
                stream::Limits::default(),
                origin,
            ));
            Ok(())
        })
        .register_asynchronous_uri_scheme_protocol("kstream", |ctx, request, responder| {
            // Only Kinora's own window may use the stream protocol.
            if ctx.webview_label() != "main" {
                responder.respond(
                    tauri::http::Response::builder()
                        .status(403)
                        .body(Vec::new())
                        .unwrap_or_default(),
                );
                return;
            }
            let app = ctx.app_handle().clone();
            tauri::async_runtime::spawn(async move {
                let uri_path = request.uri().path();
                if uri_path.starts_with("/dvr/") {
                    let dvr = app.state::<dvr::DvrEngine>();
                    let header =
                        |name: &str| request.headers().get(name).and_then(|v| v.to_str().ok());
                    let ranges: Vec<&str> = request
                        .headers()
                        .get_all("range")
                        .iter()
                        .filter_map(|v| v.to_str().ok())
                        .collect();
                    let reply = dvr
                        .serve(
                            request.method().as_str(),
                            uri_path,
                            header("origin"),
                            &ranges,
                        )
                        .await;
                    responder.respond(dvr::into_response(reply));
                    return;
                }
                let streams = app.state::<stream::Streams>();
                let header = |name: &str| request.headers().get(name).and_then(|v| v.to_str().ok());
                let ranges: Vec<&str> = request
                    .headers()
                    .get_all("range")
                    .iter()
                    .filter_map(|v| v.to_str().ok())
                    .collect();
                let reply = streams
                    .serve(
                        request.method().as_str(),
                        uri_path,
                        header("origin"),
                        &ranges,
                    )
                    .await;
                responder.respond(stream::into_response(reply));
            });
        })
        .invoke_handler(tauri::generate_handler![
            app_info,
            fetch_channel_logo,
            fetch_programme_artwork,
            connect_xtream,
            refresh_xtream,
            load_xtream_catalogue,
            xtream_series_details,
            xtream_artwork,
            disconnect_xtream,
            is_xtream_connected,
            open_xtream_stream,
            open_xtream_catchup,
            dvr_get_recordings,
            dvr_start_recording,
            dvr_stop_recording,
            dvr_schedule_recording,
            dvr_cancel_recording,
            dvr_delete_recording,
            dvr_protect_recording,
            dvr_open_recording,
            dvr_get_rules,
            dvr_save_rule,
            dvr_delete_rule,
            dvr_get_config,
            dvr_save_config,
            dvr_get_storage_info,
            test_xtream_connection,
            xtream_vod_details,
            xtream_epg,
            fetch_playlist,
            parse_playlist_text,
            open_stream,
            close_stream,
            load_sources,
            save_sources,
            fetch_guide,
            import_guide_file,
            load_guide,
            guide_channels,
            guide_programmes,
            remove_guide,
            load_catalogue,
            refresh_catalogue,
            test_source_connection,
            hash_parental_pin,
            verify_parental_pin,
            fetch_metadata,
            check_for_updates
        ])
        .run(tauri::generate_context!());

    // Fail loudly with a readable message and a non-zero exit instead of a panic backtrace.
    if let Err(error) = result {
        eprintln!("Kinora failed to start: {error}");
        std::process::exit(1);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn imgur_region_banner_is_not_a_logo() {
        let mut banner = b"\x89PNG\r\n\x1a\n\0\0\0\rIHDR".to_vec();
        banner.extend(336u32.to_be_bytes());
        banner.extend(478u32.to_be_bytes());
        banner.push(8);
        assert!(is_region_block(Some("i.imgur.com"), &banner));
        assert!(!is_region_block(Some("img.example"), &banner));
        banner[19] = 100;
        assert!(!is_region_block(Some("i.imgur.com"), &banner));
    }

    #[test]
    fn app_info_reports_this_build() {
        let info = build_info("Kinora", "0.1.0");
        assert_eq!(info.name, "Kinora");
        assert_eq!(info.version, "0.1.0");
        assert_eq!(
            info.profile,
            if cfg!(debug_assertions) {
                "debug"
            } else {
                "release"
            }
        );
        assert_eq!(info.os, std::env::consts::OS);
        assert!(
            info.tauri_version.starts_with("2."),
            "expected Tauri 2, got {}",
            info.tauri_version
        );
    }

    #[test]
    fn app_info_serialises_with_the_field_names_the_frontend_expects() {
        let json = serde_json::to_value(build_info("Kinora", "0.1.0")).unwrap();
        let mut keys: Vec<&str> = json
            .as_object()
            .unwrap()
            .keys()
            .map(String::as_str)
            .collect();
        keys.sort_unstable();
        assert_eq!(
            keys,
            ["arch", "name", "os", "profile", "tauriVersion", "version"]
        );
    }

    #[test]
    fn channel_logos_accept_only_known_raster_signatures() {
        assert_eq!(logo_mime(b"\x89PNG\r\n\x1a\nrest"), Some("image/png"));
        assert_eq!(logo_mime(b"\xff\xd8\xff\xe0rest"), Some("image/jpeg"));
        assert_eq!(logo_mime(b"GIF89arest"), Some("image/gif"));
        assert_eq!(logo_mime(b"RIFF0000WEBPrest"), Some("image/webp"));
        assert_eq!(logo_mime(b"<svg xmlns='http://www.w3.org/2000/svg'>"), None);
    }
}
