#!/usr/bin/env node
// print-tracker's accessibility gate.
//
// IT EXITS NON-ZERO ON ANY FAILURE. That single property is the difference
// between a gate and a reporter.
//
// WHY THIS REPO HAS ITS OWN. The hub's a11y-gate.mjs is the reference
// implementation and the one shared gate that does not serve siblings: it takes
// no --repo, resolves paths against the working directory, and registers
// hub-specific selectors which — correctly — fail hard when they match nothing.
// Pointed at this app it would fail on every one of them.
//
// IT SERVES THE APP OVER HTTP. A gate pointed at file:// cannot test an app made
// of ES modules: the origin is opaque, every import is blocked by CORS, and the
// gate reports an empty shell as clean, in both themes, at every viewport,
// forever.
//
// IT AUDITS STATES, NOT PAGES, AND DERIVES THE LIST FROM THE MARKUP. A closed
// <dialog> is invisible to axe, so a single-page app's dialogs are outside any
// gate that only loads the page. And a hand-maintained list of surfaces goes
// stale silently: adding a screen and adding it to the list are two separate
// acts, and only the first is forced by wanting the feature — so the second is
// skipped exactly when a session is busy, which is always the session adding a
// screen. Here the list is derived from index.html and THE COMPARISON FAILS BOTH
// WAYS: an unaudited dialog fails, and a state naming a dialog that no longer
// exists fails too.
//
// IT PRESSES THINGS. A page that renders correctly can be a page that does
// nothing. Every check below could pass on an app whose buttons were all inert,
// so the gate moves a card, logs filament and filters the board — in BOTH touch
// and mouse modes, because an emulated interaction is a claim about one input
// path and the device this app is for has no mouse.
//
// IT ASKS AN OUTCOME QUESTION, not only minimums. If every check on a surface is
// a floor, nothing there is measuring the product.

import { chromium } from 'playwright-core';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { serve } from './serve.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const VERBOSE = process.argv.includes('--verbose');
const BROWSER = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';
const AXE = readFileSync(join(ROOT, 'node_modules/axe-core/axe.min.js'), 'utf8');

// Our floors. 44 is SC 2.5.5/2.5.8 in CSS PIXELS — deliberately not rem, because
// a finger does not get bigger when a reader increases their text size, and a rem
// floor makes the check go GREENER as the layout breaks. 8px of spacing is OUR
// rule for tremor overshoot, not a WCAG citation.
const MIN_TARGET = 44;
const MIN_SPACING = 8;

const THEMES = ['light', 'dark'];
const VIEWPORTS = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'phone-320', width: 320, height: 568 },
];

const failures = [];
const exemptions = [];
const passes = [];

function fail(where, message) {
  failures.push(`${where}: ${message}`);
}
function pass(where, message) {
  passes.push(`${where}: ${message}`);
}

// ---------------------------------------------------------------- registry
//
// A registered selector that matches nothing FAILS. Renaming a class must not
// silently remove coverage — that is what "added to the gate in the same commit"
// is protecting. Add a new foreground/background pair here in the commit that
// introduces it.

const BASE_TEXT = [
  '.wordmark',
  '.tab',
  '.tab[aria-current="page"]',
  '.btn',
  '.btn-primary',
  '.lastexport',
  '.stamp .linkbtn',
];

const STATE_TEXT = {
  board: [
    ...BASE_TEXT,
    '.chip[aria-pressed="true"] .chip-label',
    '.column-title',
    '.column-count',
    '.column-toggle',
    '.card-title',
    '.card-meta span',
    '.badge-request',
    '.badge-wanted',
    '.badge-fun',
    '.card-grip',
  ],
  inventory: [...BASE_TEXT, '.rowcard-title', '.rowcard-sub', '.remaining', '.note'],
  models: [...BASE_TEXT, '.rowcard-title', '.rowcard-sub', '.remaining'],
  'update-stuck': [...BASE_TEXT, '.strip-text'],
  undo: [...BASE_TEXT, '.strip-text'],
  firstrun: ['#dlg-firstrun h2', '#dlg-firstrun p', '#dlg-firstrun li', '#dlg-firstrun .btn', '.panel-foot-note'],
  info: ['#dlg-info h2', '#dlg-info h3', '#dlg-info p', '#dlg-info li', '#dlg-info a', '#dlg-info .release-head'],
  diagnostic: ['#dlg-diagnostic h2', '#dlg-diagnostic p', '#dlg-diagnostic .diag-text'],
  // `.note` is the Model box's hint, which is ALWAYS on screen — that is what
  // makes it registerable. It shares the class with #job-f-nospools, which is
  // hidden once a spool exists and so is filtered out before measuring.
  job: ['#dlg-job h2', '#dlg-job label', '#dlg-job legend', '#dlg-job .note', '#dlg-job .btn', '#dlg-job .btn-danger'],
  spool: ['#dlg-spool h2', '#dlg-spool label', '#dlg-spool .btn', '#dlg-spool .note'],
  model: ['#dlg-model h2', '#dlg-model label', '#dlg-model legend', '#dlg-model .btn'],
  move: ['#dlg-move h2', '#dlg-move p', '#dlg-move h3', '#dlg-move .btn'],
  confirm: ['#dlg-confirm h2', '#dlg-confirm p', '#dlg-confirm .btn', '#dlg-confirm .btn-danger'],
  import: ['#dlg-import h2', '#dlg-import p', '#dlg-import label', '#dlg-import .btn'],
};

const STATE_NONTEXT = {
  board: ['.btn', '.iconbtn', '.chip', '.card', '.column', '.card-grip', '.column-toggle'],
  inventory: ['.btn', '.rowcard', 'select', 'input[type="checkbox"]', '.bar'],
  models: ['.btn', '.rowcard'],
  'update-stuck': ['.strip', '.btn'],
  undo: ['.strip', '.btn'],
  firstrun: ['#dlg-firstrun .btn', '#dlg-firstrun .iconbtn'],
  info: ['#dlg-info .btn', '#dlg-info .iconbtn'],
  diagnostic: ['#dlg-diagnostic .btn', '#dlg-diagnostic .diag-text'],
  // No .fieldset here on purpose: a fieldset is a grouping named by its <legend>,
  // which is text, so its border carries no information a reader needs to
  // identify a component. It is drawn with --hairline, which the palette spec
  // exempts as decoration.
  job: ['#dlg-job input[type="text"]', '#dlg-job select', '#dlg-job textarea', '#dlg-job .btn', '#dlg-job input[list]'],
  spool: ['#dlg-spool input[type="text"]', '#dlg-spool input[type="number"]', '#dlg-spool .btn'],
  model: ['#dlg-model input[type="text"]', '#dlg-model .btn'],
  move: ['#dlg-move .btn'],
  confirm: ['#dlg-confirm .btn'],
  import: ['#dlg-import .btn', '#dlg-import input[type="file"]'],
};

// ------------------------------------------------------------------ states

