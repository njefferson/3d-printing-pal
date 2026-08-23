// The Undo button.
//
// IT LIVES IN THE APP'S CHROME, beside the (i), which is where every other
// program on this device keeps undo. Until 0.7.2 it was a strip across the page:
// a standing band under the tabs describing a thing the reader had deliberately
// done two seconds earlier. That form was right about one thing and wrong about
// the rest — a toast with a deadline IS a route that expires, and the answer to
// that is a control that does not expire, not a bar that narrates.
//
// IT IS ALWAYS THERE. A button that appears only once there is something to undo
// answers "can this app undo" with silence until the moment it is too late to
// ask, and the strip had exactly that shape: hidden until the first change.
//
// `aria-disabled`, NOT `disabled`. A truly disabled button is skipped by tabbing
// and dropped from a screen reader's list of controls, so a reader who has not
// yet changed anything would never learn undo exists — the same defect one level
// down. This one keeps its place in the order, and pressing it when there is
// nothing says so.
//
// WHAT IT WOULD PUT BACK is in the accessible name and the title rather than in
// the visible word. "Undo" alone does ask the reader to remember which of the
// last few things they did was the last one — but the app already told them, at
// the moment it happened, through the live region in panels.js, and it says what
// came back when they press this. A word that changes width on every edit, in a
// bar that holds the app's name, buys that reminder with a chrome that moves.
//
// THE STORE IS THE ONLY THING THAT KNOWS. Nothing here tracks what happened; it
// asks store.undoLabel() on every announcement and draws the answer. A second
// record of the last change is a second thing that can be wrong.

import { $ } from '../dom.js';
import * as store from '../store.js';
import { say } from './panels.js';

export function initUndo() {
  const button = $('#undo-do');

  button.addEventListener('click', async () => {
    // The button is focusable while unavailable, so this is a real path rather
    // than a guard against the impossible. Silence here would read as the app
    // having lost the press.
    if (!store.canUndo()) {
      say('Nothing to undo. Your next change can be undone from here.');
      return;
    }

    const label = await store.undo();
    if (!label) return;
    say(`Undone — ${label}.`);
    // NO FOCUS RESCUE, and that is the point of the button living in the chrome.
    // The strip removed itself from under the finger when the last change was
    // undone, dropping focus to the body and losing a screen reader's place, so
    // it needed code to move focus somewhere deliberate. This element never
    // leaves, so focus stays exactly where the reader put it.
  });

  store.subscribe(renderUndo);
  renderUndo();
}

export function renderUndo() {
  const button = $('#undo-do');
  const label = store.undoLabel();

  button.setAttribute('aria-disabled', label ? 'false' : 'true');
  // The visible word is "Undo" and it opens the accessible name, so somebody
  // saying "undo" out loud matches it (SC 2.5.3). `title` carries the same words
  // for a pointer, and is deliberately the same string rather than a shorter one.
  const name = label ? `Undo ${label}` : 'Undo — nothing to undo yet';
  button.setAttribute('aria-label', name);
  button.title = name;
}
