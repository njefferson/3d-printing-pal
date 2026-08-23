#!/usr/bin/env node
// The pages that ship with the app and are NOT the app.
//
// public/status.html — where the work stands, one address, always current.
// public/probe.html  — can a picture's address be read? A measurement, not a
//                      feature, and the only thing here that runs script.
//
// WHY THEY NEED THEIR OWN GATE. Everything else is pointed at the app:
// tools/a11y.mjs derives its surface list from index.html's markup, and
// palette-check reads palettes/3d-printing-pal.json rather than any stylesheet.
// Both of these carry a HAND COPY of those palette tokens, which means nothing at
// all was measuring the colours their readers actually see. That is the shape of a
// file that looks covered because it sits beside covered things.
//
// The contrast machinery is IMPORTED from tools/page-helpers.mjs rather than
// restated. A second copy was written first, and it measured dark text against an
// assumed black page because the body's background is a gradient — reporting
// ratios of 1.32 in light mode and clean in dark, both fictional.
//
// EACH PAGE DECLARES WHAT IT MAY CONTAIN, rather than sharing one rule. The status
// page carries no script at all; the probe is nothing but script. A single rule
// covering both would have to permit script everywhere, which would stop it saying
// anything about the page that must not have any.
//
// It also asserts the two things that keep them out of the app: nothing the
// service worker would keep a copy of, and — for the probe — that its widened
// policy is scoped to its own path and nowhere else. The caching half is proved at
// RUNTIME by tools/update-walk.mjs against a real worker; the half here is static,
// so dropping the exemption fails both at once.

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

// Each page, and what it is allowed to be. `script` is per-page on purpose: the
// status page must contain none, the probe is nothing but. `files` is everything
// that page ships, all of which the worker must leave alone.
const PAGES = [
  {
    file: 'status.html',
    label: 'status',
    script: false,
    files: ['/status.html', '/status.css'],
    ownPolicy: false,
  },
  {
    file: 'probe.html',
    label: 'probe',
    script: true,
    files: ['/probe.html', '/probe.css', '/probe.js', '/probe-standalone.html'],
    ownPolicy: true,
  },
];

// ------------------------------------------------------------ source checks

