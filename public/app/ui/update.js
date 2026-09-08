// The stale-app indicator (§7h).
//
// An app that caches itself cannot notice it has gone stale — that is what
// caching means. Nothing errors, nothing is missing, and the version on screen is
// the old one reporting itself perfectly accurately. There is no symptom. So the
// app has to be told, and then it has to tell the reader.
//
// THE NEW VERSION WAITS. `sw.js` does not call `skipWaiting` on install, so an
// open page keeps running a consistent old app rather than a mixed one — old
// markup with new modules, which is what taking over immediately produces. The
// reader decides when to swap, and nothing else triggers it.
//
// A BRAND-NEW VISITOR IS NEVER TOLD. "A new version is ready" thirty seconds into
// a first-ever visit is nonsense. The guard is `hadControllerAtLoad` — captured
// once, at load, because "nothing has ever controlled this page" is a condition of
// the world rather than a value to pass around. It is checked on BOTH paths that
// can raise the strip, not only inside a shared decision function: elsewhere a
// gate sat on the decision function while `controllerchange` reached the reader
// down a different path, and shipped.
//
// THIS FILE CONTAINS NO TIMED RELOAD, AND MUST NOT GAIN ONE. An installed app on
// iPadOS will not reliably let a waiting worker take over while the app is open —
// a platform behaviour headless Chromium does not have and cannot be made to
// have. The honest response is to say so and let the reader close the app, not to
// reload underneath them and hope. A blind timed reload is a reload loop waiting
// for a false positive.

import { $ } from '../dom.js';
import { say } from './panels.js';
import { VERSION } from '../version.js';

const STUCK_AFTER_MS = 6000;

let hadControllerAtLoad = false;
let dismissed = false;
let accepted = false;
let stuckTimer = null;

export function initUpdates() {
  const strip = $('#update-strip');

  // §7h.6, and it is wired BEFORE the guard below rather than after it. The
  // version this device is running and the answer "this browser cannot check"
  // are both true when there is no service worker at all, and a control that
  // silently does nothing in that case is the worst of the three answers.
  $('#info-version').textContent = VERSION;
  $('#info-checkupd').addEventListener('click', checkNow);

  if (!strip || !('serviceWorker' in navigator)) return;

  // Captured once, before anything can change it.
  hadControllerAtLoad = Boolean(navigator.serviceWorker.controller);

  $('#update-later').addEventListener('click', () => {
    dismissed = true;
    hide();
    say('The update will be there next time you open the app.');
  });

  $('#update-apply').addEventListener('click', async () => {
    accepted = true;
    $('#update-apply').disabled = true;
    $('#update-text').textContent = 'Applying the update…';
    const reg = await navigator.serviceWorker.getRegistration();
    reg?.waiting?.postMessage({ type: 'SKIP_WAITING' });

    // If the swap does not happen — which is the iPadOS case — say so plainly
    // rather than reloading and hoping.
    stuckTimer = window.setTimeout(showStuck, STUCK_AFTER_MS);
  });

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // Only a swap the reader asked for reloads the page. A first-ever visit can
    // also fire this event, and it must not be treated as an update.
    if (!accepted) return;
    window.clearTimeout(stuckTimer);
    window.location.reload();
  });

  // `updateViaCache: 'none'` is the escape hatch, and it is load-bearing: it
  // guarantees sw.js itself is always fetched from the network rather than the
  // HTTP cache, so a bad release can always be replaced. Do not remove it.
  navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then((reg) => {
    // Path one: an update was already downloaded and waiting when this page loaded.
    if (reg.waiting && hadControllerAtLoad) offer();

    // Path two: one arrives while the page is open.
    reg.addEventListener('updatefound', () => {
      const incoming = reg.installing;
      if (!incoming) return;
      incoming.addEventListener('statechange', () => {
        // `installed` with a controller already present is a genuine update.
        // `installed` with no controller is the FIRST install, and says nothing.
        if (incoming.state === 'installed' && hadControllerAtLoad) offer();
      });
    });
  }).catch((error) => {
    // Registration failing is not fatal — the app runs, it just will not work
    // offline. The diagnostic reports it; the reader is not interrupted over it.
    console.error('Service worker registration failed:', error.message);
  });
}

