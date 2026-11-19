# 13 Coverage Reconciliation and Unknown Items

## 1. Coverage Reconciliation Matrix

The following table summarizes the reconciliation between all elements discovered in the Kinora codebase and their documentation across the 13 forensic extraction records.

| Category | Discovered in Codebase | Documented in Extraction | Reconciliation Status | Primary Document Reference |
|---|---|---|---|---|
| Application Routes | 34 active routes | 34 routes | 100% Reconciled | `02_COMPLETE_ROUTE_INVENTORY.md` |
| Primary Screens | 14 main screens + 2 flows | 14 screens + 2 flows | 100% Reconciled | `03_SCREEN_BY_SCREEN_UI_EXTRACTION.md` |
| Shared Components | 46 components | 46 components | 100% Reconciled | `04_COMPONENT_HIERARCHY_AND_USAGE.md` |
| Design Tokens | 4 token groups (typography, color, spacing, motion) | 4 token groups | 100% Reconciled | `05_DESIGN_SYSTEM_AND_STYLE_FACTS.md` |
| Interactive Controls | 35+ control types | 35+ control types | 100% Reconciled | `06_INTERACTIVE_CONTROL_INVENTORY.md` |
| Data Entities | 7 core data domains | 7 core data domains | 100% Reconciled | `07_DATA_FLOW_AND_STATE_ARCHITECTURE.md` |
| Data Isolation Rules | 4 domain partitioning rules | 4 domain partitioning rules | 100% Reconciled | `08_REAL_USER_AND_DEV_MOCK_DATA_SEPARATION.md` |
| Metadata Adapters | 5 external provider integrations | 5 external provider integrations | 100% Reconciled | `09_ARTWORK_AND_METADATA_PIPELINE.md` |
| Backend Tauri Commands | 56 registered IPC handlers | 56 registered IPC handlers | 100% Reconciled | `10_BACKEND_AND_TAURI_IPC_MAP.md` |
| EPG and Player Subsystems | 7 pipeline stages | 7 pipeline stages | 100% Reconciled | `11_LIVE_TV_EPG_AND_PLAYER_ARCHITECTURE.md` |
| Automated Test Suites | 48 Vitest files (470 tests) + 16 Cargo modules (175 tests) | 645 tests across 64 test targets | 100% Reconciled | `12_TESTS_AND_VERIFICATION_EVIDENCE.md` |
| Full-Resolution Screenshots | 37 Dev-Mock, 37 Real-User, 28 Comparison, 12 Responsive | 114 captured screenshots | 100% Reconciled | `Kinora_COMPLETE_UI_Evidence.zip` |

---

## 2. Items Established as Unknown or Unverified

In accordance with forensic extraction standards, the following architectural and runtime boundaries cannot be established from the repository source code and local runtime environment. They are explicitly classified below.

### 2.1 Physical TV Remote Infrared / HDMI-CEC Bus Handling
- **Status:** UNKNOWN - NOT ESTABLISHED FROM AVAILABLE EVIDENCE
- **Source:** `src/components/design-system/useTVNavigation.ts`, `src/App.tsx`
- **Fact:** Kinora listens for standard W3C DOM `KeyboardEvent` keys (`ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight`, `Enter`, `Escape`, `Backspace`). The code contains no native libCEC bindings, Linux `/dev/cec*` ioctl calls, or LIRC infrared remote daemon interfaces.
- **Evidence:** Inspection of `src-tauri/Cargo.toml` confirms zero CEC or infrared crate dependencies. Whether HDMI-CEC remote presses are mapped to keyboard events depends entirely on the host operating system, window manager, or hardware set-top box middleware.

### 2.2 Hardware-Accelerated Video Decoding on Target Hardware
- **Status:** UNKNOWN - NOT ESTABLISHED FROM AVAILABLE EVIDENCE
- **Source:** `src/lib/playback.ts`, WebKitGTK / Wry integration
- **Fact:** HLS playback uses HLS.js through standard HTML5 Media Source Extensions (MSE). Rendering of the `<video>` element is handled by the underlying WebKitGTK runtime and GStreamer pipeline on Linux (`playbin` / `vaapi` / `vdpau`).
- **Evidence:** The application code does not directly configure hardware video decoders or verify GPU codec offloading. Codec acceleration (H.264, HEVC, AV1) is determined at runtime by the system GStreamer plugins and GPU graphics drivers.

### 2.3 External Xtream Server Concurrency and Rate Limits
- **Status:** UNKNOWN - NOT ESTABLISHED FROM AVAILABLE EVIDENCE
- **Source:** `src-tauri/src/xtream.rs`, `src/state/xtream.ts`
- **Fact:** Kinora enforces client-side request timeouts (10 seconds for authentication, 30 seconds for category and stream downloads) and size caps.
- **Evidence:** The repository cannot establish what upstream concurrent stream limits, IP connection caps, or bandwidth throttling policies are enforced by individual third-party Xtream server providers.

### 2.4 External DRM Protected Media (Widevine / PlayReady / FairPlay)
- **Status:** KNOWN INCOMPATIBLE - EXPLICITLY REFUSED BY DESIGN
- **Source:** `src-tauri/src/hls.rs:242-258`, `src-tauri/src/stream.rs:188-195`
- **Fact:** The application explicitly refuses DRM-encrypted streams.
- **Evidence:** `hls.rs` inspects `#EXT-X-KEY` tags. If `METHOD=SAMPLE-AES` or any encryption method other than supported unencrypted media is encountered, the stream parser rejects the playlist with an explicit unsupported encryption error. No Content Decryption Module (CDM) or Widevine CDM wrapper exists in the codebase.

### 2.5 Multi-Audio and External Subtitle Track Switching on Plain HLS Streams
- **Status:** UNVERIFIED AT RUNTIME FOR ALL THIRD-PARTY STREAM VARIANTS
- **Source:** `src/lib/playback.ts:284-315`
- **Fact:** Track switching functions `setAudioTrack` and `setSubtitleTrack` are implemented using HLS.js API calls (`hls.audioTrack`, `hls.subtitleTrack`).
- **Evidence:** While unit tested with synthetic manifest fixtures in `PlayerPlayback.test.tsx`, behavior with arbitrary third-party multiplexed MPEG-TS or fragmented MP4 streams with non-standard audio track descriptors has not been verified across all commercial IPTV providers.

---

## 3. Extraction Methodology and Integrity Statement

- **Date of Forensic Extraction:** 2026-11-19
- **Extraction Scope:** Entire repository tree at `/mnt/storage/TVMovie` on branch `v0.5.1` (commit `996fd70be1f089551f7f47ebe088492de64e81fa`).
- **Verification Method:** Direct AST and regex inspection of TypeScript and Rust source files, runtime execution in headless Chromium and WebKitGTK, Vitest runner execution, and Cargo test suite execution.
- **Modifications Made:** Zero modifications to existing UI designs, business logic, user settings, or source connections. All findings are strictly grounded in observable code and runtime outputs.
