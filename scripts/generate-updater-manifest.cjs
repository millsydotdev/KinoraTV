#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const pkg = require('../package.json');

const authVersion = pkg.version;
if (!authVersion) {
  throw new Error('Authoritative version not found in package.json');
}

const tag = `v${authVersion}`;
const distArgIdx = process.argv.indexOf('--dist-dir');
const distDir =
  distArgIdx >= 0 && process.argv[distArgIdx + 1]
    ? path.resolve(process.argv[distArgIdx + 1])
    : path.resolve(__dirname, '..', 'release-dist');
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

const files = fs.readdirSync(distDir);
console.log(`Generating latest.json updater manifest for ${tag} from release-dist files:`, files);

function isValidMinisign(sig) {
  if (!sig || sig.length < 40) return false;
  try {
    const decoded = Buffer.from(sig, 'base64').toString('utf8');
    return decoded.includes('untrusted comment:') && decoded.includes('trusted comment:');
  } catch {
    return false;
  }
}

function findAssetAndSig(patterns) {
  for (const pattern of patterns) {
    const asset = files.find(f => pattern.test(f) && !f.endsWith('.sig'));
    if (asset) {
      const assetPath = path.join(distDir, asset);
      if (fs.statSync(assetPath).size === 0) {
        throw new Error(`Updater asset "${asset}" is empty (0 bytes).`);
      }
      const sigFile = files.find(f => f === `${asset}.sig`);
      if (sigFile) {
        const sig = fs.readFileSync(path.join(distDir, sigFile), 'utf8').trim();
        if (isValidMinisign(sig)) {
          return {
            url: `https://github.com/millsydotdev/KinoraTV/releases/download/${tag}/${asset}`,
            signature: sig
          };
        }
        throw new Error(`Signature file "${sigFile}" does not contain a valid Base64 Minisign signature.`);
      }
    }
  }
  throw new Error(`Missing asset or signature matching patterns: ${patterns.map(p => p.toString()).join(', ')}`);
}

const platforms = {};

// 1. linux-x86_64: AppImage or AppImage tar.gz
platforms['linux-x86_64'] = findAssetAndSig([
  /\.AppImage\.tar\.gz$/i,
  /\.AppImage$/i
]);

// 2. windows-x86_64: setup exe or nsis zip or msi
platforms['windows-x86_64'] = findAssetAndSig([
  /\.nsis\.zip$/i,
  /setup\.exe$/i,
  /\.exe$/i
]);

// 3. darwin-aarch64: aarch64 app tar.gz
platforms['darwin-aarch64'] = findAssetAndSig([
  /aarch64.*\.app\.tar\.gz$/i
]);

// 4. darwin-x86_64: x64 app tar.gz
platforms['darwin-x86_64'] = findAssetAndSig([
  /x64.*\.app\.tar\.gz$/i
]);

function loadStructuredReleaseNotes(version) {
  try {
    const changelogPath = path.resolve(__dirname, '..', 'src', 'data', 'changelog.json');
    const db = JSON.parse(fs.readFileSync(changelogPath, 'utf8'));
    const rel = Array.isArray(db.releases) ? db.releases.find((r) => r.version === version) : null;
    if (!rel) return null;
    const userEntries = (rel.entries || []).filter((e) => e.audience !== 'developer');
    const bullets = userEntries.slice(0, 8).map((e) => `- ${e.title}: ${e.description}`);
    return `Kinora v${rel.version}: ${rel.title}\n\n${rel.summary}\n\n${bullets.join('\n')}`;
  } catch {
    return null;
  }
}

const defaultNotes = loadStructuredReleaseNotes(authVersion) || (
  `Kinora v${authVersion} Desktop Release\n\n` +
  '- Centralised version synchronization across React frontend, Rust backend, installers, and updater\n' +
  '- Multi-Platform matrix builds: Linux (DEB, RPM, AppImage), macOS (Apple Silicon ARM64, Intel x64 DMG), and Windows (NSIS, MSI)\n' +
  '- Zero em-dashes and strict privacy-first local architecture'
);

const manifest = {
  version: authVersion,
  notes: process.env.RELEASE_NOTES || defaultNotes,
  pub_date: new Date().toISOString(),
  platforms
};

const manifestPath = path.join(distDir, 'latest.json');
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log('Successfully generated latest.json:\n', JSON.stringify(manifest, null, 2));
