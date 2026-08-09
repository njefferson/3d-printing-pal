// A picture on a tile.
//
// Shared by the board and the model catalog so a print looks the same wherever it
// appears, and so the two cannot drift into handling a missing picture differently.
//
// THE ALT TEXT IS EMPTY, DELIBERATELY, and that is not an oversight to be
// "fixed". The picture always sits beside the name it belongs to, so an alt of
// "Picture of Articulated Dragon" makes a screen reader say the same thing twice
// — once for the image and once for the heading right after it. WCAG's own advice
// for a thumbnail adjacent to its label is to mark the image decorative. Where
// there is NO adjacent name — the preview inside the form — the alt is written
// out, because there the image is the only thing describing itself.
//
// THE URL ARRIVES LATE. Reading a blob out of IndexedDB is asynchronous and a
// render is not, so the element is returned immediately and filled in when the
// bytes arrive. That ordering is why a tile never blocks a board redraw on disk.

import { el } from '../dom.js';
import * as store from '../store.js';

/**
 * A thumbnail element for a stored picture id.
 *
 * Always returns a node, even with no picture — the tiles keep one shape whether
 * or not there is an image, so a board of half-pictured cards does not jump
 * about as they load.
 */
export function thumbFor(imageId, name = '') {
  const box = el('div', { class: 'thumb' });

  if (!imageId) {
    box.classList.add('is-empty');
    // aria-hidden: the empty state is a visual placeholder holding the layout
    // steady. There is nothing here for a screen reader to be told about.
    box.setAttribute('aria-hidden', 'true');
    return box;
  }

  const img = el('img', { class: 'thumb-img' });
  img.alt = '';
  img.decoding = 'async';
  img.loading = 'lazy';

  // A picture that fails to decode leaves the placeholder rather than a broken
  // icon — the record is still fine, only its bytes are unreadable, and a broken
  // image glyph reads as "this app is broken" rather than "this picture is".
  img.addEventListener('error', () => {
    img.remove();
    box.classList.add('is-empty');
    box.setAttribute('aria-hidden', 'true');
  });

  store.imageUrl(imageId).then((url) => {
    if (!url) {
      box.classList.add('is-empty');
      box.setAttribute('aria-hidden', 'true');
      return;
    }
    img.src = url;
    box.append(img);
  });

  if (name) box.dataset.for = name;
  return box;
}