const STATES = [
  { name: 'board', surface: null, enter: async (p) => showView(p, 'board') },
  { name: 'inventory', surface: null, enter: async (p) => showView(p, 'inventory') },
  { name: 'models', surface: null, enter: async (p) => showView(p, 'models') },
  {
    name: 'update-stuck',
    surface: null,
    // A transient state is its own a11y state. This one shipped unmeasured for a
    // day in a sibling app.
    enter: async (p) => {
      await showView(p, 'board');
      await p.evaluate(() => {
        const strip = document.getElementById('update-strip');
        strip.hidden = false;
        strip.dataset.state = 'stuck';
        document.getElementById('update-text').textContent =
          'The update is downloaded but this device will not swap it in while the app is open. Close the app completely and open it again, and the new version will be there. Nothing you have entered is affected.';
        document.getElementById('update-apply').hidden = true;
        document.getElementById('update-later').textContent = 'Dismiss';
      });
    },
    leave: async (p) => p.evaluate(() => {
      const strip = document.getElementById('update-strip');
      strip.hidden = true;
      strip.removeAttribute('data-state');
      document.getElementById('update-apply').hidden = false;
      document.getElementById('update-later').textContent = 'Not now';
    }),
  },
  {
    name: 'undo',
    surface: null,
    // ASSERTED, NOT STAGED. The seed above makes five changes through the real
    // forms, so by the time any state runs the strip is genuinely on screen and
    // carrying a real label. Setting `hidden = false` here instead would prove the
    // strip renders and prove nothing about whether anything ever shows it — and
    // the strip's whole failure mode is being wired to nothing.
    enter: async (p) => {
      await showView(p, 'board');
      const found = await p.evaluate(() => ({
        hidden: document.getElementById('undo-strip').hidden,
        text: document.getElementById('undo-text').textContent,
        name: document.getElementById('undo-do').getAttribute('aria-label'),
      }));
      if (found.hidden) {
        fail('undo', 'the undo strip is hidden after the seed made five changes through the forms, so nothing on it is measured and nothing offers the reader a way back');
      } else if (!/\S/.test(found.text)) {
        fail('undo', 'the undo strip is showing with no words in it — "Undo" alone does not say what would come back');
      } else if (!found.name?.startsWith('Undo ')) {
        fail('undo', `the undo button's accessible name is "${found.name}", which does not begin with its visible word (SC 2.5.3)`);
      } else {
        pass('undo', `the strip names its last change: "${found.text}"`);
      }
    },
  },
  { name: 'firstrun', surface: 'dlg-firstrun', enter: async (p) => openFirstRun(p) },
  { name: 'info', surface: 'dlg-info', enter: async (p) => press(p, '#info-open') },
  { name: 'diagnostic', surface: 'dlg-diagnostic', enter: async (p) => press(p, '#diag-open') },
  { name: 'job', surface: 'dlg-job', enter: async (p) => { await showView(p, 'board'); await press(p, '#job-new'); } },
  { name: 'spool', surface: 'dlg-spool', enter: async (p) => { await showView(p, 'inventory'); await press(p, '#spool-new'); } },
  { name: 'model', surface: 'dlg-model', enter: async (p) => { await showView(p, 'models'); await press(p, '#model-new'); } },
  {
    name: 'move',
    surface: 'dlg-move',
    enter: async (p) => { await showView(p, 'board'); await press(p, '.card .card-actions button'); },
  },
  {
    name: 'confirm',
    surface: 'dlg-confirm',
    enter: async (p) => {
      await showView(p, 'inventory');
      await press(p, '.rowcard .btn');
      await press(p, '#spool-delete');
    },
  },
  { name: 'import', surface: 'dlg-import', enter: async (p) => press(p, '#import-open') },
];

// ------------------------------------------------------------- the surfaces
//
// Derived from the markup, compared both ways.

