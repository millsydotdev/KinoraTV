# 06 Interactive Control Inventory

This document enumerates every interactive control implemented across Kinora, documenting the exact event handler, state transition, IPC boundary calls, and verification status.

---

## 1. Global Shell & Navigation Controls

### Control G-01: Global Search Input
- **Screen:** Global Header (`src/components/PageHeader.tsx:120-145`)
- **Location:** Top navigation bar center
- **Visible Label / Placeholder:** "Search movies, series, channels, programmes and more... (Ctrl + K)"
- **Component:** `<input type="search">` within `PageHeader`
- **Source Path & Line:** `src/components/PageHeader.tsx:128`
- **Event Handler:** `onChange={(e) => setSearchText(e.target.value)}`, `onKeyDown={(e) => if (e.key === 'Enter') navigate('/search?q=' + encodeURIComponent(searchText))}`
- **Function Called:** `navigate` from `useNavigate()`
- **State Changed:** Updates local input state, navigates to `/search?q=...`
- **IPC Call:** None directly (Search screen triggers search query against store)
- **Persistence:** Recent search query stored in `sessionStorage`
- **Verification Status:** Verified.

### Control G-02: Command Palette Trigger
- **Screen:** Global Shell (`src/App.tsx:131-136`)
- **Location:** Keyboard listener
- **Visible Label:** None (Keyboard accelerator `Ctrl+K` or `Cmd+K`)
- **Component:** Window event listener in `Shell`
- **Source Path & Line:** `src/App.tsx:132`
- **Event Handler:** `window.addEventListener('keydown', (e) => ...)`
- **Function Called:** `setPaletteOpen((prev) => !prev)`
- **State Changed:** `paletteOpen` boolean in `Shell`
- **Route Changed:** None (opens `<CommandPalette>` overlay modal)
- **Verification Status:** Verified.

### Control G-03: Keyboard Shortcuts Modal Trigger
- **Screen:** Global Shell (`src/App.tsx:138-143`)
- **Location:** Keyboard listener
- **Visible Label:** None (Keyboard key `?`)
- **Component:** Window event listener in `Shell`
- **Source Path & Line:** `src/App.tsx:139`
- **Event Handler:** `window.addEventListener('keydown', ...)`
- **Function Called:** `setShortcutsOpen(true)`
- **State Changed:** `shortcutsOpen` boolean in `Shell`
- **Verification Status:** Verified.

### Control G-04: Number Key Fast Navigation
- **Screen:** Global Shell (`src/App.tsx:145-162`)
- **Location:** Keyboard listener (Keys `1` through `8`)
- **Visible Label:** None
- **Handler & Target:**
  - `1` -> `/` (Home)
  - `2` -> `/live` (Live TV)
  - `3` -> `/movies` (Movies)
  - `4` -> `/series` (TV Shows)
  - `5` -> `/radio` (Radio)
  - `6` -> `/library` (Media Library)
  - `7` -> `/sources` (Sources)
  - `8` -> `/settings` (Settings)
- **State Changed:** `pathname` via `navigate(numNav[e.key])`
- **Verification Status:** Verified.

### Control G-05: Sidebar Expand / Collapse Toggle
- **Screen:** Sidebar (`src/components/Sidebar.tsx:180-210`)
- **Location:** Sidebar top right
- **Visible Label:** Icon button with chevron
- **Source Path & Line:** `src/components/Sidebar.tsx:195`
- **Function Called:** `store.setSidebarCollapsed(!collapsed)`
- **State Changed:** `prefs.sidebarCollapsed` in `store`
- **Persistence:** Written to `localStorage['kinora.prefs.v2']`
- **Verification Status:** Verified.

### Control G-06: Sidebar Section Accordion Toggles
- **Screen:** Sidebar (`src/components/Sidebar.tsx:270-285`)
- **Location:** Sidebar root group buttons ("Live TV", "Movies & Series", "Audio", "Reading", "Discover")
- **Visible Label:** Section labels
- **Function Called:** `toggleSection(section.id)`
- **State Changed:** `expandedSections[section.id]` boolean in local component state
- **Persistence:** Written to `localStorage['kinora.sidebar.sections.v2']`
- **Verification Status:** Verified.

---

## 2. Live TV & EPG Interactive Controls

### Control L-01: View Toggle (Timeline vs Channels)
- **Screen:** Live TV (`src/screens/LiveTV.tsx:420-450`)
- **Location:** Page header right
- **Visible Label:** "Timeline" / "Channels"
- **Component:** Tab buttons
- **Source Path & Line:** `src/screens/LiveTV.tsx:432`
- **Function Called:** `setViewMode('timeline')` or `setViewMode('channels')`
- **State Changed:** Updates URL query parameter `?view=timeline` or `?view=channels`
- **Verification Status:** Verified.

