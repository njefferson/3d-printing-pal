#!/usr/bin/env node
// The lines that say which version is on staging and which is in production.
//
// This repo writes those two facts in three places by hand: NOTES.md's staged
// candidate, and TWO lines of `public/status.html` — the lede and the row block —
// which is a page that exists to be always current and is deployed to the owner.
// Every one of them is derivable. The release triplet lives in `public/sw.js`,
// and git holds that file at every ref, so the whole check is two file reads and
// a `git show`, with no network.
//
// WHY IT IS A GATE. Hub LESSONS 128: Quietkeep's equivalent block was wrong three
// times in four days — through two promotes, then eleven releases, then five more
// — and all three discoveries were luck. Nothing about a version number beside a
// URL looks stale. Every other kind of rot in these repos announces itself: a
// broken link 404s, a generated file fails its `--check`, a missing surface fails
// the walk. A prose fact just sits there being wrong, and it is read as current by
// everyone, including the session that wrote the note about the last time it was
// wrong. Writing the lesson into the artefact that has the defect is what
// produced the third one.
//
// It nearly happened here on 2026-08-23: the status page said "0.7.0 is live,
// nothing is waiting on staging" while 0.7.1 sat on staging, and it was found by
// going to look rather than by anything failing.
//
// WHERE IT RUNS, WHICH IS PART OF THE DESIGN. A COMMIT GUARD, declared in
// `.branch-guard` — never a CI step and never in `npm run check`. It compares the
// tree against `origin/main` AS OF THE MOMENT OF THE COMMIT. On a runner after a
// promote, `origin/main` is already the promoted commit, so a CI step would be red
// by construction for a window on every release, and a gate that is red for a
// window teaches everyone to ignore red. Same reasoning that keeps
// `doctrine-sync.mjs` out of CI. Before wiring a gate, ask what its assertion is
// true OF — a tree, a clone, a ref, a moment — and put it where that thing exists.
//
// `tools/gates-parity.mjs` compares the check chain against the workflow's steps,
// so a gate missing from CI looks exactly like the accident it was written to
// find. This one is out on purpose, and that is declared here and in the parity
// gate's own exemption list, rather than in a commit message nobody will open.
//
// A MISSING `origin/main` IS A FAILURE, NEVER A SKIP. A guard that quietly does
// nothing when its evidence is absent is the fail-open shape the hook's own
// history is about — `git fetch origin main` and run it again.
//
// WHAT IS DELIBERATELY NOT GATED: the SHAs. A commit cannot name its own hash,
// and gating production's would leave the block unfixable for a window after
// every promote. All the real failures have been version failures.

import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
const passed = [];

const TRIPLET = /(\d+\.\d+\.\d+)/;
const cacheVersion = (text, where) => {
  const m = /const CACHE\s*=\s*'[\w-]*?-(\d+\.\d+\.\d+)'/.exec(text);
  if (!m) {
    console.error(`branch-state: FAIL — no CACHE triplet in ${where}.`);
    process.exit(1);
  }
  return m[1];
};

// The candidate: what this tree would deploy to staging.
const staged = cacheVersion(readFileSync(join(ROOT, 'public/sw.js'), 'utf8'), 'public/sw.js');

// Production: what `main` is serving right now, read from the ref rather than
// from any file in this tree that claims to know.
let live;
try {
  live = cacheVersion(
    execFileSync('git', ['show', 'origin/main:public/sw.js'], { cwd: ROOT, encoding: 'utf8' }),
    'origin/main:public/sw.js',
  );
} catch {
  console.error(
    'branch-state: FAIL — could not read public/sw.js at origin/main.\n'
    + '  This check compares the tree against production and cannot run without it.\n'
    + '  Run `git fetch origin main` and commit again. It does not skip: a guard that\n'
    + '  does nothing when its evidence is missing is worse than no guard.',
  );
  process.exit(1);
}

// Two states, and they need different sentences. When the tree and production
// carry the same triplet there is no candidate, and a record still naming one is
// how the next session concludes something is waiting when nothing is.
const waiting = staged !== live;