function checkSurfaceCoverage() {
  const html = readFileSync(join(ROOT, 'public/index.html'), 'utf8');
  const inMarkup = new Set(Array.from(html.matchAll(/<dialog[^>]*\bid="([^"]+)"/g), (m) => m[1]));
  const audited = new Set(STATES.map((s) => s.surface).filter(Boolean));

  for (const id of inMarkup) {
    if (!audited.has(id)) {
      fail('surfaces', `<dialog id="${id}"> is in the markup and no state opens it, so it would ship unmeasured. Add a state to STATES in this file, in the same commit as the dialog.`);
    }
  }
  for (const id of audited) {
    if (!inMarkup.has(id)) {
      fail('surfaces', `a state opens "${id}", which is no longer in the markup. Coverage that quietly stopped applying looks identical to coverage that works.`);
    }
  }
  if (inMarkup.size && audited.size === inMarkup.size) {
    pass('surfaces', `${inMarkup.size} dialog(s) in the markup, ${audited.size} audited, derived not listed`);
  }
}

// --------------------------------------------------------------- utilities

async function press(page, selector) {
  await page.locator(selector).first().click();
  await page.waitForTimeout(90);
}

async function showView(page, view) {
  await page.evaluate((v) => {
    for (const d of document.querySelectorAll('dialog[open]')) d.close();
    document.getElementById(`tab-${v}`).click();
  }, view);
  await page.waitForTimeout(60);
}

async function openFirstRun(page) {
  // Closing first, and WAITING, matters: `close()` queues its event, and the
  // close handler is what moves the orientation back into the information panel.
  // Appending in the same evaluate would put the orientation in place and then
  // have the handler pull it straight back out.
  await closeEverything(page);
  await page.evaluate(() => {
    document.getElementById('firstrun-slot').append(document.getElementById('info-orientation'));
    document.getElementById('dlg-firstrun').showModal();
  });
  await page.waitForTimeout(60);
}

async function closeEverything(page) {
  await page.evaluate(() => {
    for (const d of document.querySelectorAll('dialog[open]')) d.close();
  });
  await page.waitForTimeout(60);
}

// ---------------------------------------------------------- in-page checks
//
// Everything below runs inside the page. Contrast is computed rather than taken
// from axe, which reports color-contrast as `incomplete` (not a violation) on
// transformed content — a green axe run over such content proves nothing.

const PAGE_HELPERS = `
function parseColor(value) {
  const m = String(value).match(/rgba?\\(([^)]+)\\)/);
  if (!m) return null;
  const parts = m[1].split(/[,\\s/]+/).filter(Boolean).map(Number);
  return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
}

function lum(c) {
  const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
}

function ratio(a, b) {
  const la = lum(a), lb = lum(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function over(fg, bg) {
  if (fg.a >= 1) return fg;
  return {
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1,
  };
}

/* Every opaque background an element could actually be drawn over, including
   every colour stop of any gradient in the ancestor chain. The worst is used.
   Anything below full alpha is NOT opaque and the walk continues — measuring
   against a translucent layer gives a number that is wrong in a direction
   nobody notices. If nothing opaque is found the caller REFUSES TO GUESS. */
function backdrops(el) {
  const found = [];
  let node = el;
  while (node && node !== document.documentElement.parentNode) {
    const cs = getComputedStyle(node);
    const bg = parseColor(cs.backgroundColor);
    const image = cs.backgroundImage || '';
    for (const stop of image.matchAll(/rgba?\\([^)]+\\)/g)) {
      const c = parseColor(stop[0]);
      if (c && c.a > 0.95) found.push(c);
    }
    if (bg && bg.a >= 1) { found.push(bg); return found; }
    if (bg && bg.a > 0) found.push(bg);
    node = node.parentElement;
  }
  return found;
}

function visible(el) {
  const r = el.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return false;
  const cs = getComputedStyle(el);
  return cs.visibility !== 'hidden' && cs.display !== 'none';
}

/* A rect clipped by every scrolling ancestor. A control inside a scroll
   container has a bounding rect that runs past the container, which produces
   spacing failures against neighbours it can never actually touch. */
function clippedRect(el) {
  let r = el.getBoundingClientRect();
  let node = el.parentElement;
  while (node) {
    const cs = getComputedStyle(node);
    if (cs.overflow !== 'visible' || cs.overflowX !== 'visible' || cs.overflowY !== 'visible') {
      const c = node.getBoundingClientRect();
      const left = Math.max(r.left, c.left), right = Math.min(r.right, c.right);
      const top = Math.max(r.top, c.top), bottom = Math.min(r.bottom, c.bottom);
      r = { left, right, top, bottom, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
    }
    node = node.parentElement;
  }
  return r;
}

function accessibleName(el) {
  const labelledby = el.getAttribute('aria-labelledby');
  if (labelledby) {
    const parts = labelledby.split(/\\s+/).map((id) => document.getElementById(id)?.textContent || '').join(' ');
    if (parts.trim()) return parts.trim();
  }
  const aria = el.getAttribute('aria-label');
  if (aria && aria.trim()) return aria.trim();
  if (el.id) {
    const label = document.querySelector('label[for="' + CSS.escape(el.id) + '"]');
    if (label) return label.textContent.trim();
  }
  const closestLabel = el.closest('label');
  if (closestLabel) return closestLabel.textContent.trim();
  const text = (el.innerText || el.textContent || '').trim();
  if (text) return text;
  const title = el.getAttribute('title');
  return title ? title.trim() : '';
}

/* Only text a sighted reader can actually see: aria-hidden subtrees and
   .sr-only text are not visible words for SC 2.5.3 to be about. */
function visibleWords(el) {
  const clone = el.cloneNode(true);
  for (const hidden of clone.querySelectorAll('[aria-hidden="true"], .sr-only')) hidden.remove();
  return (clone.textContent || '').replace(/\\s+/g, ' ').trim();
}

/* The root of a modal is the open dialog when there is one: everything behind it
   is inert, and sweeping the whole document produces dozens of imaginary
   collisions with controls nobody can reach. */
function auditRoot() {
  /* :modal returns dialogs in the top layer, in stacking order, so the LAST is
     the one actually on top. Taking the first open dialog in DOM order audited
     the panel underneath a stacked confirmation and reported every selector in
     the real top panel as matching nothing. */
  let stack = [];
  try { stack = Array.from(document.querySelectorAll('dialog:modal')); } catch { stack = []; }
  if (!stack.length) stack = Array.from(document.querySelectorAll('dialog[open]'));
  return stack.length ? stack[stack.length - 1] : document.body;
}
`;

async function measureState(page, state, theme, viewport) {
  const where = `${state.name}/${theme}/${viewport.name}`;

  // --- axe ---------------------------------------------------------------
  // From a same-origin URL, not inline content: the app's own CSP is
  // `script-src 'self'` and this gate runs under it rather than around it.
  await page.addScriptTag({ url: '/__axe.js' });
  const axeResult = await page.evaluate(async () => {
    /* global axe */
    const open = document.querySelector('dialog[open]');
    return axe.run(open || document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] },
    });
  });
  for (const violation of axeResult.violations) {
    fail(where, `axe ${violation.id} (${violation.impact}) on ${violation.nodes.length} node(s) — ${violation.help}`);
  }
  if (!axeResult.violations.length) pass(where, 'axe clean');

  // --- everything else ---------------------------------------------------
  const result = await page.evaluate(
    ({ textSelectors, nonTextSelectors, MIN_TARGET, MIN_SPACING, helpers }) => {
      // eslint-disable-next-line no-eval
      eval(helpers);

      const out = { text: [], nonText: [], targets: [], spacing: [], structure: [], exempt: [], names: [] };
      const root = auditRoot();

      // Text contrast, per registered selector. Matching nothing FAILS.
      for (const selector of textSelectors) {
        const nodes = Array.from(root.querySelectorAll(selector)).filter(visible);
        if (!nodes.length) {
          out.text.push({ selector, kind: 'missing' });
          continue;
        }
        const el = nodes[0];
        const cs = getComputedStyle(el);
        const fg = parseColor(cs.color);
        const backs = backdrops(el);
        if (!fg || !backs.length) {
          out.text.push({ selector, kind: 'undetermined' });
          continue;
        }
        const size = parseFloat(cs.fontSize);
        const weight = Number(cs.fontWeight) || 400;
        const large = size >= 24 || (size >= 18.66 && weight >= 700);
        const need = large ? 3 : 4.5;
        let worst = Infinity;
        for (const back of backs) {
          const solid = back.a >= 1 ? back : over(back, backs[backs.length - 1]);
          worst = Math.min(worst, ratio(over(fg, solid), solid));
        }
        if (worst + 0.005 < need) {
          out.text.push({ selector, kind: 'low', got: Number(worst.toFixed(2)), need });
        } else {
          out.text.push({ selector, kind: 'ok', got: Number(worst.toFixed(2)), need });
        }
      }

      // Non-text contrast: the BEST boundary signal, border or fill, at 3:1.
      // 1.4.11 asks whether the component is identifiable, not whether one
      // particular property passes — a card visible by its fill is identifiable.
      for (const selector of nonTextSelectors) {
        const nodes = Array.from(root.querySelectorAll(selector)).filter(visible);
        if (!nodes.length) {
          out.nonText.push({ selector, kind: 'missing' });
          continue;
        }
        const el = nodes[0];
        const cs = getComputedStyle(el);
        const outside = backdrops(el.parentElement || document.body);
        if (!outside.length) {
          out.nonText.push({ selector, kind: 'undetermined' });
          continue;
        }
        const base = outside.find((c) => c.a >= 1) || outside[outside.length - 1];
        const candidates = [];
        for (const side of ['Top', 'Right', 'Bottom', 'Left']) {
          const c = parseColor(cs['border' + side + 'Color']);
          if (c && c.a > 0 && parseFloat(cs['border' + side + 'Width']) > 0) candidates.push(ratio(over(c, base), base));
        }
        const outline = parseColor(cs.outlineColor);
        if (outline && outline.a > 0 && parseFloat(cs.outlineWidth) > 0 && cs.outlineStyle !== 'none') {
          candidates.push(ratio(over(outline, base), base));
        }
        const fill = parseColor(cs.backgroundColor);
        if (fill && fill.a > 0) candidates.push(ratio(over(fill, base), base));
        if (!candidates.length) {
          out.nonText.push({ selector, kind: 'no-signal' });
          continue;
        }
        const best = Math.max(...candidates);
        out.nonText.push({ selector, kind: best + 0.005 < 3 ? 'low' : 'ok', got: Number(best.toFixed(2)) });
      }

      // Targets: size, spacing, names.
      //
      // AN aria-hidden SUBTREE IS NOT PART OF THE ACCESSIBLE EXPERIENCE, so it is
      // not measured for names or target size. That is what aria-hidden MEANS,
      // and the alternative is demanding a label on a control no assistive
      // technology can reach — which teaches people to write labels nobody hears
      // in order to quiet a gate.
      //
      // BUT aria-hidden ON SOMETHING A KEYBOARD CAN STILL REACH IS A REAL FAULT,
      // and a worse one than a missing label: focus lands on a control the screen
      // reader cannot describe, so the user is somewhere they cannot be told
      // about. That case is caught below rather than skipped, which is why this
      // is not simply a wider exemption.
      const ariaHidden = (el) => el.closest('[aria-hidden="true"]') !== null;
      const keyboardReachable = (el) => {
        const tabindex = el.getAttribute('tabindex');
        if (tabindex !== null) return Number(tabindex) >= 0;
        return !el.disabled; // a, button, input, select, textarea are focusable by default
      };

      for (const el of root.querySelectorAll('[aria-hidden="true"]')) {
        const controls = [el, ...el.querySelectorAll('a[href], button, input, select, textarea')]
          .filter((node) => node.matches?.('a[href], button, input, select, textarea'))
          .filter((node) => node.type !== 'hidden')
          .filter(keyboardReachable);
        for (const bad of controls) {
          out.structure.push(
            `${describe(bad)} is inside aria-hidden but a keyboard can still reach it — focus would land somewhere a screen reader cannot describe`,
          );
        }
      }

      const interactive = Array.from(
        root.querySelectorAll('a[href], button, [role="button"], input, select, textarea'),
      ).filter(visible).filter((el) => el.type !== 'hidden').filter((el) => !ariaHidden(el));

      const measured = [];
      for (const el of interactive) {
        const cs = getComputedStyle(el);
        const r = clippedRect(el);
        const label = (el.tagName === 'BUTTON' || el.tagName === 'A' ? visibleWords(el) : '') || '';
        const aria = el.getAttribute('aria-label');

        // Size is measured on the control's OWN rect; clipping is only used for
        // spacing below. A card scrolled off the side of the board is clipped to
        // zero width and is still a 44px control the moment it scrolls in —
        // measuring size against the clip reports every off-screen control as
        // 0x44 and buries the real failures.
        const own = el.getBoundingClientRect();

        // SC 2.5.8's inline-in-a-sentence exception, applied and PRINTED.
        const inline = cs.display === 'inline';
        let adjacentText = false;
        if (inline) {
          for (const side of ['previousSibling', 'nextSibling']) {
            let n = el[side];
            while (n && n.nodeType === Node.TEXT_NODE && !n.textContent.trim()) n = n[side];
            if (n && n.nodeType === Node.TEXT_NODE && n.textContent.trim()) adjacentText = true;
          }
        }
        const exempt = inline && adjacentText;
        if (exempt) out.exempt.push(describe(el));
        else {
          if (own.width + 0.5 < MIN_TARGET || own.height + 0.5 < MIN_TARGET) {
            out.targets.push({ el: describe(el), w: Math.round(own.width), h: Math.round(own.height) });
          }
          measured.push({ el, r, describe: describe(el) });
        }

        // Every interactive element has an accessible name. The label and the
        // aria-label are captured HERE, on the element in hand — an earlier
        // version re-found the element afterwards by a description string that is
        // not unique (every `button.btn` describes identically), so it compared
        // one button's visible text against a different button's label and
        // reported failures that were not there.
        const name = accessibleName(el);
        if (!name) out.structure.push(`an interactive ${el.tagName.toLowerCase()} has no accessible name (${describe(el)})`);
        else out.names.push({ name, describe: describe(el), label, aria, tag: el.tagName });
      }

      // Spacing between non-inline targets.
      for (let i = 0; i < measured.length; i += 1) {
        for (let j = i + 1; j < measured.length; j += 1) {
          const a = measured[i].r;
          const b = measured[j].r;
          // Clipped to nothing means scrolled out of the visible area entirely,
          // so these two are not neighbours anybody can hit at once.
          if (a.width <= 0 || b.width <= 0 || a.height <= 0 || b.height <= 0) continue;
          const dx = Math.max(0, Math.max(a.left - b.right, b.left - a.right));
          const dy = Math.max(0, Math.max(a.top - b.bottom, b.top - a.bottom));
          const gap = Math.hypot(dx, dy);
          const overlapping = dx === 0 && dy === 0;
          // Nested controls overlap by construction and are not two neighbours.
          const nested = measured[i].el.contains(measured[j].el) || measured[j].el.contains(measured[i].el);
          if (!nested && !overlapping && gap + 0.5 < MIN_SPACING) {
            out.spacing.push({ a: measured[i].describe, b: measured[j].describe, gap: Number(gap.toFixed(1)) });
          }
        }
      }

      // Duplicate accessible names on one surface: two controls answering to one
      // name is a coin toss for anyone driving by voice.
      const byName = new Map();
      for (const entry of out.names) {
        const key = entry.name.toLowerCase();
        byName.set(key, (byName.get(key) || []).concat(entry.describe));
      }
      out.duplicateNames = Array.from(byName.entries())
        .filter(([, list]) => list.length > 1)
        .map(([name, list]) => ({ name, count: list.length, examples: list.slice(0, 3) }));

      // SC 2.5.3 Label in Name, tokenised into words from what is actually
      // visible. Comparing textContent as one substring is wrong the moment a
      // control is built from two elements — they serialise with no separator.
      out.labelInName = [];
      for (const entry of out.names) {
        if (!entry.label) continue;
        const aria = entry.aria;
        if (!aria) continue;

        // A control whose visible text is ONE character and which carries an
        // aria-label fails outright. "information".includes("i") is true, so a
        // substring check passes it by pure accident — one character is a symbol
        // wearing a letter's clothing, and it is not a phrase anybody can say.
        if (entry.label.replace(/\\s/g, '').length <= 1) {
          out.labelInName.push({ el: entry.describe, label: entry.label, aria, kind: 'single-char' });
          continue;
        }
        const words = entry.label.toLowerCase().split(/\\s+/).map((w) => w.replace(/[.,:;!?]+$/, '')).filter(Boolean);
        const inAria = aria.toLowerCase();
        const missing = words.filter((w) => !inAria.includes(w));
        if (missing.length) out.labelInName.push({ el: entry.describe, label: entry.label, aria, kind: 'missing', missing });
      }

      // Structure.
      if (!document.documentElement.lang) out.structure.push('<html> has no lang attribute');
      const h1s = document.querySelectorAll('h1').length;
      if (h1s !== 1) out.structure.push(`the document has ${h1s} <h1> elements, and must have exactly 1`);
      for (const img of root.querySelectorAll('img')) {
        if (!img.hasAttribute('alt')) out.structure.push('an <img> has no alt attribute at all');
      }
      for (const canvas of root.querySelectorAll('canvas')) {
        const named = canvas.getAttribute('aria-label') || canvas.getAttribute('aria-labelledby') || canvas.getAttribute('title') || canvas.textContent.trim();
        if (!named) out.structure.push('a <canvas> has no text alternative (SC 1.1.1)');
      }

      function describe(el) {
        const id = el.id ? `#${el.id}` : '';
        const cls = el.className && typeof el.className === 'string' ? `.${el.className.trim().split(/\\s+/).join('.')}` : '';
        return `${el.tagName.toLowerCase()}${id}${cls}`.slice(0, 90);
      }

      return out;
    },
    {
      textSelectors: STATE_TEXT[state.name] || BASE_TEXT,
      nonTextSelectors: STATE_NONTEXT[state.name] || [],
      MIN_TARGET,
      MIN_SPACING,
      helpers: PAGE_HELPERS,
    },
  );

  for (const row of result.text) {
    if (row.kind === 'missing') fail(where, `contrast registry selector matched nothing: ${row.selector} — restore it or remove it from the registry`);
    else if (row.kind === 'undetermined') fail(where, `could not determine an opaque background for ${row.selector} — refusing to guess`);
    else if (row.kind === 'low') fail(where, `text contrast ${row.got}:1 on ${row.selector}, needs ${row.need}:1`);
    else if (VERBOSE) pass(where, `text ${row.selector} ${row.got}:1`);
  }
  for (const row of result.nonText) {
    if (row.kind === 'missing') fail(where, `non-text registry selector matched nothing: ${row.selector}`);
    else if (row.kind === 'undetermined') fail(where, `could not determine a backdrop for ${row.selector} — refusing to guess`);
    else if (row.kind === 'no-signal') fail(where, `${row.selector} draws no boundary at all — no border, no outline, no fill — so nothing identifies it (SC 1.4.11)`);
    else if (row.kind === 'low') fail(where, `non-text contrast ${row.got}:1 on ${row.selector}, needs 3:1 (SC 1.4.11)`);
    else if (VERBOSE) pass(where, `non-text ${row.selector} ${row.got}:1`);
  }
  for (const t of result.targets) fail(where, `touch target ${t.w}x${t.h}px is under ${MIN_TARGET}px: ${t.el}`);
  for (const s of result.spacing) fail(where, `targets ${s.gap}px apart, under our ${MIN_SPACING}px floor: ${s.a} and ${s.b}`);
  for (const s of result.structure) fail(where, s);
  for (const d of result.duplicateNames) {
    fail(where, `${d.count} controls answer to the accessible name "${d.name}" (${d.examples.join(', ')})`);
  }
  for (const l of result.labelInName) {
    if (l.kind === 'single-char') {
      fail(where, `${l.el} shows the single character "${l.label}" and carries aria-label "${l.aria}". A substring check passes this by accident; use an aria-hidden glyph plus an .sr-only sentence.`);
    } else {
      fail(where, `SC 2.5.3: ${l.el} shows "${l.label}" but its accessible name omits ${l.missing.join(', ')} — saying what is written on it does nothing`);
    }
  }
  for (const e of result.exempt) exemptions.push(`${where}: ${e}`);

  if (!result.targets.length && !result.spacing.length && !result.structure.length) {
    pass(where, `${result.names.length} control(s) measured, all named and at least ${MIN_TARGET}px`);
  }
}
export { measureState };