// -------------------------------------------------------- the reader asks
//
// §7h.6. Everything else in this file is the app speaking when the browser
// happens to notice; an installed app opened rarely, or left open for days, may
// not notice at all. So there is a control, and it answers in all three cases.
//
// THE BORING ANSWER IS THE LOAD-BEARING ONE. "You are on the newest version" is
// what somebody actually needs to hear, and it is the answer a control that only
// speaks when there is news never gives — leaving the reader unsure whether it
// did anything. The failure answer is the same shape: a check that cannot reach
// the network has learned nothing about the version, which is not the same as
// learning there is nothing new, and it must not be reported as if it were.

const ANSWER_WAIT_MS = 10000;

/** Resolve once an installing worker settles, or after ANSWER_WAIT_MS. */
function settled(worker) {
  return new Promise((resolve) => {
    const done = () => {
      if (worker.state === 'installed' || worker.state === 'activated' || worker.state === 'redundant') {
        worker.removeEventListener('statechange', done);
        resolve();
      }
    };
    worker.addEventListener('statechange', done);
    window.setTimeout(resolve, ANSWER_WAIT_MS);
    done();
  });
}

function answer(text) {
  $('#info-checkupd-answer').textContent = text;
}

async function checkNow() {
  const button = $('#info-checkupd');
  button.disabled = true;
  answer('Checking…');

  try {
    if (!('serviceWorker' in navigator)) {
      answer(`This copy is version ${VERSION}. This browser cannot keep an offline copy, so there is nothing to check — reloading the page always gets the newest one.`);
      return;
    }

    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) {
      answer(`This copy is version ${VERSION}. The app has no offline copy on this device yet, so reloading the page gets the newest one.`);
      return;
    }

    await reg.update();
    if (reg.installing) await settled(reg.installing);

    if (reg.waiting) {
      // ASKING UNDOES AN EARLIER "Not now". Without this line the answer below
      // sends a reader who dismissed the strip to a strip that is no longer
      // there — the sentence would be false for exactly the person most likely
      // to come looking. Pressing "Not now" is an answer to being interrupted,
      // not a standing instruction to be refused later.
      dismissed = false;
      // Told twice on purpose: the strip is where the button to take it lives,
      // and the reader is looking at this panel rather than at the strip.
      if (hadControllerAtLoad) offer();
      answer('A new version is ready. Close this panel — the strip at the top of the screen has the button that takes it.');
      return;
    }

    answer(`You are on the newest version (${VERSION}).`);
  } catch {
    // A check that could not reach the network has learned NOTHING about the
    // version, which is not the same as learning there is nothing new.
    answer(`Could not check just now — there was no answer from the network. This copy is version ${VERSION}, and the app carries on working offline either way.`);
  } finally {
    button.disabled = false;
  }
}

function offer() {
  if (dismissed || accepted) return;
  const strip = $('#update-strip');
  $('#update-text').textContent =
    'A new version is ready. Your jobs, spools and models stay exactly as they are — updating only replaces the app itself.';
  strip.hidden = false;
}

function showStuck() {
  // Its own state, and audited as one: a transient state is still a state, and
  // this one shipped unmeasured for a day elsewhere.
  const strip = $('#update-strip');
  strip.dataset.state = 'stuck';
  $('#update-text').textContent =
    'The update is downloaded but this device will not swap it in while the app is open. Close the app completely and open it again, and the new version will be there. Nothing you have entered is affected.';
  $('#update-apply').hidden = true;
  $('#update-later').textContent = 'Dismiss';
  strip.hidden = false;
  say('The update needs the app closed and reopened.');
}

function hide() {
  const strip = $('#update-strip');
  strip.hidden = true;
  strip.removeAttribute('data-state');
}

/** For the gate: drive the stuck state without waiting six seconds for it. */
export function __showStuckForAudit() {
  showStuck();
}
