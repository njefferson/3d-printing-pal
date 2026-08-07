// Dialogs, the confirmation panel, and the status line.
//
// THE WAY OUT IS WIRED FIRST. `registerPanel` attaches every dismiss before it
// does anything else, and before any caller has a chance to run content wiring
// that might throw. A close button attached after the content, the storage and
// the import wiring is a close button that only works when all three succeeded.

import { $, $$, el } from '../dom.js';

const openers = new Map();

/**
 * Wire one dialog's exits.
 *
 * Six things every interrupting surface owes, and where each is met:
 *   1. visible in the first frame            — the head close, outside the scroll area
 *   2. reachable from anywhere in it         — head and foot both sit outside the
 *                                              scrolling body, so neither scrolls away
 *   3. present at the bottom as well         — the foot close
 *   4. working before anything else does     — wired here, first
 *   5. never conditional                     — nothing to finish, agree to or choose
 *   6. bounded in length                     — the body scrolls inside itself
 */
export function registerPanel(id, { onClose } = {}) {
  const dialog = document.getElementById(id);
  if (!dialog) return null;

  // 1-4: the exits, before anything else in this function.
  for (const button of $$(`[data-close="${id}"]`)) {
    button.addEventListener('click', () => {
      const then = button.dataset.thenOpen;
      close(id);
      if (then) openPanel(then);
    });
  }

  dialog.addEventListener('cancel', (event) => {
    // `<input type="file">` fires its own `cancel` event and IT BUBBLES. Without
    // this guard, picking a file to import closes the whole import panel the
    // instant the file picker returns.
    if (event.target !== dialog) return;
    event.preventDefault();
    close(id);
  });

  dialog.addEventListener('close', () => {
    onClose?.();
    const opener = openers.get(id);
    openers.delete(id);
    // Focus lands somewhere real: back on the control that opened it, if it is
    // still in the document.
    if (opener && document.contains(opener)) opener.focus();
  });

  return dialog;
}

export function openPanel(id, opener = null) {
  const dialog = document.getElementById(id);
  if (!dialog) return null;
  if (dialog.open) return dialog;
  openers.set(id, opener || document.activeElement);
  dialog.showModal();
  // Start the reader at the top of the panel rather than wherever the browser
  // decided; the first focusable is the close, which is the point.
  dialog.querySelector('.panel-body')?.scrollTo?.(0, 0);
  return dialog;
}

export function close(id) {
  const dialog = document.getElementById(id);
  if (dialog?.open) dialog.close();
}

export function isOpen(id) {
  return document.getElementById(id)?.open === true;
}

/** Every `data-surface-opener` button opens the surface it names. */
export function wireOpeners() {
  for (const button of $$('[data-surface-opener]')) {
    button.addEventListener('click', () => openPanel(button.dataset.surfaceOpener, button));
  }
}

// ------------------------------------------------------------------ confirm

let confirmHandler = null;

export function initConfirm() {
  registerPanel('dlg-confirm');
  $('#confirm-go').addEventListener('click', () => {
    const run = confirmHandler;
    confirmHandler = null;
    close('dlg-confirm');
    run?.();
  });
}

/**
 * Ask before something destructive. `body` says exactly what will happen,
 * including what else it will touch, so the answer is informed rather than brave.
 */
export function confirmThen({ title, body, action }, run) {
  $('#confirm-title').textContent = title;
  $('#confirm-body').textContent = body;
  $('#confirm-go').textContent = action || 'Delete';
  confirmHandler = run;
  openPanel('dlg-confirm');
}

// ------------------------------------------------------------------- status

/**
 * Status messages (SC 4.1.3): announced to a screen reader without stealing
 * focus. Not machine-checkable, so it is declared in ACCESSIBILITY.md and hand
 * checked — a check that always passes reads as coverage.
 */
export function say(message) {
  const live = $('#live');
  if (!live) return;
  // Re-announcing identical text needs the node to change.
  live.textContent = '';
  window.setTimeout(() => {
    live.textContent = message;
  }, 30);
}

/** A visible, non-blocking report inside an already-open panel. */
export function reportInto(node, { heading, lines, bad = false }) {
  node.hidden = false;
  node.replaceChildren(
    el('h3', { text: heading, class: bad ? 'report-bad' : null }),
    el('ul', {}, ...lines.map((line) => el('li', { text: line }))),
  );
}