// ------------------------------------------------------------ dismiss check

async function checkDismiss(page, state) {
  if (!state.surface) return;
  const where = `${state.name}/dismiss`;

  const report = await page.evaluate((id) => {
    const dialog = document.getElementById(id);
    if (!dialog?.open) return { error: 'the dialog is not open' };

    const body = dialog.querySelector('.panel-body');
    const closers = Array.from(dialog.querySelectorAll(`[data-close="${id}"]`));
    if (!closers.length) return { error: 'no dismiss control at all' };

    const dialogRect = dialog.getBoundingClientRect();
    const inFirstFrame = closers.some((c) => {
      const r = c.getBoundingClientRect();
      return r.top >= dialogRect.top - 1 && r.bottom <= dialogRect.bottom + 1 && r.width > 0;
    });

    // Two ways out, not one: one in the head, one at the end.
    const inHead = closers.some((c) => c.closest('.panel-head'));
    const inFoot = closers.some((c) => c.closest('.panel-foot'));

    // Scroll to the very end and check a dismiss is still on screen — this is
    // the one that catches a way out that scrolls away.
    if (body) body.scrollTop = body.scrollHeight;
    const afterScroll = closers.some((c) => {
      const r = c.getBoundingClientRect();
      return r.bottom <= window.innerHeight + 1 && r.top >= -1 && r.width > 0 && r.height > 0;
    });

    // Hit-testing the centre of a dismiss returns the dismiss itself, rather
    // than something painted over it.
    const target = closers.find((c) => c.getBoundingClientRect().width > 0);
    const r = target.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    const hitIsDismiss = Boolean(hit && (hit === target || target.contains(hit)));

    return {
      inFirstFrame, inHead, inFoot, afterScroll, hitIsDismiss,
      height: Math.round(dialogRect.height),
      viewport: window.innerHeight,
    };
  }, state.surface);

  if (report.error) {
    fail(where, report.error);
    return;
  }
  if (!report.inFirstFrame) fail(where, 'no dismiss is inside the panel in the first frame');
  if (!report.inHead) fail(where, 'no dismiss in the panel head');
  if (!report.inFoot) fail(where, 'no dismiss at the end of the panel — two ways out, not one');
  if (!report.afterScroll) fail(where, 'after scrolling to the very end, no dismiss is on screen');
  if (!report.hitIsDismiss) fail(where, 'hit-testing the centre of the dismiss returns something else painted over it');
  if (report.height > report.viewport + 1) fail(where, `the panel is ${report.height}px tall in a ${report.viewport}px viewport — it must scroll inside itself, not past the screen edge`);

  // It is genuinely GONE afterwards, not merely flagged closed. An unscoped
  // `display` on a dialog beats the user agent's own hiding rule on specificity,
  // and the panel stays on screen while close() succeeds and every handler runs.
  const gone = await page.evaluate((id) => {
    const dialog = document.getElementById(id);
    dialog.querySelector(`[data-close="${id}"]`).click();
    return {
      open: dialog.open,
      stillVisible: dialog.checkVisibility ? dialog.checkVisibility() : getComputedStyle(dialog).display !== 'none',
      focus: document.activeElement ? document.activeElement.tagName : null,
    };
  }, state.surface);

  if (gone.open) fail(where, 'pressing the dismiss did not close the dialog');
  if (gone.stillVisible) fail(where, 'the dialog reports closed but is still visible — check for an unscoped display rule beating dialog:not([open])');
  if (!gone.focus || gone.focus === 'BODY') fail(where, 'after dismissal focus landed on <body> rather than somewhere real');
  if (!failures.some((f) => f.startsWith(where))) pass(where, 'two ways out, reachable after scrolling, hit-testable, genuinely gone, focus lands somewhere real');
}

