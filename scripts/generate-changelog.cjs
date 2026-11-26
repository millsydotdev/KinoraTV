#!/usr/bin/env node
/**
 * Kinora Automated Changelog Generator & Validator
 *
 * Reads the authoritative structured release database (src/data/changelog.json),
 * optionally merges pending fragments from changelog/fragments/*.json,
 * validates schema, categories, uniqueness, SemVer, ISO dates, and zero em-dash policy,
 * and deterministically renders CHANGELOG.md and docs/release/release-notes-v<version>.md.
 *
 * Usage:
 *   node scripts/generate-changelog.cjs                 # Validate + regenerate CHANGELOG.md & release notes
 *   node scripts/generate-changelog.cjs --check         # Validate only (fails if CHANGELOG.md is out of sync)
 *   node scripts/generate-changelog.cjs --merge-fragments  # Absorb changelog/fragments/*.json into current version
 */

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const pkgPath = path.join(rootDir, 'package.json');
const changelogDataPath = path.join(rootDir, 'src', 'data', 'changelog.json');
const changelogMdPath = path.join(rootDir, 'CHANGELOG.md');
const fragmentsDir = path.join(rootDir, 'changelog', 'fragments');
const releaseDocsDir = path.join(rootDir, 'docs', 'release');

const ALLOWED_CATEGORIES = [
  'New Features',
  'UI Upgrades',
  'Design Improvements',
  'Playback Improvements',
  'Live TV and EPG',
  'Movies and Series',
  'Audio and Podcasts',
  'Books and Reading',
  'AI and Automation',
  'Server and Devices',
  'Mobile Remote',
  'Synchronisation',
  'Artwork and Discovery',
  'Source Integrations',
  'Security and Privacy',
  'Performance Improvements',
  'Reliability Improvements',
  'Bug Fixes',
  'Developer and Infrastructure Improvements',
];

const SEMVER_REGEX = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const EM_DASH = '\u2014';

function fail(message) {
  console.error(`\x1b[31m[CHANGELOG ERROR]\x1b[0m ${message}`);
  process.exit(1);
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    fail(`Could not parse JSON file ${filePath}: ${err.message}`);
  }
}

function assertNoEmDash(text, context) {
  if (typeof text === 'string' && text.includes(EM_DASH)) {
    fail(`Em-dash character found in ${context}. Use hyphens (-), colons (:), or parentheses () instead.`);
  }
}

function validateDatabase(db, authVersion) {
  if (!db || db.schemaVersion !== 1 || !Array.isArray(db.releases) || db.releases.length === 0) {
    fail('src/data/changelog.json must contain schemaVersion 1 and a non-empty releases array.');
  }

  const seenVersions = new Set();
  const seenGlobalIds = new Set();

  for (const rel of db.releases) {
    if (!rel.version || !SEMVER_REGEX.test(rel.version)) {
      fail(`Invalid SemVer release version: "${rel.version}"`);
    }
    if (seenVersions.has(rel.version)) {
      fail(`Duplicate release version "${rel.version}" in src/data/changelog.json.`);
    }
    seenVersions.add(rel.version);

    if (!rel.releaseDate || !DATE_REGEX.test(rel.releaseDate)) {
      fail(`Release ${rel.version} has invalid ISO date "${rel.releaseDate}" (expected YYYY-MM-DD).`);
    }
    if (!rel.title || !rel.title.trim()) {
      fail(`Release ${rel.version} is missing a title.`);
    }
    if (!rel.summary || !rel.summary.trim()) {
      fail(`Release ${rel.version} is missing a summary.`);
    }

    assertNoEmDash(rel.title, `release ${rel.version} title`);
    assertNoEmDash(rel.summary, `release ${rel.version} summary`);

    if (!Array.isArray(rel.entries) || rel.entries.length === 0) {
      fail(`Release ${rel.version} must contain at least one changelog entry.`);
    }

    const seenTitles = new Set();
    for (const entry of rel.entries) {
      if (!entry.id || typeof entry.id !== 'string' || !entry.id.trim()) {
        fail(`Release ${rel.version} has an entry with a missing id.`);
      }
      if (seenGlobalIds.has(entry.id)) {
        fail(`Duplicate entry id "${entry.id}" found in changelog database.`);
      }
      seenGlobalIds.add(entry.id);

      if (!ALLOWED_CATEGORIES.includes(entry.category)) {
        fail(`Release ${rel.version} entry "${entry.id}" has unknown category "${entry.category}".`);
      }
      if (!entry.title || !entry.title.trim()) {
        fail(`Release ${rel.version} entry "${entry.id}" is missing a title.`);
      }
      if (!entry.description || !entry.description.trim()) {
        fail(`Release ${rel.version} entry "${entry.id}" is missing a description.`);
      }

      const normTitle = entry.title.trim().toLowerCase();
      if (seenTitles.has(normTitle)) {
        fail(`Duplicate entry title "${entry.title}" in release ${rel.version}.`);
      }
      seenTitles.add(normTitle);

      assertNoEmDash(entry.title, `entry ${entry.id} title`);
      assertNoEmDash(entry.description, `entry ${entry.id} description`);
      if (entry.details) assertNoEmDash(entry.details, `entry ${entry.id} details`);
    }
  }

  if (!seenVersions.has(authVersion)) {
    fail(`Current package.json version "${authVersion}" is missing from src/data/changelog.json.`);
  }
}

