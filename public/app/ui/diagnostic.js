// The text diagnostic (§7f).
//
// Ask for this, never for a screenshot: a photograph of a screen loses every
// reason string and cannot show internal state at all.
//
// TWO THINGS THIS EXISTS TO CARRY, both of which are easy to leave out:
//
//   What the browser string HIDES. iPadOS Safari sends the macOS user-agent
//   verbatim — `Macintosh; Intel Mac OS X 10_15_7` — so a report that repeats it
//   confidently says "Mac" about an iPad. That is worse than an absence: it is a
//   wrong answer that looks like a fact. `maxTouchPoints` is the tell an iPad
//   says 5, a Mac says 0, and a compatibility user-agent cannot fake it.
//
//   Whether the copy running is the current one. The version at the top of this
//   report is whatever the cache served, so on its own it cannot tell "this is
//   current" from "this is what the cache still holds". The cache names and the
//   worker state are what make it readable from the other end.
//
// IT CONTAINS NOTHING THE READER WROTE. Counts, never contents. No job titles, no
// names, no notes, no spool brands. The gate asserts this against seeded data.

import { $ } from '../dom.js';
import { VERSION } from '../version.js';
import { captured } from '../errlog.js';
import * as store from '../store.js';
import { registerPanel, say } from './panels.js';

