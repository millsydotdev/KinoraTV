#!/usr/bin/env node
/**
 * Kinora CycloneDX / SPDX Software Bill of Materials (SBOM) Generator (v0.6.0)
 *
 * Scans package.json and Cargo.lock to generate a verified, standard SBOM
 * document in CycloneDX JSON format for software supply chain transparency.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
const cargoLockPath = path.join(repoRoot, 'src-tauri', 'Cargo.lock');

function readBuildCommit() {
  const envSha = (process.env.GITHUB_SHA || '').trim();
  if (/^[0-9a-f]{7,40}$/i.test(envSha)) return envSha.toLowerCase();
  try {
    return execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf8' }).trim().toLowerCase();
  } catch {
    return 'unknown';
  }
}

const buildCommit = readBuildCommit();

const components = [];

// 1. Root Application Component
const rootComponent = {
  type: 'application',
  name: pkg.name || 'kinora',
  version: pkg.version || '0.6.0',
  description: 'Kinora desktop entertainment platform (React + Tauri 2)',
  licenses: [{ license: { id: pkg.license || 'UNLICENSED' } }],
  purl: `pkg:npm/${pkg.name}@${pkg.version}`
};

// 2. Parse Frontend Dependencies
if (pkg.dependencies) {
  for (const [dep, ver] of Object.entries(pkg.dependencies)) {
    const cleanVer = ver.replace(/[\^~>=<]/g, '');
    components.push({
      type: 'library',
      name: dep,
      version: cleanVer,
      scope: 'required',
      purl: `pkg:npm/${dep}@${cleanVer}`
    });
  }
}

// 3. Parse Rust Cargo Dependencies from Cargo.lock
if (fs.existsSync(cargoLockPath)) {
  const cargoLockContent = fs.readFileSync(cargoLockPath, 'utf8');
  const packageBlocks = cargoLockContent.split('[[package]]').slice(1);

  for (const block of packageBlocks) {
    const nameMatch = block.match(/name\s*=\s*"([^"]+)"/);
    const verMatch = block.match(/version\s*=\s*"([^"]+)"/);
    const sourceMatch = block.match(/source\s*=\s*"([^"]+)"/);

    if (nameMatch && verMatch) {
      const name = nameMatch[1];
      const version = verMatch[1];
      const source = sourceMatch ? sourceMatch[1] : 'local';

      // Avoid duplicating the root package
      if (name === 'kinora' || name === 'kinora-lib') continue;

      components.push({
        type: 'library',
        name,
        version,
        scope: 'required',
        description: `Rust crate (${source})`,
        purl: `pkg:cargo/${name}@${version}`
      });
    }
  }
}

const sbom = {
  bomFormat: 'CycloneDX',
  specVersion: '1.5',
  serialNumber: `urn:uuid:${require('crypto').randomUUID()}`,
  version: 1,
  metadata: {
    timestamp: new Date().toISOString(),
    tools: [
      {
        vendor: 'millsydotdev',
        name: 'kinora-sbom-generator',
        version: '0.6.0'
      }
    ],
    component: rootComponent,
    properties: [
      {
        name: 'kinora:git-commit',
        value: buildCommit
      }
    ]
  },
  components
};

const outputArg = process.argv[2];
const outputPath = outputArg ? path.resolve(outputArg) : path.join(repoRoot, 'dist', 'bom.json');

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(sbom, null, 2), 'utf8');

console.log(`[SBOM] Successfully generated CycloneDX SBOM with ${components.length} components: ${outputPath}`);
