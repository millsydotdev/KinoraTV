//! Kinora native shell. The React UI owns presentation and demo state; Rust owns native concerns:
//! `app_info`, playlist ingestion (`fetch_playlist`, `parse_playlist_text`), guarded HLS playback
//! (`open_stream`, `close_stream` and the `kstream` protocol, see `stream.rs`), saved sources
//! (`load_sources`, `save_sources`, see `sources.rs`) and XMLTV guides (`fetch_guide`,
//! `import_guide_file`, `load_guide`, `guide_channels`, `guide_programmes`, `remove_guide`, see
//! `guides.rs` and `xmltv.rs`) and the public source catalogue (`load_catalogue`,
//! `refresh_catalogue`, see `catalogue.rs`).

mod catalogue;
mod fetch;
mod guides;
mod hls;
mod ingest;
mod m3u;
mod sources;
mod stream;
mod xmltv;

use serde::Serialize;
use tauri::Manager;

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
        profile: if cfg!(debug_assertions) { "debug" } else { "release" },
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
            let dir = app.path().app_data_dir().ok().map(|d| d.join("sources"));
            app.manage(guides::GuideStore::new(dir.clone()));
            app.manage(catalogue::CatalogueStore::new(dir.clone()));
            app.manage(sources::Store::new(dir));
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
                        request.uri().path(),
                        header("origin"),
                        &ranges,
                    )
                    .await;
                responder.respond(stream::into_response(reply));
            });
        })
        .invoke_handler(tauri::generate_handler![
            app_info,
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
            refresh_catalogue
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
    fn app_info_reports_this_build() {
        let info = build_info("Kinora", "0.1.0");
        assert_eq!(info.name, "Kinora");
        assert_eq!(info.version, "0.1.0");
        assert_eq!(info.profile, if cfg!(debug_assertions) { "debug" } else { "release" });
        assert_eq!(info.os, std::env::consts::OS);
        assert!(info.tauri_version.starts_with("2."), "expected Tauri 2, got {}", info.tauri_version);
    }

    #[test]
    fn app_info_serialises_with_the_field_names_the_frontend_expects() {
        let json = serde_json::to_value(build_info("Kinora", "0.1.0")).unwrap();
        let mut keys: Vec<&str> = json.as_object().unwrap().keys().map(String::as_str).collect();
        keys.sort_unstable();
        assert_eq!(keys, ["arch", "name", "os", "profile", "tauriVersion", "version"]);
    }
}
