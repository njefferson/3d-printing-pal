#!/usr/bin/env node
// ONE SOURCE for what changed.
//
// CHANGELOG.md is written; public/app/releases.js is generated from it and is
// what the app renders. `--check` regenerates in memory and fails on any
// difference, so the notes a reader sees cannot drift from the notes in the repo.
//
// It also holds the TRIPLET together: the newest entry's version, the constant in
// public/app/version.js, and the service worker's cache name all have to agree.
// Bumping one and forgetting another is how an app reports a version it is not.
//
// WHAT THIS DELIBERATELY DOES NOT DO: assert on the wording. A test pinned to a
// sentence of product copy goes red the moment that sentence is correctly
// improved — three such tests once failed a release whose entire point was
// shortening a message, and the app sat undeployed for a day over it. Structure
// is checked here; voice is checked by notes-voice.mjs against patterns, not
// against sentences.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = join(ROOT, 'CHANGELOG.md');
const TARGET = join(ROOT, 'public/app/releases.js');
const VERSION_FILE = join(ROOT, 'public/app/version.js');
const SW_FILE = join(ROOT, 'public/sw.js');

const KINDS = new Set(['VERSION', 'CAPABILITY', 'ITERATION']);
const SECTIONS = { New: 'added', Fixed: 'fixed', 'Still not right': 'broken' };

export function parseChangelog(text) {
  const releases = [];
  let current = null;
  let bucket = null;
  const lines = text.split('\n');

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];

    const head = line.match(/^##\s+(\d+\.\d+\.\d+)\s+—\s+([A-Z]+)\s+—\s+(\d{4}-\d{2}-\d{2})\s*$/);
    if (head) {
      current = { version: head[1], kind: head[2], date: head[3], summary: '', added: [], fixed: [], broken: [] };
      if (!KINDS.has(current.kind)) {
        throw new Error(`${current.version}: "${current.kind}" is not a release kind. Use VERSION, CAPABILITY or ITERATION.`);
      }
      releases.push(current);
      bucket = null;
      continue;
    }

    if (!current) continue;

    const section = line.match(/^###\s+(.+?)\s*$/);
    if (section) {
      const key = SECTIONS[section[1]];
      if (!key) throw new Error(`${current.version}: "${section[1]}" is not a section. Use New, Fixed or Still not right.`);
      bucket = key;
      continue;
    }

    if (/^-\s+/.test(line)) {
      // Bullets wrap in the source; the app wants one string per bullet.
      let item = line.replace(/^-\s+/, '').trim();
      while (i + 1 < lines.length && /^\s{2,}\S/.test(lines[i + 1])) {
        item += ' ' + lines[i + 1].trim();
        i += 1;
      }
      if (!bucket) throw new Error(`${current.version}: a bullet appears before any section heading.`);
      current[bucket].push(strip(item));
      continue;
    }

    if (line.trim() && !bucket && !line.startsWith('#') && !line.startsWith('---')) {
      current.summary = current.summary ? `${current.summary} ${strip(line.trim())}` : strip(line.trim());
    }
  }

  if (!releases.length) throw new Error('CHANGELOG.md has no release headings.');
  return releases;
}

/** Markdown emphasis is noise once it is text content in the app. */
function strip(s) {
  return s.replace(/\*\*(.+?)\*\*/g, '$1').replace(/(^|\s)\*(\S.*?\S)\*/g, '$1$2').replace(/`([^`]+)`/g, '$1');
}

export function render(releases) {
  return `// GENERATED — do not edit.
//
// Written by tools/changelog.mjs from CHANGELOG.md, which is the one source.
// \`npm run notes:check\` fails if this file and CHANGELOG.md disagree, or if the
// newest version here does not match public/app/version.js and the service
// worker's cache name.

export const RELEASES = ${JSON.stringify(releases, null, 2)};
`;
}

function readVersionConstant() {
  const m = readFileSync(VERSION_FILE, 'utf8').match(/VERSION\s*=\s*['"](\d+\.\d+\.\d+)['"]/);
  if (!m) throw new Error('public/app/version.js does not declare a VERSION triplet.');
  return m[1];
}

function readCacheVersion() {
  const m = readFileSync(SW_FILE, 'utf8').match(/CACHE\s*=\s*['"][\w-]*?-(\d+\.\d+\.\d+)['"]/);
  if (!m) throw new Error('public/sw.js does not declare a cache name carrying a version triplet.');
  return m[1];
}

function main() {
  const check = process.argv.includes('--check');
  const releases = parseChangelog(readFileSync(SOURCE, 'utf8'));
  const generated = render(releases);

  const newest = releases[0].version;
  const declared = readVersionConstant();
  const cached = readCacheVersion();

  const problems = [];
  if (newest !== declared) problems.push(`CHANGELOG.md's newest entry is ${newest} but public/app/version.js says ${declared}.`);
  if (newest !== cached) problems.push(`CHANGELOG.md's newest entry is ${newest} but the service worker cache is ${cached}.`);

  if (check) {
    let onDisk = null;
    try { onDisk = readFileSync(TARGET, 'utf8'); } catch { onDisk = null; }
    if (onDisk === null) problems.push('public/app/releases.js does not exist. Run: npm run notes');
    else if (onDisk !== generated) problems.push('public/app/releases.js has drifted from CHANGELOG.md. Run: npm run notes');

    if (problems.length) {
      console.error('patch notes: FAIL');
      for (const p of problems) console.error(`  ${p}`);
      process.exit(1);
    }
    console.log(`patch notes: ${releases.length} release(s), in step with version ${declared}.`);
    return;
  }

  if (problems.length) {
    console.error('patch notes: refusing to generate while the triplet disagrees.');
    for (const p of problems) console.error(`  ${p}`);
    process.exit(1);
  }

  writeFileSync(TARGET, generated);
  console.log(`patch notes: wrote ${releases.length} release(s) to public/app/releases.js at version ${declared}.`);
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) main();
