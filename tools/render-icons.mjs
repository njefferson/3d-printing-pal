#!/usr/bin/env node
// Renders the PNG icon set from icon.svg.
//
// A DEVELOPER-TIME SCRIPT, not a CI step. It launches the sandbox Chromium at a
// hardcoded path that does not exist on a GitHub runner, so the generated PNGs
// are committed rather than built. Run it after editing icon.svg and commit what
// it writes.
//
// playwright-core and the browser revision are a MATCHED PAIR — see the //browser
// note in package.json. A playwright-core expecting a different revision connects
// and then hangs on a protocol mismatch, with no error.

import { chromium } from 'playwright-core';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BROWSER = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';

const SIZES = {
  'public/apple-touch-icon.png': 180,
  'public/icon-192.png': 192,
  'public/icon-512.png': 512,
  'public/favicon-32.png': 32,
};

const svg = readFileSync(join(ROOT, 'icon.svg'), 'utf8');
const browser = await chromium.launch({
  ...(existsSync(BROWSER) ? { executablePath: BROWSER } : {}),
  args: ['--no-sandbox'],
});

for (const [file, size] of Object.entries(SIZES)) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  await page.setContent(
    `<style>*{margin:0}html,body{width:${size}px;height:${size}px}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`,
    { waitUntil: 'load' },
  );
  await page.screenshot({ path: join(ROOT, file), clip: { x: 0, y: 0, width: size, height: size } });
  await page.close();
  console.log(`  ${file} (${size}px)`);
}

await browser.close();
console.log('icons rendered from icon.svg');
