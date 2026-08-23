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
import { makePng } from './png.mjs';
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
const viaLabels = new Set();
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
  // TWO SPANS, NOT THE BUTTON. Since 1.1.0 the last-export line is a control in
  // two parts — the sentence in --text-3 and the "Keep a copy" action in --text-2
  // — and neither colour is on the button itself. Measuring `.lastexport` would
  // have measured a container holding no text of its own and reported the pair as
  // covered, which is the exact shape of the chip fill that shipped at 1.63:1.
  '.lastexport-state',
  '.lastexport-go',
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
    '.badge-ordered',
    '.badge-request',
    '.badge-wanted',
    '.badge-fun',
    '.card-grip',
    '.card-source',
    '.card-model',
  ],
  inventory: [...BASE_TEXT, '.rowcard-title', '.rowcard-sub', '.remaining', '.note'],
  models: [...BASE_TEXT, '.rowcard-title', '.rowcard-sub', '.remaining'],
  'update-stuck': [...BASE_TEXT, '.strip-text'],
  // The Undo button in both of its appearances. It is one element with one set of
  // colours at a time, so the unavailable form needs a state of its own or it
  // ships unmeasured — which is what a `.btn[aria-disabled]` rule quietly is
  // until something looks at it on screen.
  undo: [...BASE_TEXT, '#undo-do'],
  'undo-empty': [...BASE_TEXT, '#undo-do'],
  firstrun: ['#dlg-firstrun h2', '#dlg-firstrun p', '#dlg-firstrun li', '#dlg-firstrun .btn', '.panel-foot-note'],
  // THE (i) IS SIX STATES, NOT ONE. It was a single scroll until 1.1.0; it is now
  // a menu and five destinations, and only one of them is on screen at a time.
  // Measuring the panel once would measure whichever screen happened to be
  // showing and report the other five as covered — the same shape as the disabled
  // Undo button, one level up. Every destination gets its own state or it ships
  // unmeasured, and `checkInfoMenu` refuses a section that no state reaches.
  info: ['#dlg-info h2', '#dlg-info .info-item-title', '#dlg-info .info-item-note'],
  'info-about': ['#dlg-info h2', '#dlg-info h3', '#dlg-info p', '#dlg-info li'],
  'info-changed': ['#dlg-info h2', '#dlg-info p', '#dlg-info li', '#dlg-info .release-head'],
  // No `li` here: this destination is prose and two buttons. The registry fails on
  // a selector that matches nothing, which is what caught it — a list that stops
  // existing takes its own contrast measurement with it, silently, otherwise.
  'info-data': ['#dlg-info h2', '#dlg-info h3', '#dlg-info p', '#dlg-info .btn'],
  'info-wrong': ['#dlg-info h2', '#dlg-info h3', '#dlg-info p', '#dlg-info .btn', '#dlg-info .note'],
  'info-legal': ['#dlg-info h2', '#dlg-info li', '#dlg-info a'],
  diagnostic: ['#dlg-diagnostic h2', '#dlg-diagnostic p', '#dlg-diagnostic .diag-text'],
  // `.note` is the Model box's hint, which is ALWAYS on screen — that is what
  // makes it registerable. It shares the class with #job-f-nospools, which is
  // hidden once a spool exists and so is filtered out before measuring.
  job: ['#dlg-job h2', '#dlg-job label', '#dlg-job legend', '#dlg-job .note', '#dlg-job .btn',
        '#dlg-job .typeopt-label', '#dlg-job .typeopt-note'],
  // The EDIT form, which is a different surface from the add form by exactly one
  // control: Delete. That button was registered against the add form and matched
  // for the wrong reason — `.btn` sets `display: inline-flex`, which outbid the UA
  // rule for `hidden`, so Delete was on screen while adding a job that did not
  // exist yet. Fixing `hidden` made the selector match nothing, which is how this
  // was found.
  'job-edit': ['#dlg-job h2', '#dlg-job label', '#dlg-job .note', '#dlg-job .btn', '#dlg-job .btn-danger'],
  // The same form with the Model box holding a name that is not in the models, so
  // the save-this-as-a-model tick is on screen. It is hidden in every other state,
  // which is exactly why it needs one of its own.
  'job-newmodel': ['#dlg-job h2', '#dlg-job label', '#dlg-job legend', '#dlg-job .note', '#dlg-job .btn',
                   '#dlg-job .typeopt-label', '#dlg-job .typeopt-note'],
  spool: ['#dlg-spool h2', '#dlg-spool label', '#dlg-spool .btn', '#dlg-spool .note'],
  model: ['#dlg-model h2', '#dlg-model label', '#dlg-model legend', '#dlg-model .btn'],
  move: ['#dlg-move h2', '#dlg-move p', '#dlg-move h3', '#dlg-move .btn'],
  confirm: ['#dlg-confirm h2', '#dlg-confirm p', '#dlg-confirm .btn', '#dlg-confirm .btn-danger'],
  import: ['#dlg-import h2', '#dlg-import p', '#dlg-import label', '#dlg-import .btn'],
};

