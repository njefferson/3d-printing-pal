// The undo strip.
//
// IT NAMES WHAT IT WOULD PUT BACK, in words on the screen. "Undo" alone asks the
// reader to remember which of the last few things they did was the last one, and
// on a board where a move, an edit and a delete all look like the tile changing,
// that is a guess with consequences.
//
// IT NEVER GOES AWAY ON A TIMER. The strip appears with the first undoable change
// and then stays for the sitting, changing only its words. That costs one layout
// shift per session instead of a toast's shift on every action, and it means the
// route is there for a reader who looked up, was interrupted, or reads slowly.
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
    const label = await store.undo();
    if (!label) return;
    say(`Undone — ${label}.`);

    // Focus has to land somewhere deliberate. When there is more to undo the
    // button is still here and keeps it; when this was the last one the button
    // disappears from under the finger, and focus left on a removed element falls
    // to the body, which loses a screen reader's place entirely.
    if (!store.canUndo()) {
      const main = $('#main');
      main.tabIndex = -1;
      main.focus();
    }
  });

  store.subscribe(renderUndo);
  renderUndo();
}

export function renderUndo() {
  const strip = $('#undo-strip');
  const text = $('#undo-text');
  const button = $('#undo-do');
  const label = store.undoLabel();

  strip.hidden = !label;
  if (!label) return;

  text.textContent = `Last change: ${label}.`;
  // The visible word is "Undo" and it appears verbatim at the start of the
  // accessible name, so somebody saying "undo" out loud matches it (SC 2.5.3).
  // The rest of the name is what the strip's own text already says, for a reader
  // who reaches the button without having read across to it.
  button.setAttribute('aria-label', `Undo ${label}`);
}