// ------------------------------------------------------------- press checks

/** The ids of the cards in Research, in the order they are drawn. */
async function cardOrder(page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('#col-research .card')).map((c) => c.dataset.jobId));
}

async function openMoveFor(page, mode, jobId) {
  const button = page.locator(`.card[data-job-id="${jobId}"] .card-actions button`).first();
  if (mode === 'touch') await button.tap();
  else await button.click();
  await page.waitForTimeout(150);
}

/** The first button in the open move list whose words match, with its index. */
async function findMoveButton(page, pattern) {
  return page.evaluate((source) => {
    const re = new RegExp(source);
    const buttons = Array.from(document.querySelectorAll('#move-list button'));
    const at = buttons.findIndex((b) => re.test(b.textContent));
    return at < 0 ? null : { at, text: buttons[at].textContent };
  }, pattern.source);
}

async function pressMove(page, mode, at) {
  const button = page.locator('#move-list button').nth(at);
  if (mode === 'touch') await button.tap();
  else await button.click();
  await page.waitForTimeout(260);
}

async function checkPressing(page) {
  // Both input paths. An emulated interaction is a claim about ONE of them.
  for (const mode of ['mouse', 'touch']) {
    const where = `press/${mode}`;
    await closeEverything(page);
    await showView(page, 'board');

    // THE DRAG DOES TWO THINGS, so this presses for two things. A card carried by
    // drag lands in a column AND at a place within it, and the Move panel
    // answered only the first until 0.3.0 — while this check pressed whichever
    // button happened to be at the top of the list, so a panel that had lost half
    // its job would still have passed.
    //
    // The reorder goes first because it needs two cards in Research, and the
    // column move below takes one away on every pass.
    const orderBefore = await cardOrder(page);
    if (orderBefore.length < 2) {
      fail(where, `only ${orderBefore.length} card(s) left in Research — the gate cannot prove reordering works`);
    } else {
      await openMoveFor(page, mode, orderBefore[0]);
      const reorder = await findMoveButton(page, /^Put (before|last) /);
      if (!reorder) {
        fail(where, "the Move panel offers no way to change a card's place within its column, so reordering is drag-only (SC 2.5.7)");
        await closeEverything(page);
      } else {
        await pressMove(page, mode, reorder.at);
        const orderAfter = await cardOrder(page);
        if (orderAfter.join() === orderBefore.join()) {
          fail(where, `"${reorder.text}" closed the panel and the column's order did not change`);
        } else {
          pass(where, `"${reorder.text}" reordered a column without a drag`);
        }
      }
    }

    await closeEverything(page);
    const before = await page.evaluate(() => {
      const card = document.querySelector('#col-research .card');
      return card ? { id: card.dataset.jobId, column: 'research' } : null;
    });
    if (!before) {
      fail(where, 'no card in Research to move — the gate cannot prove moving works');
      continue;
    }

    await openMoveFor(page, mode, before.id);
    const moveOpen = await page.evaluate(() => document.getElementById('dlg-move').open);
    if (!moveOpen) {
      fail(where, 'pressing Move did nothing — the move list did not open');
      continue;
    }

    const toColumn = await findMoveButton(page, /^Move to /);
    if (!toColumn) {
      fail(where, 'the Move panel offers no other column to move to');
      await closeEverything(page);
      continue;
    }
    await pressMove(page, mode, toColumn.at);

    const after = await page.evaluate((id) => {
      const card = document.querySelector(`.card[data-job-id="${id}"]`);
      return card ? card.closest('.column').dataset.column : null;
    }, before.id);

    if (!after) fail(where, 'the card vanished from the board after being moved');
    else if (after === before.column) fail(where, 'the move list closed and the card did not move');
    else pass(where, `card moved from ${before.column} to ${after}`);

    // Filtering, on the same input path.
    const chip = page.locator('.chip[data-type="fun"]');
    const countBefore = await page.locator('.card').count();
    if (mode === 'touch') await chip.tap();
    else await chip.click();
    await page.waitForTimeout(150);
    const countAfter = await page.locator('.card').count();
    const pressed = await chip.getAttribute('aria-pressed');
    if (pressed !== 'false') fail(where, 'pressing a filter chip did not change its pressed state');
    else if (countAfter >= countBefore) fail(where, `filtering out "fun" did not remove any cards (${countBefore} before, ${countAfter} after)`);
    else pass(where, `filter chip hid ${countBefore - countAfter} card(s)`);

    if (mode === 'touch') await chip.tap();
    else await chip.click();
    await page.waitForTimeout(120);
  }
}

