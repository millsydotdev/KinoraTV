//! Kinora native shell. The React UI owns presentation and demo state; Rust owns native concerns:
//! `app_info`, and playlist ingestion (`fetch_playlist`, `parse_playlist_text`).

mod fetch;
mod ingest;
mod m3u;

use serde::Serialize;

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let result = tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            app_info,
            fetch_playlist,
            parse_playlist_text
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
