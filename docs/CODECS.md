# System Video & Audio Codec Support

This document details Kinora's media playback architecture, required video/audio codecs, packaging dependencies, and troubleshooting across supported Linux distributions.

## Architecture

Kinora runs within a native desktop shell using WebKitGTK and Media Source Extensions (MSE).
Video decoding is performed through GStreamer plugins installed on the host operating system:

```
[ HLS Stream / Direct Stream ]
              │
              ▼
    [ Rust kstream Proxy ] (guarded, bounded buffers, handle-based isolation)
              │
              ▼
   [ WebKitGTK MSE Engine ] (hls.js light engine)
              │
              ▼
 [ GStreamer Host Pipeline ] (Hardware/Software decoder plugins)
              │
              ▼
         [ Display ]
```

## Required Codecs

| Format | Role | Prevalence | Required Host Package |
|---|---|---|---|
| **H.264 (AVC)** | Primary video stream | ~95% of live IPTV channels & VOD | `gstreamer1-plugin-openh264` or `gstreamer1.0-libav` |
| **AAC** | Primary audio track | Standard for HLS broadcasts | `gstreamer1-plugins-good` / `gstreamer1.0-plugins-good` |
| **MP3** | Secondary audio / Radio | Common in live radio & audio feeds | `gstreamer1-plugins-good` / `gstreamer1.0-plugins-good` |
| **HEVC (H.265)** | High definition / 4K video | Premium & UHD IPTV streams | `gstreamer1-plugins-bad-free` or RPM Fusion `gstreamer1-plugin-libav` |
| **AV1** | Open next-generation video | Select modern feeds | `gstreamer1-plugins-bad-free` / `gstreamer1.0-plugins-bad` |
| **VP9** | Open video container format | WebM streams | `gstreamer1-plugins-good` / `gstreamer1.0-plugins-good` |

## Packaging Dependencies

Kinora bundles packaging configuration for RPM (Fedora, RHEL, openSUSE) and DEB (Debian, Ubuntu, Linux Mint) targets in `src-tauri/tauri.conf.json`:

### Fedora / RPM Package (`rpm.depends`)
* `webkit2gtk4.1`: WebKitGTK web rendering runtime.
* `libayatana-appindicator3`: System tray icon and menu integration.
* `librsvg2`: Scalable vector graphic rasterizer.
* `openssl-libs`: Native cryptographic library.
* `gstreamer1-plugin-openh264`: Cisco OpenH264 GStreamer decoder plugin.
* `gstreamer1-plugins-good`: MP4 demuxer, AAC audio decoder, and RTSP elements.
* `gstreamer1-plugins-bad-free`: Free/libre format parsers and demuxers.

### Debian / Ubuntu Package (`deb.depends`)
* `libwebkit2gtk-4.1-0`: WebKitGTK runtime.
* `libayatana-appindicator3-1`: Tray indicator library.
* `librsvg2-2`: SVG rendering support.
* `libssl3`: Transport security and encryption primitives.
* `gstreamer1.0-plugins-good`: Good-quality GStreamer plugins.
* `gstreamer1.0-plugins-bad`: Extended demuxers and codecs.
* `gstreamer1.0-libav`: Libav/FFmpeg wrapper for full H.264/HEVC decode.

## Clean Fedora Installation Guidance (Audit Finding 5)

Clean Fedora Workstation installs come with standard free codecs only. Fedora includes the `fedora-cisco-openh264` repository enabled by default, which provides binary OpenH264 packages licensed by Cisco (covering MPEG LA patent royalties on pre-compiled binaries):

### Recommended Fedora Setup
```bash
# Enable Cisco OpenH264 decoder (shipped in standard Fedora repository)
sudo dnf install -y gstreamer1-plugin-openh264 gstreamer1-plugins-good

# Optional: For full HEVC / 4K hardware-accelerated playback via RPM Fusion
sudo dnf install -y https://mirrors.rpmfusion.org/free/fedora/rpmfusion-free-release-$(rpm -E %fedora).noarch.rpm
sudo dnf install -y https://mirrors.rpmfusion.org/nonfree/fedora/rpmfusion-nonfree-release-$(rpm -E %fedora).noarch.rpm
sudo dnf install -y gstreamer1-plugin-libav gstreamer1-plugins-ugly
```

### Debian / Ubuntu Setup
```bash
sudo apt-get update
sudo apt-get install -y gstreamer1.0-libav gstreamer1.0-plugins-good gstreamer1.0-plugins-bad
```

### Arch Linux Setup
```bash
sudo pacman -S --needed gst-plugins-good gst-plugins-bad gst-libav openh264
```

## In-App Diagnostics

Users can verify their current host decoder availability at any time by navigating to:
**Settings > Playback > What this system can play**

If H.264 is missing, Kinora will:
1. Shorten stream start timeouts from 30 seconds to 12 seconds so users are not left waiting.
2. Display an inline alert with distribution-specific installation commands.
3. Show missing status badges next to the affected codecs.
