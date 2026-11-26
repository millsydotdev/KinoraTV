# Kinora Installation Guide

This guide covers installing and configuring Kinora on Linux distributions and building from source.

## 1. Supported Operating Systems

- **Fedora Linux:** 38, 39, 40, 41 (x86_64, aarch64) - Recommended
- **Debian / Ubuntu:** Debian 12+, Ubuntu 22.04 LTS, Ubuntu 24.04 LTS
- **Arch Linux / Manjaro:** Rolling release with GStreamer and WebKitGTK packages

## 2. Fedora Installation (RPM)

Kinora ships as a native RPM package bundled with desktop integration and icons.

### Install RPM via DNF:

```bash
sudo dnf install ./kinora-0.6.0-1.x86_64.rpm
```

### Media Codec Requirements on Clean Fedora:

Fresh Fedora desktop installations do not bundle proprietary H.264 video decoders out of the box. Kinora packages dependencies that automatically pull Cisco OpenH264 from Fedora's official repositories:

- `gstreamer1-plugin-openh264` (Cisco H.264 decoder)
- `gstreamer1-plugins-good` (Matroska, AVI, audio decoders)
- `gstreamer1-plugins-bad-free` (MPEG-TS, HLS parsing plugins)

If stream playback reports missing video decoders, run:

```bash
sudo dnf install -y gstreamer1-plugin-openh264 gstreamer1-plugins-good
```

## 3. Debian / Ubuntu Installation (DEB)

### Install DEB via APT:

```bash
sudo apt install ./kinora_0.6.0_amd64.deb
```

Or using `dpkg`:

```bash
sudo dpkg -i ./kinora_0.6.0_amd64.deb
sudo apt-get install -f
```

### Required GStreamer Plugins on Debian / Ubuntu:

```bash
sudo apt-get install -y gstreamer1.0-libav gstreamer1.0-plugins-good gstreamer1.0-plugins-bad
```

## 4. Arch Linux Installation

For Arch Linux users installing from binary or AUR:

```bash
sudo pacman -S webkit2gtk-4.1 gst-plugins-good gst-plugins-bad gst-libav gst-plugin-openh264
```

## 5. Building From Source

### Prerequisites:

- Node.js 20+ (with npm)
- Rust 1.75+ (via rustup)
- C/C++ compiler (gcc or clang)
- WebKitGTK 4.1 development headers:
  - Fedora: `sudo dnf install webkit2gtk4.1-devel openssl-devel`
  - Debian/Ubuntu: `sudo apt install libwebkit2gtk-4.1-dev libssl-dev`
  - Arch: `sudo pacman -S webkit2gtk-4.1 openssl`

### Build Steps:

```bash
# 1. Clone repository
git clone https://github.com/example/TVMovie.git
cd TVMovie

# 2. Install frontend dependencies
npm install

# 3. Verify TypeScript and Rust test suites
npm run typecheck
npm test
cargo test --manifest-path src-tauri/Cargo.toml

# 4. Build release bundle
npm run tauri:build
```

The compiled binary and packages will be located in `src-tauri/target/release/bundle/`.
