#!/usr/bin/env node
// The gate list exists in two places. This is the thing that holds them together.
//
// `npm run check` is an && chain in package.json, and .github/workflows/gates.yml
// runs the same gates as SEPARATE NAMED STEPS — deliberately, because a single
// step that runs everything reports one red X and makes a run unreadable, and
// reading a run by step rather than by conclusion is the discipline this repo was
// burned into having.
//
// The cost of that is two lists, and nothing was comparing them. `shell` and
// `fromurl` were added to the chain and never to the workflow: both were written,
// both were planted red, both passed locally, and NEITHER HAD EVER RUN ON A
// RUNNER. A gate that only runs on the machine of whoever wrote it is not a gate,
// and its greenness is the most misleading kind — it looks like coverage.
//
// This check must be in BOTH lists, and is, so removing it from either is caught
// from the other side.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WORKFLOW = '.github/workflows/gates.yml';

// Gates that run in the chain and are NOT expected in CI, each with the reason.
// A list rather than a pattern, so adding one is a decision somebody wrote down.
const LOCAL_ONLY = {
  sync: 'blocks the session, not the push — a sibling going red because the hub moved trains everyone to ignore red (hub CLAUDE.md)',
  // A DEBT WITH A DATE ON IT, not a permanent exemption, and it is here rather
  // than silent because that is the difference. The palette clears the hub's
  // colour floors at the pin CI used until 2026-08-29 and fails four of them at
  // the current one — text on accent-tinted surfaces, 3.84 to 4.58 — because the
  // floors tightened and this repo has not reconciled the PALETTES drift.
  // Clearing them changes colours a reader sees, which is the owner's call.
  // gates.yml names the four figures. Delete this line when the palette passes.
  palette: 'the hub floors tightened and four are not cleared yet; clearing them is a colour decision, not a wiring one — see gates.yml',
};

// Gates that run in CI as an npm script and are NOT in the chain, same rule.
// `guard` looks like it belongs here and does not, because CI invokes it as
// `node .hub/branch-guard.mjs --artefact` rather than through npm, and the chain
// does not run it at all.
const CI_ONLY = {
  audit: 'needs the network and npm\'s advisory database, and every other gate in the chain runs OFFLINE — `npm run check` on a train must not fail because a registry is unreachable. It also goes red without any commit, which is the point of it and is wrong for a pre-push chain.',
};

const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const workflow = readFileSync(join(ROOT, WORKFLOW), 'utf8');

// What the chain runs, in order.
const chain = [...pkg.scripts.check.matchAll(/npm run --silent ([\w:.-]+)/g)].map((m) => m[1]);
if (!chain.length) {
  console.error(`  FAIL could not read any gate out of the check chain — this check has gone blind, which is worse than absent`);
  process.exit(1);
}

// What CI runs. Two spellings: `npm run --silent X`, and a hub gate invoked
// directly as `node .hub/thing.mjs`, which the chain spells `../noahjefferson/`.
const ciScripts = new Set([...workflow.matchAll(/npm run --silent ([\w:.-]+)/g)].map((m) => m[1]));
const ciDirect = new Set([...workflow.matchAll(/node \.hub\/([\w./-]+\.mjs)/g)].map((m) => m[1]));

// AND THE ONES CI NO LONGER SPELLS OUT. The hub's gates used to be a dozen
// `node .hub/x.mjs` steps in this file; they are now one `uses:` of the hub's
// reusable workflow, so scanning for the old spelling would report every hub
// gate as "in the chain and not in CI" — a parity check going blind in exactly
// the way its own header says is worse than being absent.
//
// The unconditional gates come with the call. The rest are conditional on an
// input, so each is credited only when this repo actually passes the flag —
// which keeps this file honest about `pwa: false` somewhere meaning pwa-check
// is genuinely not running.
const hubCall = /uses:\s*njefferson\/noahjefferson\/\.github\/workflows\/hub-gates\.yml@[0-9a-f]{40}([\s\S]*?)(?=\n  \w|\n\S|$)/.exec(workflow);
if (hubCall) {
  for (const f of ['privacy-check.mjs', 'quote-check.mjs', 'docs-check.mjs',
                   'pin-check.mjs', 'branch-guard.mjs']) ciDirect.add(f);
  const w = hubCall[1];
  if (/\bthird-person:\s*false\b/.test(w) === false) ciDirect.add('third-person-check.mjs');
  if (/\bpwa:\s*true\b/.test(w)) ciDirect.add('pwa-check.mjs');
  if (/\bmirror:\s*true\b/.test(w)) ciDirect.add('privacy-mirror-check.mjs');
  if (/\bpalette-path:\s*\S/.test(w)) ciDirect.add('palette-check.mjs');
  if (/\btextsize-paths:\s*\S/.test(w)) ciDirect.add('scripts/check-textsize.mjs');
}

/** The hub file a chain entry invokes, if it invokes one. */
function hubFile(name) {
  const body = pkg.scripts[name] || '';
  const m = body.match(/\.\.\/noahjefferson\/([\w./-]+\.mjs)/);
  return m ? m[1] : null;
}

const failures = [];
const passes = [];

for (const name of chain) {
  if (LOCAL_ONLY[name]) continue;
  if (ciScripts.has(name)) { passes.push(`${name} runs in CI as an npm script`); continue; }
  const file = hubFile(name);
  if (file && ciDirect.has(file)) { passes.push(`${name} runs in CI as node .hub/${file}`); continue; }
  failures.push(`\`npm run ${name}\` is in the check chain but nothing in ${WORKFLOW} runs it — it has never run on a runner`);
}

for (const name of ciScripts) {
  if (CI_ONLY[name]) continue;
  if (!chain.includes(name)) {
    failures.push(`${WORKFLOW} runs \`npm run ${name}\` but the check chain does not — it cannot be run before a push`);
  }
}

// The declared exemptions have to still be real, or the list becomes a place
// where a gate goes to be forgotten.
for (const [name, why] of Object.entries(LOCAL_ONLY)) {
  if (!pkg.scripts[name]) failures.push(`LOCAL_ONLY names \`${name}\`, which is not a script any more — drop it and its reason: ${why}`);
}
for (const [name, why] of Object.entries(CI_ONLY)) {
  if (!workflow.includes(`npm run --silent ${name}`)) {
    failures.push(`CI_ONLY names \`${name}\`, which ${WORKFLOW} does not run any more — drop it and its reason: ${why}`);
  }
}

// And this check itself must be on both sides, or it is the next thing to drift.
const SELF = 'parity';
if (!chain.includes(SELF)) failures.push(`the check chain does not run \`npm run ${SELF}\` — this check cannot catch what it is not part of`);
if (!ciScripts.has(SELF)) failures.push(`${WORKFLOW} does not run \`npm run ${SELF}\` — this check cannot catch what it is not part of`);

if (process.argv.includes('--verbose')) for (const p of passes) console.log(`  ok   ${p}`);
for (const f of failures) console.error(`  FAIL ${f}`);

if (failures.length) {
  console.error(`\ngate parity: ${failures.length} gate(s) do not run in both places.`);
  process.exit(1);
}
const exempt = Object.keys(LOCAL_ONLY).length + Object.keys(CI_ONLY).length;
console.log(`gate parity: pass — ${passes.length} gate(s) run both locally and in CI, ${exempt} declared exemption(s).`);