function mergeFragments(db, authVersion) {
  if (!fs.existsSync(fragmentsDir)) return 0;
  const files = fs.readdirSync(fragmentsDir).filter((f) => f.endsWith('.json')).sort();
  if (files.length === 0) return 0;

  let target = db.releases.find((r) => r.version === authVersion);
  if (!target) {
    target = {
      version: authVersion,
      releaseDate: new Date().toISOString().slice(0, 10),
      channel: authVersion.includes('-') ? 'prerelease' : 'stable',
      title: `Kinora v${authVersion}`,
      summary: `Release ${authVersion} updates and improvements.`,
      entries: [],
    };
    db.releases.unshift(target);
  }

  let merged = 0;
  const existingIds = new Set(db.releases.flatMap((r) => r.entries.map((e) => e.id)));

  for (const file of files) {
    const full = path.join(fragmentsDir, file);
    const fragment = readJson(full);
    const items = Array.isArray(fragment) ? fragment : [fragment];
    for (const item of items) {
      if (!item.id || existingIds.has(item.id)) continue;
      target.entries.push(item);
      existingIds.add(item.id);
      merged += 1;
    }
    fs.unlinkSync(full);
  }

  if (merged > 0) {
    fs.writeFileSync(changelogDataPath, JSON.stringify(db, null, 2) + '\n');
  }
  return merged;
}

function groupByCategory(entries) {
  const groups = new Map();
  for (const cat of ALLOWED_CATEGORIES) {
    const matching = entries.filter((e) => e.category === cat);
    if (matching.length > 0) {
      groups.set(cat, matching);
    }
  }
  return groups;
}

function renderReleaseSection(rel) {
  const lines = [];
  lines.push(`## [${rel.version}] - ${rel.releaseDate} (${rel.title})`);
  lines.push('');
  lines.push(rel.summary);
  lines.push('');

  const grouped = groupByCategory(rel.entries);
  for (const [category, items] of grouped.entries()) {
    lines.push(`### ${category}`);
    for (const item of items) {
      lines.push(`- **${item.title}:** ${item.description}`);
    }
    lines.push('');
  }
  return lines.join('\n').trimEnd();
}

function renderChangelogMarkdown(db) {
  const header = [
    '# Changelog',
    '',
    'All notable changes to Kinora are maintained in `src/data/changelog.json` and rendered into this file.',
    '',
    'The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)',
    'and adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).',
    '',
  ].join('\n');

  const sections = db.releases.map((rel) => renderReleaseSection(rel));
  return `${header}\n${sections.join('\n\n---\n\n')}\n`;
}

function renderReleaseNotes(rel) {
  const userEntries = rel.entries.filter((e) => e.audience !== 'developer');
  const devEntries = rel.entries.filter((e) => e.audience === 'developer');

  const lines = [
    `# Kinora v${rel.version}: ${rel.title}`,
    '',
    `**Release Date:** ${rel.releaseDate}  `,
    `**Channel:** ${rel.channel || 'stable'}`,
    '',
    rel.summary,
    '',
  ];

  const groupedUser = groupByCategory(userEntries);
  for (const [category, items] of groupedUser.entries()) {
    lines.push(`## ${category}`);
    lines.push('');
    for (const item of items) {
      lines.push(`- **${item.title}:** ${item.description}`);
      if (item.details) {
        lines.push(`  ${item.details}`);
      }
    }
    lines.push('');
  }

  if (devEntries.length > 0) {
    lines.push('## Engineering and Infrastructure Notes');
    lines.push('');
    for (const item of devEntries) {
      lines.push(`- **${item.title}:** ${item.description}`);
    }
    lines.push('');
  }

  return lines.join('\n').trimEnd() + '\n';
}

function main() {
  const args = new Set(process.argv.slice(2));
  const checkOnly = args.has('--check');
  const shouldMerge = args.has('--merge-fragments');

  const pkg = readJson(pkgPath);
  const authVersion = pkg.version;
  const db = readJson(changelogDataPath);

  if (shouldMerge && !checkOnly) {
    const mergedCount = mergeFragments(db, authVersion);
    if (mergedCount > 0) {
      console.log(`[CHANGELOG] Merged ${mergedCount} fragment(s) into v${authVersion}.`);
    }
  }

  validateDatabase(db, authVersion);

  const generatedMd = renderChangelogMarkdown(db);
  const currentRel = db.releases.find((r) => r.version === authVersion);
  const generatedNotes = renderReleaseNotes(currentRel);
  const releaseNotesPath = path.join(releaseDocsDir, `release-notes-v${authVersion}.md`);

  if (checkOnly) {
    const existingMd = fs.existsSync(changelogMdPath) ? fs.readFileSync(changelogMdPath, 'utf8') : '';
    if (existingMd !== generatedMd) {
      fail('CHANGELOG.md is out of sync with src/data/changelog.json. Run "npm run changelog:generate".');
    }
    const existingNotes = fs.existsSync(releaseNotesPath) ? fs.readFileSync(releaseNotesPath, 'utf8') : '';
    if (existingNotes !== generatedNotes) {
      fail(`docs/release/release-notes-v${authVersion}.md is out of sync with src/data/changelog.json. Run "npm run changelog:generate".`);
    }
    console.log(`\x1b[32m[CHANGELOG OK]\x1b[0m Validated ${db.releases.length} releases; CHANGELOG.md and v${authVersion} release notes are in sync.`);
    return;
  }

  fs.writeFileSync(changelogMdPath, generatedMd);
  if (!fs.existsSync(releaseDocsDir)) fs.mkdirSync(releaseDocsDir, { recursive: true });
  fs.writeFileSync(releaseNotesPath, generatedNotes);
  console.log(`\x1b[32m[CHANGELOG GENERATED]\x1b[0m Updated CHANGELOG.md and docs/release/release-notes-v${authVersion}.md (${db.releases.length} releases).`);
}

main();
