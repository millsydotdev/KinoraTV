# Security Policy

Kinora is designed with a defense-in-depth security model to safeguard user privacy, network boundaries, and playback integrity.

## Supported Versions

Only the latest release candidate and stable releases receive security patches.

| Version | Supported |
| :--- | :--- |
| 0.1.x (Release Candidate) | Yes |
| < 0.1.0 | No |

## Reporting a Vulnerability

If you discover a security vulnerability or security bug in Kinora, please report it privately.

**Do not disclose security vulnerabilities through public GitHub issues, discussions, or pull requests.**

### Preferred Reporting Method

Use GitHub's Private Vulnerability Reporting:
1. Navigate to the repository's **Security** tab.
2. Select **Advisories** and click **Report a vulnerability**.
3. Provide a detailed summary, proof of concept, and affected platforms.

### Alternative Reporting Method

If GitHub Private Vulnerability Reporting is unavailable, email security details to:
`security@millsy.dev`

Please include:
- A clear description of the vulnerability.
- Steps to reproduce or a minimal proof-of-concept.
- Affected platforms (Windows, macOS, Linux).
- Potential impact and risk assessment.

### Response Timeline

- **Initial Acknowledgement:** Within 48 hours.
- **Assessment and Triage:** Within 5 business days.
- **Remediation and Release:** Prioritized according to severity. We request that reporters maintain coordinated disclosure until an official patch is published.

## Architectural Security Invariants

When evaluating potential vulnerabilities, keep Kinora's core security invariants in mind:

1. **Guarded Network Client:** All outbound HTTP requests pass through `fetch.rs`. Kinora intentionally disables system proxies (`no_proxy()`), resolves hostnames via a guarded DNS resolver, blocks all loopback/private/reserved IP ranges (anti-SSRF), and sanitizes URL paths and query parameters from all error strings.
2. **Stream URL and Credential Isolation:** Upstream stream URLs and authentication tokens are kept strictly in native Rust memory. The React frontend interacts solely with opaque handles through the custom protocol `kstream://localhost/<handle>`. Upstream URLs and tokens are never rendered to DOM elements, never written to disk, and never output to logs.
3. **Local-First Profile Persistence:** User data is saved under user-scoped paths (`0700` directories, `0600` files). Personal source definitions are never transmitted to external servers or telemetry platforms.
4. **HLS and Media Restrictions:** Kinora explicitly refuses non-HLS formats, DRM streams, and unknown encryption schemes at the protocol layer.
