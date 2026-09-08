#!/usr/bin/env node
// Renders the icon set from icon.svg, and holds the served copy to it.
//
// `icon.svg` AT THE ROOT IS THE ONE SOURCE. This script writes `public/icon.svg`
// from it alongside the five PNGs, so the served copy is generated rather than
// hand-maintained. They were byte-identical for two releases with nothing holding
// them together, which is the same shape as any other pair that must never
// disagree: it disagrees the first time one is edited alone.
//
// TWO MODES, ONE FILE — the same arrangement as tools/changelog.mjs, so the thing
// that knows the truth is the thing that asserts it:
//
//   (no flag)  render. A DEVELOPER-TIME step: it launches the sandbox Chromium at
//              a hardcoded path that does not exist on a GitHub runner, so the
//              PNGs are committed rather than built. Run it after editing
//              icon.svg and commit what it writes.
//
//   --check    compare only. NO BROWSER, so unlike the render this one runs in
//              CI, on every push.
//
// WHAT --check DOES NOT PROVE, said plainly rather than left to be assumed: it
// does not verify the five PNGs were re-rendered. That needs a browser the runner
// does not have. But one command writes the SVG copy AND the PNGs, so a stale
// `public/icon.svg` is the signature of a render that was never run — which is
// the realistic failure, and the one this catches.
//
// playwright-core and the browser revision are a MATCHED PAIR — see the //browser
// note in package.json. A playwright-core expecting a different revision connects
// and then hangs on a protocol mismatch, with no error.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BROWSER = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';
const CHECK = process.argv.includes('--check');

const SOURCE = join(ROOT, 'icon.svg');
const SERVED = join(ROOT, 'public/icon.svg');

// THE MASKABLE ONE IS THE SAME DRAWING, NOT A SECOND SOURCE. A platform crops a
// maskable icon to whatever shape it likes, up to a circle 80% of the width, so
// the background has to reach the edges and the drawing has to sit inside that
// circle. `#art` in icon.svg holds everything except the background rect, and
// `shrink` scales that group alone: the gradient still fills all 512px and the
// nozzle and layers come in far enough to survive the crop. Rendering it from
// the same file is the point — a hand-drawn second icon is a second thing to
// keep in step, and the pair goes out of step the first time either is edited.
//
// 0.8 is measured rather than chosen for looking about right. The drawing's
// furthest corner sits 231px from the centre and the safe circle's radius is
// 205px, so it needs at most 0.887; 0.8 clears it with room and matches the
// proportion the platforms document.
const RENDERS = [
  { file: 'public/apple-touch-icon.png', size: 180 },
  { file: 'public/icon-192.png', size: 192 },
  { file: 'public/icon-512.png', size: 512 },
  { file: 'public/favicon-32.png', size: 32 },
  { file: 'public/icon-maskable-512.png', size: 512, shrink: 0.8 },
];

const svg = readFileSync(SOURCE, 'utf8');

if (CHECK) {
  if (!existsSync(SERVED)) {
    console.error('icons: FAIL — public/icon.svg does not exist.\n');
    console.error('  It is generated from icon.svg. Run `npm run render:icons` and commit what it writes.');
    process.exit(1);
  }

  const served = readFileSync(SERVED, 'utf8');
  if (served !== svg) {
    // Name WHERE they diverge. "They differ" sends you to diff two files by hand;
    // a line number sends you to the line.
    const a = svg.split('\n');
    const b = served.split('\n');
    const at = a.findIndex((line, i) => line !== b[i]);
    console.error('icons: FAIL — public/icon.svg has drifted from icon.svg.\n');
    console.error(`  They first differ at line ${at + 1}:`);
    console.error(`    icon.svg         ${JSON.stringify(a[at] ?? '(end of file)')}`);
    console.error(`    public/icon.svg  ${JSON.stringify(b[at] ?? '(end of file)')}`);
    console.error('\n  icon.svg at the root is the one source. Edit THERE, then run');
    console.error('  `npm run render:icons` and commit the regenerated copy and PNGs.');
    process.exit(1);
  }

  console.log('icons: public/icon.svg matches icon.svg. (The PNGs are committed output and are not compared — see the note in this file.)');
  process.exit(0);
}

// The served copy first, so it lands even if the browser step fails.
writeFileSync(SERVED, svg);
console.log('  public/icon.svg (copied from the source)');

const { chromium } = await import('playwright-core');
const browser = await chromium.launch({
  ...(existsSync(BROWSER) ? { executablePath: BROWSER } : {}),
  args: ['--no-sandbox'],
});

for (const { file, size, shrink } of RENDERS) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  // `transform-box: view-box` is load-bearing: without it a CSS transform on an
  // SVG group is measured from the origin of its own bounding box rather than
  // the drawing's coordinate system, and the shrink slides the art off centre.
  const mask = shrink
    ? `#art{transform-box:view-box;transform-origin:50% 50%;transform:scale(${shrink})}`
    : '';
  await page.setContent(
    `<style>*{margin:0}html,body{width:${size}px;height:${size}px}svg{display:block;width:${size}px;height:${size}px}${mask}</style>${svg}`,
    { waitUntil: 'load' },
  );
  await page.screenshot({ path: join(ROOT, file), clip: { x: 0, y: 0, width: size, height: size } });
  await page.close();
  console.log(`  ${file} (${size}px${shrink ? `, maskable, art at ${shrink}` : ''})`);
}

await browser.close();
console.log('icons rendered from icon.svg');
