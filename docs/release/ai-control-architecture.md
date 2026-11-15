# Kinora AI Control and External Integration Architecture (Milestone D13 Specification)

**Programme:** Kinora Release Candidate (Gate D10 Architectural Deliverable)  
**Date:** 2026-11-15  
**Target Implementation Milestone:** Gate D13

This specification establishes the architectural foundation for enabling external AI assistants (including voice agents, home automation systems, and local LLMs like Jarvis) to securely discover, inspect, and control Kinora.

---

## 1. Core Principles and Security Boundaries

1. **No Superficial Chatbots:** Kinora is a dedicated media playback experience. We do not embed an in-app chat widget or ungrounded conversational agent. Control is exercised through standard external agent protocols.
2. **Local Loopback Only:** AI communication is restricted strictly to local machine loopback (`127.0.0.1` or Unix domain socket). The control service never binds to `0.0.0.0` or exposes an unauthenticated LAN endpoint.
3. **Model Context Protocol (MCP) as First-Class Bridge:** The primary external interface is a standard MCP server (`kinora-mcp`) operating over stdio or local authenticated HTTP/SSE.
4. **Zero Raw Credential Exposure:** External assistants are never handed raw playlist stream URLs, upstream passwords, API keys, or session tokens. Stream commands accept opaque channel or media identifiers.
5. **No Shell or File System Access:** The AI control bridge exposes strictly typed domain operations. It grants no arbitrary shell execution, file path reading, or operating system access.

---

## 2. Authentication, Pairing, and Revocation

External assistants must be paired before accessing any Kinora resources:

```
+-------------------+                   +------------------+                   +--------------------+
| External Agent    |                   | Kinora Shell     |                   | Kinora UI          |
| (Jarvis / MCP)    |                   | (Local Loopback) |                   | (User Screen)      |
+-------------------+                   +------------------+                   +--------------------+
          |                                       |                                      |
          | 1. Connect (unauthenticated)          |                                      |
          |-------------------------------------->|                                      |
          |                                       | 2. Display 6-digit pairing PIN       |
          |                                       |------------------------------------->|
          |                                       |                                      |
          | 3. Submit PIN + Client Identity       |                                      |
          |-------------------------------------->|                                      |
          |                                       | 4. Prompt user: "Authorize Jarvis?"  |
          |                                       |------------------------------------->|
          |                                       | 5. User clicks "Approve"             |
          |                                       |<-------------------------------------|
          | 6. Issue Scoped Bearer Token          |                                      |
          |<--------------------------------------|                                      |
          |                                       |                                      |
```

### Pairing Rules
- **Pairing Ritual:** A 6-digit pairing PIN is displayed on the Kinora screen upon initial connection request. The external client must supply this PIN along with a descriptive client name (e.g. `HomeAssistant-LivingRoom`).
- **Cryptographic Tokens:** Kinora issues a 256-bit cryptographically secure random bearer token stored in `<app data>/security/paired_agents.json` (permissions `0600`).
- **Immediate Revocation:** The Settings > Security menu provides a live list of paired clients with an instant "Revoke" button that purges the token and disconnects active sockets.

---

## 3. Permission Scopes and Access Tiers

Every operation is classified into a strict permission tier:

| Scope | Access Level | Permitted Operations | Confirmation Required |
| :--- | :--- | :--- | :--- |
| `kinora:read` | Read-only | List channels, read EPG schedules, get Now Playing status, search titles | None (Automatic) |
| `kinora:playback` | State Mutating | Tune channel, play, pause, seek, adjust volume, toggle mute | None (Audited) |
| `kinora:library` | State Mutating | Add/remove title from watchlist, toggle favorite, record progress | None (Audited) |
| `kinora:sources:refresh` | Network Mutating | Refresh active playlist or XMLTV guide | Optional notification |
| `kinora:sources:write` | High Risk | Add a new playlist source or Xtream provider, remove a source | **Mandatory UI Confirmation** |

> **High-Risk Guardrail:** Any command with `kinora:sources:write` triggers a confirmation banner on Kinora's UI requiring explicit physical approval ("Allow Jarvis to add playlist 'Sports HD'?"). The request times out after 30 seconds if unacknowledged.

---

## 4. MCP Tool Definitions (Draft Schema)

The `kinora-mcp` service exposes the following structured tools:

### Read and Discovery Tools
- `kinora_search_catalog`: Search across all imported channels, films, series, and EPG listings.
- `kinora_get_now_playing`: Retrieve the active playing title, channel, elapsed time, and duration.
- `kinora_get_schedule`: Retrieve current and upcoming TV listings for a specific channel.
- `kinora_get_watchlist`: Return user bookmarked films and series.
- `kinora_get_recording_status`: Inspect DVR active recordings, rules, and remaining storage quota.

### Playback Control Tools
- `kinora_tune_channel`: Tune directly to a channel by name or key (e.g. `{ "query": "BBC One HD" }`).
- `kinora_play_vod`: Start playback of a film or series episode by identifier.
- `kinora_playback_control`: Send transport commands (`pause`, `resume`, `stop`, `seek_relative`).

### Library and Source Tools
- `kinora_watchlist_toggle`: Add or remove an item from the personal library.
- `kinora_refresh_source`: Trigger an asynchronous background refresh for a named source.
- `kinora_request_source_add`: Request permission to import a new playlist URL (gated by UI prompt).

---

## 5. Audit Logging Architecture

All external AI actions are written to `<app data>/audit/ai_actions.log`:
- Timestamp (ISO 8601 UTC).
- Client ID and Client Name.
- Operation invoked and input arguments (sanitized: passwords, tokens, and credentials scrubbed).
- Authorization outcome: `ALLOWED`, `USER_CONFIRMED`, `DENIED_INVALID_TOKEN`, or `REJECTED_BY_USER`.
- Execution duration and result code.

Log files are rotated at 10 MB and preserved locally for user inspection.

---

## 6. Milestone D13 Implementation Roadmap

Milestone D13 will execute the implementation across five focused phases:

1. **Phase 1: Local Loopback Server (Rust):** Implement a lightweight, authenticated loopback server inside `src-tauri` using tokio.
2. **Phase 2: MCP Server Implementation:** Author `kinora-mcp` exposing the standard tool schemas over stdio and SSE.
3. **Phase 3: Pairing and Token Management:** Build the pairing modal and security settings management UI in React.
4. **Phase 4: High-Risk Confirmation Bridge:** Implement the interactive approval prompt banner for state-mutating actions.
5. **Phase 5: Automated Integration Testing:** Test external tool invocation, authentication rejection, and rate limiting with Vitest and Cargo test suites.
