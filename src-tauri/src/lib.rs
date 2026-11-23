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
mod dlna;
mod downloader;
mod dvr;
mod fetch;
mod guides;
mod hls;
mod ingest;
mod local_media;
mod m3u;
mod metadata_vault;
pub mod parking;
mod pin;
mod remote_server;
mod sources;
mod stalker;
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

/// Fetches and persistently caches typed artwork (movie poster, backdrop, season poster, still).
#[tauri::command]
async fn fetch_artwork(
    artwork_key: String,
    url: Option<String>,
    force_refresh: Option<bool>,
    artwork: tauri::State<'_, artwork::ArtworkStore>,
) -> Result<Option<ChannelLogo>, ingest::IngestError> {
    let res = artwork
        .get_or_fetch_artwork_opts(&artwork_key, url.as_deref(), force_refresh.unwrap_or(false))
        .await?;
    Ok(res.map(|a| ChannelLogo {
        mime_type: a.mime_type,
        bytes: a.bytes,
    }))
}

#[tauri::command]
fn artwork_cache_stats(
    artwork: tauri::State<'_, artwork::ArtworkStore>,
) -> artwork::ArtworkCacheStats {
    artwork.cache_stats()
}

#[tauri::command]
fn clear_artwork_cache(artwork: tauri::State<'_, artwork::ArtworkStore>) -> u64 {
    artwork.clear_cache()
}

#[tauri::command]
fn retry_failed_artwork(artwork: tauri::State<'_, artwork::ArtworkStore>) {
    artwork.clear_failed();
}

#[tauri::command]
fn load_local_media_artwork(
    media_id: String,
    variant: Option<String>,
    engine: tauri::State<'_, local_media::LocalMediaEngine>,
) -> Option<ChannelLogo> {
    let kind = variant.as_deref().unwrap_or("poster");
    engine
        .read_local_artwork(&media_id, kind)
        .map(|a| ChannelLogo {
            mime_type: a.mime_type,
            bytes: a.bytes,
        })
}

/// Queries an approved metadata provider API (TMDB, TVmaze, or TVDB).
#[tauri::command]
async fn fetch_metadata(
    url: String,
    auth_header: Option<String>,
) -> Result<String, ingest::IngestError> {
    fetch::fetch_metadata(&url, auth_header.as_deref()).await
}

/// Queries an approved subtitle provider or downloads subtitle text (OpenSubtitles).
#[tauri::command]
async fn fetch_subtitle(
    url: String,
    api_key: Option<String>,
) -> Result<String, ingest::IngestError> {
    fetch::fetch_subtitle(&url, api_key.as_deref()).await
}

/// Sends an authenticated or public request to Trakt.tv REST API.
#[tauri::command]
async fn fetch_trakt(
    url: String,
    method: String,
    client_id: String,
    access_token: Option<String>,
    body: Option<String>,
) -> Result<String, ingest::IngestError> {
    fetch::fetch_trakt_api(
        &url,
        &method,
        &client_id,
        access_token.as_deref(),
        body.as_deref(),
    )
    .await
}

/// Sends a bounded JSON POST request to an approved metadata provider API (e.g. TVDB v4 login).
#[tauri::command]
async fn post_metadata(
    url: String,
    body_json: String,
    auth_header: Option<String>,
) -> Result<String, ingest::IngestError> {
    fetch::post_metadata(&url, &body_json, auth_header.as_deref()).await
}

#[tauri::command]
fn save_metadata_credentials(
    credentials: metadata_vault::MetadataCredentials,
    vault: tauri::State<'_, metadata_vault::MetadataVault>,
) -> Result<(), ingest::IngestError> {
    vault.save(credentials)
}

#[tauri::command]
fn load_metadata_credentials(
    vault: tauri::State<'_, metadata_vault::MetadataVault>,
) -> metadata_vault::MetadataCredentials {
    vault.load()
}

