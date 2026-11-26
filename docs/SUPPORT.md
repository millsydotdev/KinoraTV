# Kinora Support and Issue Reporting

This document outlines the scope of support and instructions for reporting issues.

## 1. Scope of Support

- **Desktop Shell and Client:** Kinora is an open desktop multimedia client application built with React, TypeScript, Rust, and Tauri.
- **No Stream Content:** Kinora does not host, provide, manage, or sell IPTV channels, playlists, films, or series.
- **Lawful Use:** Users are solely responsible for providing lawful playlists, XMLTV feeds, or media servers that they are authorized to access.

## 2. Reporting Issues

When filing a bug report or requesting assistance:

### A. Provide System Diagnostics:
Include details from **Settings -> About Kinora**:
- Application Version (e.g. `0.6.0`)
- Build Profile (e.g. `release` or `debug`)
- Operating System and Architecture (e.g. `linux x86_64`)
- Commit Hash

### B. Include Codec Capabilities:
Navigate to **Settings -> Playback -> What this system can play** and report the availability status of:
- H.264 video
- AAC audio
- HEVC video
- AV1 video

### C. Scrub All Private URLs and Credentials:
**CRITICAL SECURITY RULE:** Never paste raw playlist URLs, stream URLs, XMLTV URLs, or server tokens into public issue trackers.
- Always redact private domains and queries:
  - Good: `https://provider.example/playlist.m3u8?token=REDACTED`
  - Bad: `https://my-private-iptv.com:8080/get.php?username=realuser&password=realpassword`
- Kinora's internal UI automatically scrubs URLs in error dialogs to display only the host. Ensure manual reports maintain this standard.

## 3. Contact

For technical questions and issue submissions, please file an issue on the official project repository or contact the project maintainer.