### Control L-02: Timeline "Jump to Now" Button
- **Screen:** Live TV (`src/screens/LiveTV.tsx:510-530`)
- **Location:** Timeline navigation toolbar
- **Visible Label:** "Now" with clock icon
- **Source Path & Line:** `src/screens/LiveTV.tsx:518`
- **Function Called:** `scrollToNow()`
- **State Changed:** Sets `timelineRef.current.scrollLeft` to calculated `nowOffsetPx`
- **Verification Status:** Verified.

### Control L-03: Timeline Zoom Selector
- **Screen:** Live TV (`src/screens/LiveTV.tsx:535-560`)
- **Location:** Timeline navigation toolbar
- **Visible Label:** "1 Hour", "2 Hours", "4 Hours"
- **Source Path & Line:** `src/screens/LiveTV.tsx:542`
- **Function Called:** `setZoomLevel(val)`
- **State Changed:** Updates `zoomLevel` state (changes pixels-per-minute multiplier from 10 to 5 to 2.5)
- **Verification Status:** Verified.

### Control L-04: Timeline Date Navigation Step Buttons
- **Screen:** Live TV (`src/screens/LiveTV.tsx:480-505`)
- **Location:** Timeline toolbar date picker
- **Visible Label:** `<` (Previous Day) and `>` (Next Day)
- **Source Path & Line:** `src/screens/LiveTV.tsx:492`
- **Function Called:** `stepDate(-1)` and `stepDate(1)`
- **State Changed:** Updates `selectedDate`, triggers EPG query for local midnight bounds
- **IPC Call:** `guide_programmes` (queries Rust cache for new 24-hour window)
- **Verification Status:** Verified.

### Control L-05: Programme Block Click (Open Details Drawer)
- **Screen:** Live TV (`src/screens/LiveTV.tsx:750-790`)
- **Location:** Within any rendered programme block in EPG grid
- **Visible Label:** Programme title and time
- **Source Path & Line:** `src/screens/LiveTV.tsx:762`
- **Event Handler:** `onClick={() => setSelectedProgramme({ programme, channel })}`
- **State Changed:** Opens right-hand side drawer with complete metadata
- **Verification Status:** Verified.

### Control L-06: Programme Block Double Click (Tune Channel)
- **Screen:** Live TV (`src/screens/LiveTV.tsx:765`)
- **Location:** Within any rendered programme block
- **Event Handler:** `onDoubleClick={() => navigate('/watch/channel:' + channel.id)}`
- **State Changed:** Navigates to `/watch/channel:...` launching fullscreen playback
- **Verification Status:** Verified.

### Control L-07: Stage Preview Mute / Volume Toggle
- **Screen:** Live TV (`src/screens/LiveTV.tsx:310-340`)
- **Location:** Top stage live preview video box
- **Visible Label:** Volume / Mute icon button
- **Source Path & Line:** `src/screens/LiveTV.tsx:322`
- **Function Called:** Toggles `previewMuted` state on native `<video>` element
- **State Changed:** `videoRef.current.muted = !videoRef.current.muted`
- **Verification Status:** Verified.

### Control L-08: Quick Record Button
- **Screen:** Live TV (`src/screens/LiveTV.tsx:360-385`)
- **Location:** Now playing card actions row
- **Visible Label:** "Record" with record dot icon
- **Source Path & Line:** `src/screens/LiveTV.tsx:371`
- **Function Called:** `handleStartOrScheduleRecording(channel, currentProgramme)`
- **IPC Call:** `dvr_start_recording` (if programme is live) or `dvr_schedule_recording` (if future)
- **Persistence:** Appended to DVR database in Rust backend
- **Verification Status:** Verified.

### Control L-09: Channel Favourite Toggle
- **Screen:** Live TV (`src/screens/LiveTV.tsx:390-410`)
- **Location:** Now playing card actions row & channel row star icon
- **Visible Label:** "Favourite" / Star icon
- **Source Path & Line:** `src/screens/LiveTV.tsx:395`
- **Function Called:** `store.toggleFavourite('channel:' + channel.id)`
- **Persistence:** Saved in `localStorage['kinora.library.v1']` under profile key
- **Verification Status:** Verified.