#[tauri::command]
fn clear_metadata_credentials(vault: tauri::State<'_, metadata_vault::MetadataVault>) {
    vault.clear();
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
async fn connect_stalker(
    portal_url: String,
    mac: String,
    stalker: tauri::State<'_, stalker::StalkerEngine>,
) -> Result<stalker::StalkerProfile, ingest::IngestError> {
    stalker.connect(&portal_url, &mac).await
}

#[tauri::command]
async fn load_stalker_catalogue(
    stalker: tauri::State<'_, stalker::StalkerEngine>,
) -> Result<stalker::StalkerCatalogue, ingest::IngestError> {
    stalker.load_catalogue().await
}

#[tauri::command]
async fn open_stalker_stream(
    cmd: String,
    stalker: tauri::State<'_, stalker::StalkerEngine>,
    streams: tauri::State<'_, stream::Streams>,
) -> Result<stream::Opened, ingest::IngestError> {
    let url = stalker.create_playback_link(&cmd).await?;
    streams.open(url.as_str())
}

#[tauri::command]
fn disconnect_stalker(stalker: tauri::State<'_, stalker::StalkerEngine>) {
    stalker.disconnect();
}

#[tauri::command]
fn is_stalker_connected(stalker: tauri::State<'_, stalker::StalkerEngine>) -> bool {
    stalker.is_connected()
}

#[tauri::command]
fn start_download(
    url: String,
    title: String,
    kind: String,
    extension: String,
    artwork_url: Option<String>,
    downloader: tauri::State<'_, std::sync::Arc<downloader::DownloadEngine>>,
) -> Result<downloader::DownloadItem, ingest::IngestError> {
    downloader.start_download(&url, &title, &kind, &extension, artwork_url)
}

#[tauri::command]
fn pause_download(
    id: String,
    downloader: tauri::State<'_, std::sync::Arc<downloader::DownloadEngine>>,
) -> Result<downloader::DownloadItem, ingest::IngestError> {
    downloader.pause_download(&id)
}

#[tauri::command]
fn resume_download(
    id: String,
    downloader: tauri::State<'_, std::sync::Arc<downloader::DownloadEngine>>,
) -> Result<downloader::DownloadItem, ingest::IngestError> {
    downloader.resume_download(&id)
}

#[tauri::command]
fn cancel_download(
    id: String,
    downloader: tauri::State<'_, std::sync::Arc<downloader::DownloadEngine>>,
) -> Result<(), ingest::IngestError> {
    downloader.cancel_download(&id)
}

#[tauri::command]
fn delete_download(
    id: String,
    downloader: tauri::State<'_, std::sync::Arc<downloader::DownloadEngine>>,
) -> Result<(), ingest::IngestError> {
    downloader.delete_download(&id)
}

#[tauri::command]
fn get_downloads(
    downloader: tauri::State<'_, std::sync::Arc<downloader::DownloadEngine>>,
) -> Vec<downloader::DownloadItem> {
    downloader.list()
}

/// Discovers DLNA / UPnP MediaRenderer devices across the local subnet.
#[tauri::command]
async fn discover_dlna_renderers() -> Result<Vec<dlna::DlnaDevice>, ingest::IngestError> {
    dlna::discover_renderers().await
}

/// Casts media to a DLNA MediaRenderer by setting its URI and initiating playback.
#[tauri::command]
async fn cast_dlna_media(
    control_url: String,
    media_url: String,
    title: String,
) -> Result<bool, ingest::IngestError> {
    dlna::cast_media(&control_url, &media_url, &title).await
}

/// Dispatches a playback command (play, pause, stop, volume) to the DLNA renderer.
#[tauri::command]
async fn control_dlna_playback(
    control_url: String,
    action: String,
    volume: Option<u8>,
) -> Result<bool, ingest::IngestError> {
    dlna::control_playback(&control_url, &action, volume).await
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
async fn open_m3u_catchup(
    stream_url: String,
    catchup_type: Option<String>,
    catchup_source: Option<String>,
    start_timestamp: i64,
    duration_mins: u32,
    stop_timestamp: i64,
    streams: tauri::State<'_, stream::Streams>,
) -> Result<stream::Opened, ingest::IngestError> {
    let resolved_url = m3u::format_m3u_catchup_url(
        &stream_url,
        catchup_type.as_deref(),
        catchup_source.as_deref(),
        start_timestamp,
        duration_mins,
        stop_timestamp,
    );
    streams.open(resolved_url.as_str())
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
fn dvr_evaluate_series_rules(
    programmes: Vec<dvr::ProgrammeCandidate>,
    dvr: tauri::State<'_, dvr::DvrEngine>,
) -> Vec<dvr::Recording> {
    dvr.evaluate_series_rules_for_programmes(&programmes)
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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub commit_hash: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data_dir: Option<String>,
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
        commit_hash: None,
        data_dir: None,
    }
}

/// Read-only: takes no input and touches no files, so there is nothing to validate on the way in.
#[tauri::command]
fn app_info(app: tauri::AppHandle) -> AppInfo {
    let package = app.package_info();
    let mut info = build_info(&package.name, &package.version.to_string());
    if let Ok(data_dir) = app.path().app_data_dir() {
        info.data_dir = Some(data_dir.to_string_lossy().to_string());
    }
    info.commit_hash = option_env!("GIT_COMMIT_HASH")
        .or(option_env!("GITHUB_SHA"))
        .map(|s| s.to_string());
    info
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
    options: Option<stream::StreamOptions>,
    streams: tauri::State<'_, stream::Streams>,
) -> Result<stream::Opened, ingest::IngestError> {
    streams.open_with_options(&url, options)
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

/// Queries local media libraries configured by the user.
#[tauri::command]
fn get_local_libraries(
    engine: tauri::State<'_, local_media::LocalMediaEngine>,
) -> Vec<local_media::LocalLibrary> {
    engine.get_libraries()
}

/// Saves or updates a local media library definition.
#[tauri::command]
fn save_local_library(
    library: local_media::LocalLibrary,
    engine: tauri::State<'_, local_media::LocalMediaEngine>,
) -> Result<local_media::LocalLibrary, ingest::IngestError> {
    engine.save_library(library)
}

/// Deletes a local library configuration and drops indexed items without touching media files on disk.
#[tauri::command]
fn delete_local_library(
    library_id: String,
    engine: tauri::State<'_, local_media::LocalMediaEngine>,
) -> Result<bool, ingest::IngestError> {
    engine.delete_library(&library_id)
}

/// Scans media folders in a local library recursively and updates the local catalogue.
#[tauri::command]
fn scan_local_library(
    library_id: String,
    engine: tauri::State<'_, local_media::LocalMediaEngine>,
) -> Result<local_media::LocalScanResult, ingest::IngestError> {
    engine.scan_library(&library_id)
}

/// Returns all indexed local movies and TV series.
#[tauri::command]
fn get_local_media_catalogue(
    engine: tauri::State<'_, local_media::LocalMediaEngine>,
) -> local_media::LocalMediaCatalogue {
    engine.get_catalogue()
}

/// Returns genuine operating-system storage capacity measurements for all distinct volumes.
#[tauri::command]
fn get_storage_volumes_info(
    engine: tauri::State<'_, local_media::LocalMediaEngine>,
) -> local_media::StorageVolumesSummary {
    engine.get_storage_volumes_info()
}

/// Validates or selects a local media folder path safely.
#[tauri::command]
fn select_local_media_folder(
    folder_path: Option<String>,
) -> Result<Option<String>, ingest::IngestError> {
    if let Some(path_str) = folder_path {
        let p = std::path::PathBuf::from(&path_str);
        if p.is_dir() {
            return Ok(Some(
                p.canonicalize().unwrap_or(p).to_string_lossy().to_string(),
            ));
        } else {
            return Err(ingest::IngestError::new(
                ingest::ErrorCode::Storage,
                "Specified path is not an existing directory.",
            ));
        }
    }
    #[cfg(target_os = "linux")]
    {
        if let Ok(output) = std::process::Command::new("zenity")
            .args([
                "--file-selection",
                "--directory",
                "--title=Select Media Folder",
            ])
            .output()
        {
            if output.status.success() {
                let s = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if !s.is_empty() && std::path::Path::new(&s).is_dir() {
                    return Ok(Some(s));
                }
            }
        }
    }
    #[cfg(target_os = "macos")]
    {
        let script = "POSIX path of (choose folder with prompt \"Select Media Folder\")";
        if let Ok(output) = std::process::Command::new("osascript")
            .args(["-e", script])
            .output()
        {
            if output.status.success() {
                let s = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if !s.is_empty() && std::path::Path::new(&s).is_dir() {
                    return Ok(Some(s));
                }
            }
        }
    }
    Ok(None)
}

/// Starts a playback stream for an indexed local media file inside an approved library root.
#[tauri::command]
fn open_local_media_stream(
    media_id: String,
    engine: tauri::State<'_, local_media::LocalMediaEngine>,
) -> Result<stream::Opened, ingest::IngestError> {
    let cat = engine.get_catalogue();
    let is_movie = cat.movies.iter().any(|m| m.id == media_id);
    let is_ep = cat.series.iter().any(|s| {
        s.seasons
            .iter()
            .any(|sn| sn.episodes.iter().any(|e| e.id == media_id))
    });
    if is_movie || is_ep {
        Ok(stream::Opened {
            url: format!("kstream://localhost/local/{}/stream", media_id),
            session: 0,
            format: "direct",
        })
    } else {
        Err(ingest::IngestError::new(
            ingest::ErrorCode::Storage,
            "Local media item not found.",
        ))
    }
}

/// Starts the wireless LAN mobile remote control web server.
#[tauri::command]
async fn start_remote_server(
    app: tauri::AppHandle,
    port: Option<u16>,
    pin: Option<String>,
    manager: tauri::State<'_, remote_server::RemoteServerManager>,
) -> Result<remote_server::RemoteServerStatus, String> {
    use tauri::Emitter;
    let app_handle = app.clone();
    manager
        .start(port, pin, move |event| {
            let _ = app_handle.emit("kinora:remote_command", event);
        })
        .await
}

/// Stops the wireless LAN mobile remote control web server.
#[tauri::command]
async fn stop_remote_server(
    manager: tauri::State<'_, remote_server::RemoteServerManager>,
) -> Result<(), String> {
    manager.stop().await;
    Ok(())
}

/// Returns the current runtime status of the mobile remote server.
#[tauri::command]
async fn get_remote_server_status(
    manager: tauri::State<'_, remote_server::RemoteServerManager>,
) -> Result<remote_server::RemoteServerStatus, String> {
    Ok(manager.get_status().await)
}

/// Updates the cached playback state broadcast to connected mobile remotes.
#[tauri::command]
async fn update_remote_playback_state(
    state: remote_server::RemotePlaybackState,
    manager: tauri::State<'_, remote_server::RemoteServerManager>,
) -> Result<(), String> {
    manager.update_playback_state(state).await;
    Ok(())
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
            app.manage(local_media::LocalMediaEngine::new(app_data.clone()));
            app.manage(dvr::DvrEngine::new(app_data.clone()));
            app.manage(metadata_vault::MetadataVault::new(app_data.clone()));
            app.manage(guides::GuideStore::new(dir.clone()));
            app.manage(catalogue::CatalogueStore::new(dir.clone()));
            app.manage(sources::Store::new(dir.clone()));
            app.manage(artwork::ArtworkStore::new(dir.clone()));
            app.manage(xtream::Providers::new(dir));
            app.manage(stalker::StalkerEngine::new(app_data.clone()));
            app.manage(downloader::DownloadEngine::new(app_data));
            app.manage(remote_server::RemoteServerManager::new());
            app.manage(stream::Streams::new(
                fetch::Policy::default(),
                stream::Limits::default(),
                origin,
            ));
            let dvr_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                loop {
                    tokio::time::sleep(std::time::Duration::from_secs(30)).await;
                    let now = std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .map(|d| d.as_secs() as i64)
                        .unwrap_or(0);
                    let dvr = dvr_handle.state::<dvr::DvrEngine>();
                    let _ = dvr.tick(now);
                }
            });
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
                if uri_path.starts_with("/local/") {
                    let local_eng = app.state::<local_media::LocalMediaEngine>();
                    let header =
                        |name: &str| request.headers().get(name).and_then(|v| v.to_str().ok());
                    let ranges: Vec<&str> = request
                        .headers()
                        .get_all("range")
                        .iter()
                        .filter_map(|v| v.to_str().ok())
                        .collect();
                    let reply = local_eng
                        .serve(
                            request.method().as_str(),
                            uri_path,
                            header("origin"),
                            &ranges,
                        )
                        .await;
                    responder.respond(local_media::into_response(reply));
                    return;
                }
                if uri_path.starts_with("/downloads/") {
                    let dl = app.state::<std::sync::Arc<downloader::DownloadEngine>>();
                    let header =
                        |name: &str| request.headers().get(name).and_then(|v| v.to_str().ok());
                    let ranges: Vec<&str> = request
                        .headers()
                        .get_all("range")
                        .iter()
                        .filter_map(|v| v.to_str().ok())
                        .collect();
                    let reply = dl
                        .serve(
                            request.method().as_str(),
                            uri_path,
                            header("origin"),
                            &ranges,
                        )
                        .await;
                    responder.respond(downloader::into_response(reply));
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
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            app_info,
            fetch_channel_logo,
            fetch_programme_artwork,
            fetch_artwork,
            artwork_cache_stats,
            clear_artwork_cache,
            retry_failed_artwork,
            load_local_media_artwork,
            post_metadata,
            save_metadata_credentials,
            load_metadata_credentials,
            clear_metadata_credentials,
            connect_xtream,
            refresh_xtream,
            load_xtream_catalogue,
            xtream_series_details,
            xtream_artwork,
            disconnect_xtream,
            is_xtream_connected,
            open_xtream_stream,
            open_xtream_catchup,
            open_m3u_catchup,
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
            dvr_evaluate_series_rules,
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
            fetch_subtitle,
            fetch_trakt,
            check_for_updates,
            get_local_libraries,
            save_local_library,
            delete_local_library,
            scan_local_library,
            get_local_media_catalogue,
            get_storage_volumes_info,
            select_local_media_folder,
            open_local_media_stream,
            start_remote_server,
            stop_remote_server,
            get_remote_server_status,
            update_remote_playback_state,
            connect_stalker,
            load_stalker_catalogue,
            open_stalker_stream,
            disconnect_stalker,
            is_stalker_connected,
            start_download,
            pause_download,
            resume_download,
            cancel_download,
            delete_download,
            get_downloads,
            discover_dlna_renderers,
            cast_dlna_media,
            control_dlna_playback
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

    #[test]
    fn cargo_version_matches_package_json() {
        let pkg_json: serde_json::Value = serde_json::from_str(include_str!("../../package.json"))
            .expect("package.json must exist and be valid JSON");
        let pkg_version = pkg_json
            .get("version")
            .and_then(|v| v.as_str())
            .expect("package.json must contain a version field");
        assert_eq!(
            env!("CARGO_PKG_VERSION"),
            pkg_version,
            "Authoritative version mismatch: src-tauri/Cargo.toml ({}) != package.json ({})",
            env!("CARGO_PKG_VERSION"),
            pkg_version
        );
    }
}
