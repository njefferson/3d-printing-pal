// The picture field, used inside a form panel.
//
// THREE WAYS IN, because one is not enough on the devices this app runs on:
// a file picker (which on iOS offers the photo library AND the camera, so a
// finished print can be photographed), a paste (which is how a picture gets out
// of a model page in about three taps — long-press, Copy, paste), and a drop
// (desktop). All three land in the same place.
//
// THE PICTURE IS PREPARED BEFORE IT IS HELD. Nothing here keeps the file the
// reader chose; image.js downscales and re-encodes first, and only that result is
// ever stored. See the note in that file for why the budget is the feature.
//
// NOTHING IS WRITTEN HERE AT ALL. The control holds a prepared picture in memory
// and hands the BYTES to the store on save; the store is what writes it. This
// field wrote the image itself once, and the write happened outside the model
// save — so undoing a picture change restored the old model record and left the
// new blob in the database with nothing pointing at it, an orphan the export then
// carried forever. Cancelling a half-finished edit leaves nothing behind either,
// for the same reason.

import { el, clear } from '../dom.js';
import { prepare, firstImage, describeBytes } from '../image.js';
import * as store from '../store.js';

/**
 * Build a picture field.
 *
 * `read()` returns `{ prepared, removed }` for `store.saveModel`, and `saved()`
 * is the acknowledgement that the save went through.
 */
export function pictureField({ label = 'Picture', describe = 'this model' } = {}) {
  let currentId = '';
  let pending = null; // a prepared picture, not yet stored
  let removed = false;

  const preview = el('div', { class: 'pic-preview' });
  const status = el('p', { class: 'note pic-status' });

  const file = el('input', { type: 'file', accept: 'image/*', class: 'pic-file' });
  file.setAttribute('aria-hidden', 'true');
  file.tabIndex = -1;

  const choose = el('button', { type: 'button', class: 'btn' }, 'Choose a picture');
  choose.setAttribute('aria-label', `Choose a picture for ${describe}`);

  const drop = el('button', { type: 'button', class: 'btn' }, 'Paste a picture');
  drop.setAttribute('aria-label', `Paste a picture for ${describe}`);

  // The visible words appear VERBATIM inside the accessible name (SC 2.5.3):
  // "Remove the picture for this model" reads better and fails, because someone
  // saying "remove picture" out loud would not match it.
  const remove = el('button', { type: 'button', class: 'btn' }, 'Remove picture');
  remove.setAttribute('aria-label', `Remove picture for ${describe}`);

  const zone = el('div', { class: 'pic-zone' }, preview, el('div', { class: 'pic-actions' }, choose, drop, remove));

  const field = el('fieldset', { class: 'fieldset pic-field' },
    el('legend', { text: label }),
    zone,
    status,
    file,
  );

  function say(text, bad = false) {
    status.textContent = text;
    status.classList.toggle('is-bad', Boolean(bad));
  }

  async function showCurrent() {
    clear(preview);
    const src = pending ? pending.url : (currentId && !removed ? await store.imageUrl(currentId) : null);
    if (!src) {
      preview.append(el('p', { class: 'pic-empty', text: 'No picture yet' }));
      remove.disabled = true;
      return;
    }
    const img = el('img', { class: 'pic-img', src });
    img.alt = `The picture chosen for ${describe}`;
    preview.append(img);
    remove.disabled = false;
  }

  async function accept(fileLike) {
    if (!fileLike) {
      say('There was no picture in that. Copy the image itself, not the link to it.', true);
      return;
    }
    say('Preparing…');
    try {
      const ready = await prepare(fileLike);
      if (pending?.url) URL.revokeObjectURL(pending.url);
      pending = { ...ready, url: URL.createObjectURL(ready.blob) };
      removed = false;
      await showCurrent();
      say(`Ready — ${ready.width} by ${ready.height}, ${describeBytes(ready.bytes)}.`);
    } catch (err) {
      say(err?.message || 'That picture could not be used.', true);
    }
  }

  choose.addEventListener('click', () => file.click());
  file.addEventListener('change', () => {
    accept(firstImage(file));
    file.value = '';
  });

  // An explicit button rather than only a document-level paste listener: a reader
  // on a touch device has no Ctrl+V, and a paste target they cannot see is a
  // feature that does not exist. The button reads the clipboard directly where
  // that is allowed, and the field also accepts an ordinary paste.
  drop.addEventListener('click', async () => {
    if (!navigator.clipboard?.read) {
      say('This browser will not hand over the clipboard. Use Choose a picture instead.', true);
      return;
    }
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const type = item.types.find((t) => t.startsWith('image/'));
        if (!type) continue;
        const blob = await item.getType(type);
        await accept(new File([blob], 'pasted', { type }));
        return;
      }
      say('There was no picture on the clipboard. Copy the image itself, not the link to it.', true);
    } catch {
      say('This browser would not hand over the clipboard. Use Choose a picture instead.', true);
    }
  });

  field.addEventListener('paste', (event) => {
    const found = firstImage(event.clipboardData);
    if (!found) return;
    event.preventDefault();
    accept(found);
  });

  for (const name of ['dragenter', 'dragover']) {
    zone.addEventListener(name, (event) => {
      event.preventDefault();
      zone.classList.add('is-over');
    });
  }
  for (const name of ['dragleave', 'drop']) {
    zone.addEventListener(name, () => zone.classList.remove('is-over'));
  }
  zone.addEventListener('drop', (event) => {
    event.preventDefault();
    accept(firstImage(event.dataTransfer));
  });

  remove.addEventListener('click', async () => {
    if (pending?.url) URL.revokeObjectURL(pending.url);
    pending = null;
    removed = true;
    await showCurrent();
    say('The picture will be removed when you save.');
  });

  return {
    node: field,
    async set(imageId) {
      currentId = imageId || '';
      if (pending?.url) URL.revokeObjectURL(pending.url);
      pending = null;
      removed = false;
      say('');
      await showCurrent();
    },
    /**
     * What the form hands to `store.saveModel` — the prepared bytes, never an id.
     * Reading does not change anything, so a save that fails leaves the field as
     * the reader left it and they can press it again.
     */
    read() {
      return { prepared: pending, removed };
    },
    /**
     * The save went through. Only now is the held picture let go: revoking its
     * URL any earlier would blank the preview while the panel is still on screen.
     */
    saved(imageId) {
      if (pending?.url) URL.revokeObjectURL(pending.url);
      pending = null;
      removed = false;
      currentId = imageId || '';
    },
  };
}
