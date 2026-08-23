// The undo strip.
//
// IT NAMES WHAT IT WOULD PUT BACK, in words on the screen. "Undo" alone asks the
// reader to remember which of the last few things they did was the last one, and
// on a board where a move, an edit and a delete all look like the tile changing,
// that is a guess with consequences.
//
// IT NEVER GOES AWAY ON A TIMER, and it never went away at all until 0.7.0. A
// toast that vanishes is a route that is gone before a reader who looked up, was
// interrupted, or reads slowly can take it. But the answer to that was a bar
// under the tabs with two heavy rails and a raised background, permanently, on
// every screen — 72px of an 844px phone, 9% of it, reading as an alert about a
// thing the reader had just deliberately done.
//
// SO IT IS QUIET, AND IT CAN BE DISMISSED. Quiet is most of it: no rails, no
// raised ground, small text. Dismissing it is keyed to the CHANGE rather than to
// the sitting, so the next thing they do brings it back — which is the only
// version of "go away" that does not silently cost them the route.
//
// THE STORE IS THE ONLY THING THAT KNOWS. Nothing here tracks what happened; it
// asks store.undoLabel() on every announcement and draws the answer. A second
// record of the last change is a second thing that can be wrong.

import { $ } from '../dom.js';
import * as store from '../store.js';
import { say } from './panels.js';

// The change whose strip the reader has waved away. Not a boolean: a boolean
// would either come back on the next render or never come back at all.
let dismissed = null;

export function initUndo() {
  const button = $('#undo-do');

  $('#undo-dismiss').addEventListener('click', () => {
    dismissed = store.undoId();
    renderUndo();
    // Said out loud, because a strip vanishing under a finger with nothing
    // announced is indistinguishable from the app having lost the change.
    //
    // AND IT SAYS THE COST. Dismissing gives up the undo for THIS change — there
    // is no other route to it — and the strip returns for the next one. Hiding
    // that would be the app quietly removing a safety net and saying "hidden".
    say('Hidden, and this change can no longer be undone. Your next change brings the strip back.');
  });

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

  strip.hidden = !label || store.undoId() === dismissed;
  if (strip.hidden) return;

  text.textContent = `Last change: ${label}.`;
  // The visible word is "Undo" and it appears verbatim at the start of the
  // accessible name, so somebody saying "undo" out loud matches it (SC 2.5.3).
  // The rest of the name is what the strip's own text already says, for a reader
  // who reaches the button without having read across to it.
  button.setAttribute('aria-label', `Undo ${label}`);
}