const STATE_NONTEXT = {
  board: ['.btn', '.iconbtn', '.chip', '.card', '.column', '.card-grip', '.column-toggle', '.card-source', '.card-model'],
  inventory: ['.btn', '.rowcard', 'select', 'input[type="checkbox"]', '.bar'],
  models: ['.btn', '.rowcard'],
  'update-stuck': ['.strip', '.btn'],
  undo: ['.btn', '.iconbtn'],
  'undo-empty': ['.btn', '.iconbtn'],
  firstrun: ['#dlg-firstrun .btn', '#dlg-firstrun .iconbtn'],
  info: ['#dlg-info .info-item', '#dlg-info .iconbtn'],
  'info-about': ['#dlg-info .iconbtn'],
  'info-changed': ['#dlg-info .iconbtn'],
  'info-data': ['#dlg-info .btn', '#dlg-info .iconbtn'],
  'info-wrong': ['#dlg-info .btn', '#dlg-info .iconbtn'],
  'info-legal': ['#dlg-info .iconbtn'],
  diagnostic: ['#dlg-diagnostic .btn', '#dlg-diagnostic .diag-text'],
  // No .fieldset here on purpose: a fieldset is a grouping named by its <legend>,
  // which is text, so its border carries no information a reader needs to
  // identify a component. It is drawn with --hairline, which the palette spec
  // exempts as decoration.
  job: ['#dlg-job input[type="text"]', '#dlg-job input[type="url"]', '#dlg-job select', '#dlg-job textarea', '#dlg-job .btn', '#dlg-job input[list]', '#dlg-job .typeopt'],
  'job-newmodel': ['#dlg-job input[type="text"]', '#dlg-job select', '#dlg-job textarea', '#dlg-job .btn', '#dlg-job input[type="checkbox"]'],
  'job-edit': ['#dlg-job input[type="text"]', '#dlg-job select', '#dlg-job .btn', '#dlg-job .btn-danger'],
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
    // forms, so by the time this runs the button is genuinely live and carrying a
    // real label. Setting the attribute here instead would prove the button
    // renders and prove nothing about whether anything ever enables it — and being
    // wired to nothing is this control's whole failure mode.
    enter: async (p) => {
      await showView(p, 'board');
      const found = await p.evaluate(() => {
        const b = document.getElementById('undo-do');
        return {
          inChrome: Boolean(b.closest('.topbar')),
          disabledAttr: b.disabled,
          ariaDisabled: b.getAttribute('aria-disabled'),
          label: b.textContent.trim(),
          name: b.getAttribute('aria-label'),
          title: b.title,
        };
      });
      // WHERE IT RENDERS, not only that it exists. It was a band across the page
      // until 0.7.2 and the reason it is not one now is that a band is the wrong
      // form for it — a check that only asks "is there an Undo control" passes
      // just as happily on the thing that was removed.
      if (!found.inChrome) {
        fail('undo', 'the Undo button is not inside the topbar — it belongs in the app\'s own chrome, not in a band across the page');
      } else if (found.disabledAttr) {
        fail('undo', 'the Undo button carries the `disabled` attribute, which drops it from tabbing and from a screen reader\'s list of controls — it must use aria-disabled so a reader can find it before they need it');
      } else if (found.ariaDisabled !== 'false') {
        fail('undo', 'the Undo button still says aria-disabled after the seed made five changes through the forms, so nothing offers the reader a way back');
      } else if (!found.name?.startsWith(found.label)) {
        fail('undo', `the Undo button's accessible name is "${found.name}", which does not begin with its visible word "${found.label}" (SC 2.5.3)`);
      } else if (found.name === found.label || found.title !== found.name) {
        fail('undo', `the Undo button's name is "${found.name}" and its title is "${found.title}" — the name has to say WHAT would come back, and the title has to say the same thing`);
      } else {
        pass('undo', `the button names its last change: "${found.name}"`);
      }
    },
  },
  { name: 'firstrun', surface: 'dlg-firstrun', enter: async (p) => openFirstRun(p) },
  { name: 'info', surface: 'dlg-info', enter: async (p) => press(p, '#info-open') },
  // One per destination. `enterInfoSection` presses the (i) and then the menu
  // item that names the section, so a section unreachable from the menu fails
  // here as a missing button rather than passing as an unvisited div.
  { name: 'info-about', surface: 'dlg-info', enter: async (p) => enterInfoSection(p, 'info-sec-about') },
  { name: 'info-changed', surface: 'dlg-info', enter: async (p) => enterInfoSection(p, 'info-sec-changed') },
  { name: 'info-data', surface: 'dlg-info', enter: async (p) => enterInfoSection(p, 'info-sec-data') },
  { name: 'info-wrong', surface: 'dlg-info', enter: async (p) => enterInfoSection(p, 'info-sec-wrong') },
  { name: 'info-legal', surface: 'dlg-info', enter: async (p) => enterInfoSection(p, 'info-sec-legal') },
  { name: 'diagnostic', surface: 'dlg-diagnostic', enter: async (p) => press(p, '#diag-open') },
  { name: 'job', surface: 'dlg-job', enter: async (p) => { await showView(p, 'board'); await press(p, '#job-new'); } },
  {
    name: 'job-newmodel',
    surface: 'dlg-job',
    // A tick box that is only ever on screen for a name the models do not have.
    // Reached the way a reader reaches it — by typing a title, which fills the
    // Model box — rather than by unhiding the field, so this proves the route as
    // well as the pixels.
    enter: async (p) => {
      await showView(p, 'board');
      await press(p, '#job-new');
      await p.fill('#job-f-title', 'Something not in the models');
      await p.waitForTimeout(60);
      const shown = await p.evaluate(() => ({
        hidden: document.getElementById('job-f-model-save-field').hidden,
        checked: document.getElementById('job-f-model-save').checked,
        hint: document.getElementById('job-f-model-hint').textContent,
      }));
      if (shown.hidden) {
        fail('job-newmodel', 'typing a name the models do not have left the save-this-as-a-model tick hidden, so there is no way to decline it but to clear the box');
      } else if (!shown.checked) {
        fail('job-newmodel', 'the save-this-as-a-model tick defaults to off, which makes the ordinary case the one that needs a press');
      } else if (!/will be added/.test(shown.hint)) {
        fail('job-newmodel', `the hint reads "${shown.hint}" while the tick is on`);
      } else {
        pass('job-newmodel', 'a new name shows the tick, on by default, and the hint agrees with it');
      }
    },
  },
  {
    name: 'job-edit',
    surface: 'dlg-job',
    // Opened from a card, which is the only route that shows Delete.
    enter: async (p) => {
      await showView(p, 'board');
      await press(p, '.card .card-open');
      const del = await p.evaluate(() => {
        const button = document.getElementById('job-delete');
        return { hidden: button.hidden, shown: button.checkVisibility ? button.checkVisibility() : true };
      });
      if (del.hidden || !del.shown) {
        fail('job-edit', 'the edit form has no visible Delete, so the add form and the edit form are the same surface and one of them is wrong');
      } else {
        pass('job-edit', 'editing an existing job shows Delete; adding one does not');
      }
    },
  },
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
  // Import moved behind the (i) in 1.1.0, so the state walks the real route.
  { name: 'import', surface: 'dlg-import', enter: async (p) => { await enterInfoSection(p, 'info-sec-data'); await press(p, '#import-open'); } },
  {
    name: 'undo-empty',
    surface: null,
    // THE UNAVAILABLE APPEARANCE, which is a second set of colours on the same
    // element and therefore a second thing to measure. `.btn[aria-disabled]` is
    // dimmed text and a dashed border, and until something looked at it on screen
    // it was a rule nobody had checked against the floors in either theme.
    //
    // REACHED BY RELOADING, which is the app's own behaviour rather than a pose.
    // The undo journal is in memory and nothing else is: closing the app or
    // reloading it starts again with nothing to undo and every record intact.
    // That is a documented limit of undo, so this is a state a reader genuinely
    // meets — every session begins in it.
    //
    // THE FIRST VERSION UNDID EVERYTHING INSTEAD, by pressing the button until it
    // went quiet. Honest, and it emptied the database: the card-shape check and
    // the 320px outcome question run after the state loop, found no cards, and
    // reported the app as broken. Re-seeding afterwards produced a second failure,
    // because the seed is not idempotent. **Reaching a state must not cost the
    // states around it** — and "put it last" was not the fix, because there is
    // always work after the last thing in a list.
    enter: async (p) => {
      await p.reload({ waitUntil: 'networkidle' });
      await p.waitForSelector('#version-stamp');
      await showView(p, 'board');
      const found = await p.evaluate(() => {
        const b = document.getElementById('undo-do');
        return {
          present: Boolean(b),
          visible: Boolean(b && b.getClientRects().length),
          off: b?.getAttribute('aria-disabled'),
          name: b?.getAttribute('aria-label'),
          focusable: b?.tabIndex >= 0 && !b.disabled,
        };
      });
      if (!found.present || !found.visible) {
        fail('undo-empty', 'the Undo button is not on screen once there is nothing to undo — it has to stay, or a reader cannot tell the app can undo before they need it');
      } else if (found.off !== 'true') {
        fail('undo-empty', 'the app was reloaded, which empties the undo journal, and the Undo button still says it can act');
      } else if (!found.focusable) {
        fail('undo-empty', 'the unavailable Undo button cannot be focused, so a reader tabbing through the chrome never meets it');
      } else if (!/nothing/i.test(found.name || '')) {
        fail('undo-empty', `the unavailable Undo button's name is "${found.name}", which does not say there is nothing to undo`);
      } else {
        pass('undo-empty', `it stays in the chrome, focusable, and says "${found.name}"`);
      }
    },
  },
];

