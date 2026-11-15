---
name: Feature Request
about: Suggest an idea or enhancement for Kinora
title: "[FEATURE]: "
labels: ["enhancement"]
assignees: []
---

### Is your feature request related to a problem? Please describe.
A clear and concise description of what the problem is. For example: "I find it difficult to..."

### Describe the solution you would like
A clear and concise description of what you want to happen.

### Describe alternatives you have considered
A clear and concise description of any alternative solutions or features you have considered.

### Architectural Consideration
Kinora operates under strict local-first and privacy-focused design rules:
- React owns UI and client state; Rust owns native tasks and networking.
- No stream addresses or credentials are exposed to the webview or persisted in plaintext.
- Media playback is strictly HLS over HTTP(S) with no DRM support.
- External network requests pass through guarded resolvers with loopback/private SSRF blocks.

Does your proposed feature respect these boundaries?

### Additional context
Add any other context, screenshots, or mockups about the feature request here.
