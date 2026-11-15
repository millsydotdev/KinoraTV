#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const distDir = path.resolve(__dirname, '..', 'release-dist');
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

const files = fs.readdirSync(distDir);
console.log('Generating latest.json updater manifest from release-dist files:', files);

function findAssetAndSig(patterns) {
  for (const pattern of patterns) {
    const asset = files.find(f => pattern.test(f) && !f.endsWith('.sig'));
    if (asset) {
      const sigFile = files.find(f => f === `${asset}.sig`);
      if (sigFile) {
        const sig = fs.readFileSync(path.join(distDir, sigFile), 'utf8').trim();
        if (sig && sig.length >= 10) {
          return {
            url: `https://github.com/millsydotdev/KinoraTV/releases/download/v0.5.0/${asset}`,
            signature: sig
          };
        }
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

const manifest = {
  version: '0.5.0',
  notes: 'Kinora v0.5.0 Public Desktop Release Candidate\n\n- Proprietary Source-Available Licence - All Rights Reserved\n- Creator Attribution for millsydotdev in Settings and README\n- Signed Tauri Updater with in-app notifications and What\'s New modal\n- Multi-Platform matrix builds: Linux (DEB, RPM, AppImage), macOS (Apple Silicon ARM64, Intel x64 DMG), and Windows (NSIS, MSI)\n- Zero em-dashes and strict privacy-first local architecture',
  pub_date: new Date().toISOString(),
  platforms
};

const manifestPath = path.join(distDir, 'latest.json');
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log('Successfully generated latest.json:\n', JSON.stringify(manifest, null, 2));
