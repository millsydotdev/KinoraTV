#!/usr/bin/env node
/**
 * Kinora Version Validation Utility
 *
 * Verifies that the authoritative version in package.json is valid SemVer 2.0.0
 * and that all derived files (Cargo.toml, tauri.conf.json, package-lock.json, CI tags)
 * are strictly in sync with zero drift. Fails with code 1 on any mismatch.
 */

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const packageJsonPath = path.join(rootDir, 'package.json');
const cargoTomlPath = path.join(rootDir, 'src-tauri', 'Cargo.toml');
const tauriConfPath = path.join(rootDir, 'src-tauri', 'tauri.conf.json');
const packageLockPath = path.join(rootDir, 'package-lock.json');
const manifestScriptPath = path.join(rootDir, 'scripts', 'generate-updater-manifest.cjs');

// SemVer 2.0.0 specification regex (official regex with pre-release and build metadata)
const SEMVER_REGEX = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

function fail(message) {
  console.error(`\x1b[31m[VERSION ERROR]\x1b[0m ${message}`);
  process.exit(1);
}

// 1. Authoritative source: package.json
if (!fs.existsSync(packageJsonPath)) {
  fail(`Missing authoritative package.json at ${packageJsonPath}`);
}
const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const authVersion = pkg.version;

if (!authVersion || typeof authVersion !== 'string') {
  fail('package.json must contain a string "version" field.');
}

if (!SEMVER_REGEX.test(authVersion)) {
  fail(`Authoritative version "${authVersion}" in package.json is not valid SemVer 2.0.0.`);
}

console.log(`[VERSION CHECK] Authoritative version from package.json: ${authVersion}`);

// 2. Rust Cargo.toml check
if (!fs.existsSync(cargoTomlPath)) {
  fail(`Missing src-tauri/Cargo.toml at ${cargoTomlPath}`);
}
const cargoContent = fs.readFileSync(cargoTomlPath, 'utf8');
const cargoMatch = cargoContent.match(/\[package\][^]*?version\s*=\s*"([^"]+)"/);
if (!cargoMatch) {
  fail('Could not extract version from [package] section in src-tauri/Cargo.toml.');
}
const cargoVersion = cargoMatch[1];
if (cargoVersion !== authVersion) {
  fail(
    `Cargo.toml version mismatch! package.json has "${authVersion}" but Cargo.toml has "${cargoVersion}".\n` +
    'Run "npm run version:sync" to synchronize Cargo.toml.'
  );
}

// 3. Tauri configuration check
if (!fs.existsSync(tauriConfPath)) {
  fail(`Missing tauri.conf.json at ${tauriConfPath}`);
}
const tauriConf = JSON.parse(fs.readFileSync(tauriConfPath, 'utf8'));
if (tauriConf.version !== '../package.json') {
  fail(
    `tauri.conf.json "version" field must point directly to authoritative "../package.json", ` +
    `but found "${tauriConf.version}".`
  );
}

// 4. package-lock.json check (if present)
if (fs.existsSync(packageLockPath)) {
  const lock = JSON.parse(fs.readFileSync(packageLockPath, 'utf8'));
  if (lock.version && lock.version !== authVersion) {
    fail(
      `package-lock.json version mismatch! package.json has "${authVersion}" but package-lock.json has "${lock.version}".\n` +
      'Run "npm run version:sync" or "npm install" to synchronize.'
    );
  }
}

// 5. Updater manifest generator script check
if (fs.existsSync(manifestScriptPath)) {
  const scriptContent = fs.readFileSync(manifestScriptPath, 'utf8');
  // Must dynamically derive version from package.json, not hardcoded strings
  if (/version:\s*['"]0\.\d+\.\d+['"]/.test(scriptContent)) {
    fail('scripts/generate-updater-manifest.cjs contains a hardcoded version string instead of deriving from package.json.');
  }
}

// 6. CI Git Tag validation (when running under release workflow or git tag trigger)
const gitTagRef = process.env.GITHUB_REF_NAME || (process.env.GITHUB_REF && process.env.GITHUB_REF.replace(/^refs\/tags\//, ''));
if (gitTagRef && gitTagRef.startsWith('v')) {
  const tagVersion = gitTagRef.slice(1);
  if (tagVersion !== authVersion) {
    fail(
      `CI Git Tag mismatch! Triggered tag is "${gitTagRef}" (version "${tagVersion}"), ` +
      `but authoritative package.json version is "${authVersion}".\n` +
      'Release pipelines must only run against tags exactly matching package.json.'
    );
  }
  console.log(`[VERSION CHECK] CI Git Tag "${gitTagRef}" matches authoritative version "${authVersion}".`);
}

console.log(`\x1b[32m[VERSION OK]\x1b[0m All version checks passed. Authoritative version: ${authVersion}`);
