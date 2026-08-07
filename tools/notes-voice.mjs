#!/usr/bin/env node
// Patch notes are product copy, not correspondence (§7d.1).
//
// The difference is invisible from inside the session writing them, which is why
// this is a gate rather than a paragraph at the top of the file. A rule you can
// only comply with by remembering it is not a rule.
//
// Three banned shapes:
//
//   "I" APPEARING AT ALL. There is no author character in a patch note. The app
//   changed; say what it does now.
//
//   "YOU" MEANING SOMEBODY OTHER THAN THE READER. A stranger opens the notes and
//   is addressed as a person they are not, about events they were not present
//   for. Ordinary second person is correct and must stay — "your jobs are safe",
//   "you decide when to install it" — so the ban is on the reporting verbs, not
//   on the word.
//
//   THE READER BEING GIVEN HOMEWORK. Telling somebody how to report a problem is
//   the information surface's job. Making a release conditional on them doing
//   something is a working arrangement between two other people, on their screen.
//
// And one more, from the same section: RAW PROTOCOL. Status codes, header names
// and pixel measurements belong in the diagnostic, which is one press away.
//
// THE CHECK ASSERTS BOTH DIRECTIONS. Every pattern is proved to catch a sentence
// of the shape it exists for, AND proved not to catch correct copy — because a
// ban that widens into ordinary second person makes the notes worse than it found
// them, and nobody would notice until the writing got stilted.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseChangelog } from './changelog.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const RULES = [
  {
    id: 'first-person',
    why: 'There is no author character in a patch note. Say what the app does now.',
    // Case matters for the pronoun "I" and must NOT for "my" / "me" / "mine", so
    // the case classes are written out rather than reached for with an /i flag —
    // an /i here would match the letter i inside every other word.
    re: /(^|[^\w'’])I(['’]\w+)?([^\w]|$)|(^|\W)([Mm]y|[Mm]ine|[Mm]e)(\W|$)/,
  },
  {
    id: 'you-as-reporter',
    why: '"You" here means whoever reported the fault, not the person reading. Ordinary second person is fine; this is not.',
    re: /\byou\s+(asked|said|reported|found|noticed|mentioned|sent|showed|told|pointed out|were right|flagged|complained)\b/i,
  },
  {
    id: 'homework',
    why: 'The reader is not being asked to do anything. How to report a problem lives on the information surface.',
    re: /\b(send|email|message|report)\s+(me|us|it to me|that to me|this to me)\b|\blet\s+(me|us)\s+know\b|\bplease\s+(send|tell|report|try)\b/i,
  },
  {
    id: 'raw-protocol',
    why: 'Status codes, header names and pixel measurements belong in the diagnostic report, not in the notes.',
    re: /\bHTTP\s?\d{3}\b|\b(4\d{2}|5\d{2})\s+(error|response|status)\b|\b(Content-Type|User-Agent|Authorization|Cache-Control)\b|\b\d+\s?px\b/i,
  },
  {
    id: 'release-name',
    why: 'Releases do not have names. A release is its triplet and what it did for the reader.',
    re: /\b\d+\.\d+\.\d+\s+["“”'']/,
  },
];

// Sentences each rule MUST catch. Written in the shape of the real failures
// rather than lifted from them: the shape is the thing being tested.
const MUST_CATCH = [
  ['first-person', 'I only wrote the test after the fault turned up, which is backwards.'],
  ['first-person', 'My mistake was assuming the board always had a column.'],
  ['you-as-reporter', 'You asked why the filament number went up after a delete.'],
  ['you-as-reporter', 'You reported that the board would not scroll on the iPad.'],
  ['homework', 'Send me the diagnostic and I will look at it.'],
  ['homework', 'Let me know if this one is any better.'],
  ['raw-protocol', 'The export now retries after a 503 response.'],
  ['raw-protocol', 'The header row was 51px taller than it should have been.'],
  ['release-name', '1.2.0 "Filament" is out.'],
];

// Correct copy that must NOT be caught. If the ban widens, these go red first.
const MUST_PASS = [
  'Your jobs, spools and models stay exactly as they are.',
  'You decide when to install an update.',
  'The board no longer empties when you change the filter.',
  'Filament you log against a job now comes off the spool straight away.',
  'You can export everything to one file and put it back later.',
  'Deleting a spool tells you how many jobs it will unlink first.',
  'Import replaces what is there, and asks you first.',
  'If the version at the bottom is not the one you expect, close the app and open it again.',
];

function ruleById(id) {
  const rule = RULES.find((r) => r.id === id);
  if (!rule) throw new Error(`no rule called ${id}`);
  return rule;
}

function selfTest() {
  const failures = [];

  for (const [id, sentence] of MUST_CATCH) {
    if (!ruleById(id).re.test(sentence)) {
      failures.push(`rule "${id}" no longer catches the shape it exists for: ${sentence}`);
    }
  }

  for (const sentence of MUST_PASS) {
    for (const rule of RULES) {
      if (rule.re.test(sentence)) {
        failures.push(`rule "${rule.id}" has widened onto correct copy: ${sentence}`);
      }
    }
  }

  return failures;
}

function main() {
  const selfFailures = selfTest();
  if (selfFailures.length) {
    console.error('notes voice: the CHECK is broken, before any notes were read.');
    for (const f of selfFailures) console.error(`  ${f}`);
    process.exit(1);
  }

  const releases = parseChangelog(readFileSync(join(ROOT, 'CHANGELOG.md'), 'utf8'));
  const hits = [];

  for (const release of releases) {
    const lines = [release.summary, ...release.added, ...release.fixed, ...release.broken].filter(Boolean);
    for (const line of lines) {
      for (const rule of RULES) {
        if (rule.re.test(line)) hits.push({ version: release.version, rule, line });
      }
    }
  }

  if (hits.length) {
    console.error(`notes voice: FAIL — ${hits.length} line(s) read as correspondence rather than product copy.`);
    for (const hit of hits) {
      console.error(`  ${hit.version} · ${hit.rule.id}`);
      console.error(`    ${hit.line}`);
      console.error(`    ${hit.rule.why}`);
    }
    process.exit(1);
  }

  const counted = releases.reduce((n, r) => n + r.added.length + r.fixed.length + r.broken.length, 0);
  console.log(`notes voice: ${counted} line(s) across ${releases.length} release(s) read as product copy.`);
  console.log(`  ${MUST_CATCH.length} shape(s) still caught, ${MUST_PASS.length} correct sentence(s) still allowed.`);
}

main();