export function initDiagnostic() {
  registerPanel('dlg-diagnostic');

  $('#diag-open').addEventListener('click', async () => {
    $('#diag-text').value = await buildReport();
  });

  $('#diag-copy').addEventListener('click', async () => {
    const text = $('#diag-text').value;
    try {
      await navigator.clipboard.writeText(text);
      say('The report is on the clipboard.');
    } catch {
      // Clipboard access is refused in plenty of ordinary situations. Selecting
      // the text is a route that always works, so offer it rather than failing.
      const field = $('#diag-text');
      field.focus();
      field.select();
      say('This browser would not let the app copy it. The report is selected — copy it yourself.');
    }
  });

  $('#diag-save').addEventListener('click', () => {
    const blob = new Blob([$('#diag-text').value], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `print-tracker-diagnostic-${VERSION}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
    say('Report saved.');
  });
}

export async function buildReport() {
  const lines = [];
  const problems = [];
  const knockedOver = [];

  // --- gather, tolerating every part failing on its own -------------------
  const touchPoints = navigator.maxTouchPoints ?? 0;
  const standalone = window.matchMedia?.('(display-mode: standalone)')?.matches
    || window.navigator.standalone === true;
  const coarse = window.matchMedia?.('(pointer: coarse)')?.matches;

  let storageText = 'not reported by this browser';
  try {
    const estimate = await navigator.storage?.estimate?.();
    if (estimate) {
      storageText = `${mb(estimate.usage)} used of about ${mb(estimate.quota)} available`;
    }
  } catch (error) {
    storageText = `could not be read (${error.message})`;
  }

  let persisted = 'not asked';
  try {
    if (navigator.storage?.persisted) persisted = (await navigator.storage.persisted()) ? 'yes' : 'no';
  } catch { persisted = 'could not be read'; }

  // The Cache API is absent in some privacy modes and older WebViews, so this is
  // asked with optional chaining rather than assumed to exist.
  let cacheNames = null;
  try {
    cacheNames = await globalThis.caches?.keys();
  } catch (error) {
    problems.push(`Cache storage could not be read: ${error.message}`);
  }

  let workerState = 'no service worker support in this browser';
  let waiting = false;
  let controlled = false;
  try {
    if (navigator.serviceWorker) {
      const reg = await navigator.serviceWorker.getRegistration();
      controlled = Boolean(navigator.serviceWorker.controller);
      waiting = Boolean(reg?.waiting);
      workerState = reg
        ? `registered · controlling this page: ${controlled ? 'yes' : 'no'} · update waiting: ${waiting ? 'yes' : 'no'}`
        : 'not registered — the app will not work offline';
    }
  } catch (error) {
    workerState = `could not be read (${error.message})`;
  }

  let counts = null;
  let dbError = null;
  try {
    counts = {
      jobs: store.state.jobs.length,
      spools: store.state.spools.length,
      models: store.state.models.length,
      images: store.state.imageIds.length,
    };
  } catch (error) {
    dbError = error.message;
  }

  // --- the diagnosis, first ----------------------------------------------
  if (!navigator.serviceWorker) problems.push('This browser has no service worker support, so the app cannot work offline.');
  else if (workerState.startsWith('not registered')) problems.push('The service worker is not registered, so the app will not work offline.');
  if (!globalThis.indexedDB) problems.push('This browser has no IndexedDB. The app has nowhere to keep data.');
  if (dbError) problems.push(`The database could not be read: ${dbError}`);
  if (cacheNames && cacheNames.length && !cacheNames.some((n) => n.includes(VERSION))) {
    knockedOver.push(`No cache carries the running version (${VERSION}). This copy may be older than the one on the server.`);
  }
  if (waiting) knockedOver.push('An update is downloaded and waiting. The version above is the one still running.');
  for (const entry of captured) problems.push(`${entry.kind}: ${entry.detail}`);

  lines.push('print-tracker diagnostic');
  lines.push(`version ${VERSION}`);
  lines.push(`taken ${new Date().toISOString()}`);
  lines.push('');

  if (problems.length === 0 && knockedOver.length === 0) {
    lines.push('DIAGNOSIS: nothing is failing that this report can see.');
  } else {
    lines.push('DIAGNOSIS');
    if (problems.length) {
      lines.push('  Root causes:');
      for (const p of problems) lines.push(`    - ${p}`);
    }
    if (knockedOver.length) {
      lines.push('  Consequences of the above, not separate faults:');
      for (const k of knockedOver) lines.push(`    - ${k}`);
    }
  }
  lines.push('');

  // --- the device, including what the user-agent hides ---------------------
  lines.push('DEVICE');
  lines.push(`  maxTouchPoints        ${touchPoints}`);
  lines.push(`  pointer               ${coarse ? 'coarse (touch)' : 'fine (mouse or trackpad)'}`);
  lines.push(`  screen                ${screen.width}x${screen.height}`);
  lines.push(`  viewport              ${window.innerWidth}x${window.innerHeight}`);
  lines.push(`  devicePixelRatio      ${window.devicePixelRatio}`);
  lines.push(`  running from          ${standalone ? 'the home screen' : 'a browser tab'}`);
  lines.push(`  colour scheme         ${window.matchMedia?.('(prefers-color-scheme: dark)')?.matches ? 'dark' : 'light'}`);
  lines.push(`  reduced motion        ${window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ? 'yes' : 'no'}`);
  lines.push(`  language              ${navigator.language}`);
  lines.push(`  online                ${navigator.onLine ? 'yes' : 'no'}`);
  lines.push(`  user-agent            ${navigator.userAgent}`);
  lines.push('');
  // Labelled a guess, because it is one — see the iPadOS note at the top.
  lines.push(`  GUESS AT THE DEVICE (not a fact): ${deviceGuess(touchPoints)}`);
  lines.push('');

  lines.push('STORAGE');
  lines.push(`  indexedDB             ${globalThis.indexedDB ? 'available' : 'MISSING'}`);
  lines.push(`  space                 ${storageText}`);
  lines.push(`  storage persisted     ${persisted}`);
  lines.push('');

  lines.push('APP CACHE');
  if (cacheNames == null) lines.push('  caches                not readable in this browser or this mode');
  else if (cacheNames.length === 0) lines.push('  caches                none — nothing is cached, so the app needs the network');
  else for (const name of cacheNames) lines.push(`  cache                 ${name}`);
  lines.push(`  service worker        ${workerState}`);
  lines.push('');

  lines.push('RECORD COUNTS (counts only — no titles, names or notes are in this report)');
  if (counts) {
    lines.push(`  jobs                  ${counts.jobs}`);
    lines.push(`  spools                ${counts.spools}`);
    lines.push(`  models                ${counts.models}`);
    lines.push(`  pictures              ${counts.images}`);
    lines.push(`  last export           ${store.state.lastExportAt || 'never from this device'}`);
  } else {
    lines.push('  unavailable — the database could not be read');
  }

  return lines.join('\n');
}

function deviceGuess(touchPoints) {
  const ua = navigator.userAgent;
  const saysMac = /Macintosh/.test(ua);
  if (saysMac && touchPoints > 0) {
    return 'an iPad — the user-agent says Mac, which iPadOS Safari always does, but a Mac reports 0 touch points and this reports ' + touchPoints;
  }
  if (saysMac) return 'a Mac';
  if (/iPhone/.test(ua)) return 'an iPhone';
  if (/Android/.test(ua)) return 'an Android device';
  if (/Windows/.test(ua)) return 'a Windows PC';
  return 'not something this report can name';
}

function mb(bytes) {
  if (!Number.isFinite(bytes)) return 'an unreported amount';
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
