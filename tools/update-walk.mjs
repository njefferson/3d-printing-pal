#!/usr/bin/env node
// The stale-app walk (§7h), and the offline walk.
//
// IT DRIVES A REAL SECOND SERVICE WORKER. Serving a genuinely different sw.js and
// letting the browser's own update machinery run is the only thing that proves
// any of this: a mocked registration proves the mock works and nothing else.
//
// The four things it asserts, in the order they can go wrong:
//
//   A BRAND-NEW VISITOR IS NEVER TOLD. "A new version is ready" thirty seconds
//   into a first-ever visit is nonsense. This is the check most likely to be
//   written and still be empty — the guard has to sit on the path that actually
//   fires, and `controllerchange` is a different path from `updatefound`.
//
//   THE NEW VERSION WAITS. With the page controlled, an incoming worker must sit
//   in `waiting` rather than taking over underneath the open app, which would
//   leave old markup running against new modules.
//
//   THE READER IS TOLD, IN WORDS THEY CAN SEE, with two ways out.
//
//   PRESSING THE BUTTON ACTUALLY SWAPS IT. The cache name afterwards is the new
//   one, read from the browser rather than assumed.
//
// AND ONE ASSERTION FROM THE FAILURE SIDE. An installed app on iPadOS will not
// reliably let a waiting worker take over while the app is open — a platform
// behaviour headless Chromium does not have and cannot be made to have. Proving
// the happy path harder here proves nothing about that device, so this also
// asserts the app contains NO blind timed reload: the stuck case must tell the
// reader, never reload underneath them.

import { chromium } from 'playwright-core';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { serve } from './serve.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BROWSER = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';
const BASE_SW = readFileSync(join(ROOT, 'public/sw.js'), 'utf8');

const failures = [];
const passes = [];
const fail = (m) => failures.push(m);
const pass = (m) => passes.push(m);

/**
 * A genuinely different worker: different bytes, different cache name.
 *
 * The tags are deliberately NOT version numbers. An earlier version of this walk
 * used '0.1.1', '0.2.0', '0.3.0' — and the moment the app itself reached 0.1.1
 * the first synthetic worker became byte-identical to the real one, so the walk
 * would have been driving the browser's update machinery against a file it had no
 * reason to replace. The guard below caught it; the tags are now ones no release
 * can ever collide with.
 */
const WALK_TAGS = ['walk-a', 'walk-b', 'walk-c'];

function swAtTag(tag) {
  const next = BASE_SW.replace(/const CACHE = '[^']+';/, `const CACHE = 'print-tracker-${tag}';`);
  if (next === BASE_SW) throw new Error(`could not rewrite the cache constant for "${tag}" — the walk would be testing an identical worker, which proves nothing`);
  return next;
}

async function swState(page) {
  return page.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    return {
      controller: Boolean(navigator.serviceWorker.controller),
      waiting: Boolean(reg?.waiting),
      active: Boolean(reg?.active),
      caches: await caches.keys(),
    };
  });
}

async function stripVisible(page) {
  return page.evaluate(() => {
    const strip = document.getElementById('update-strip');
    if (!strip || strip.hidden) return null;
    const r = strip.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return null;
    return {
      text: document.getElementById('update-text').textContent.trim(),
      apply: !document.getElementById('update-apply').hidden,
      later: document.getElementById('update-later').textContent.trim(),
    };
  });
}

// -------------------------------------------------------- source assertions

/** Block and line comments, and HTML comments. The `//` rule leaves URLs alone. */
function stripComments(text) {
  return text
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
}

