# Kinora Troubleshooting Guide

Common issues, diagnostic procedures, and recovery instructions.

## 1. Video Playback Issues

### HLS Stream Fails with "No compatible source" or Black Screen:
- **Root Cause:** Missing H.264 video codec in the system GStreamer multimedia pipeline.
- **Diagnostic:** Navigate to **Settings -> Playback & Video -> What this system can play**. Verify whether `H.264 video` is marked as Available.
- **Remedy:**
  - **Fedora:**
    ```bash
    sudo dnf install -y gstreamer1-plugin-openh264 gstreamer1-plugins-good
    ```
  - **Debian / Ubuntu:**
    ```bash
    sudo apt-get install -y gstreamer1.0-libav gstreamer1.0-plugins-good
    ```
  - **Arch Linux:**
    ```bash
    sudo pacman -S gst-plugin-openh264 gst-plugins-good
    ```

### Stream Fails with 403 Forbidden or Token Expiry:
- **Root Cause:** Provider requires specific HTTP request headers or session cookies.
- **Remedy:**
  - Navigate to **Settings -> Playback -> Stream Headers & Identity**.
  - Choose a User-Agent profile (e.g. VLC Media Player, Kodi, or Apple TV) or enter a custom User-Agent string.
  - Set an HTTP Referrer override if your stream provider expects requests from a specific web portal.

### Channel Shows "Offline" Badge:
- **Root Cause:** Kinora recorded an active playback error when tuning into this channel (server unreachable, HTTP 404/500, or network drop).
- **Remedy:**
  - Click the **Retry** button on the channel card or player dock.
  - Check whether the source playlist requires a refresh: open **Sources**, locate the playlist, and trigger a refresh.

## 2. Source and Guide Sync Issues

### Scheduled Refresh Not Updating Data:
- **Root Cause:** Remote host returned an error status or refresh schedule is paused.
- **Remedy:**
  - In **Sources**, check the **Schedule** dropdown in the top refresh bar. Ensure it is set to `Every 4 hours`, `Every 8 hours`, `Every 12 hours`, or `Every 24 hours` (not `Manual only`).
  - If a previous refresh failed, exponential backoff pauses the next attempt for 5 to 60 minutes to prevent server flooding. Click **Refresh all** to trigger an immediate manual update.

### XMLTV Guide Missing Programmes for Channels:
- **Root Cause:** Playlist channel `tvg-id` does not match the XMLTV `<channel id="...">`.
- **Remedy:**
  - Open **Sources**, select the XMLTV guide row to open its detail sheet.
  - Review the unmatched channels list.
  - Use the manual search picker to assign the correct guide channel to your playlist channel. Hand matches are saved automatically in `<app data>/sources/sources.json`.

## 3. Storage and Data Recovery

### "Your saved sources file was damaged" Startup Notice:
- **Explanation:** Kinora detected that `sources.json` could not be parsed as valid JSON.
- **Automatic Recovery:** Kinora moves the damaged file to `sources.json.corrupt-<timestamp>` and starts with a clean slate. Your original data is never destroyed.
- **Restoration:** You can inspect the backup file or restore from a previously created encrypted backup file in **Settings -> Advanced -> Backup & Migration**.

### Factory Reset:
- If you need to clear all local application data, navigate to **Settings -> Advanced -> Factory Reset**.
- Type `RESET` to confirm. This completely removes imported playlists, guides, favourites, history, local media caches, and preferences.
