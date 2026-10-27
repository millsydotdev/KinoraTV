//! Kinora native shell. The React UI owns presentation and demo state; Rust owns native concerns:
//! `app_info`, playlist ingestion (`fetch_playlist`, `parse_playlist_text`), guarded HLS playback
//! (`open_stream`, `close_stream` and the `kstream` protocol, see `stream.rs`) and saved sources
//! (`load_sources`, `save_sources`, see `sources.rs`).

mod fetch;
mod hls;
mod ingest;
mod m3u;
mod sources;
mod stream;

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

/// Reads the saved playlist sources (and why, if they could not be used as they were).
#[tauri::command]
async fn load_sources(
    store: tauri::State<'_, sources::Store>,
) -> Result<sources::Loaded, ingest::IngestError> {
    Ok(store.load())
}

/// Replaces the saved playlist sources atomically. Validated in Rust; refused while read-only.
#[tauri::command]
async fn save_sources(
    sources: Vec<sources::SavedSource>,
    store: tauri::State<'_, sources::Store>,
) -> Result<(), ingest::IngestError> {
    store.save(&sources)
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
            save_sources
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