// --------------------------------------------------------- outcome check

async function checkOutcome(page) {
  // Not a minimum. The question is whether the product is usable, not whether
  // some button clears 44px — a floor-only surface is measuring nothing.
  const where = 'outcome/320-at-200%';
  await page.setViewportSize({ width: 320, height: 568 });
  await page.evaluate(() => { document.documentElement.style.fontSize = '32px'; });
  await closeEverything(page);
  await showView(page, 'board');
  await page.waitForTimeout(150);

  const report = await page.evaluate(() => {
    const card = document.querySelector('.card');
    if (!card) return { error: 'no card on the board' };
    const move = card.querySelector('.card-actions button');
    const r = card.getBoundingClientRect();
    const m = move.getBoundingClientRect();
    const hit = document.elementFromPoint(m.left + m.width / 2, m.top + m.height / 2);

    let widest = null;
    for (const el of document.querySelectorAll('body *')) {
      const b = el.getBoundingClientRect();
      if (b.width <= window.innerWidth + 1) continue;
      if (!el.offsetParent && getComputedStyle(el).position !== 'fixed') continue;
      // Inside a scroll container it is contained, not overflowing the page.
      let scrolls = false;
      for (let n = el.parentElement; n; n = n.parentElement) {
        const cs = getComputedStyle(n);
        if (cs.overflowX === 'auto' || cs.overflowX === 'scroll' || cs.overflowX === 'hidden') { scrolls = true; break; }
      }
      if (scrolls) continue;
      if (!widest || b.width > widest.width) {
        widest = { width: Math.round(b.width), el: el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/).join('.') : '') };
      }
    }

    return {
      bodySW: document.body.scrollWidth,
      htmlSW: document.documentElement.scrollWidth,
      widest,
      moveTop: Math.round(m.top),
      moveBottom: Math.round(m.bottom),
      hitWas: hit ? (hit.tagName.toLowerCase() + (hit.id ? '#' + hit.id : '') + (typeof hit.className === 'string' && hit.className ? '.' + hit.className.trim().split(/\s+/).join('.') : '')) : 'nothing',
      cardTop: Math.round(r.top),
      cardVisible: r.top < window.innerHeight && r.bottom > 0,
      moveOnScreen: m.top >= 0 && m.bottom <= window.innerHeight && m.width > 0,
      moveHittable: Boolean(hit && (hit === move || move.contains(hit))),
      moveWidth: Math.round(m.width),
      pageWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
      chrome: Math.round(r.top),
      viewportHeight: window.innerHeight,
    };
  });

  if (report.error) {
    fail(where, report.error);
  } else {
    if (!report.cardVisible) fail(where, `the first job card starts ${report.cardTop}px down a ${report.viewportHeight}px screen — the board is not on the glass`);
    if (report.pageWidth > report.viewportWidth + 1) {
      const blame = report.widest
        ? `${report.widest.el} is ${report.widest.width}px wide and is not inside a scroll container`
        : report.bodySW <= report.viewportWidth + 1
          ? `the body measures ${report.bodySW}px but <html> measures ${report.htmlSW}px, which is the signature of an absolutely positioned descendant escaping a scroll container — give that container position: relative`
          : 'the overflow is from a scroll container that is not clipping';
      fail(where, `the page is ${report.pageWidth}px wide in a ${report.viewportWidth}px viewport and scrolls sideways — ${blame}`);
    }
  }

  // Reachability, not luck of the layout: scroll the control into view the way a
  // reader would and prove the press lands on it. A control one scroll away is
  // reachable; a control under fixed chrome is not, and only this can tell them
  // apart.
  const reach = await page.evaluate(() => {
    const move = document.querySelector('.card .card-actions button');
    if (!move) return { error: 'no Move control on the board' };
    move.scrollIntoView({ block: 'center' });
    const m = move.getBoundingClientRect();
    const hit = document.elementFromPoint(m.left + m.width / 2, m.top + m.height / 2);
    return {
      onScreen: m.top >= 0 && m.bottom <= window.innerHeight && m.width > 0,
      hittable: Boolean(hit && (hit === move || move.contains(hit))),
      hitWas: hit ? hit.tagName.toLowerCase() + (hit.id ? '#' + hit.id : '') : 'nothing',
      top: Math.round(m.top),
      height: Math.round(m.height),
    };
  });

  if (reach.error) fail(where, reach.error);
  else {
    if (!reach.onScreen) fail(where, `after scrolling to it, the Move control is still off screen (top ${reach.top}px)`);
    if (!reach.hittable) fail(where, `after scrolling to it, pressing the Move control would hit ${reach.hitWas} instead — something is painted over it`);
  }

  if (!failures.some((f) => f.startsWith(where))) {
    pass(where, `board on screen from ${report.chrome}px, Move control ${reach.height}px and hittable after scrolling, page does not scroll sideways`);
  }

  await page.evaluate(() => { document.documentElement.style.fontSize = ''; });
}

// ------------------------------------------------- doctrine §7e assertions

