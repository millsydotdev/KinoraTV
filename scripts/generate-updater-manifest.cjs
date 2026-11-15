#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const distDir = path.resolve(__dirname, '..', 'release-dist');
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

const files = fs.readdirSync(distDir);
console.log('Generating latest.json updater manifest from release-dist files:', files);

function findAssetAndSig(pattern, sigPattern) {
  const asset = files.find(f => pattern.test(f));
  const sigFile = files.find(f => sigPattern.test(f));
  if (!asset) {
    throw new Error(`Missing asset matching ${pattern}`);
  }
  if (!sigFile) {
    throw new Error(`Missing signature file matching ${sigPattern} for asset ${asset}`);
  }
  const sig = fs.readFileSync(path.join(distDir, sigFile), 'utf8').trim();
  if (!sig || sig.length < 10) {
    throw new Error(`Signature file ${sigFile} is empty or invalid`);
  }
  return {
    url: `https://github.com/millsydotdev/KinoraTV/releases/download/v0.5.0/${asset}`,
    signature: sig
  };
}

const platforms = {};

// 1. linux-x86_64: AppImage tar.gz
platforms['linux-x86_64'] = findAssetAndSig(
  /\.AppImage\.tar\.gz$/i,
  /\.AppImage\.tar\.gz\.sig$/i
);

// 2. windows-x86_64: nsis.zip
platforms['windows-x86_64'] = findAssetAndSig(
  /\.nsis\.zip$/i,
  /\.nsis\.zip\.sig$/i
);

// 3. darwin-aarch64: aarch64 app tar.gz
platforms['darwin-aarch64'] = findAssetAndSig(
  /aarch64.*\.app\.tar\.gz$/i,
  /aarch64.*\.app\.tar\.gz\.sig$/i
);

// 4. darwin-x86_64: x64 app tar.gz
platforms['darwin-x86_64'] = findAssetAndSig(
  /x64.*\.app\.tar\.gz$/i,
  /x64.*\.app\.tar\.gz\.sig$/i
);

const manifest = {
  version: '0.5.0',
  notes: 'Kinora v0.5.0 Public Desktop Release Candidate\n\n- Proprietary Source-Available Licence - All Rights Reserved\n- Creator Attribution for millsydotdev in Settings and README\n- Signed Tauri Updater with in-app notifications and What\'s New modal\n- Multi-Platform matrix builds: Linux (DEB, RPM, AppImage), macOS (Apple Silicon ARM64, Intel x64 DMG), and Windows (NSIS, MSI)\n- Zero em-dashes and strict privacy-first local architecture',
  pub_date: new Date().toISOString(),
  platforms
};

const manifestPath = path.join(distDir, 'latest.json');
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log('Successfully generated latest.json:\n', JSON.stringify(manifest, null, 2));
