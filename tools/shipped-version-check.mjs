#!/usr/bin/env node
// If what the app SERVES has changed, the version has to have changed too.
//
// WHY THIS EXISTS, and it is not hypothetical. Between 1.2.0 reaching production
// and this being written, four stylesheets on `staging` had their dimmed-text
// colours corrected — a real contrast fix, measured against the palette floors,
// green on every gate. The version constant was not touched, so `public/sw.js`
// stayed byte-identical and kept the cache name `print-tracker-1.2.0`.
//
// PROMOTED AS IT STOOD, THAT FIX WOULD HAVE REACHED NOBODY. An installed app
// serves its precached shell and only goes looking for a new one when the worker
// itself differs; an unchanged worker is the definition of "no update". The
// change would have been live at the address, correct in the repo, and invisible
// on every device that already had the app — which is the population it was for.
//
// Nothing caught it. `pwa-check.mjs` asserts the cache name CARRIES a release,
// which it did. `changelog.mjs --check` holds the version constant, CHANGELOG and
// the in-app notes to each other — all three agreed, on the old number. Every one
// of those checks is about internal consistency, and a release that forgets to
// happen is perfectly self-consistent.
//
// THE ASSERTION: if any precached file differs from `origin/main`, the version
// must differ from `origin/main` too.
//
// A COMMIT GUARD, not a CI step, for the same reason as branch-state-check: it
// compares this tree against `origin/main` AS OF THE MOMENT OF THE COMMIT. After
// a promote the two are the same commit, so there is no diff and this passes
// trivially — which is correct, and which a CI step could not express without
// being red by construction for a window on every release.
//
// A MISSING `origin/main` FAILS RATHER THAN SKIPS. A guard that quietly does
// nothing when its evidence is absent is the fail-open shape this repo has been
// bitten by more than once.

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' });

const triplet = (text, where) => {
  const m = /const CACHE\s*=\s*'[\w-]*?-(\d+\.\d+\.\d+)'/.exec(text);
  if (!m) {
    console.error(`shipped-version: FAIL — no CACHE triplet in ${where}.`);
    process.exit(1);
  }
  return m[1];
};

// WHAT THE WORKER ACTUALLY PRECACHES, read out of sw.js rather than listed here.
// A second hand-written list of shipped files is a second thing to forget, and
// forgetting is the entire subject of this file.
function shellPaths(swText) {
  const block = /const SHELL = \[([\s\S]*?)\]/.exec(swText);
  if (!block) {
    console.error('shipped-version: FAIL — could not read the SHELL list out of public/sw.js.');
    process.exit(1);
  }
  return [...block[1].matchAll(/'([^']+)'/g)]
    .map((m) => m[1])
    .filter((p) => p.startsWith('./') || p.startsWith('/'))
    .map((p) => 'public/' + p.replace(/^\.?\//, ''))
    // './' is the app itself; the file behind it is index.html.
    .map((p) => (p === 'public/' ? 'public/index.html' : p));
}

const swHere = readFileSync(join(ROOT, 'public/sw.js'), 'utf8');
const staged = triplet(swHere, 'public/sw.js');

let live;
let mainSw;
try {
  mainSw = git('show', 'origin/main:public/sw.js');
  live = triplet(mainSw, 'origin/main:public/sw.js');
} catch {
  console.error(
    'shipped-version: FAIL — could not read public/sw.js at origin/main.\n'
    + '  This check compares what this tree serves against what production serves\n'
    + '  and cannot run without it. `git fetch origin main` and run it again.',
  );
  process.exit(1);
}

// Every precached path that differs from production, plus sw.js itself.
const watched = [...new Set([...shellPaths(swHere), 'public/sw.js'])];
let changed = [];
try {
  const out = git('diff', '--name-only', 'origin/main', 'HEAD', '--', ...watched);
  changed = out.split('\n').map((s) => s.trim()).filter(Boolean);
} catch {
  console.error('shipped-version: FAIL — could not diff this tree against origin/main.');
  process.exit(1);
}

// sw.js changing on its own is the version bump itself, not a shipped change.
const shipped = changed.filter((p) => p !== 'public/sw.js');

console.log(`=== shipped version · tree ${staged} · production ${live} ===\n`);

if (!shipped.length) {
  console.log('  ✓ nothing the app serves differs from production');
  console.log('\nPASS — no shipped file has changed, so no version bump is owed.');
  process.exit(0);
}

if (staged === live) {
  console.error(`  ✗ ${shipped.length} file(s) the app SERVES differ from production, and the version does not:`);
  for (const p of shipped) console.error(`      ${p}`);
  console.error(
    `\nshipped-version: FAIL — this tree would deploy ${staged}, which is what production\n`
    + '  already runs. The service worker would be byte-identical, so a browser that\n'
    + '  has the app installed never fetches any of it. The change would be live at\n'
    + '  the address and invisible on every device that already had it.\n\n'
    + '  Bump public/app/version.js and the CACHE name in public/sw.js together, and\n'
    + '  add the CHANGELOG entry — `npm run notes` regenerates the in-app copy.',
  );
  process.exit(1);
}

console.log(`  ✓ ${shipped.length} shipped file(s) differ, and the version moved ${live} → ${staged}`);
for (const p of shipped) console.log(`      ${p}`);
console.log('\nPASS — what the app serves changed, and it carries a version that says so.');
