#!/usr/bin/env node
// Every module the app ships is in the service worker's precache list.
//
// WHY THIS IS A GATE AND NOT A HABIT. Adding a module is the ordinary way to
// build a feature, and adding it to `SHELL` in sw.js is a second, unrelated step
// nothing reminds you about. Miss it and everything works: the module loads from
// the network on every visit and no test notices, because tests run online.
//
// The failure is reserved entirely for the reader, offline, on the one property
// this app exists to have — the app opens, the shell is cached, and one import
// 404s into a blank screen. That is the worst shape a defect can have: invisible
// to the person who caused it and total for the person who meets it.
//
// It also fails the other way, on a SHELL entry with no file behind it, because
// `cache.addAll` rejects the whole batch if any one request fails — so a stale
// path does not degrade the cache, it empties it.

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public');

const sw = readFileSync(join(PUBLIC, 'sw.js'), 'utf8');

// The SHELL array, read as source rather than imported: sw.js is a service
// worker and importing it here would run worker code in node.
const block = sw.match(/const SHELL\s*=\s*\[([\s\S]*?)\];/);
if (!block) {
  console.error('shell: FAIL — could not find the SHELL array in public/sw.js.');
  process.exit(1);
}
const listed = new Set(
  Array.from(block[1].matchAll(/'([^']+)'/g)).map((m) => m[1].replace(/^\.\//, '')),
);

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

const shipped = walk(join(PUBLIC, 'app'))
  .filter((f) => f.endsWith('.js'))
  .map((f) => relative(PUBLIC, f).split('\\').join('/'));

const missing = shipped.filter((f) => !listed.has(f));

// Every listed path exists. './' is the navigation request and has no file.
const dangling = [...listed].filter((entry) => entry !== '' && !existsSync(join(PUBLIC, entry)));

const problems = [];
for (const file of missing) {
  problems.push(`${file} is shipped but not in SHELL — it would 404 offline, with no error anywhere online`);
}
for (const entry of dangling) {
  problems.push(`SHELL lists ./${entry}, which does not exist — cache.addAll rejects the whole batch, so nothing is cached at all`);
}

if (problems.length) {
  console.error(`\nshell: FAIL — ${problems.length} problem(s)\n`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}

console.log(`shell: ${shipped.length} module(s) shipped, every one precached, and all ${listed.size} SHELL entries exist.`);