async function checkInfoSurface(page) {
  const where = 'info-surface';
  await closeEverything(page);

  const report = await page.evaluate(() => {
    const button = document.getElementById('info-open');
    if (!button) return { error: 'there is no (i) control in the app chrome' };
    const name = (button.getAttribute('aria-label') || button.textContent || '').trim();
    const visibleText = (() => {
      const clone = button.cloneNode(true);
      for (const h of clone.querySelectorAll('[aria-hidden="true"], .sr-only')) h.remove();
      return (clone.textContent || '').trim();
    })();
    const srOnly = button.querySelector('.sr-only');
    return {
      name: srOnly ? srOnly.textContent.trim() : name,
      visibleText,
      inChrome: Boolean(button.closest('.topbar')),
      isTab: Boolean(button.closest('.tabs')),
      inFooter: Boolean(button.closest('.footer')),
    };
  });

  if (report.error) {
    fail(where, report.error);
    return;
  }
  if (!report.inChrome) fail(where, 'the (i) control is not in the app\'s own chrome');
  if (report.isTab) fail(where, 'the (i) control is a tab — tabs are for the app\'s content, and every one added takes width from it');
  if (report.inFooter) fail(where, 'the (i) control is in the footer, where it is a link nobody has ever pressed');
  if (report.visibleText.length > 1) fail(where, `the (i) control shows the words "${report.visibleText}" — the glyph should be aria-hidden`);
  // Its accessible name says WHAT IT OPENS, not just that it exists.
  if (!/\b(what|how|install|information|about|report)\b/i.test(report.name) || report.name.split(/\s+/).length < 4) {
    fail(where, `the (i) control's accessible name does not say what it opens: "${report.name}"`);
  }

  // The seven things behind it.
  await press(page, '#info-open');
  const contents = await page.evaluate(() => {
    const panel = document.getElementById('dlg-info');
    const text = panel.innerText;
    return {
      orientationInside: Boolean(panel.querySelector('#info-orientation')?.textContent.trim()),
      whatItIs: /what this is/i.test(text),
      whatItIsNot: /what it is not/i.test(text),
      install: /home screen/i.test(text) && /iphone|ipad/i.test(text) && /android/i.test(text),
      changed: /what changed/i.test(text) && Boolean(panel.querySelector('#info-releases .release')),
      dataSource: /where the numbers come from/i.test(text),
      reporting: /report a problem/i.test(text),
      accessibility: Boolean(panel.querySelector('a[href*="accessibility"]')),
      licence: Boolean(panel.querySelector('a[href*="LICENSE"]')),
      height: Math.round(panel.scrollHeight),
    };
  });

  const owed = {
    'what the app IS': contents.whatItIs,
    'what it is NOT': contents.whatItIsNot,
    'how to install it, with every platform named': contents.install,
    'what changed': contents.changed,
    'where the numbers come from': contents.dataSource,
    'how to report a problem': contents.reporting,
    'the accessibility statement': contents.accessibility,
    'the licence': contents.licence,
  };
  for (const [what, present] of Object.entries(owed)) {
    if (!present) fail(where, `the information panel does not carry ${what}`);
  }
  if (!contents.orientationInside) {
    fail(where, 'the first-run orientation is not inside the information panel — it has to live there permanently, not be copied there');
  }
  // Bounded, so it cannot become the app. Generous, so the failure is never fixed
  // by cutting the words a reader needs.
  if (contents.height > 9000) fail(where, `the information panel is ${contents.height}px of content — bound it by structure, not by deleting prose`);
  if (!failures.some((f) => f.startsWith(where))) pass(where, `(i) control in the chrome, all seven items behind it, ${contents.height}px`);

  await closeEverything(page);
}

async function checkFirstRunSurvives(page) {
  const where = 'first-run';
  await openFirstRun(page);

  const during = await page.evaluate(() =>
    Boolean(document.querySelector('#dlg-firstrun #info-orientation')?.textContent.trim()));
  if (!during) fail(where, 'the first-run panel has no orientation content in it');

  // Press the thing a reader presses to begin.
  await page.locator('#dlg-firstrun .panel-foot .btn').first().click();
  await page.waitForTimeout(120);

  const after = await page.evaluate(() => {
    const orientation = document.getElementById('info-orientation');
    return {
      exists: Boolean(orientation),
      insideInfo: Boolean(orientation && document.getElementById('dlg-info').contains(orientation)),
      hasContent: Boolean(orientation && orientation.textContent.trim().length > 100),
      copies: document.querySelectorAll('#info-orientation').length,
    };
  });

  if (!after.exists || !after.hasContent) {
    fail(where, 'the orientation text did not survive the button a new reader presses to begin — that gate must never be the thing that destroys the instructions');
  }
  if (!after.insideInfo) fail(where, 'after dismissal the orientation is not behind the (i) control, so a reader cannot find it again');
  if (after.copies > 1) fail(where, `there are ${after.copies} copies of the orientation. It is MOVED, never copied — two copies drift, and the one nobody is looking at goes stale.`);
  if (!failures.some((f) => f.startsWith(where))) pass(where, 'orientation survives dismissal, lives behind the (i), exactly one copy');
}

async function checkDiagnosticPrivacy(page) {
  const where = 'diagnostic';
  await closeEverything(page);
  await press(page, '#diag-open');

  const report = await page.evaluate(() => document.getElementById('diag-text').value);
  await closeEverything(page);

  // Everything the seeded data typed in. None of it may appear in the report.
  const readerWrote = ['Benchy', 'Calibration cube', 'Dragon egg', 'Ada Lovelace', 'Prusa MK4', 'Polymaker', 'Galaxy Black', 'a note about the print'];
  const leaked = readerWrote.filter((word) => report.includes(word));
  if (leaked.length) {
    fail(where, `the diagnostic contains things the reader typed: ${leaked.join(', ')}. It carries counts, never contents.`);
  }

  if (!/maxTouchPoints/.test(report)) {
    fail(where, 'the diagnostic does not report maxTouchPoints — iPadOS Safari sends the macOS user-agent, so without it the report confidently says "Mac" about an iPad');
  }
  if (!/GUESS/.test(report)) fail(where, 'the diagnostic\'s plain-language device summary is not labelled a guess');
  if (!/DIAGNOSIS/.test(report)) fail(where, 'the diagnostic does not lead with a diagnosis');
  if (!/cache|caches/i.test(report)) fail(where, 'the diagnostic does not report cache state, so it cannot tell "this is current" from "this is what the cache holds"');
  if (!failures.some((f) => f.startsWith(where))) pass(where, 'leads with a diagnosis, carries maxTouchPoints and cache state, contains nothing the reader wrote');
}

async function checkInteractionSelectors(page) {
  const where = 'interactions/live';
  const spec = JSON.parse(readFileSync(join(ROOT, 'INTERACTIONS.json'), 'utf8'));
  await closeEverything(page);
  await showView(page, 'board');

  for (const item of spec.interactions) {
    const found = await page.locator(item.selector).count();
    if (found === 0) {
      fail(where, `INTERACTIONS.json declares "${item.id}" on ${item.selector}, which matches nothing in the running app. A declaration that matches nothing is not coverage.`);
    }
    if (item.alternative?.selector) {
      const alt = await page.locator(item.alternative.selector).count();
      if (alt === 0) {
        fail(where, `the non-drag alternative for "${item.id}" (${item.alternative.selector}) matches nothing in the running app`);
      }
    }
  }

  // The grip must not be reachable only by drag: it is a real button.
  const gripIsButton = await page.evaluate(() => document.querySelector('.card-grip')?.tagName === 'BUTTON');
  if (!gripIsButton) fail(where, 'the drag grip is not a button, so it cannot be reached from a keyboard');

  if (!failures.some((f) => f.startsWith(where))) pass(where, `${spec.interactions.length} declared interaction(s) match live, each with a live alternative`);
}

