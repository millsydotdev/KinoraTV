# Security Policy (v0.6.0)

Kinora is designed with a defense-in-depth security model to safeguard user privacy, network boundaries, and playback integrity.

## 1. Supported Versions

Only the active stable release and release candidates receive security patches.

| Version | Supported | Notes |
| :--- | :--- | :--- |
| 0.6.x (Current) | Yes | Active maintenance milestone |
| < 0.6.0 | No | Legacy baseline releases |

---

## 2. Reporting a Vulnerability

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

---

## 3. Architectural Security Invariants

When evaluating potential vulnerabilities, keep Kinora's core security invariants in mind:

1. **Guarded Network Client (`src-tauri/src/fetch.rs`):**
   - All outbound HTTP requests pass through the guarded native fetch engine.
   - Kinora intentionally disables system proxies (`no_proxy()`) to prevent proxy-based SSRF bypasses.
   - Hostnames are resolved through a guarded DNS resolver; loopback, private, CGNAT, link-local, and multicast IP destinations are strictly blocked.
   - Every redirect hop is re-validated against security policy.
   - URL paths and query tokens are scrubbed from all error strings to prevent credential exposure.

2. **Stream URL and Credential Isolation:**
   - Upstream stream URLs and authentication tokens are kept strictly in native Rust memory.
   - The React frontend interacts solely with opaque handles through the custom protocol `kstream://localhost/<handle>`.
   - Upstream URLs and tokens are never rendered to DOM elements, never written to disk, and never output to logs.

3. **Local-First Profile Persistence:**
   - User data is stored in user-scoped paths (`0700` directories, `0600` files).
   - Saved sources and credentials are never transmitted to external servers or telemetry platforms.

4. **HLS and Media Restrictions:**
   - Kinora explicitly refuses non-HLS formats, DRM streams, and unknown encryption schemes at the protocol layer.

5. **Parental PIN Cryptographic Protection:**
   - Parental PINs are hashed using salted SHA-256 (`kinora:<salt>:<pin>`). Plaintext PINs are never persisted.
   - Lockout mechanisms throttle consecutive failed attempts.

---

## 4. Software Supply Chain & Dependency Governance

Kinora enforces automated supply chain controls across development and CI/CD:

1. **Automated Vulnerability Audits:**
   - Rust dependencies: Verified via `cargo audit` against the RustSec Advisory Database.
   - Dependency bans and licensing: Enforced via `cargo deny` (`advisories`, `licenses`, `bans`, `sources`).
   - Node dependencies: Verified via `npm audit` on every build.

2. **Software Bill of Materials (SBOM):**
   - Every staging and production release generates a standard CycloneDX 1.5 JSON SBOM (`node scripts/generate-sbom.cjs`).
   - The SBOM catalogues every frontend and native crate dependency with Package URL (PURL) identifiers.

3. **Secret Scanning:**
   - Repository commits and pull requests are scanned for leaked credentials, private keys, and API tokens using Gitleaks in CI.

4. **Cryptographic Release Integrity:**
   - Every binary package is accompanied by SHA-256 checksums (`SHA256SUMS.txt`).
   - Native packages and updater bundles are cryptographically signed using Minisign keys.
