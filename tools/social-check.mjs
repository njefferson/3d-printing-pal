#!/usr/bin/env node
// The social card's contrast, MEASURED rather than looked at.
//
// A card is the one surface where "it looks fine" is most tempting and least
// reliable: it is authored at full size and read at a third of it, over artwork
// rather than a flat fill, and nobody ever runs a contrast checker on a picture.
//
// THE METHOD IS PRESCRIBED, and each step of it is there because the obvious
// shortcut gives a wrong answer:
//
//   1. Render the card once with the TEXT HIDDEN. That is the only way to see
//      the backdrop a glyph is actually drawn over; with the text present you
//      would be sampling the text.
//
//   2. Take each LINE's tight rect, from Range.getClientRects(), not the
//      element's bounding box. An element's box is as wide as its container and
//      covers backdrop no glyph is ever drawn over — on a card with a gradient
//      or artwork behind it, that box includes the light part the words carefully
//      avoid, and the check then fails work that is fine, or passes work that is
//      not, depending which way the picture runs.
//
//   3. Take the LIGHTEST pixel found under that rect, not the average. Contrast
//      is a worst-case property: one bright patch under one letter is where it
//      breaks, and an average hides exactly that.
//
//   4. Compute the real ratio against the real text colour, and fail below the
//      floor.
//
// Pixels are read by drawing the screenshot into a canvas and calling
// getImageData — no image library, and the WCAG maths is the same formula the
// palette gate uses.
//
// IF A LINE FAILS, MOVE OR NARROW THE WORDS BEFORE DEEPENING ANY SCRIM. A scrim
// heavy enough to guarantee any placement also erases the subject, and the card
// then has good contrast and nothing worth looking at.

import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BROWSER = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';
const VERBOSE = process.argv.includes('--verbose');

// Takes an optional card path so alternative compositions can be measured by THIS
// gate rather than by a second copy of its maths. Defaults to the shipping card,
// so `npm run social` is unchanged.
const CARD = process.argv.slice(2).find((a) => !a.startsWith('--')) || join(ROOT, 'social-card.html');

// 4.5:1 across the board. Most of this text is large enough for the 3:1
// allowance, but a card is read shrunk to a third of its size, so the large-text
// exemption is not honestly available here.
const FLOOR = 4.5;

// Both sizes are measured: the layout is in viewport units, so a line that
// clears at one aspect can wrap differently and land somewhere lighter at the
// other.
const SIZES = [
  { name: 'og 1200x630', width: 1200, height: 630 },
  { name: 'social 1280x640', width: 1280, height: 640 },
];

const failures = [];
const rows = [];

const browser = await chromium.launch({
  ...(existsSync(BROWSER) ? { executablePath: BROWSER } : {}),
  args: ['--no-sandbox'],
});

for (const size of SIZES) {
  const page = await browser.newPage({ viewport: { width: size.width, height: size.height }, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(CARD).href, { waitUntil: 'networkidle' });

  // Step 2 first, while the text is still visible: where is each LINE?
  const lines = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('.measured')) {
      const range = document.createRange();
      range.selectNodeContents(el);
      // One rect per rendered line — this is the whole reason for using a Range
      // rather than the element.
      const rects = Array.from(range.getClientRects()).filter((r) => r.width > 1 && r.height > 1);
      const colour = getComputedStyle(el).color;
      const text = el.textContent.trim();
      rects.forEach((r, i) => {
        out.push({
          text: rects.length > 1 ? `${text} (line ${i + 1})` : text,
          colour,
          x: Math.floor(r.left),
          y: Math.floor(r.top),
          w: Math.ceil(r.width),
          h: Math.ceil(r.height),
        });
      });
    }
    return out;
  });

  if (!lines.length) {
    failures.push(`${size.name}: no .measured text found on the card — the check would pass having measured nothing`);
    await page.close();
    continue;
  }

  // Step 1: hide the text and photograph the real backdrop.
  await page.evaluate(() => document.documentElement.classList.add('hide-measured'));
  const backdrop = await page.screenshot({ clip: { x: 0, y: 0, width: size.width, height: size.height } });

  // Steps 3 and 4, in the page so getImageData does the decoding.
  const measured = await page.evaluate(
    async ({ pngBase64, lines, floor }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${pngBase64}`;
      await img.decode();

      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);

      const channel = (v) => {
        const c = v / 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
      };
      const lum = (r, g, b) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
      const parse = (css) => {
        const m = String(css).match(/rgba?\(([^)]+)\)/);
        const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
        return { r: p[0], g: p[1], b: p[2] };
      };

      const out = [];
      for (const line of lines) {
        const x = Math.max(0, line.x);
        const y = Math.max(0, line.y);
        const w = Math.min(canvas.width - x, line.w);
        const h = Math.min(canvas.height - y, line.h);
        if (w <= 0 || h <= 0) {
          out.push({ ...line, error: 'the line rect falls outside the card' });
          continue;
        }

        const data = ctx.getImageData(x, y, w, h).data;
        let lightest = -1;
        let lightestPx = null;
        for (let i = 0; i < data.length; i += 4) {
          const L = lum(data[i], data[i + 1], data[i + 2]);
          if (L > lightest) {
            lightest = L;
            lightestPx = [data[i], data[i + 1], data[i + 2]];
          }
        }

        const fg = parse(line.colour);
        const fgL = lum(fg.r, fg.g, fg.b);
        const ratio = (Math.max(fgL, lightest) + 0.05) / (Math.min(fgL, lightest) + 0.05);

        out.push({
          ...line,
          lightest: lightestPx,
          ratio: Number(ratio.toFixed(2)),
          ok: ratio + 0.005 >= floor,
          pixels: (w * h),
        });
      }
      return out;
    },
    { pngBase64: backdrop.toString('base64'), lines, floor: FLOOR },
  );

  for (const m of measured) {
    if (m.error) {
      failures.push(`${size.name}: ${m.error} — "${m.text}"`);
      continue;
    }
    rows.push({ size: size.name, ...m });
    if (!m.ok) {
      failures.push(
        `${size.name}: "${m.text}" measures ${m.ratio}:1 against the lightest pixel under it ` +
        `(rgb(${m.lightest.join(',')})), and needs ${FLOOR}:1. Move or narrow the words before deepening any scrim.`,
      );
    }
  }

  await page.close();
}

await browser.close();

if (VERBOSE || failures.length) {
  for (const r of rows) {
    console.log(`  ${r.ok ? 'ok  ' : 'FAIL'} ${r.size}  ${r.ratio}:1  over ${r.pixels}px  "${r.text}"`);
  }
}

if (failures.length) {
  console.error(`\nsocial card: FAIL — ${failures.length} line(s) below ${FLOOR}:1\n`);
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}

const worst = rows.reduce((a, b) => (a.ratio < b.ratio ? a : b));
console.log(
  `social card: ${rows.length} line(s) measured across ${SIZES.length} sizes, all at or above ${FLOOR}:1. ` +
  `Worst is ${worst.ratio}:1 — "${worst.text}" at ${worst.size}.`,
);
