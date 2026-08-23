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

import { $, $$, el, clear } from '../dom.js';
import { RELEASES } from '../releases.js';
import { registerPanel, openPanel } from './panels.js';
import { renderSnapshots } from './backup-ui.js';
import * as store from '../store.js';

// The menu item that opened the section on screen, so back can put focus where
// the reader left it rather than at the top of a list they have to re-read.
let cameFrom = null;

export function initInfo() {
  registerPanel('dlg-info', { onClose: renderSnapshots });
  registerPanel('dlg-firstrun', { onClose: returnOrientation });

  renderReleases();
  wireMenu();

  $('#info-open').addEventListener('click', () => {
    renderSnapshots();
  });
}

// --------------------------------------------------------------- the menu
//
// ONE DIALOG, FIVE DESTINATIONS. The alternative was five more `<dialog>`s, which
// the accessibility gate would have measured for free — its surface list is
// derived from the markup — but which stack modals on top of modals and give
// "back" and "close" the same job. One dialog swapping its body keeps a single
// focus trap and a single way out, and the gate is taught to walk the sections
// instead. The check that no section can ship unreachable is written by hand in
// `checkInfoMenu`, because that is the assertion the dialog-derived list was
// making for us and it does not survive the move.

function sections() {
  return $$('#dlg-info .info-section');
}

function wireMenu() {
  // EVERY `data-info-section` BUTTON, not only the ones inside the menu. The
  // footer's last-export line carries one too, so the sentence that says you have
  // no copy is itself the way to the button that makes one — a route from the
  // problem to the remedy rather than a note about where to look for it.
  for (const item of $$('[data-info-section]')) {
    item.addEventListener('click', () => {
      renderSnapshots();
      showSection(item.dataset.infoSection, item.closest('#dlg-info') ? item : null);
    });
  }
  $('#info-back').addEventListener('click', () => showMenu());

  // Opening the panel always lands on the menu. A panel that reopens wherever it
  // was last left is a panel whose first screen depends on something the reader
  // did days ago and has no way to remember.
  $('#dlg-info').addEventListener('close', () => showMenu({ focus: false }));
}

/**
 * Land on a section. Focus goes to the panel's own title, which has just become
 * the section's name — so the change is ANNOUNCED rather than merely rendered,
 * and a reader who cannot see the body still learns where they are.
 */
export function showSection(id, opener = null) {
  const section = document.getElementById(id);
  if (!section) return;
  cameFrom = opener;

  $('#info-menu').hidden = true;
  for (const other of sections()) other.hidden = other !== section;
  section.hidden = false;

  $('#info-back').hidden = false;
  $('#info-title').textContent = section.dataset.infoTitle || 'About print-tracker';
  $('#dlg-info .panel-body').scrollTo?.(0, 0);
  $('#info-title').focus();
}

function showMenu({ focus = true } = {}) {
  for (const section of sections()) section.hidden = true;
  $('#info-menu').hidden = false;
  $('#info-back').hidden = true;
  $('#info-title').textContent = 'About print-tracker';
  $('#dlg-info .panel-body').scrollTo?.(0, 0);

  if (!focus) return;
  // Back to the item that was pressed, not the top of the list.
  const target = cameFrom && document.contains(cameFrom) ? cameFrom : $('#info-title');
  cameFrom = null;
  target.focus();
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
  // BACK INTO ITS SECTION, not the top of the panel body. Since 1.1.0 the body
  // holds a menu and five sections, and prepending here would put the whole
  // welcome above the menu — permanently, for every reader, from the moment they
  // dismissed it. The place it belongs is the destination the menu names.
  const home = document.getElementById('info-sec-about');
  if (orientation && home && !home.contains(orientation)) {
    home.append(orientation);
  }
  store.markFirstRunDone();
}

function renderReleases() {
  const node = $('#info-releases');
  clear(node);

  // Bounded on purpose: half a dozen entries is a history, forty is an archive,
  // and an archive belongs in the repo.
  for (const release of RELEASES.slice(0, 6)) {
    // AN `h3`, NOT A `p`. Each release already had `h4` subheadings under it, so
    // as a paragraph this line left the section running h2 straight to h4 — axe's
    // heading-order, and a screen reader's outline of this screen showed four
    // unattached "New"/"Fixed" headings with nothing saying which release they
    // belonged to. It looks identical; it is styled by class, not by level.
    const block = el('div', { class: 'release' },
      el('h3', { class: 'release-head', text: `${release.version} — ${release.kind} — ${release.date}` }),
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
