fn main() {
    // Declaring the app's commands makes each one deny-by-default: the webview can only call
    // commands granted in capabilities/*.json (see allow-app-info).
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "app_info",
            "fetch_playlist",
            "parse_playlist_text",
            "open_stream",
            "close_stream",
            "load_sources",
            "save_sources",
            "fetch_guide",
            "import_guide_file",
            "load_guide",
            "guide_channels",
            "guide_programmes",
            "remove_guide",
        ]),
    ))
    .expect("failed to run the Tauri build script");
}
