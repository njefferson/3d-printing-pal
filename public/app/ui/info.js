// The one information surface (§7e), and the first run.
//
// THE ORIENTATION TEXT EXISTS ONCE. It is authored inside the information panel
// and MOVED into the first-run dialog at first run, then moved back when the
// reader presses the button that begins. Moved, never copied.
//
// That is not tidiness either. Two copies of the same prose drift, and the one
// nobody is looking at is the one that goes stale. And copying it would mean the
// gate a new reader dismisses could be the thing that destroys the instructions —
// the orientation has to SURVIVE whatever they press to get started, and the way
// to guarantee that is for the surviving copy to be the only copy.
//
// The gate asserts exactly this: after first run is dismissed, #info-orientation
// is inside #dlg-info and has content.

import { $, el, clear } from '../dom.js';
import { RELEASES } from '../releases.js';
import { registerPanel, openPanel } from './panels.js';
import { renderSnapshots } from './backup-ui.js';
import * as store from '../store.js';

export function initInfo() {
  registerPanel('dlg-info', { onClose: renderSnapshots });
  registerPanel('dlg-firstrun', { onClose: returnOrientation });

  renderReleases();

  $('#info-open').addEventListener('click', () => {
    renderSnapshots();
  });
}

/** Shown once, on a device that has not seen it. */
export function maybeFirstRun() {
  if (store.state.firstRunDone) return false;
  // Move the orientation in. The nodes are the same nodes.
  $('#firstrun-slot').append($('#info-orientation'));
  openPanel('dlg-firstrun');
  return true;
}

function returnOrientation() {
  const orientation = document.getElementById('info-orientation');
  const panel = $('#dlg-info .panel-body');
  if (orientation && panel && !panel.contains(orientation)) {
    // Back to the top of the information panel, where it lives permanently.
    panel.prepend(orientation);
  }
  store.markFirstRunDone();
}

function renderReleases() {
  const node = $('#info-releases');
  clear(node);

  // Bounded on purpose: half a dozen entries is a history, forty is an archive,
  // and an archive belongs in the repo.
  for (const release of RELEASES.slice(0, 6)) {
    const block = el('div', { class: 'release' },
      el('p', { class: 'release-head', text: `${release.version} — ${release.kind} — ${release.date}` }),
    );
    if (release.summary) block.append(el('p', { text: release.summary }));
    if (release.added?.length) {
      block.append(el('h4', { text: 'New' }), el('ul', {}, ...release.added.map((line) => el('li', { text: line }))));
    }
    if (release.fixed?.length) {
      block.append(el('h4', { text: 'Fixed' }), el('ul', {}, ...release.fixed.map((line) => el('li', { text: line }))));
    }
    // An app that lists only its fixes is an advertisement.
    if (release.broken?.length) {
      block.append(el('h4', { text: 'Still not right' }), el('ul', {}, ...release.broken.map((line) => el('li', { text: line }))));
    }
    node.append(block);
  }

  if (RELEASES.length > 6) {
    node.append(el('p', { class: 'note', text: `Earlier releases are in the repository's changelog.` }));
  }
}