// The state above RELOADS the page, which clears the in-memory undo journal for
// everything that runs after it. Nothing later needs an undo to be available, and
// keeping it last is how that stays true. A comment saying "keep this last" is the
// kind of instruction this repo has watched fail; this is the check.
if (STATES[STATES.length - 1].name !== 'undo-empty') {
  console.error('a11y: FAIL — `undo-empty` must be the LAST state. It reloads the app, which empties the undo journal for every state after it.');
  process.exit(1);
}

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

/**
 * Open the (i) and walk to one destination THE WAY A READER DOES — press the
 * menu item, rather than un-hiding the section from script.
 *
 * That difference is the whole value of this helper. Setting `hidden = false`
 * would render every section perfectly and prove nothing about whether anything
 * on screen leads to it; a section whose menu button was deleted, or whose
 * `data-info-section` no longer matches its id, would still be measured, still
 * be green, and still be unreachable in the app. Pressing the button means an
 * unreachable section fails as a missing locator.
 */
async function enterInfoSection(page, sectionId) {
  await closeEverything(page);
  await press(page, '#info-open');
  await press(page, `#dlg-info .info-item[data-info-section="${sectionId}"]`);
}

// ---------------------------------------------------------- in-page checks
//
// The code that runs inside the page lives in tools/page-helpers.mjs, because
// tools/status-check.mjs needs the same contrast machinery and importing it from
// HERE would run this whole gate — main() is called at module load. See that
// file for why contrast is computed rather than taken from axe.
import { PAGE_HELPERS } from './page-helpers.mjs';

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

      const out = { text: [], nonText: [], targets: [], spacing: [], structure: [], exempt: [], viaLabel: [], names: [] };
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

        /* A CONTROL INSIDE ITS OWN <label> IS PRESSED BY PRESSING THE LABEL, so
         * the label is the target and the label is what gets measured. That is a
         * fact about the DOM rather than a waiver, and it is narrow: `.field-check`
         * puts its checkbox BESIDE a `<label for>` rather than inside one, so it
         * is unaffected and still has to be its own 44px square. Every use is
         * printed, so this can never become an invisible hole.
         *
         * Without it the gate reported three 18px radios in a chip-shaped control
         * whose pressable area is the 44px pill around each of them — a failure
         * about the wrong element, which is the kind that gets "fixed" by making
         * the visible design worse. */
        const wrapper = el.closest('label');
        const viaLabel = Boolean(wrapper) && wrapper !== el;
        const box = viaLabel ? wrapper : el;
        if (viaLabel) out.viaLabel.push(`${describe(el)} inside ${describe(wrapper)}`);

        const r = clippedRect(box);
        const label = (el.tagName === 'BUTTON' || el.tagName === 'A' ? visibleWords(el) : '') || '';
        const aria = el.getAttribute('aria-label');

        // Size is measured on the control's OWN rect; clipping is only used for
        // spacing below. A card scrolled off the side of the board is clipped to
        // zero width and is still a 44px control the moment it scrolls in —
        // measuring size against the clip reports every off-screen control as
        // 0x44 and buries the real failures.
        const own = box.getBoundingClientRect();

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
  // Printed rather than silent, on the same principle as the SC 2.5.8 exemptions:
  // a measurement taken on something other than the element named has to say so.
  for (const v of result.viaLabel || []) viaLabels.add(`${where}: ${v}`);
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

  // The eight things behind it.
  //
  // `textContent`, NOT `innerText`, and that is not a detail. Since 1.1.0 only one
  // destination is on screen at a time, so `innerText` — which is what is
  // RENDERED — returns the menu and nothing else. This check would have gone red
  // on five items that are all present and one press away, and the obvious way to
  // make it green again is to stop hiding the sections, which is to undo the
  // release. What §7e asks is whether the panel CARRIES these things, and
  // `textContent` is the question that asks that. Reachability is a separate
  // assertion with a separate failure message, in `checkInfoMenu` below.
  await press(page, '#info-open');
  const contents = await page.evaluate(() => {
    const panel = document.getElementById('dlg-info');
    const text = panel.textContent;
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
      // The MENU's height, which is what a reader meets on opening it. The old
      // number measured one scroll of everything, and bounding that is what this
      // was for; bounding the menu is the same intent one level up, and a menu
      // that needs scrolling is a menu with too many destinations in it.
      height: Math.round(document.getElementById('info-menu').scrollHeight),
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
  // Bounded, so it cannot become the app. The bound is now on the MENU rather
  // than on the sum of the prose: an (i) becomes a manual by growing chapters,
  // and chapters are visible here as destinations. 900px is roughly five items
  // and no scroll on a phone.
  if (contents.height > 900) fail(where, `the (i) menu is ${contents.height}px — that is more destinations than a reader will read. Merge two, do not shrink the type.`);
  if (!failures.some((f) => f.startsWith(where))) pass(where, `(i) control in the chrome, all eight items behind it, a ${contents.height}px menu`);

  await closeEverything(page);
}

/**
 * The menu and its destinations agree, in both directions.
 *
 * WHY THIS IS HAND-WRITTEN. Until 1.1.0 the panel was one document, and the check
 * that no screen could ship unmeasured came for free: the surface list is derived
 * from `<dialog id>` in the markup, so a new screen without a state failed the
 * build. Five destinations inside ONE dialog are invisible to that derivation —
 * they are divs. So the assertion it was making has to be re-made by hand, or the
 * release quietly removes a gate while adding the thing the gate was for.
 *
 * Both directions, because each catches a different accident. A section with no
 * menu item is content nobody can reach. A menu item pointing at a section that
 * does not exist is a button that does nothing, which is worse than a missing one
 * — it answers "is this handled" with yes.
 */
async function checkInfoMenu(page) {
  const where = 'info-menu';
  await closeEverything(page);
  await press(page, '#info-open');

  const report = await page.evaluate(() => {
    const panel = document.getElementById('dlg-info');
    const items = [...panel.querySelectorAll('.info-item')];
    const sections = [...panel.querySelectorAll('.info-section')];
    const targeted = items.map((b) => b.dataset.infoSection);
    return {
      itemCount: items.length,
      menuVisible: !document.getElementById('info-menu').hidden,
      backHiddenOnMenu: document.getElementById('info-back').hidden === true,
      // A destination whose button names an id that is not in the panel.
      danglingItems: targeted.filter((id) => !panel.querySelector(`#${CSS.escape(id)}.info-section`)),
      // A destination nothing leads to.
      orphanSections: sections.map((s) => s.id).filter((id) => !targeted.includes(id)),
      // Two buttons on one destination: one of them is dead weight and the reader
      // cannot tell which.
      duplicates: targeted.filter((id, i) => targeted.indexOf(id) !== i),
      // Every destination says what it is before it is opened. "Your data" alone
      // does not tell a stranger their export lives behind it.
      untitled: items.filter((b) => !b.querySelector('.info-item-title')?.textContent.trim()).length,
      undescribed: items.filter((b) => !b.querySelector('.info-item-note')?.textContent.trim()).length,
      // Each section carries the name the head will announce when it opens.
      unnamed: sections.filter((s) => !(s.dataset.infoTitle || '').trim()).map((s) => s.id),
      // Nothing is on screen twice.
      shownAtOnce: sections.filter((s) => !s.hidden).map((s) => s.id),
    };
  });

  if (!report.menuVisible) fail(where, 'opening the (i) does not land on the menu — a panel that reopens wherever it was last left has a first screen nobody chose');
  if (!report.backHiddenOnMenu) fail(where, 'the back button is on screen at the top level, where it either does nothing or closes the panel');
  if (report.shownAtOnce.length) fail(where, `${report.shownAtOnce.join(', ')} is on screen beside the menu — one destination at a time, or the menu is a table of contents above the document it lists`);
  for (const id of report.danglingItems) fail(where, `a menu item points at "${id}", which is not a section in the panel — a button that does nothing answers "is this handled" with yes`);
  for (const id of report.orphanSections) fail(where, `the section "${id}" is in the panel and no menu item reaches it, so it would ship unmeasured and unread. Add an item in the same commit as the section.`);
  for (const id of report.duplicates) fail(where, `two menu items point at "${id}" — one of them is dead weight and the reader cannot tell which`);
  for (const id of report.unnamed) fail(where, `the section "${id}" has no data-info-title, so the panel would keep announcing "About print-tracker" while showing it`);
  if (report.untitled) fail(where, `${report.untitled} menu item(s) have no title`);
  if (report.undescribed) fail(where, `${report.undescribed} menu item(s) have no sentence saying what is behind them`);
  if (report.itemCount < 2) fail(where, 'there is no menu behind the (i)');

  // AND THE BACK ROUTE WORKS, pressed rather than assumed. A section with no way
  // back is a dead end inside a modal, and the only exit left is the one that
  // throws away the reader's place entirely.
  if (!report.danglingItems.length && report.itemCount) {
    await press(page, '#dlg-info .info-item');
    const inSection = await page.evaluate(() => ({
      menuHidden: document.getElementById('info-menu').hidden === true,
      backShown: document.getElementById('info-back').hidden === false,
      title: document.getElementById('info-title').textContent.trim(),
      focusIsTitle: document.activeElement === document.getElementById('info-title'),
    }));
    if (!inSection.menuHidden) fail(where, 'pressing a menu item leaves the menu on screen');
    if (!inSection.backShown) fail(where, 'there is no way back from a section — a dead end inside a modal, where the only exit left throws away the reader\'s place');
    if (inSection.title === 'About print-tracker') fail(where, 'the panel keeps its top-level name inside a section, so one dialog has one name for six screens');
    if (!inSection.focusIsTitle) fail(where, 'focus does not move to the section title, so the change is rendered without being announced');

    await press(page, '#info-back');
    const backOnMenu = await page.evaluate(() => ({
      menuVisible: document.getElementById('info-menu').hidden === false,
      backHidden: document.getElementById('info-back').hidden === true,
      title: document.getElementById('info-title').textContent.trim(),
      focusOnItem: document.activeElement?.classList.contains('info-item') === true,
    }));
    if (!backOnMenu.menuVisible) fail(where, 'back does not return to the menu');
    if (!backOnMenu.backHidden) fail(where, 'the back button stays on screen after returning to the menu');
    if (backOnMenu.title !== 'About print-tracker') fail(where, `back leaves the panel titled "${backOnMenu.title}" while showing the menu`);
    if (!backOnMenu.focusOnItem) fail(where, 'back does not put focus on the item that was pressed, so the reader re-reads the list to find their place');
  }

  if (!failures.some((f) => f.startsWith(where))) {
    pass(where, `${report.itemCount} destinations, each named and described, each reachable, back returns focus`);
  }
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

/**
 * The model button goes somewhere, and somewhere RIGHT.
 *
 * A control that exists, is named, contrasts and meets the target floor can still
 * be wired to nothing — every one of those questions is about the button and none
 * is about what pressing it does. This presses it and reads where it landed.
 */
async function checkModelRoute(page) {
  await closeEverything(page);
  await showView(page, 'board');

  const named = await page.evaluate(() => {
    const button = document.querySelector('.card .card-model');
    if (!button || button.hidden) return null;
    return { text: button.textContent, name: button.getAttribute('aria-label') || '' };
  });
  if (!named) {
    fail('model-route', 'no card offers a way into the model it prints, so the only route is the Models tab and a hunt');
    return;
  }

  await press(page, '.card .card-model');
  await page.waitForTimeout(220);

  const landed = await page.evaluate(() => ({
    open: document.getElementById('dlg-model').open,
    name: document.getElementById('model-f-name').value,
    view: document.querySelector('.tab[aria-current="page"]')?.textContent,
  }));

  if (!landed.open) {
    fail('model-route', `pressing "${named.text}" did not open the model`);
  } else if (!named.name.includes(landed.name)) {
    fail('model-route', `pressing "${named.text}" opened "${landed.name}", which its accessible name "${named.name}" does not mention`);
  } else if (!named.name.includes(named.text.trim())) {
    fail('model-route', `the button reads "${named.text}" and answers to "${named.name}", which does not contain it (SC 2.5.3)`);
  } else if (landed.view !== 'Models') {
    fail('model-route', `the model opened over the ${landed.view} tab, so closing it leaves the reader somewhere they did not choose`);
  } else {
    pass('model-route', `"${named.text.trim()}" opens ${landed.name} on the Models tab, from the board`);
  }
  await closeEverything(page);
}

/**
 * The other direction: from a model in the catalog to a job that prints it.
 *
 * checkModelRoute above walks card -> model. This walks model -> job, and the two
 * are a pair: a route that only goes one way is how "creating a job from a model"
 * ends up meaning "go to the board and type the name the app already knows".
 *
 * It asserts the FILLED FORM rather than only that a panel opened, because a form
 * that opens empty is the defect this exists to catch, not a lesser version of
 * success.
 */
async function checkJobFromModel(page) {
  await closeEverything(page);
  await showView(page, 'models');

  const named = await page.evaluate(() => {
    const button = document.querySelector('.rowcard .btn-primary');
    if (!button || button.hidden) return null;
    const row = button.closest('.rowcard');
    return {
      text: button.textContent.trim(),
      label: button.getAttribute('aria-label') || '',
      model: row.querySelector('.rowcard-title')?.textContent || '',
    };
  });
  if (!named) {
    fail('job-from-model', 'no model offers a way to start a job printing it, so the catalog can be read and not acted on');
    return;
  }

  await press(page, '.rowcard .btn-primary');
  await page.waitForTimeout(240);

  const landed = await page.evaluate(() => ({
    open: document.getElementById('dlg-job').open,
    title: document.getElementById('job-f-title').value,
    model: document.getElementById('job-f-model').value,
    view: document.querySelector('.tab[aria-current="page"]')?.textContent,
  }));

  if (!landed.open) {
    fail('job-from-model', `pressing "${named.text}" did not open the job form`);
  } else if (landed.model !== named.model) {
    fail('job-from-model', `the job form opened with model "${landed.model}" rather than "${named.model}"`);
  } else if (!landed.title) {
    fail('job-from-model', `the job form opened with an empty title, so the name the app already knew has to be typed anyway`);
  } else if (!named.label.includes(named.text)) {
    fail('job-from-model', `the button reads "${named.text}" and answers to "${named.label}", which does not contain it (SC 2.5.3)`);
  } else if (!named.label.includes(named.model)) {
    fail('job-from-model', `"${named.label}" does not say which model, so every one of these sounds identical`);
  } else if (landed.view !== 'Board') {
    fail('job-from-model', `the job form opened over the ${landed.view} tab, so saving leaves the reader away from the new card`);
  } else {
    pass('job-from-model', `"${named.text}" opens a job already titled ${landed.title}, on the Board, from the catalog`);
  }
  await closeEverything(page);
}

/**
 * The Title and Model boxes fill each other, in BOTH directions.
 *
 * One direction shipped and the other did not, for three releases, and nothing
 * here noticed — because every assertion was about a control existing, being
 * named, being reachable and contrasting, and none about two halves of a mirror
 * being the same size.
 */
async function checkNameMirror(page) {
  await closeEverything(page);
  await showView(page, 'board');

  const existing = await page.evaluate(() => document.querySelector('#job-f-model-options option')?.value || '');
  await press(page, '#job-new');
  await page.waitForTimeout(200);

  // Title -> Model, the direction that always worked.
  await page.fill('#job-f-title', 'Widget stand');
  await page.waitForTimeout(120);
  const forward = await page.inputValue('#job-f-model');
  if (forward !== 'Widget stand') {
    fail('name-mirror', `typing a title left the Model box reading "${forward}"`);
  } else {
    pass('name-mirror', 'a typed title fills the Model box');
  }

  // Model -> Title, on a fresh form, in the case that matters: a model that exists.
  await closeEverything(page);
  await press(page, '#job-new');
  await page.waitForTimeout(200);
  if (!existing) {
    fail('name-mirror', 'no model exists in the seed, so the direction that was broken cannot be measured');
    await closeEverything(page);
    return;
  }
  // Lower-cased on purpose: the title must come back spelled the way the MODEL is.
  await page.fill('#job-f-model', existing.toLowerCase());
  await page.waitForTimeout(140);
  const back = await page.inputValue('#job-f-title');
  if (back !== existing) {
    fail('name-mirror', `naming the model "${existing.toLowerCase()}" left the title reading "${back}" rather than "${existing}"`);
  } else {
    pass('name-mirror', `naming an existing model fills the title with its own spelling, "${existing}"`);
  }

  // And the picture field says where a picture would be kept, on the same screen.
  const hint = await page.evaluate(() => document.getElementById('job-f-picture-hint')?.textContent?.trim() || '');
  const hasField = await page.evaluate(() => Boolean(document.querySelector('#job-f-picture .pic-zone')));
  if (!hasField) {
    fail('name-mirror', 'the job form has no picture field, so a picture still needs a second trip to Models');
  } else if (!hint.includes(existing)) {
    fail('name-mirror', `the picture hint reads "${hint}", which does not say which record keeps it`);
  } else {
    pass('name-mirror', `a picture can be added here, and it says where it goes: "${hint}"`);
  }
  await closeEverything(page);
}

/**
 * The three job types explain themselves, and every list of them agrees.
 *
 * THE LEGEND MUST BE A QUESTION. It said "Type", which is not one, so three words
 * sat under it as categories with rules a reader had to invent.
 *
 * AND THE AXIS HAS TO BE REAL. Under the old wording `wanted` and `fun` behaved
 * identically — same everything, a different word and colour on a badge — so
 * choosing between them was a decision with no consequence, which is exactly what
 * it felt like. `wanted` is now "Gift": for someone else who did not ask, and it
 * carries their name like `request` does. That is what makes it a category rather
 * than a shade, so the check is BEHAVIOURAL: every type that claims a recipient
 * must actually show the field, and the one that does not must not.
 *
 * THE LABELS LIVE IN THREE PLACES. `derive.js` names them for the badge; the form
 * names them again; the filter chips a third time. The first version of this check
 * compared the form against the chips — both in index.html — and passed happily
 * while derive.js said something else entirely, which is the badge and the filter
 * disagreeing about the same job. It now reads derive.js FROM THE PAGE, so all
 * three are held to each other.
 */
/**
 * The printer box: absent in Research, and a list of what this board already uses.
 *
 * BOTH HALVES ARE THE POINT. Hiding it in Research is what stops the form asking a
 * question a research job has no answer to; the list is what stops the same
 * printer being typed on every job after that. Neither is visible to a contrast or
 * a target check, so without this they are two behaviours nothing measures.
 */
/**
 * The filter chips say which types are shown, and say it in more than a hue.
 *
 * They were ticks until 0.8.1. A tick is unambiguous and asks the reader to READ a
 * mark; a lit button is seen. The risk in the swap is the obvious one — if the
 * only difference between on and off is which accent the text is, then greyscale,
 * colour blindness and a phone in sunlight all lose the answer.
 *
 * So this asserts the FILL differs, which is the cue that survives all three, and
 * that `aria-pressed` still carries the state to anything not looking at pixels.
 */
/**
 * The orientation names every job type the app actually has.
 *
 * WHY THIS IS A GATE. 0.8.0 added a fourth type and left this text saying "Asked,
 * Gift and Fun" and "any of the three" — the app's own welcome telling a reader
 * there were three categories while the form offered four. It shipped, and it was
 * found by reading the panel rather than by anything failing.
 *
 * Prose cannot be held to code in general. This much can: every label in TYPES is
 * a word that must appear in the text that explains the types, and a number-word
 * that contradicts the count is a sentence nobody updated. It is the cheap half of
 * a real problem, and the cheap half is what caught nothing before.
 */
async function checkOrientationTypes(page) {
  const where = 'orientation';
  await closeEverything(page);
  await press(page, '#info-open');
  await page.waitForTimeout(200);

  const seen = await page.evaluate(async () => {
    const mod = await import('/app/derive.js');
    const block = document.getElementById('info-orientation');
    return {
      labels: mod.TYPES.map((t) => t.label),
      count: mod.TYPES.length,
      present: Boolean(block),
      text: block ? block.textContent.replace(/\s+/g, ' ') : '',
    };
  });

  if (!seen.present) {
    fail(where, 'there is no orientation block — the welcome and the (i) panel share one, and it is gone');
    await closeEverything(page);
    return;
  }

  const missing = seen.labels.filter((label) => !new RegExp(`\\b${label}\\b`).test(seen.text));
  // The words that would have made the 0.8.0 sentence wrong. Only the ones BELOW
  // the real count matter: "four" reads fine in a four-type app, "three" does not.
  // NOT BEFORE A HYPHEN. The first run of this check failed on "press the
  // three-dot menu" in the install instructions — a compound, not a count of
  // anything. A gate that cries wolf on honest prose teaches people to route
  // around it, so the pattern narrows rather than the rule loosening.
  const stale = ['one', 'two', 'three', 'four', 'five']
    .slice(0, Math.max(0, seen.count - 1))
    .filter((word) => new RegExp(`\\b(the|any of the|all) ${word}\\b(?!-)`, 'i').test(seen.text));

  if (missing.length) {
    fail(where, `the welcome never names ${missing.join(' or ')} — the app offers ${seen.count} job types and its own orientation describes fewer`);
  } else if (stale.length) {
    fail(where, `the welcome says "the ${stale[0]}" of something while there are ${seen.count} job types — a count that was true before the last type was added`);
  } else {
    pass(where, `the welcome names all ${seen.count} job types: ${seen.labels.join(', ')}`);
  }

  await closeEverything(page);
}

async function checkChips(page) {
  await closeEverything(page);
  await showView(page, 'board');

  /* THE RATIO, NOT THE STRING. The first version of this asked whether the two
   * fills were DIFFERENT, and they were — as values. As light they differed by
   * 1.63:1, which no eye reads as a state change, and the check went green while
   * the app's only real cue was grey-to-colour. Inequality is not perceptibility,
   * and a gate that confuses them measures the CSS rather than the reader.
   *
   * `computedFill` walks up for the first opaque ancestor, because a transparent
   * chip's own backgroundColor is rgba(0,0,0,0) and the thing an eye compares is
   * what shows THROUGH it. */
  const read = () => page.evaluate(() => {
    const lum = (rgb) => {
      const [r, g, b] = rgb;
      const f = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const parse = (v) => (v.match(/[\d.]+/g) || []).map(Number);
    const computedFill = (el) => {
      for (let node = el; node; node = node.parentElement) {
        const c = parse(getComputedStyle(node).backgroundColor);
        if (c.length >= 3 && (c[3] === undefined || c[3] > 0)) return c.slice(0, 3);
      }
      return [255, 255, 255];
    };
    const chip = document.querySelector('.chip');
    const cs = getComputedStyle(chip);
    return {
      type: chip.dataset.type,
      pressed: chip.getAttribute('aria-pressed'),
      name: chip.textContent.trim(),
      background: cs.backgroundColor,
      fill: computedFill(chip),
      lum: lum(computedFill(chip)),
      border: cs.borderTopColor,
      width: Math.round(chip.getBoundingClientRect().width),
    };
  });

  const on = await read();
  await page.click('.chip');
  await page.waitForTimeout(160);
  const off = await read();
  const hi = Math.max(on.lum, off.lum);
  const lo = Math.min(on.lum, off.lum);
  on.fillRatio = (hi + 0.05) / (lo + 0.05);
  // Put it back, because every state after this one measures the board.
  await page.click('.chip');
  await page.waitForTimeout(160);

  // EVERY CHIP OFF IS ALLOWED, and the board says so in words.
  //
  // Refusing the last one was a guard against a confusion this app does not have:
  // there are two empty messages, and the filtered one names the filters. All the
  // guard achieved was refusing an ordinary act — clear the lot, then pick the one
  // thing you want — and a chip that will not turn off is indistinguishable from a
  // press that did not register.
  const allOff = await page.evaluate(async () => {
    for (const chip of document.querySelectorAll('.chip')) {
      if (chip.getAttribute('aria-pressed') === 'true') chip.click();
    }
    await new Promise((r) => setTimeout(r, 200));
    const lit = [...document.querySelectorAll('.chip')].filter((c) => c.getAttribute('aria-pressed') === 'true');
    const filtered = document.getElementById('board-filtered');
    const empty = document.getElementById('board-empty');
    return {
      lit: lit.length,
      cards: document.querySelectorAll('.card').length,
      saysFiltered: filtered && !filtered.hidden,
      saysEmpty: empty && !empty.hidden,
      words: filtered ? filtered.textContent.trim() : '',
    };
  });
  // Put them all back before anything else measures the board.
  await page.evaluate(async () => {
    for (const chip of document.querySelectorAll('.chip')) {
      if (chip.getAttribute('aria-pressed') === 'false') chip.click();
    }
    await new Promise((r) => setTimeout(r, 200));
  });

  if (allOff.lit !== 0) {
    fail('chips', `${allOff.lit} chip(s) refused to switch off — a control that will not act looks exactly like a press that did not register`);
  } else if (allOff.cards !== 0) {
    fail('chips', `every chip is off and ${allOff.cards} card(s) are still on the board`);
  } else if (!allOff.saysFiltered) {
    fail('chips', 'every chip is off, the board is empty, and nothing says why — which is the confusion that refusing the last chip was guarding against');
  } else if (allOff.saysEmpty) {
    fail('chips', `the board says there are no jobs when there are — the filtered message and the empty message are both showing`);
  } else {
    pass('chips', `every chip can be switched off, and the board says "${allOff.words}"`);
  }

  if (on.pressed !== 'true' || off.pressed !== 'false') {
    fail('chips', `pressing a chip took aria-pressed from "${on.pressed}" to "${off.pressed}" — the state is not being carried to anything that cannot see it`);
  } else if (on.fillRatio < 3) {
    fail('chips', `a shown chip and a hidden one differ by ${on.fillRatio.toFixed(2)}:1 in fill — under SC 1.4.11's 3:1, so the state rests on a hue change, which is the one cue a colour-blind reader does not get`);
  } else if (on.name !== off.name) {
    fail('chips', `the chip reads "${on.name}" when on and "${off.name}" when off — the name has to say which type it is either way`);
  } else if (Math.abs(on.width - off.width) > 1) {
    fail('chips', `a chip is ${on.width}px on and ${off.width}px off — it moves the chips after it under a finger already on its way`);
  } else {
    pass('chips', `on and off differ by ${on.fillRatio.toFixed(2)}:1 in fill and in aria-pressed, at the same width`);
  }

  await closeEverything(page);
}

async function checkPrinterField(page) {
  await closeEverything(page);
  await showView(page, 'board');
  await press(page, '#job-new');
  await page.waitForTimeout(160);

  await page.selectOption('#job-f-column', 'research');
  await page.waitForTimeout(100);
  if (await page.isVisible('#job-f-printer-field')) {
    fail('printer', 'a Research job is asked which printer it is on, which is a question with no answer');
  } else {
    pass('printer', 'Research does not ask which printer');
  }

  await page.selectOption('#job-f-column', 'printing');
  await page.waitForTimeout(100);
  if (!(await page.isVisible('#job-f-printer-field'))) {
    fail('printer', 'a job that is printing cannot say which printer it is on');
  } else {
    pass('printer', 'a printing job can say which printer');
  }

  // READ FROM THE JOBS, so this asserts the derivation rather than the markup: the
  // seed typed "Prusa MK4" on one job and nothing anywhere holds a list of
  // printers, so its presence here means the options were built from the board.
  const options = await page.evaluate(() =>
    [...document.querySelectorAll('#job-f-printer-options option')].map((o) => o.value));
  if (!options.includes('Prusa MK4')) {
    fail('printer', `the printer list offers ${JSON.stringify(options)} and not the printer the seed typed — it is not being read from the jobs`);
  } else {
    pass('printer', `the printer list is built from the board: ${JSON.stringify(options)}`);
  }

  await closeEverything(page);
}

async function checkJobTypes(page) {
  await closeEverything(page);
  await showView(page, 'board');
  await press(page, '#job-new');
  await page.waitForTimeout(200);

  // The module the app itself imports, rather than a second reading of the file.
  const types = await page.evaluate(async () => {
    const mod = await import('/app/derive.js');
    return mod.TYPES.map((t) => ({
      id: t.id,
      label: t.label,
      hasRecipient: Boolean(t.hasRecipient),
      hasPrice: Boolean(t.hasPrice),
    }));
  });

  const seen = await page.evaluate(() => ({
    legend: document.querySelector('#job-f-type legend')?.textContent?.trim() || '',
    options: [...document.querySelectorAll('#job-f-type .typeopt')].map((label) => ({
      value: label.querySelector('input')?.value || '',
      label: label.querySelector('.typeopt-label')?.textContent?.trim() || '',
      note: label.querySelector('.typeopt-note')?.textContent?.trim() || '',
    })),
    chips: [...document.querySelectorAll('.chips .chip')].map((chip) => ({
      value: chip.dataset.type,
      label: chip.querySelector('.chip-label')?.textContent?.trim() || '',
    })),
  }));

  if (!seen.legend.endsWith('?')) {
    fail('job-types', `the type fieldset is headed "${seen.legend}", which is not a question — words under a noun read as categories with rules to work out`);
  } else {
    pass('job-types', `the ${seen.options.length} types answer a question: "${seen.legend}"`);
  }

  const silent = seen.options.filter((o) => !o.note);
  if (silent.length) {
    fail('job-types', `${silent.map((o) => o.label).join(' and ')} say nothing about what choosing them does`);
  } else {
    pass('job-types', `all ${seen.options.length} types say what choosing them does`);
  }

  // Three lists, one word each.
  let agree = true;
  for (const type of types) {
    const option = seen.options.find((o) => o.value === type.id);
    const chip = seen.chips.find((c) => c.value === type.id);
    if (!option) { fail('job-types', `the app has a type \`${type.id}\` the form does not offer`); agree = false; }
    else if (option.label !== type.label) { fail('job-types', `\`${type.id}\` is "${type.label}" on the badge and "${option.label}" on the form`); agree = false; }
    if (!chip) { fail('job-types', `the app has a type \`${type.id}\` the filter cannot show`); agree = false; }
    else if (chip.label !== type.label) { fail('job-types', `\`${type.id}\` is "${type.label}" on the badge and "${chip.label}" in the filter`); agree = false; }
  }
  if (agree) pass('job-types', `the badge, the form and the filter use one word for each of the ${types.length} types`);

  /* THE SHAPE OF THE TABLE ITSELF, before any per-type behaviour.
   *
   * Every check below compares a flag against the form, so they all agree with
   * each other when a flag is simply GONE: set `hasPrice: false` on every type and
   * the money box disappears from the app while this gate stays green, because
   * nothing is inconsistent — it is only absent. That is the same defect as a
   * category with nothing behind it, one level up, and it is what a plant found.
   *
   * So the table is asserted to have both answers present. A recipient and a price
   * are each a real division of the types, or they are decoration. */
  const charging = types.filter((t) => t.hasPrice);
  const receiving = types.filter((t) => t.hasRecipient);
  if (!charging.length || charging.length === types.length) {
    fail('job-types', `${charging.length} of ${types.length} types carry a price — money has to divide the types or it is not a property of one`);
  } else if (!receiving.length || receiving.length === types.length) {
    fail('job-types', `${receiving.length} of ${types.length} types carry a recipient — that has to divide the types or it is not a property of one`);
  } else {
    pass('job-types', `the table divides: ${charging.length} of ${types.length} charge, ${receiving.length} of ${types.length} are for somebody else`);
  }

  // BEHAVIOURAL. A type that claims somebody to give it to has to ask who.
  for (const type of types) {
    const option = seen.options.find((o) => o.value === type.id);
    if (!option) continue;
    await page.check(`input[name="job-type"][value="${type.id}"]`);
    await page.waitForTimeout(120);
    const asks = await page.isVisible('#job-f-requester-field');
    if (type.hasRecipient && !asks) {
      fail('job-types', `"${type.label}" is for somebody else and never asks who, so it is a label with nothing behind it`);
    } else if (!type.hasRecipient && asks) {
      fail('job-types', `"${type.label}" is not for anybody else and asks who it is for anyway`);
    } else if (type.hasRecipient && !/who|name/i.test(option.note)) {
      fail('job-types', `"${type.label}" asks who it is for and its note does not mention it: "${option.note}"`);
    } else {
      pass('job-types', `"${type.label}" ${type.hasRecipient ? 'asks who it is for, and says so' : 'is for you, and asks nobody'}`);
    }

    /* THE SAME QUESTION ABOUT MONEY, and it is a separate one. `hasPrice` was
     * added because price charged sat on every job from the first release, so
     * three categories in four carried a money box that is never filled in — and
     * a form full of boxes that do not apply teaches a reader to skim the ones
     * that do. A flag nothing checks goes back to being decoration, which is
     * exactly what the type itself was before 0.7.1. */
    const charges = await page.isVisible('#job-f-price-field');
    if (type.hasPrice && !charges) {
      fail('job-types', `"${type.label}" is the type money is attached to and never asks for a price`);
    } else if (!type.hasPrice && charges) {
      fail('job-types', `"${type.label}" has no money attached and asks what was charged anyway`);
    } else {
      pass('job-types', `"${type.label}" ${type.hasPrice ? 'asks what was charged' : 'asks for no money'}`);
    }
  }

  await closeEverything(page);
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

  // A REAL PICTURE, so the board measures a real thumbnail. It never did: this
  // seed made a model with no picture, so every card the gate had ever looked at
  // was an empty one, and the placeholder that took 44% of each of them was the
  // only thing in the frame.
  await page.setInputFiles('.pic-file', {
    name: 'dragon-egg.png',
    mimeType: 'image/png',
    buffer: makePng(900, 600),
  });
  await page.waitForFunction(
    () => /Ready —/.test(document.querySelector('.pic-status')?.textContent || ''),
    null,
    { timeout: 8000 },
  );

  await page.click('#model-save');
  await page.waitForTimeout(220);

  /* ONE JOB OF EVERY TYPE, because each badge is registered for contrast and a
   * registry selector matching nothing is a FAILURE — so this list and the badge
   * registrations hold each other up, the same way the link on Benchy holds up
   * `.card-source`.
   *
   * THREE STAY IN RESEARCH WITH NO PRINTER, deliberately, and for two reasons.
   * The printer box is absent until a job leaves Research, so a seed that gave
   * every job a printer would never exercise the case the field was made
   * conditional for — and filling a hidden input throws, which is the loud half.
   * The quiet half is a card with a printer line that could never have been empty.
   *
   * Three rather than one because the reordering checks MOVE cards out of Research
   * and need some left to move; setting this to one emptied the column and three
   * assertions reported that they could not run. A seed is a fixture for every
   * check downstream of it, not only for the one being written. */
  const jobs = [
    { title: 'Benchy', type: 'fun', column: 'research', printer: '', qty: '1', price: '' },
    { title: 'Calibration cube', type: 'wanted', column: 'research', printer: '', qty: '2', price: '' },
    { title: 'Dragon egg', type: 'request', column: 'research', printer: '', qty: '3', price: '' },
    { title: 'Bolt privacy screen', type: 'ordered', column: 'staged', printer: 'Prusa MK4', qty: '1', price: '18.00' },
  ];

  const withRecipient = await page.evaluate(async () => {
    const mod = await import('/app/derive.js');
    return mod.TYPES_WITH_RECIPIENT;
  });

  await showView(page, 'board');
  for (const job of jobs) {
    await press(page, '#job-new');
    await page.fill('#job-f-title', job.title);
    await page.check(`input[name="job-type"][value="${job.type}"]`);
    // Read from the app rather than compared to an id here — `=== 'request'` in a
    // gate is the same defect as `=== 'request'` in the app, one layer removed.
    if (withRecipient.includes(job.type)) await page.fill('#job-f-requester', 'Ada Lovelace');
    // The column FIRST: it is what decides whether there is a printer box at all.
    await page.selectOption('#job-f-column', job.column);
    if (job.printer) await page.fill('#job-f-printer', job.printer);
    await page.fill('#job-f-quantity', job.qty);
    /* ASSERTED BEFORE IT IS TYPED. Filling a hidden input throws a Playwright
     * timeout from inside the seed, which reads as "the gate is broken" and buries
     * the real finding — that the type money is attached to stopped asking for it.
     * A fixture that dies on a product defect has to say which one. */
    if (job.price) {
      if (!(await page.isVisible('#job-f-price-field'))) {
        fail('seed', `"${job.title}" is an ${job.type} job and the form has no price box, so nothing on this board can carry money`);
      } else {
        await page.fill('#job-f-price', job.price);
      }
    }
    await page.fill('#job-f-notes', 'a note about the print');
    // Log filament on one of them, so remaining weight is a real computation.
    if (job.title === 'Dragon egg') {
      await page.click('#job-f-addlink');
      await page.fill('#job-f-links .linkrow input[type="number"]', '240');
    }
    // One job carries a link, so the card's source control exists to be measured.
    // Registered in STATE_NONTEXT for `board`, where a selector matching nothing
    // is a FAILURE — so this seed line and that registration hold each other up.
    if (job.title === 'Benchy') {
      await page.fill('#job-f-link', 'https://www.printables.com/model/905441-bolt-euv-2022-privacy-screen-post-replacement/files');
      await page.waitForTimeout(60);
    }
    await page.click('#job-save');
    await page.waitForTimeout(180);
  }

  const counts = await page.evaluate(() => ({
    cards: document.querySelectorAll('.card').length,
    spools: document.querySelectorAll('#inventory-list .rowcard').length,
    models: document.querySelectorAll('#models-list .rowcard').length,
  }));
  if (counts.cards !== jobs.length) fail('seed', `expected ${jobs.length} job cards after using the form, got ${counts.cards} — the job form does not work`);
  if (counts.spools !== 1) fail('seed', `expected 1 spool, got ${counts.spools} — the spool form does not work`);

  // THE ARITHMETIC IS THE CHECK. One model was entered directly. Four jobs
  // followed, and the Model box fills from the title, so every job whose title is
  // not already a model makes one — while "Dragon egg" MATCHED the model already
  // there rather than making a twin. 1 + 3 = 4, and a 5 means matching by name
  // broke. A bare "expected 4" would go stale the moment the seed changed and
  // would be a number nobody could check.
  const expectedModels = 1 + jobs.filter((j) => j.title !== 'Dragon egg').length;
  if (counts.models !== expectedModels) {
    fail('seed', `expected ${expectedModels} models — 1 entered directly plus ${expectedModels - 1} created by jobs named after models that did not exist, with "Dragon egg" matching the existing one — got ${counts.models}`);
  } else {
    pass('seed', `a job names its model and the model appears: 1 entered + ${expectedModels - 1} made by jobs, with the repeated name matching rather than duplicating`);
  }

  /* A CARD WITH NO PICTURE TAKES NO PICTURE-SIZED HOLE.
   *
   * Hub LESSONS §124: this suite asks whether a thing exists, is named, is
   * reachable, contrasts and meets the target floor — and none of that asks how
   * much room it takes. The empty placeholder measured 128px of a 291px card,
   * 44% of every card without a picture, and every gate passed for four releases.
   * It was found by rendering the board and looking at it.
   *
   * Asserted as a RELATIONSHIP rather than a number, because a number here would
   * be a snapshot that the next font change invalidates: a card carrying a
   * picture is taller than one that is not, and a card that is not shows no
   * thumbnail at all. */
  await showView(page, 'board');
  // A thumbnail's bytes come out of IndexedDB asynchronously, so a measurement
  // taken the instant the board renders reads a card whose picture has not
  // arrived — which looks exactly like a card that has no picture. Waited for
  // rather than slept through, and bounded: if it never arrives, the measurement
  // below still runs and reports the numbers rather than this hanging.
  await page.waitForFunction(() => {
    const card = Array.from(document.querySelectorAll('.card'))
      .find((c) => c.textContent.includes('Dragon egg'));
    return Boolean(card && card.querySelector('.thumb img'));
  }, null, { timeout: 4000 }).catch(() => {});

  const shapes = await page.evaluate(() => {
    const read = (needle) => {
      const card = Array.from(document.querySelectorAll('.card'))
        .find((c) => c.textContent.includes(needle));
      if (!card) return null;
      const thumb = card.querySelector('.thumb');
      const shown = Boolean(thumb) && thumb.checkVisibility
        ? thumb.checkVisibility()
        : Boolean(thumb && thumb.getBoundingClientRect().height > 0);
      return { height: Math.round(card.getBoundingClientRect().height), thumb: shown };
    };
    return { withPicture: read('Dragon egg'), without: read('Calibration cube') };
  });

  if (!shapes.withPicture || !shapes.without) {
    fail('cards', 'could not find both a pictured and an unpictured card to compare');
  } else if (shapes.without.thumb) {
    fail('cards', `a job with no picture still draws a thumbnail, so its card is ${shapes.without.height}px against ${shapes.withPicture.height}px for one that has a picture — the hole is charged to every card that will never fill it`);
  } else if (!shapes.withPicture.thumb) {
    fail('cards', 'a job whose model has a picture is not showing it');
  } else if (shapes.without.height >= shapes.withPicture.height) {
    fail('cards', `an unpictured card is ${shapes.without.height}px and a pictured one ${shapes.withPicture.height}px — the picture is costing nothing, which means it is not being drawn`);
  } else {
    pass('cards', `a card without a picture is ${shapes.without.height}px against ${shapes.withPicture.height}px with one — the space is spent only where there is something in it`);
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
  await checkModelRoute(page);
  await checkJobFromModel(page);
  await checkNameMirror(page);
  await checkJobTypes(page);
  await checkPrinterField(page);
  await checkChips(page);
  await checkOrientationTypes(page);
  await checkInteractionSelectors(page);
  await checkInfoSurface(page);
  await checkInfoMenu(page);
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
  if (viaLabels.size) {
    console.log(`\nMEASURED ON THE LABEL (${viaLabels.size}) — a control inside its own <label> is pressed by pressing the label`);
    for (const v of [...viaLabels].sort()) console.log(`  ${v}`);
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
