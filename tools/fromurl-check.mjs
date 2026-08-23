#!/usr/bin/env node
// What a link says about itself, checked against real link shapes.
//
// `fromurl.js` is a pure function over a string and it was the ONLY part of this
// app with no check of its own — it was exercised through a browser walk that
// pasted one URL into one form and asserted the form worked. That proved the
// wiring and nothing about the parsing, so the parser shipped returning the title
// **"Files"** for the most ordinary link there is: a Printables model page copied
// from its Files tab, which is the tab you send to somebody who is going to print
// the thing.
//
// The cases below are URL SHAPES rather than a list of sites. Each one is a
// structural pattern the parser has to survive — an id-prefixed slug, a route
// word after the slug, a year inside the name, a path with no title in it at all
// — so adding a site never requires adding a case here, which is the same rule
// the module itself follows about its KNOWN list.
//
// Every case says WHY it is here. A table of inputs and outputs with no reasons
// is a snapshot: when one changes, the next person cannot tell whether they broke
// the parser or improved it, and the safe-looking move is to update the expected
// value.

import { siteFrom, titleFrom } from '../public/app/fromurl.js';

const CASES = [
  {
    url: 'https://makerworld.bblmw.com/makerworld/model/USb4cd954e75f587/design/3ad2d89093fc967b.jpg?x-oss-process=image/resize,w_1000/format,webp',
    site: 'Bblmw',
    title: '',
    why: "A PICTURE'S ADDRESS, which is all route and hash and no name. It offered \"3ad2d89093fc967b\" as a model's name, then \"Design\", then \"Makerworld\" as each was rejected in turn — three separate wrong answers from one link, each of which looked like an answer. An empty box is the truth about this address.",
  },
  {
    url: 'https://example.com/models/1234abcd5678efab',
    site: 'Example',
    title: '',
    why: 'A hash on its own. Nothing to offer, so nothing is offered.',
  },
  {
    url: 'https://example.com/design/',
    site: 'Example',
    title: '',
    why: 'A route word with nothing to lose to. Scoring alone let these win by default whenever a path carried no slug at all, which is how "Files" and "Design" got proposed as names.',
  },
  {
    url: 'https://example.com/models/dragon',
    site: 'Example',
    title: 'Dragon',
    why: 'THE ONE THE REJECTIONS MUST NOT EAT. A single-word slug is a real name, and it is the case a rule aimed at single-word route words is most likely to take with it.',
  },
  {
    url: 'https://example.com/models/mk4-mount',
    site: 'Example',
    title: 'Mk4 Mount',
    why: 'Digits inside a name. A rule reading "contains a digit, so it is an id" would delete every printer model number people actually use.',
  },
  {
    url: 'https://example.com/models/benchy3',
    site: 'Example',
    title: 'Benchy3',
    why: 'The same hazard in one token, and short, so the length floor in the opaque test is what saves it.',
  },
  {
    url: 'https://www.printables.com/model/905441-bolt-euv-2022-privacy-screen-post-replacement/files',
    site: 'Printables',
    title: 'Bolt Euv 2022 Privacy Screen Post Replacement',
    why: 'THE ONE THAT WAS BROKEN. A route word after the slug must not beat the slug; walking from the end returned "Files".',
  },
  {
    url: 'https://www.printables.com/model/905441-bolt-euv-2022-privacy-screen-post-replacement',
    site: 'Printables',
    title: 'Bolt Euv 2022 Privacy Screen Post Replacement',
    why: 'The same link without the tab. Both spellings are handed out and both have to give the same answer.',
  },
  {
    url: 'https://makerworld.com/en/models/123456-articulated-dragon',
    site: 'MakerWorld',
    title: 'Articulated Dragon',
    why: 'A locale segment and a plural route before the slug — neither is the title.',
  },
  {
    url: 'https://www.thingiverse.com/thing:2478331',
    site: 'Thingiverse',
    title: '',
    why: 'A path carrying no words at all. Empty is the honest answer; "Thing:2478331" looks like one and is not.',
  },
  {
    url: 'https://site.example/models/dragon',
    site: 'Site',
    title: 'Dragon',
    why: 'No id anywhere, so a single-word last segment IS the name. The fix for the route word must not eat this.',
  },
  {
    url: 'https://cults3d.com/en/3d-model/game/space-marine',
    site: 'Cults3D',
    title: 'Space Marine',
    why: 'Several multi-word segments and no id: the last one is the name, not the first.',
  },
  {
    url: 'https://grabcad.com/library/some-bracket-1',
    site: 'Grabcad',
    title: 'Some Bracket 1',
    why: 'An unknown site still yields a name and a tidied host, so nothing depends on the KNOWN list.',
  },
  {
    url: 'javascript:alert(1)',
    site: '',
    title: '',
    why: 'Not http(s). A field that accepts this is a hazard rather than a convenience.',
  },
  {
    url: 'not a url at all',
    site: '',
    title: '',
    why: 'Anything unparseable says nothing rather than throwing into a keystroke handler.',
  },
];

const failures = [];

for (const testCase of CASES) {
  const site = siteFrom(testCase.url);
  const title = titleFrom(testCase.url);
  if (site !== testCase.site) {
    failures.push(`site  "${site}" but expected "${testCase.site}"\n    ${testCase.url}\n    ${testCase.why}`);
  }
  if (title !== testCase.title) {
    failures.push(`title "${title}" but expected "${testCase.title}"\n    ${testCase.url}\n    ${testCase.why}`);
  }
}

// A guess is only allowed to be wrong in an editable field, never wrong in a way
// that costs something. These two hold for every case whatever the answer is.
for (const testCase of CASES) {
  const title = titleFrom(testCase.url);
  if (/^\d+$/.test(title)) failures.push(`title "${title}" for ${testCase.url} is an id, which is never a name`);
  if (title.includes(':')) failures.push(`title "${title}" for ${testCase.url} carries a route marker`);
}

if (failures.length) {
  console.error(`\nfromurl: FAIL — ${failures.length} problem(s)\n`);
  for (const failure of failures) console.error(`  ${failure}\n`);
  process.exit(1);
}

console.log(`fromurl: ${CASES.length} link shapes read correctly, each with the reason it is here.`);
