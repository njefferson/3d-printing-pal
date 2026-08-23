#!/usr/bin/env node
// public/status.html — the one page that is not the app.
//
// WHY IT NEEDS ITS OWN GATE. It ships inside public/ and is served by the same
// deploy, but every other check here is pointed at the app: tools/a11y.mjs
// derives its surface list from index.html's markup, and palette-check reads
// palettes/3d-printing-pal.json rather than any stylesheet. status.css is a HAND
// COPY of those palette tokens, which means nothing at all was measuring the
// colours a reader of that page actually sees. That is the shape of a file that
// looks covered because it sits beside covered things.
//
// The contrast machinery is IMPORTED from tools/a11y.mjs rather than restated.
// A second copy was written first, and it measured dark text against an assumed
// black page because the body's background is a gradient — reporting ratios of
// 1.32 in light mode and clean in dark, both fictional.
//
// It also asserts the two things that make it a LIVE page rather than a document:
// no script (the CSP forbids inline, and a status page has nothing to run) and
// nothing that would let the app's service worker keep a copy. The caching half
// is proved at runtime by tools/update-walk.mjs against a real worker; the half
// here is the static one, so a change to sw.js that drops the exemption fails
// both at once.

import { chromium } from 'playwright-core';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from './serve.mjs';
import { PAGE_HELPERS } from './page-helpers.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BROWSER = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';
const AXE = readFileSync(join(ROOT, 'node_modules/axe-core/axe.min.js'), 'utf8');

const failures = [];
const passes = [];
const fail = (m) => failures.push(m);
const pass = (m) => passes.push(m);

// Both themes, and both a phone and a tablet, because the page is read on both
// and the light palette is the one that has been wrong before.
const THEMES = ['light', 'dark'];
const WIDTHS = [{ name: 'phone', width: 390 }, { name: 'tablet', width: 834 }];

// ------------------------------------------------------------ source checks

function sourceChecks() {
  const html = readFileSync(join(ROOT, 'public/status.html'), 'utf8');
  const sw = readFileSync(join(ROOT, 'public/sw.js'), 'utf8');

  if (/<script/i.test(html)) fail('status.html contains a <script> — the page carries no script by design, and the CSP forbids an inline one anyway');
  else pass('no script on the page at all');

  if (/\sstyle=/i.test(html)) fail('status.html has an inline style attribute, which `style-src \'self\'` refuses with the reason only in the console');
  else pass('no inline style attribute — every rule comes from status.css');

  if (!/<meta\s+name="robots"\s+content="noindex"/i.test(html)) fail('status.html is missing its noindex — it is not a page for search results');
  else pass('marked noindex');

  // The worker must be told to leave it alone in BOTH directions: out of the
  // precache list, and out of the fetch handler that caches whatever it fetches.
  const shell = sw.slice(sw.indexOf('const SHELL'), sw.indexOf('];', sw.indexOf('const SHELL')));
  for (const file of ['status.html', 'status.css']) {
    if (shell.includes(file)) fail(`${file} is in the service worker's SHELL — the status page must never be precached`);
  }
  if (!shell.includes('status')) pass('neither status file is in the precache list');

  for (const file of ['/status.html', '/status.css']) {
    if (!sw.includes(`'${file}'`)) {
      fail(`the service worker does not name ${file} as live — being absent from SHELL is not enough, because the fetch handler caches everything it fetches`);
    }
  }
  if (sw.includes("'/status.html'") && sw.includes("'/status.css'")) {
    pass('the worker names both status files as live, so the fetch handler leaves them to the network');
  }
}

// ------------------------------------------------------------ rendered page

const MEASURE = `
(() => {
  ${PAGE_HELPERS}

  const out = { contrast: [], nonText: [], links: [], counts: {} };

  const isLarge = (cs) => {
    const px = parseFloat(cs.fontSize);
    const weight = Number(cs.fontWeight) || 400;
    return px >= 24 || (px >= 18.66 && weight >= 700);
  };

  /* Only elements that own their text. A <p> wrapping a <b> would otherwise be
     measured twice, once with a colour that paints nothing. */
  const ownsText = (el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());

  for (const el of document.querySelectorAll('body *')) {
    if (!visible(el) || !ownsText(el)) continue;
    const cs = getComputedStyle(el);
    const fg = parseColor(cs.color);
    const backs = backdrops(el);
    if (!fg) continue;
    if (!backs.length) {
      /* REFUSE TO GUESS rather than assume white or black — that assumption is
         exactly what made the first version of this check report fiction. */
      out.contrast.push({ where: el.tagName.toLowerCase() + '.' + (el.className || ''), ratio: null, floor: null });
      continue;
    }
    const floor = isLarge(cs) ? 3 : 4.5;
    let worst = Infinity;
    for (const back of backs) worst = Math.min(worst, ratio(over(fg, back), back));
    out.counts.text = (out.counts.text || 0) + 1;
    if (worst < floor) {
      out.contrast.push({
        where: el.tagName.toLowerCase() + (el.className ? '.' + el.className.split(' ')[0] : ''),
        text: (el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 48),
        ratio: Math.round(worst * 100) / 100,
        floor,
      });
    }
  }

  /* SC 1.4.11: the bullet on every list item is the only thing distinguishing
     what is done from what is open, so it is meaningful non-text content. */
  for (const li of document.querySelectorAll('li')) {
    const cs = getComputedStyle(li, '::before');
    const fg = parseColor(cs.backgroundColor);
    const backs = backdrops(li);
    if (!fg || !backs.length) continue;
    let worst = Infinity;
    for (const back of backs) worst = Math.min(worst, ratio(over(fg, back), back));
    out.counts.bullet = (out.counts.bullet || 0) + 1;
    if (worst < 3) {
      out.nonText.push({
        where: li.parentElement.className + ' bullet',
        ratio: Math.round(worst * 100) / 100,
      });
    }
  }

  /* Every link goes somewhere, and says where in its own words rather than
     "here" or "this link". */
  for (const a of document.querySelectorAll('a[href]')) {
    const name = accessibleName(a);
    out.links.push({ href: a.getAttribute('href'), name });
  }

  return out;
})()
`;

