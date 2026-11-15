# Kinora D11: Update Notification & What's New Experience

## 1. User Feedback Lifecycle

Kinora delivers transparent, non-intrusive feedback across the complete update lifecycle via its unified toast and persistent notification center architecture:

### 1. Update Available
- **Display**: Ephemeral toast alert combined with unread badge in notification center.
- **Actions**: "View Release" (opens GitHub release notes), "Download Update" (if direct bundle provided), or "Later".
- **Settings Hook**: Settings > About surfaces current installed version (v0.5.0), latest discovered version, and manual "Check for Updates" control.

### 2. What's New Modal
- **Component**: `WhatsNewModal.tsx`
- **Trigger**: Automatic display upon first launch after a version upgrade, or manual reopening from Settings > About.
- **Content**: Categorised release highlights (Features, Improvements, Fixes, Security) sourced from verified changelog metadata.
- **Persistence**: Dismissal is tracked in `kinora.whats_new_seen.v1` so users are not repeatedly prompted.

### 3. Downloading & Verification
- **Integrity**: Checksums and cryptographic signatures are validated prior to prompting for installation.
- **Honest Feedback**: Progress indicators reflect real byte transfers; synthetic percentages are strictly prohibited.

### 4. Upgrade Confirmation
- **Post-Restart Validation**: Kinora compares `getAppInfo().version` against the previously recorded local version (`kinora.version.v1`).
- **Confirmation Toast**: Displays "Kinora successfully updated to v0.5.0" once native verification succeeds.