function sourceChecks() {
  // Read every module the app ships, not just the one that looks relevant.
  const files = [];
  (function walk(dir) {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(js|mjs|html)$/.test(entry)) files.push(full);
    }
  })(join(ROOT, 'public'));

  const source = stripComments(files.map((f) => readFileSync(f, 'utf8')).join('\n'));

  // A blind timed reload is a reload loop waiting for a false positive, and it is
  // the specific thing that must not be the answer to a stuck update.
  const timedReload = /setTimeout\([^)]*(location\.reload|location\.href\s*=)/s.test(source)
    || /setInterval\([^)]*(location\.reload|location\.href\s*=)/s.test(source);
  if (timedReload) {
    fail('the app reloads itself on a timer somewhere. A stuck update must TELL the reader, not reload underneath them — a detector that fires when it should not is a reload loop, which is worse than the stale build it fixes.');
  } else {
    pass('no timed reload anywhere in the app source');
  }

  // COMMENTS ARE STRIPPED BEFORE ANY OF THESE RUN. The first version of this
  // check went red on the comment that says this worker does NOT call
  // clients.claim() — so the only ways to green were to delete a useful comment
  // or to reword around a substring. A comment is the one string in a file
  // guaranteed to be invisible to a reader, and it must be invisible here too.
  const swCode = stripComments(BASE_SW);

  if (!/clients\.claim\(\)/.test(swCode)) {
    pass('the worker does not call clients.claim() — a first-ever visitor never gets a controllerchange that looks like an update');
  } else {
    fail('the service worker calls clients.claim(), which hands a first-ever visitor its first controller and fires controllerchange exactly like a genuine swap');
  }

  const install = swCode.match(/addEventListener\(\s*['"]install['"][\s\S]*?\n\}\);/);
  if (install && /skipWaiting/.test(install[0])) {
    fail('skipWaiting is called in the install handler, so a new worker takes over under the open page');
  } else {
    pass('no skipWaiting in the install handler — the new version waits');
  }

  if (!/updateViaCache:\s*['"]none['"]/.test(source)) {
    fail('the worker is not registered with updateViaCache: "none" — sw.js could then be served from the HTTP cache, and a bad release would have no way back');
  } else {
    pass('registered with updateViaCache: "none" — sw.js always comes from the network, which is the escape hatch');
  }
}

// ------------------------------------------------------------------- main

async function main() {
  sourceChecks();

  const overrides = {};
  const { server, url } = await serve(0, { extra: overrides });
  const browser = await chromium.launch({
    ...(existsSync(BROWSER) ? { executablePath: BROWSER } : {}),
    args: ['--no-sandbox'],
  });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();

  // ---- 1. first-ever visit ------------------------------------------------
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForSelector('#version-stamp');
  await page.waitForFunction(async () => Boolean((await navigator.serviceWorker.getRegistration())?.active), null, { timeout: 15000 });
  await page.evaluate(() => { for (const d of document.querySelectorAll('dialog[open]')) d.close(); });

  const firstVisit = await swState(page);
  if (firstVisit.controller) {
    fail('the page was already controlled on a first-ever visit, so the first-visit guard cannot be what is being tested here');
  }

  // A genuinely newer worker arrives DURING that first visit. Nothing may be said.
  overrides['/sw.js'] = { body: swAtTag(WALK_TAGS[0]), type: 'text/javascript; charset=utf-8' };
  await page.evaluate(async () => { (await navigator.serviceWorker.getRegistration())?.update(); });
  await page.waitForTimeout(1500);

  const toldOnFirstVisit = await stripVisible(page);
  if (toldOnFirstVisit) {
    fail(`a brand-new visitor was told "${toldOnFirstVisit.text}" — nonsense thirty seconds into a first-ever visit`);
  } else {
    pass('a brand-new visitor is not told about an update, even with a genuinely newer worker installing');
  }

  // ---- 2. now controlled --------------------------------------------------
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('#version-stamp');
  await page.evaluate(() => { for (const d of document.querySelectorAll('dialog[open]')) d.close(); });
  await page.waitForTimeout(400);

  const controlled = await swState(page);
  if (!controlled.controller) {
    fail('the page is still not controlled after a reload, so the rest of this walk would prove nothing');
    return finish(browser, server);
  }
  pass(`the page is controlled and holds ${controlled.caches.join(', ')}`);

  const quietWhenCurrent = await stripVisible(page);
  if (quietWhenCurrent) fail(`the update strip is showing with nothing waiting: "${quietWhenCurrent.text}"`);
  else pass('nothing is shown while the running copy is the current one');

  // ---- 2b. the status page is LIVE, not cached ----------------------------
  //
  // Keeping it out of SHELL is not enough and looks like it is: the fetch handler
  // caches everything it successfully fetches, so a single visit would pin that
  // page inside the release cache and serve it from there until the next release
  // rotated the name. A page whose whole claim is "one address, always current"
  // would then be stale for exactly as long as nobody shipped.
  //
  // Read in a SECOND tab so the walk's own page keeps the state the rest of this
  // depends on. Same origin, so the same worker sees it.
  const side = await context.newPage();
  const statusUrl = new URL('status.html', url).href;
  await side.goto(statusUrl, { waitUntil: 'networkidle' });
  await side.goto(statusUrl, { waitUntil: 'networkidle' });
  await side.close();

  const cached = await page.evaluate(async () => {
    const out = [];
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      for (const request of await cache.keys()) out.push(new URL(request.url).pathname);
    }
    return out;
  });
  const live = cached.filter((path) => path.startsWith('/status'));
  // The control: if the app itself is not in there either, this proves nothing.
  if (!cached.includes('/styles.css')) {
    fail('the app itself is not in the cache, so nothing can be concluded about what is kept out of it');
  } else if (live.length) {
    fail(`the worker cached ${live.join(' and ')} — the status page would be served from a release cache and go stale`);
  } else {
    pass('the status page was read twice and the worker kept none of it, while the app itself is cached');
  }

  // ---- 3. a real second worker -------------------------------------------
  overrides['/sw.js'] = { body: swAtTag(WALK_TAGS[1]), type: 'text/javascript; charset=utf-8' };
  await page.evaluate(async () => { (await navigator.serviceWorker.getRegistration())?.update(); });
  await page.waitForTimeout(2000);

  const afterUpdate = await swState(page);
  if (!afterUpdate.waiting) {
    fail('a genuinely newer worker did not end up WAITING — it either failed to install or took over under the open page');
  } else {
    pass('the newer worker is waiting rather than taking over under the open page');
  }

  const offer = await stripVisible(page);
  if (!offer) {
    fail('a new version is waiting and the reader is not told');
  } else {
    if (!/new(er)? version|update (is )?(ready|available)/i.test(offer.text)) {
      fail(`the strip does not say a new version is ready, in words: "${offer.text}"`);
    }
    // Say what happens to their work: that is the thing they will actually worry about.
    if (!/stay|nothing is lost|data|jobs/i.test(offer.text)) {
      fail(`the strip does not say what happens to the reader's work: "${offer.text}"`);
    }
    if (!offer.apply || !offer.later) fail('the strip does not have two ways out');
    else pass(`the reader is told, in a standing strip with two ways out: "${offer.text.slice(0, 70)}…"`);
  }

  // It is a strip in the flow, not a modal over what somebody is using.
  const isModal = await page.evaluate(() => {
    const strip = document.getElementById('update-strip');
    const cs = getComputedStyle(strip);
    return cs.position === 'fixed' || cs.position === 'absolute' || strip.tagName === 'DIALOG';
  });
  if (isModal) fail('the update indicator is positioned over the app rather than sitting in the flow');
  else pass('the indicator is a standing strip in the flow, not a modal or a toast');

  // ---- 4. "Not now" -------------------------------------------------------
  await page.click('#update-later');
  await page.waitForTimeout(300);
  if (await stripVisible(page)) fail('"Not now" did not dismiss the strip');
  else pass('"Not now" dismisses it and leaves the reader on the working old version');

  // ---- 5. the swap actually happens --------------------------------------
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('#version-stamp');
  await page.evaluate(() => { for (const d of document.querySelectorAll('dialog[open]')) d.close(); });
  await page.waitForTimeout(600);

  overrides['/sw.js'] = { body: swAtTag(WALK_TAGS[2]), type: 'text/javascript; charset=utf-8' };
  await page.evaluate(async () => { (await navigator.serviceWorker.getRegistration())?.update(); });
  await page.waitForTimeout(2000);

  if (!(await stripVisible(page))) {
    fail('no offer appeared for the second genuine update');
  } else {
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle', timeout: 20000 }).catch(() => null),
      page.click('#update-apply'),
    ]);
    await page.waitForTimeout(1200);

    const after = await swState(page);
    const expected = `print-tracker-${WALK_TAGS[2]}`;
    if (!after.caches.includes(expected)) {
      fail(`after pressing Update now the device holds ${after.caches.join(', ')} rather than ${expected} — the swap did not happen`);
    } else if (after.caches.length !== 1) {
      fail(`after the swap the device holds ${after.caches.length} caches (${after.caches.join(', ')}) — the old ones were not cleaned up`);
    } else {
      pass(`pressing Update now swapped the worker: the device now holds only ${after.caches[0]}`);
    }
  }

  // ---- 6. offline ---------------------------------------------------------
  delete overrides['/sw.js'];
  await context.setOffline(true);
  await page.reload({ waitUntil: 'load' }).catch(() => null);
  await page.waitForTimeout(800);

  const offline = await page.evaluate(() => {
    const stamp = document.getElementById('version-stamp');
    return {
      booted: Boolean(stamp && stamp.textContent.trim() && stamp.textContent.trim() !== '—'),
      version: stamp?.textContent.trim(),
      board: Boolean(document.getElementById('board')?.children.length),
      tabs: document.querySelectorAll('.tab').length,
    };
  });

  if (!offline.booted) fail('the app did not boot with the network off');
  else if (!offline.board) fail('the app booted offline but the board did not render');
  else pass(`the app boots and renders offline, showing version ${offline.version}`);

  // Writes still work with no network — the whole point of local-first.
  await page.evaluate(() => { for (const d of document.querySelectorAll('dialog[open]')) d.close(); });
  await page.waitForTimeout(200);
  await page.click('#tab-inventory');
  await page.click('#spool-new');
  await page.fill('#spool-f-material', 'PETG');
  await page.fill('#spool-f-weight', '750');
  await page.click('#spool-save');
  await page.waitForTimeout(400);
  const savedOffline = await page.evaluate(() => document.querySelectorAll('#inventory-list .rowcard').length);
  if (savedOffline < 1) fail('a spool could not be saved with the network off');
  else pass('records can still be created and read with the network off');

  await context.setOffline(false);
  return finish(browser, server);
}

async function finish(browser, server) {
  await browser.close();
  server.close();

  for (const p of passes) console.log(`  ok   ${p}`);
  if (failures.length) {
    console.error(`\nupdate walk: FAIL — ${failures.length} problem(s)\n`);
    for (const f of failures) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log('\nupdate walk: pass — driven against real second and third workers, and offline.');
}

main().catch((error) => {
  console.error('update walk: could not run.');
  console.error(error);
  process.exit(2);
});