async function main() {
  sourceChecks();

  const { server, url } = await serve(0, {
    extra: { '/__axe.js': { body: AXE, type: 'text/javascript; charset=utf-8' } },
  });
  const browser = await chromium.launch({
    ...(existsSync(BROWSER) ? { executablePath: BROWSER } : {}),
    args: ['--no-sandbox'],
  });

  const target = new URL('status.html', url).href;

  for (const theme of THEMES) {
    for (const viewport of WIDTHS) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: 900 },
        colorScheme: theme,
      });
      const page = await context.newPage();
      const consoleErrors = [];
      page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
      page.on('pageerror', (e) => consoleErrors.push(String(e)));

      await page.goto(target, { waitUntil: 'networkidle' });
      const where = `${theme}/${viewport.name}`;

      // The stylesheet arrived AND applied. A page refused for its MIME type or
      // its CSP still renders, just unstyled, and reads as a working page.
      const applied = await page.evaluate(() => {
        const sheets = [...document.styleSheets];
        let rules = 0;
        for (const sheet of sheets) { try { rules += sheet.cssRules.length; } catch { /* cross-origin */ } }
        return { sheets: sheets.length, rules, pad: getComputedStyle(document.body).paddingTop };
      });
      if (applied.rules < 10) fail(`${where}: status.css did not apply — ${applied.sheets} sheet(s), ${applied.rules} rule(s)`);
      else pass(`${where}: status.css applied (${applied.rules} rules)`);

      await page.addScriptTag({ url: '/__axe.js' });
      const axeResult = await page.evaluate(async () => {
        /* global axe */
        return axe.run(document, {
          runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] },
        });
      });
      for (const violation of axeResult.violations) {
        fail(`${where}: axe ${violation.id} (${violation.impact}) on ${violation.nodes.length} node(s) — ${violation.help}`);
      }
      if (!axeResult.violations.length) pass(`${where}: axe clean`);

      const measured = await page.evaluate(MEASURE);
      for (const c of measured.contrast) {
        if (c.ratio === null) fail(`${where}: nothing opaque behind ${c.where}, so its contrast cannot be measured`);
        else fail(`${where}: ${c.where} "${c.text}" is ${c.ratio}:1, under ${c.floor}`);
      }
      if (!measured.contrast.length) pass(`${where}: all ${measured.counts.text} text runs clear their floor, measured over every gradient stop behind them`);

      for (const n of measured.nonText) fail(`${where}: ${n.where} is ${n.ratio}:1, under 3 (SC 1.4.11)`);
      if (!measured.nonText.length) pass(`${where}: all ${measured.counts.bullet} list bullets clear 3:1`);

      // Once is enough for things that do not vary by theme or width.
      if (theme === THEMES[0] && viewport === WIDTHS[0]) {
        const vague = measured.links.filter((l) => /^(here|this|link|click here|read more)$/i.test(l.name.trim()));
        for (const l of vague) fail(`a link is named "${l.name}", which says nothing out of context`);
        const unnamed = measured.links.filter((l) => !l.name.trim());
        for (const l of unnamed) fail(`the link to ${l.href} has no accessible name`);
        if (!vague.length && !unnamed.length) pass(`all ${measured.links.length} links say where they go`);
      }

      if (consoleErrors.length) fail(`${where}: the page logged ${consoleErrors.length} console error(s) — ${consoleErrors[0].slice(0, 120)}`);
      else pass(`${where}: no console errors under the deployed headers`);

      await context.close();
    }
  }

  await browser.close();
  server.close();

  if (process.argv.includes('--verbose')) for (const p of passes) console.log(`  ok   ${p}`);
  for (const f of failures) console.error(`  FAIL ${f}`);

  if (failures.length) {
    console.error(`\nstatus page: ${failures.length} failure(s) across ${THEMES.length} themes and ${WIDTHS.length} widths.`);
    process.exit(1);
  }
  console.log(`status page: pass — ${passes.length} assertions across ${THEMES.length} themes and ${WIDTHS.length} widths.`);
}

await main();
