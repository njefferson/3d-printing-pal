#!/usr/bin/env node
// Every drag is declared, and every declaration has a non-drag path.
//
// Doctrine §4: "A declared interaction with no declared alternative FAILS the
// build, and a declaration that matches nothing FAILS rather than being skipped."
// Both halves matter — the second is what stops a declaration outliving the
// interaction it describes and reading as coverage.
//
// THIS FILE CHECKS STRUCTURE ONLY, and says so rather than implying more:
//   - every interaction declares an alternative that is single-pointer and
//     reachable from a keyboard
//   - every surface an alternative names exists in index.html
//   - nothing commits on pointer-down (SC 2.5.2)
//   - nothing is timed (SC 2.2.1)
//
// THE LIVE HALF IS IN tools/a11y.mjs, because a static file cannot know whether
// `.card-grip` matches anything in a running app — the cards are built at
// runtime. The a11y gate boots the app with seeded data and asserts every
// selector here matches something, and presses the alternative to prove it works.
// A green run here is necessary and is not sufficient; that is why the two are
// wired together in `npm run check`.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const spec = JSON.parse(readFileSync(join(ROOT, 'INTERACTIONS.json'), 'utf8'));
const html = readFileSync(join(ROOT, 'public/index.html'), 'utf8');

const failures = [];
const notes = [];

if (!Array.isArray(spec.interactions) || spec.interactions.length === 0) {
  failures.push('INTERACTIONS.json declares no interactions. An app with a drag and an empty list is the failure this file exists to catch.');
}

for (const item of spec.interactions || []) {
  const where = `interaction "${item.id}"`;

  if (!item.selector) failures.push(`${where}: no selector, so nothing can check it still exists.`);

  if (item.kind === 'drag' || item.kind === 'gesture') {
    if (!item.alternative) {
      failures.push(`${where}: a ${item.kind} with no non-drag alternative. SC 2.5.7 — a drag-only interaction is a broken interaction.`);
    } else {
      if (!item.alternative.selector) failures.push(`${where}: its alternative names no control.`);
      if (item.alternative.singlePointer !== true) failures.push(`${where}: its alternative is not declared single-pointer (SC 2.5.1).`);
      if (item.alternative.keyboard !== true) failures.push(`${where}: its alternative is not declared keyboard-reachable.`);
    }

    if (item.commitsOn && item.commitsOn !== 'pointerup') {
      failures.push(`${where}: commits on "${item.commitsOn}". Nothing commits on pointer-down (SC 2.5.2) — tremor produces spurious downs.`);
    }
    if (!Array.isArray(item.cancelledBy) || item.cancelledBy.length === 0) {
      failures.push(`${where}: declares no way to cancel. A pointer that leaves the target before release has to be able to abandon the action.`);
    }
  }

  if (item.timed === true) {
    failures.push(`${where}: is timed. SC 2.2.1 — no press-and-hold on a short window, and nothing that expires while somebody is still aiming.`);
  }

  const surface = item.alternative?.surface;
  if (surface && !new RegExp(`id="${surface}"`).test(html)) {
    failures.push(`${where}: its alternative opens "${surface}", which is not in index.html. A declaration pointing at a surface that no longer exists reads exactly like coverage that works.`);
  }
}

// A positive assertion, not an absence: if a multi-point or path gesture is ever
// added, it has to be declared here with its single-pointer alternative.
for (const key of ['multiPointGestures', 'pathGestures', 'timedGestures']) {
  if (!Array.isArray(spec[key])) {
    failures.push(`INTERACTIONS.json has no "${key}" list. An empty list is a claim; a missing one is silence.`);
  } else if (spec[key].length === 0) {
    notes.push(`${key}: none declared — the app claims to have none.`);
  } else {
    for (const g of spec[key]) {
      if (!g.alternative) failures.push(`${key}: "${g.id || 'unnamed'}" has no single-pointer alternative (SC 2.5.1).`);
    }
  }
}

if (failures.length) {
  console.error('interactions: FAIL');
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}

console.log(`interactions: ${spec.interactions.length} declared, each with a non-drag path.`);
for (const n of notes) console.log(`  ${n}`);
console.log('  live selector matching is asserted by tools/a11y.mjs, which boots the app.');
