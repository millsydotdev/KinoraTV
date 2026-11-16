#!/usr/bin/env node
/**
 * Kinora Version Synchronization Utility
 *
 * Ensures package.json remains the sole authoritative source of truth,
 * synchronizing its version to src-tauri/Cargo.toml and package-lock.json,
 * and verifying tauri.conf.json dynamic pointer.
 *
 * Usage:
 *   node scripts/sync-version.cjs [new-version]
 *
 * Examples:
 *   node scripts/sync-version.cjs           # Syncs existing package.json version to Cargo.toml
 *   node scripts/sync-version.cjs 0.6.0     # Sets new authoritative version and syncs all targets
 *   node scripts/sync-version.cjs 1.0.0-rc.1
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const packageJsonPath = path.join(rootDir, 'package.json');
const cargoTomlPath = path.join(rootDir, 'src-tauri', 'Cargo.toml');
const tauriConfPath = path.join(rootDir, 'src-tauri', 'tauri.conf.json');
const packageLockPath = path.join(rootDir, 'package-lock.json');
const validateScriptPath = path.join(__dirname, 'validate-version.cjs');

const SEMVER_REGEX = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

function fail(message) {
  console.error(`\x1b[31m[SYNC ERROR]\x1b[0m ${message}`);
  process.exit(1);
}

const targetVersionArg = process.argv[2];

const pkgRaw = fs.readFileSync(packageJsonPath, 'utf8');
const pkg = JSON.parse(pkgRaw);

let newVersion = pkg.version;

if (targetVersionArg) {
  const cleanArg = targetVersionArg.trim().replace(/^v/, '');
  if (!SEMVER_REGEX.test(cleanArg)) {
    fail(`Provided version "${targetVersionArg}" is not a valid SemVer 2.0.0 string (e.g. 1.0.0, 1.0.0-rc.1).`);
  }
  newVersion = cleanArg;
  console.log(`[SYNC] Updating authoritative package.json version from ${pkg.version} to ${newVersion}...`);
  pkg.version = newVersion;
  fs.writeFileSync(packageJsonPath, JSON.stringify(pkg, null, 2) + '\n');
} else {
  console.log(`[SYNC] Synchronizing authoritative version ${newVersion} to all targets...`);
}

// 1. Synchronize src-tauri/Cargo.toml
if (!fs.existsSync(cargoTomlPath)) {
  fail(`Missing src-tauri/Cargo.toml at ${cargoTomlPath}`);
}
const cargoToml = fs.readFileSync(cargoTomlPath, 'utf8');
const updatedCargoToml = cargoToml.replace(
  /(\[package\][^]*?version\s*=\s*)"[^"]+"/,
  `$1"${newVersion}"`
);
if (updatedCargoToml === cargoToml && !cargoToml.includes(`version = "${newVersion}"`)) {
  fail('Failed to update version field in src-tauri/Cargo.toml');
}
fs.writeFileSync(cargoTomlPath, updatedCargoToml);
console.log(`[SYNC] Updated src-tauri/Cargo.toml package.version -> "${newVersion}"`);

// 2. Synchronize package-lock.json
if (fs.existsSync(packageLockPath)) {
  const lock = JSON.parse(fs.readFileSync(packageLockPath, 'utf8'));
  lock.version = newVersion;
  if (lock.packages && lock.packages['']) {
    lock.packages[''].version = newVersion;
  }
  fs.writeFileSync(packageLockPath, JSON.stringify(lock, null, 2) + '\n');
  console.log(`[SYNC] Updated package-lock.json version -> "${newVersion}"`);
}

// 3. Ensure tauri.conf.json points to ../package.json
if (fs.existsSync(tauriConfPath)) {
  const tauriConf = JSON.parse(fs.readFileSync(tauriConfPath, 'utf8'));
  if (tauriConf.version !== '../package.json') {
    console.log('[SYNC] Restoring tauri.conf.json version pointer to authoritative "../package.json"');
    tauriConf.version = '../package.json';
    fs.writeFileSync(tauriConfPath, JSON.stringify(tauriConf, null, 2) + '\n');
  }
}

// 4. Validate all targets
console.log('[SYNC] Running validation checks...');
try {
  execFileSync(process.execPath, [validateScriptPath], { stdio: 'inherit' });
} catch {
  fail('Validation failed following version synchronization.');
}

console.log(`\x1b[32m[SYNC SUCCESS]\x1b[0m Version ${newVersion} is fully synchronized across the project.`);