function sourceChecks() {
  const sw = readFileSync(join(ROOT, 'public/sw.js'), 'utf8');
  const headers = readFileSync(join(ROOT, 'public/_headers'), 'utf8');
  const shell = sw.slice(sw.indexOf('const SHELL'), sw.indexOf('];', sw.indexOf('const SHELL')));

  for (const page of PAGES) {
    const html = readFileSync(join(ROOT, 'public', page.file), 'utf8');
    const hasScript = /<script/i.test(html);

    if (page.script && !hasScript) {
      fail(`${page.file} has no <script>, and it is nothing but script — it cannot measure anything`);
    } else if (!page.script && hasScript) {
      fail(`${page.file} contains a <script>, and it carries none by design`);
    } else {
      pass(`${page.file} ${page.script ? 'runs its own script, from a file' : 'carries no script at all'}`);
    }

    // An inline style is refused by `style-src 'self'` with the reason only in the
    // console, so the page renders unstyled and reads as a working page.
    if (/\sstyle=/i.test(html)) fail(`${page.file} has an inline style attribute, which style-src 'self' silently refuses`);
    else pass(`${page.file}: no inline style attribute`);

    if (/<script(?![^>]*\ssrc=)/i.test(html)) fail(`${page.file} has an INLINE script, which script-src 'self' refuses — it must be an external file`);

    if (!/<meta\s+name="robots"\s+content="noindex"/i.test(html)) fail(`${page.file} is missing its noindex — it is not a page for search results`);
    else pass(`${page.file}: marked noindex`);

    // Kept out of the worker in BOTH directions. Absent from the precache is not
    // enough on its own: the fetch handler caches whatever it successfully fetches.
    for (const path of page.files) {
      const bare = path.slice(1);
      if (shell.includes(bare)) fail(`${bare} is in the service worker's SHELL — a page that is not the app must never be precached`);
      if (!sw.includes(`'${path}'`)) {
        fail(`the service worker does not name ${path} as live — being absent from SHELL is not enough, because the fetch handler caches everything it fetches`);
      }
    }
    if (page.files.every((path) => sw.includes(`'${path}'`) && !shell.includes(path.slice(1)))) {
      pass(`${page.label}: all ${page.files.length} file(s) named live and none precached`);
    }

    // The widened policy is scoped to ONE path. A block written as `/probe*` or
    // pasted into `/*` would hand the whole app permission to talk to other hosts,
    // which is the app's central promise, given away by a wildcard.
    if (page.ownPolicy) {
      const blocks = headers.split('\n').filter((l) => /^\S/.test(l) && l.trim().startsWith('/'));
      const own = blocks.filter((b) => b.trim() === `/${page.file}`);
      if (!own.length) fail(`_headers has no block for /${page.file}, so it would be served the app's policy and every result would be a refusal by us`);
      else if (blocks.some((b) => b.trim().startsWith(`/${page.label}`) && b.includes('*'))) {
        fail(`_headers widens a WILDCARD path for ${page.label}, which grants more than the one page`);
      } else {
        pass(`${page.label}: its policy is scoped to /${page.file} exactly`);
      }

      // The app's own block, read as its own lines rather than by slicing between
      // two markers. The slice was written when this block sat below `/*`, and
      // once the order changed it would have measured an empty string and passed.
      const lines = headers.split('\n');
      const appAt = lines.findIndex((l) => l.trim() === '/*');
      const appCsp = appAt === -1 ? '' : (lines.slice(appAt + 1).find((l) => l.trim().startsWith('Content-Security-Policy')) || '');
      if (!appCsp) {
        fail("could not find the app's own Content-Security-Policy under /*, so nothing was checked about it");
      } else if (/img-src[^;]*https:/.test(appCsp) || /connect-src[^;]*https:/.test(appCsp)) {
        fail('the APP\'s own policy now permits requests to other hosts — "nothing is fetched" is the thing this app is');
      } else {
        pass("the app's own policy still permits no request to any other host");
      }

      // ABOVE `/*`, and that is a correction rather than a preference. It was
      // written below on the reasoning that a later, more specific rule wins; the
      // deployed page was then served the APP's policy and could measure nothing.
      // The observed behaviour is that the first match wins, and tools/serve.mjs
      // was changed to match rather than to keep flattering the assumption.
      const ownAt = lines.findIndex((l) => l.trim() === `/${page.file}`);
      if (ownAt === -1 || appAt === -1) {
        fail(`_headers is missing either /${page.file} or /*, so their order cannot be checked`);
      } else if (ownAt > appAt) {
        fail(`the /${page.file} block is written BELOW /*, and on the deployed site the global block won — the page would be served the app's policy and could measure nothing`);
      } else {
        pass(`${page.label}: its block is above /*, where the deployed site was observed to take it`);
      }

      // And the route that depends on none of that.
      if (!headers.includes('/probe-standalone.html') || !/Content-Disposition:\s*attachment/.test(headers)) {
        fail("probe-standalone.html has no `Content-Disposition: attachment` rule, so navigating to it would serve it under the app's policy as a broken page that still looks like the probe");
      } else {
        pass('the standalone copy is served as an attachment, so the only way to run it is from disk');
      }
    }
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


  for (const spec of PAGES) {
  const target = new URL(spec.file, url).href;
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

      // `load`, not `networkidle`. The probe reads its own response headers on
      // open, and a page that is allowed to talk to other hosts is exactly the
      // page whose network may not go idle on cue — waiting for that is waiting
      // on the thing under test.
      await page.goto(target, { waitUntil: 'load' });
      await page.waitForTimeout(250);
      const where = `${spec.label}/${theme}/${viewport.name}`;

      // The stylesheet arrived AND applied. A page refused for its MIME type or
      // its CSP still renders, just unstyled, and reads as a working page.
      const applied = await page.evaluate(() => {
        const sheets = [...document.styleSheets];
        let rules = 0;
        for (const sheet of sheets) { try { rules += sheet.cssRules.length; } catch { /* cross-origin */ } }
        return { sheets: sheets.length, rules, pad: getComputedStyle(document.body).paddingTop };
      });
      if (applied.rules < 10) fail(`${where}: its stylesheet did not apply — ${applied.sheets} sheet(s), ${applied.rules} rule(s)`);
      else pass(`${where}: stylesheet applied (${applied.rules} rules)`);

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
        if (!vague.length && !unnamed.length) pass(`${spec.label}: all ${measured.links.length} links say where they go`);
      }

      if (consoleErrors.length) fail(`${where}: the page logged ${consoleErrors.length} console error(s) — ${consoleErrors[0].slice(0, 120)}`);
      else pass(`${where}: no console errors under the deployed headers`);

      await context.close();
    }
  }
  }

  await browser.close();
  server.close();

  if (process.argv.includes('--verbose')) for (const p of passes) console.log(`  ok   ${p}`);
  for (const f of failures) console.error(`  FAIL ${f}`);

  if (failures.length) {
    console.error(`\npages: ${failures.length} failure(s) over ${PAGES.length} page(s).`);
    process.exit(1);
  }
  console.log(`pages: pass — ${passes.length} assertions over ${PAGES.length} page(s), ${THEMES.length} themes and ${WIDTHS.length} widths.`);
}

await main();