// ------------------------------------------------------------------- seed
//
// Seeded by DRIVING THE REAL UI, so it doubles as the primary-journey walk. If a
// form is broken, the gate cannot even set itself up — which is the correct
// failure.

async function seed(page) {
  await showView(page, 'inventory');
  await press(page, '#spool-new');
  await page.fill('#spool-f-brand', 'Polymaker');
  await page.fill('#spool-f-material', 'PLA');
  await page.fill('#spool-f-color', 'Galaxy Black');
  await page.fill('#spool-f-weight', '1000');
  await page.fill('#spool-f-cost', '22.50');
  await page.selectOption('#spool-f-status', 'open');
  await page.click('#spool-save');
  await page.waitForTimeout(180);

  await showView(page, 'models');
  await press(page, '#model-new');
  await page.fill('#model-f-name', 'Dragon egg');
  await page.fill('#model-f-designer', 'Ada Lovelace');
  await page.fill('#model-f-tags', 'articulated, gift');
  await page.click('#model-f-addsource');
  await page.click('#model-f-addlisting');
  await page.click('#model-save');
  await page.waitForTimeout(180);

  const jobs = [
    { title: 'Benchy', type: 'fun', printer: 'Prusa MK4', qty: '1', price: '' },
    { title: 'Calibration cube', type: 'wanted', printer: 'Prusa MK4', qty: '2', price: '' },
    { title: 'Dragon egg', type: 'request', printer: 'Bambu P1S', qty: '3', price: '18.00' },
  ];

  await showView(page, 'board');
  for (const job of jobs) {
    await press(page, '#job-new');
    await page.fill('#job-f-title', job.title);
    await page.selectOption('#job-f-type', job.type);
    if (job.type === 'request') await page.fill('#job-f-requester', 'Ada Lovelace');
    await page.fill('#job-f-printer', job.printer);
    await page.fill('#job-f-quantity', job.qty);
    if (job.price) await page.fill('#job-f-price', job.price);
    await page.fill('#job-f-notes', 'a note about the print');
    // Log filament on one of them, so remaining weight is a real computation.
    if (job.title === 'Dragon egg') {
      await page.click('#job-f-addlink');
      await page.fill('#job-f-links .linkrow input[type="number"]', '240');
    }
    await page.click('#job-save');
    await page.waitForTimeout(180);
  }

  const counts = await page.evaluate(() => ({
    cards: document.querySelectorAll('.card').length,
    spools: document.querySelectorAll('#inventory-list .rowcard').length,
    models: document.querySelectorAll('#models-list .rowcard').length,
  }));
  if (counts.cards !== 3) fail('seed', `expected 3 job cards after using the form, got ${counts.cards} — the job form does not work`);
  if (counts.spools !== 1) fail('seed', `expected 1 spool, got ${counts.spools} — the spool form does not work`);

  // THREE, AND THE ARITHMETIC IS THE CHECK. One model was entered directly. Three
  // jobs followed, and the Model box fills from the title, so "Benchy" and
  // "Calibration cube" each made one — while "Dragon egg" MATCHED the model
  // already there rather than making a twin. 1 + 2 = 3, and a 4 means matching by
  // name broke. A bare "expected 3" would go stale the moment the seed changed and
  // would be a number nobody could check.
  if (counts.models !== 3) {
    fail('seed', `expected 3 models — 1 entered directly plus 2 created by jobs named after models that did not exist, with "Dragon egg" matching the existing one — got ${counts.models}`);
  } else {
    pass('seed', 'a job names its model and the model appears: 1 entered + 2 made by jobs, with the repeated name matching rather than duplicating');
  }

  // The computed number, checked against arithmetic the gate does itself.
  await showView(page, 'inventory');
  const remaining = await page.evaluate(() => document.querySelector('#inventory-list .remaining')?.textContent || '');
  if (!/760\s*g/.test(remaining)) {
    fail('seed', `remaining weight reads "${remaining}" — 1000g total minus 240g logged should be 760 g`);
  } else {
    pass('derived', 'remaining weight is 760 g from 1000 total minus 240 logged, computed rather than stored');
  }
}

// ------------------------------------------------------------------- main

async function main() {
  const { server, url } = await serve(0, {
    extra: { '/__axe.js': { body: AXE, type: 'text/javascript; charset=utf-8' } },
  });
  const browser = await chromium.launch({
    ...(existsSync(BROWSER) ? { executablePath: BROWSER } : {}),
    args: ['--no-sandbox'],
  });

  checkSurfaceCoverage();

  const context = await browser.newContext({
    viewport: VIEWPORTS[0],
    deviceScaleFactor: 2,
    hasTouch: true,
  });
  const page = await context.newPage();

  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error') pageErrors.push(`console: ${message.text()}`);
  });

  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForSelector('#version-stamp');

  // The version stamp is written at BOOT, not when a panel opens. Checked before
  // anything else touches the page, because that is the claim.
  const stamp = await page.evaluate(() => document.getElementById('version-stamp').textContent.trim());
  const declared = readFileSync(join(ROOT, 'public/app/version.js'), 'utf8').match(/VERSION\s*=\s*['"]([^'"]+)['"]/)[1];
  if (stamp !== declared) fail('version-stamp', `the app shows "${stamp}" but version.js says "${declared}"`);
  else pass('version-stamp', `written at boot, reads ${stamp}`);

  // First run comes up on a fresh profile. Check it survives, which also clears it.
  await checkFirstRunSurvives(page);
  await closeEverything(page);

  await seed(page);
  await checkPressing(page);
  await checkInteractionSelectors(page);
  await checkInfoSurface(page);
  await checkDiagnosticPrivacy(page);

  for (const state of STATES) {
    for (const theme of THEMES) {
      await page.emulateMedia({ colorScheme: theme });
      for (const viewport of VIEWPORTS) {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await closeEverything(page);
        await state.enter(page);
        await page.waitForTimeout(80);
        await measureState(page, state, theme, viewport);
        await state.leave?.(page);
      }
    }
    // Dismissal is checked once per state, at the narrow viewport, where a way
    // out is most likely to have scrolled off.
    await page.setViewportSize(VIEWPORTS[1]);
    await closeEverything(page);
    await state.enter(page);
    await checkDismiss(page, state);
    await state.leave?.(page);
  }

  await page.setViewportSize(VIEWPORTS[0]);
  await checkOutcome(page);

  for (const error of pageErrors) fail('page', error);

  await browser.close();
  server.close();

  // ---------------------------------------------------------------- report
  if (VERBOSE) {
    for (const p of passes) console.log(`  ok   ${p}`);
  }
  if (exemptions.length) {
    console.log(`\nEXEMPTED (${exemptions.length}) — SC 2.5.8 inline-in-a-sentence, reported, never silent`);
    for (const e of exemptions) console.log(`  ${e}`);
  }

  if (failures.length) {
    console.error(`\naccessibility gate: FAIL — ${failures.length} problem(s)\n`);
    for (const f of failures) console.error(`  ${f}`);
    process.exit(1);
  }

  const stateCount = STATES.length * THEMES.length * VIEWPORTS.length;
  console.log(`\naccessibility gate: pass`);
  console.log(`  ${STATES.length} states x ${THEMES.length} themes x ${VIEWPORTS.length} viewports = ${stateCount} measurements`);
  console.log(`  ${passes.length} assertion(s) green, ${exemptions.length} exemption(s) printed`);
}

main().catch((error) => {
  console.error('accessibility gate: could not run.');
  console.error(error);
  process.exit(2);
});