### Control L-10: Multi-Channel Share Modal Trigger
- **Screen:** Live TV (`src/screens/LiveTV.tsx:415`)
- **Location:** Now playing actions and programme side drawer
- **Visible Label:** "Share" icon button
- **Function Called:** `setShareModalItem(...)`
- **State Changed:** Opens `<ShareModal>`
- **Verification Status:** Verified.

---

## 3. Video Player Controls (`src/screens/Player.tsx`)

### Control P-01: Play / Pause Button
- **Screen:** Fullscreen Player (`src/screens/Player.tsx:210-230`)
- **Location:** Bottom control bar center
- **Visible Label:** Play / Pause icon
- **Source Path & Line:** `src/screens/Player.tsx:218`
- **Function Called:** `togglePlay()` (calls `video.play()` or `video.pause()`)
- **State Changed:** `playbackState.playing` boolean
- **Verification Status:** Verified.

### Control P-02: Timeline Scrubber Bar
- **Screen:** Fullscreen Player (`src/screens/Player.tsx:240-270`)
- **Location:** Bottom control bar
- **Visible Label:** Slider track with duration and elapsed time
- **Source Path & Line:** `src/screens/Player.tsx:255`
- **Event Handler:** `onSeek={(time) => video.currentTime = time}`
- **Function Called:** Sets video element current time
- **State Changed:** Seek position in media stream
- **Verification Status:** Verified.

### Control P-03: Audio Track Selector
- **Screen:** Fullscreen Player (`src/screens/Player.tsx:320-350`)
- **Location:** Control bar audio icon
- **Visible Label:** "Audio Track" dropdown
- **Function Called:** Switches HLS audio track index via `hls.audioTrack = index`
- **Verification Status:** Verified.

### Control P-04: Subtitle / Closed Caption Selector
- **Screen:** Fullscreen Player (`src/screens/Player.tsx:360-390`)
- **Location:** Control bar CC icon
- **Visible Label:** Subtitles list (e.g. "English", "Off")
- **Function Called:** `hls.subtitleTrack = index`
- **Verification Status:** Verified.

### Control P-05: Picture-in-Picture Toggle
- **Screen:** Fullscreen Player (`src/screens/Player.tsx:400-420`)
- **Location:** Control bar right
- **Visible Label:** PiP icon
- **Function Called:** `document.pictureInPictureElement ? document.exitPictureInPicture() : video.requestPictureInPicture()`
- **Verification Status:** Verified.

### Control P-06: Fullscreen Toggle
- **Screen:** Fullscreen Player (`src/screens/Player.tsx:430-450`)
- **Location:** Control bar far right
- **Visible Label:** Maximize / Minimize icon
- **Function Called:** `document.fullscreenElement ? document.exitFullscreen() : container.requestFullscreen()`
- **Verification Status:** Verified.

---

## 4. Personal Artwork Library Controls (`src/screens/ArtworkLibraryScreen.tsx`)

### Control A-01: "+ Upload Custom Artwork" Modal Launcher
- **Screen:** Artwork Library (`src/screens/ArtworkLibraryScreen.tsx:85-95`)
- **Location:** Page header actions
- **Visible Label:** "+ Upload Custom Artwork"
- **Function Called:** `setUploadModalOpen(true)`
- **State Changed:** Opens `ArtworkUploadModal`
- **Verification Status:** Verified.

### Control A-02: Drag & Drop File Selector
- **Screen:** Artwork Library (`src/screens/ArtworkLibraryScreen.tsx:250-280`)
- **Location:** Within `ArtworkUploadModal`
- **Visible Label:** "Drop image file here or click to browse"
- **Function Called:** `handleFileSelected(file)`
- **Validation:** Enforces PNG, JPEG, WebP, GIF under 5MB (5,242,880 bytes)
- **State Changed:** Reads file via `FileReader.readAsDataURL()`, auto-detects image dimensions and aspect ratio
- **Verification Status:** Verified.

### Control A-03: Assign Target Identifier
- **Screen:** Artwork Library (`src/screens/ArtworkLibraryScreen.tsx:290-320`)
- **Location:** Within `ArtworkUploadModal`
- **Visible Label:** Target content selector (e.g. channel name or movie title)
- **Function Called:** `setTargetContentId(e.target.value)`
- **Verification Status:** Verified.

### Control A-04: Confirm & Save Artwork
- **Screen:** Artwork Library (`src/screens/ArtworkLibraryScreen.tsx:330-350`)
- **Location:** Modal footer
- **Visible Label:** "Save Artwork"
- **Function Called:** `saveCustomArtwork(entry)`
- **Persistence:** Written to `localStorage['kinora.custom_artwork.v1']`
- **State Changed:** Closes modal, refreshes metrics HUD, updates `ChannelMark` and `ProgrammeArt` globally
- **Verification Status:** Verified.

