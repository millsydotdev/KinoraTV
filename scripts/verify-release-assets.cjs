#!/usr/bin/env node
/**
 * Kinora Release Asset, Checksum, Signature, and Updater Manifest Verifier
 *
 * Validates a release distribution directory (default: ./release-dist) before
 * GitHub Release publication:
 * - Verifies package.json, Cargo.toml, changelog.json, and release notes match
 * - Verifies latest.json schema, version, pub_date, notes (zero em-dashes), and all 4 platforms
 * - Verifies every referenced updater asset exists, is non-empty, and matches its exact download URL
 * - Verifies every .sig file exists, decodes as a valid Minisign signature, and matches latest.json
 * - Verifies every entry in SHA256SUMS.txt matches the actual SHA-256 of the file on disk
 * - Rejects colliding unprefixed Kinora.app.tar.gz artifacts
 *
 * Usage:
 *   node scripts/verify-release-assets.cjs [--dir <path>] [--repo <owner/repo>]
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const args = process.argv.slice(2);
let distDir = path.resolve(__dirname, '..', 'release-dist');
let repoSlug = 'millsydotdev/KinoraTV';

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--dir' && args[i + 1]) {
    distDir = path.resolve(args[i + 1]);
    i++;
  } else if (args[i] === '--repo' && args[i + 1]) {
    repoSlug = args[i + 1];
    i++;
  }
}

const rootDir = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
const authVersion = pkg.version;
const tag = `v${authVersion}`;

const REQUIRED_PLATFORMS = [
  'linux-x86_64',
  'windows-x86_64',
  'darwin-aarch64',
  'darwin-x86_64',
];

const errors = [];

function check(condition, msg) {
  if (!condition) errors.push(msg);
}

function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function isValidMinisignBase64(b64) {
  if (typeof b64 !== 'string' || b64.trim().length < 40) return false;
  try {
    const decoded = Buffer.from(b64.trim(), 'base64').toString('utf8');
    return decoded.includes('untrusted comment:') && decoded.includes('trusted comment:');
  } catch {
    return false;
  }
}

// 1. Check authoritative version alignment with Cargo.toml, changelog.json, and release notes
const cargoToml = fs.readFileSync(path.join(rootDir, 'src-tauri', 'Cargo.toml'), 'utf8');
const cargoMatch = cargoToml.match(/\[package\][\s\S]*?version\s*=\s*"([^"]+)"/);
check(cargoMatch && cargoMatch[1] === authVersion, `Cargo.toml version (${cargoMatch?.[1]}) does not match package.json (${authVersion}).`);

const changelogDb = JSON.parse(fs.readFileSync(path.join(rootDir, 'src', 'data', 'changelog.json'), 'utf8'));
const hasChangelogEntry = Array.isArray(changelogDb.releases) && changelogDb.releases.some((r) => r.version === authVersion);
check(hasChangelogEntry, `src/data/changelog.json has no entry for version ${authVersion}.`);

const releaseNotesPath = path.join(rootDir, 'docs', 'release', `release-notes-${tag}.md`);
check(fs.existsSync(releaseNotesPath), `Missing release notes file: ${releaseNotesPath}`);

// 2. Verify dist directory and required metadata files exist
check(fs.existsSync(distDir) && fs.statSync(distDir).isDirectory(), `Release directory does not exist: ${distDir}`);

if (errors.length === 0) {
  const files = fs.readdirSync(distDir);
  check(!files.includes('Kinora.app.tar.gz'), 'Unprefixed Kinora.app.tar.gz found in release-dist (causes x64/arm64 collision).');
  check(!files.includes('Kinora.app.tar.gz.sig'), 'Unprefixed Kinora.app.tar.gz.sig found in release-dist (causes x64/arm64 collision).');

  const manifestPath = path.join(distDir, 'latest.json');
  const sumsPath = path.join(distDir, 'SHA256SUMS.txt');
  const sbomPath = path.join(distDir, 'kinora-sbom.json');

  check(fs.existsSync(manifestPath) && fs.statSync(manifestPath).size > 0, 'Missing or empty latest.json.');
  check(fs.existsSync(sumsPath) && fs.statSync(sumsPath).size > 0, 'Missing or empty SHA256SUMS.txt.');
  check(fs.existsSync(sbomPath) && fs.statSync(sbomPath).size > 0, 'Missing or empty kinora-sbom.json.');

  // 3. Validate latest.json manifest structure, URLs, assets, and Minisign signatures
  if (fs.existsSync(manifestPath)) {
    let manifest = null;
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    } catch (e) {
      errors.push(`latest.json is not valid JSON: ${e.message}`);
    }

    if (manifest) {
      check(manifest.version === authVersion, `latest.json version (${manifest.version}) does not match package.json (${authVersion}).`);
      check(typeof manifest.pub_date === 'string' && !Number.isNaN(Date.parse(manifest.pub_date)), 'latest.json pub_date is missing or invalid ISO-8601.');
      if (manifest.build_commit !== undefined) {
        check(typeof manifest.build_commit === 'string' && /^[0-9a-f]{7,40}$/i.test(manifest.build_commit), `latest.json build_commit (${manifest.build_commit}) is invalid.`);
      }
      if (manifest.build_timestamp !== undefined) {
        check(typeof manifest.build_timestamp === 'number' && Number.isInteger(manifest.build_timestamp) && manifest.build_timestamp > 0, `latest.json build_timestamp (${manifest.build_timestamp}) is invalid.`);
      }
      check(typeof manifest.notes === 'string' && manifest.notes.trim().length > 10, 'latest.json notes are missing or empty.');
      check(typeof manifest.notes === 'string' && !manifest.notes.includes('\u2014'), 'latest.json notes contain a prohibited em-dash character.');
      check(manifest.platforms && typeof manifest.platforms === 'object', 'latest.json platforms object is missing.');

      const expectedPrefix = `https://github.com/${repoSlug}/releases/download/${tag}/`;
      for (const plat of REQUIRED_PLATFORMS) {
        const entry = manifest.platforms?.[plat];
        check(Boolean(entry), `latest.json is missing required platform "${plat}".`);
        if (!entry) continue;

        check(typeof entry.url === 'string' && entry.url.startsWith(expectedPrefix), `Platform "${plat}" URL (${entry.url}) does not start with ${expectedPrefix}.`);
        const filename = typeof entry.url === 'string' ? entry.url.slice(expectedPrefix.length) : '';
        check(filename.length > 0 && !filename.includes('/'), `Platform "${plat}" URL points to an invalid filename "${filename}".`);

        const assetPath = path.join(distDir, filename);
        check(fs.existsSync(assetPath) && fs.statSync(assetPath).size > 0, `Platform "${plat}" asset "${filename}" is missing or empty in ${distDir}.`);

        const sigPath = path.join(distDir, `${filename}.sig`);
        check(fs.existsSync(sigPath) && fs.statSync(sigPath).size > 0, `Platform "${plat}" signature file "${filename}.sig" is missing or empty.`);

        check(isValidMinisignBase64(entry.signature), `Platform "${plat}" signature in latest.json is not a valid Base64 Minisign payload.`);
        if (fs.existsSync(sigPath)) {
          const diskSig = fs.readFileSync(sigPath, 'utf8').trim();
          check(diskSig === String(entry.signature || '').trim(), `Platform "${plat}" signature in latest.json does not match ${filename}.sig on disk.`);
        }
      }
    }
  }

  // 4. Validate SHA256SUMS.txt entries against actual files on disk
  if (fs.existsSync(sumsPath)) {
    const lines = fs
      .readFileSync(sumsPath, 'utf8')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    check(lines.length >= REQUIRED_PLATFORMS.length + 1, `SHA256SUMS.txt has too few entries (${lines.length}).`);

    for (const line of lines) {
      const m = line.match(/^([a-f0-9]{64})\s+\*?(.+)$/i);
      if (!m) {
        errors.push(`Malformed SHA256SUMS.txt line: "${line}"`);
        continue;
      }
      const expectedHash = m[1].toLowerCase();
      const rawName = m[2].trim();
      const baseName = path.basename(rawName);
      const targetPath = path.join(distDir, baseName);
      if (!fs.existsSync(targetPath)) {
        errors.push(`SHA256SUMS.txt references missing file "${baseName}" (entry "${rawName}").`);
        continue;
      }
      const actualHash = sha256File(targetPath);
      if (actualHash !== expectedHash) {
        errors.push(`SHA-256 mismatch for "${baseName}": expected ${expectedHash}, got ${actualHash}.`);
      }
    }
  }
}

if (errors.length > 0) {
  console.error(`\x1b[31m[RELEASE VERIFY FAILED]\x1b[0m Found ${errors.length} issue(s):`);
  for (const err of errors) {
    console.error(`  - ${err}`);
  }
  process.exit(1);
}

console.log(`\x1b[32m[RELEASE VERIFY OK]\x1b[0m Verified ${tag} assets, Minisign signatures, SHA256SUMS.txt, SBOM, and latest.json in ${distDir}.`);