// ─── public/status.html ──────────────────────────────────────────────────────
const statusPath = join(ROOT, 'public/status.html');
if (!existsSync(statusPath)) {
  failures.push('public/status.html is missing — Doctrine §7i, the live status page.');
} else {
  const status = readFileSync(statusPath, 'utf8');

  // The row block is structured, so it is checked for EQUALITY: the label names
  // the row and the first triplet in the value beside it is the claim.
  const rowValue = (label) => {
    const re = new RegExp(
      `now-label"[^>]*>${label}</span>\\s*<span class="now-value">([\\s\\S]*?)</span>`,
    );
    const m = re.exec(status);
    return m ? m[1] : null;
  };

  const prod = rowValue('In production');
  if (prod === null) {
    failures.push('status.html has no "In production" row — the gate cannot find the claim.');
  } else {
    const said = (TRIPLET.exec(prod) || [])[1];
    if (said !== live) {
      failures.push(
        `status.html says production is ${said || 'unnamed'}; origin/main is serving ${live}.`,
      );
    } else {
      passed.push(`status.html's production row names ${live}, which is what origin/main serves`);
    }
  }

  const stage = rowValue('On staging');
  if (stage === null) {
    failures.push('status.html has no "On staging" row — the gate cannot find the claim.');
  } else {
    const said = (TRIPLET.exec(stage) || [])[1];
    if (waiting && said !== staged) {
      failures.push(
        `status.html says staging is ${said || 'unnamed'}; this tree deploys ${staged}.`,
      );
    } else if (!waiting && said) {
      failures.push(
        `status.html's staging row names ${said}, but staging and production are both ${live}. `
        + 'A promoted candidate left on the page reads as one still waiting.',
      );
    } else {
      passed.push(waiting
        ? `status.html's staging row names ${staged}, which is what this tree deploys`
        : 'status.html says nothing is staged, and nothing is');
    }
  }

  // The lede is prose and is checked for CONTAINMENT, not equality — it is the
  // first thing read and the least likely to be re-read, and it carried the
  // near-miss. Historical mentions elsewhere on the page are legitimate and are
  // none of this gate's business.
  const lede = (/<p class="lede"><b>([\s\S]*?)<\/b><\/p>/.exec(status) || [])[1];
  if (!lede) {
    failures.push('status.html has no bold lede sentence naming where each version is.');
  } else {
    const missing = [live, ...(waiting ? [staged] : [])].filter((v) => !lede.includes(v));
    // With nothing staged the lede must not carry a second number at all. The
    // rows can be corrected on a promote while this sentence goes on naming the
    // candidate it just became — which is the same stale-line failure one line up
    // the page, and the one a reader meets first.
    const strays = waiting
      ? []
      : [...lede.matchAll(/\d+\.\d+\.\d+/g)].map((m) => m[0]).filter((v) => v !== live);
    if (missing.length) {
      failures.push(
        `status.html's lede does not name ${missing.join(' or ')}. It is the first line read `
        + 'and the one that goes stale unnoticed.',
      );
    } else if (strays.length) {
      failures.push(
        `status.html's lede still names ${[...new Set(strays)].join(', ')} with nothing staged — `
        + `production and staging are both ${live}.`,
      );
    } else {
      passed.push(`status.html's lede names ${waiting ? `${live} and ${staged}` : live}`);
    }
  }
}

// ─── NOTES.md ────────────────────────────────────────────────────────────────
const notes = readFileSync(join(ROOT, 'NOTES.md'), 'utf8');
const section = (/### The staged candidate\n([\s\S]*?)(?=\n### |\n## )/.exec(notes) || [])[1];
// THE OPENING PARAGRAPH, not the section. Everything below it is the record of
// releases already promoted, which names old triplets forever and legitimately —
// so a whole-section search finds a version somewhere no matter what is true.
// The first paragraph is the standing claim, and it is the only one a session
// scanning for "what is waiting" reads. The first version of this searched the
// section and passed a stale record because a sentence further down happened to
// quote the phrase it was looking for.
const opening = section ? section.trim().split(/\n\s*\n/)[0] : '';
if (!section) {
  failures.push('NOTES.md has no "### The staged candidate" section to record a candidate in.');
} else if (waiting && !opening.includes(staged)) {
  failures.push(
    `NOTES.md's staged-candidate section does not open by naming ${staged}, which is what this `
    + 'tree deploys. A candidate nobody can name cannot be passed or rejected.',
  );
} else if (!waiting && !/there is no staged candidate/i.test(opening)) {
  failures.push(
    'staging and production are the same version, but NOTES.md\'s staged-candidate section '
    + 'does not open by saying there is no candidate. Leaving a promoted one recorded is how '
    + 'the next session concludes something is waiting when nothing is.',
  );
} else {
  passed.push(waiting
    ? `NOTES.md records ${staged} as the staged candidate`
    : 'NOTES.md says there is no staged candidate, and there is not');
}

// ─── report ──────────────────────────────────────────────────────────────────
console.log(`=== branch state · staging ${staged} · production ${live} ===\n`);
for (const p of passed) console.log(`  ✓ ${p}`);
if (failures.length) {
  console.error(`\nFAILURES (${failures.length}):`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  console.error(
    '\nBoth numbers are derivable — public/sw.js in this tree and at origin/main.\n'
    + 'A hand-maintained fact that a file already knows is not documentation,\n'
    + 'it is a second copy waiting to disagree. Hub LESSONS 128.',
  );
  process.exit(1);
}
console.log('\nPASS — every line saying where a version is agrees with the versions.');