### Control A-05: "Restore Automatic" Artwork Action
- **Screen:** Artwork Library (`src/screens/ArtworkLibraryScreen.tsx:180-205`)
- **Location:** Within each artwork card in grid
- **Visible Label:** "Restore Automatic"
- **Function Called:** `deleteCustomArtwork(item.contentId, item.targetType)`
- **Persistence:** Removes key from `localStorage['kinora.custom_artwork.v1']`
- **Verification Status:** Verified.

---

## 5. Share Modal Dialog Controls (`src/components/ShareModal.tsx`)

### Control S-01: "Copy IMDb Link" Button
- **Screen:** Share Modal (`src/components/ShareModal.tsx:53-65`)
- **Location:** Modal IMDb section
- **Visible Label:** "Copy IMDb Link" / "Copied!"
- **Function Called:** `navigator.clipboard.writeText('https://www.imdb.com/title/' + item.imdbId + '/')`
- **Feedback:** Shows success state on button for 2.5s and fires toast notification
- **Verification Status:** Verified.

### Control S-02: "Open IMDb" External Link
- **Screen:** Share Modal (`src/components/ShareModal.tsx:140-155`)
- **Location:** Modal IMDb section
- **Visible Label:** "Open IMDb" with external link icon
- **Target:** External browser window (`target="_blank" rel="noopener noreferrer"`)
- **Verification Status:** Verified.

### Control S-03: "Copy Kinora Deep Link" Button
- **Screen:** Share Modal (`src/components/ShareModal.tsx:66-77`)
- **Location:** Modal deep link section
- **Visible Label:** "Copy Link"
- **Function Called:** `navigator.clipboard.writeText(kinoraUrl)`
- **Verification Status:** Verified.

### Control S-04: Native Share Trigger
- **Screen:** Share Modal (`src/components/ShareModal.tsx:78-93`)
- **Location:** Modal action bar (rendered only if `navigator.share` is supported)
- **Visible Label:** "Share via Device"
- **Function Called:** `navigator.share({ title: item.title, url: imdbUrl || kinoraUrl })`
- **Verification Status:** Verified.

---

## 6. Settings Controls (`src/screens/Settings.tsx`)

### Control ST-01: Theme Mode Switcher
- **Screen:** Settings > Appearance (`src/screens/Settings.tsx:320-350`)
- **Location:** Theme row
- **Visible Label:** "Dark", "Light", "System"
- **Function Called:** `store.setTheme(mode)`
- **Persistence:** Saved in `kinora.prefs.v2`
- **State Changed:** Updates `document.documentElement.dataset.theme`
- **Verification Status:** Verified.

### Control ST-02: Accent Color Picker & Presets
- **Screen:** Settings > Appearance (`src/screens/Settings.tsx:360-400`)
- **Location:** Accent Colour row
- **Visible Label:** Color swatch buttons (Red, Orange, Amber, Green, Teal, Cyan, Blue, Violet, Pink)
- **Function Called:** `store.setAccent(colorName)`
- **State Changed:** Recomputes contrast tokens via `applyThemeTokensToElement`
- **Verification Status:** Verified.

### Control ST-03: Interface Density Selector
- **Screen:** Settings > Appearance (`src/screens/Settings.tsx:410-435`)
- **Location:** Density row
- **Visible Label:** "Comfortable", "Standard", "Compact"
- **Function Called:** `store.setDensity(val)`
- **State Changed:** Updates `document.documentElement.dataset.density`
- **Verification Status:** Verified.

### Control ST-04: Parental PIN Enable & Setup
- **Screen:** Settings > User Profile (`src/screens/Settings.tsx:780-840`)
- **Location:** Parental Controls row
- **Visible Label:** "Enable Parental Lock"
- **Function Called:** Opens PIN setup prompt; calls IPC `hash_parental_pin(pin)`
- **IPC Call:** `hash_parental_pin` (PBKDF2-HMAC-SHA256)
- **Persistence:** Stores `{ salt, hash, iterations: 100000, version: 2 }` in profile storage
- **Verification Status:** Verified.

### Control ST-05: Local Media Folder Scanner
- **Screen:** Settings > Media Library (`src/screens/Settings.tsx:610-660`)
- **Location:** Local Folders section
- **Visible Label:** "+ Add Local Folder"
- **Function Called:** `select_local_media_folder()` -> `scan_local_library()`
- **IPC Call:** `select_local_media_folder`, `scan_local_library`
- **Verification Status:** Verified.
