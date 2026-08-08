#!/usr/bin/env node
// Renders social-card.html at both sizes it is needed in.
//
// ONE TEMPLATE, so the site's card and GitHub's card cannot drift into saying
// different things. The card's CSS is sized in viewport units, so it lays out
// correctly at either aspect rather than being two hand-tuned files.
//
//   public/og.png          1200x630 — the site's og:image, the standard OG size
//   social-preview.png     1280x640 — what GitHub asks for, uploaded by hand at
//                          Settings -> General -> Social preview
//
// A DEVELOPER-TIME SCRIPT, not a CI step: it launches the sandbox Chromium at a
// path that does not exist on a runner, so the PNGs are committed. Run it after
// editing social-card.html, then run `npm run social` to measure it, then commit
// what both produced.

import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BROWSER = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';

export const SIZES = [
  { file: 'public/og.png', width: 1200, height: 630, why: "the site's og:image" },
  { file: 'social-preview.png', width: 1280, height: 640, why: "GitHub's social preview" },
];

const browser = await chromium.launch({
  ...(existsSync(BROWSER) ? { executablePath: BROWSER } : {}),
  args: ['--no-sandbox'],
});

for (const { file, width, height, why } of SIZES) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2 });
  await page.goto(pathToFileURL(join(ROOT, 'social-card.html')).href, { waitUntil: 'networkidle' });
  await page.screenshot({ path: join(ROOT, file), clip: { x: 0, y: 0, width, height } });
  await page.close();
  console.log(`  ${file}  ${width}x${height} @2x — ${why}`);
}

await browser.close();
console.log('social card rendered. Now run `npm run social` to measure its contrast.');
