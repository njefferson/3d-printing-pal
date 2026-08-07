// The kanban board, and the two ways a card moves.
//
// TWO INDEPENDENT PATHS, and the button is the one that counts:
//
//   The Move button on every card opens a list of the other columns. It works by
//   touch, by mouse and by keyboard, and it is what assistive technology gets.
//   A drag-only interaction is a broken interaction (SC 2.5.7).
//
//   Drag is the enhancement. It runs on Pointer Events — one code path for mouse
//   and touch — and starts from a dedicated grip with `touch-action: none`, so
//   movement begins a drag while the board still scrolls everywhere else. There
//   is NO press-and-hold: timed gestures are banned (SC 2.2.1), and nothing here
//   expires while somebody is still aiming.
//
//   Nothing commits on pointer-down (SC 2.5.2). The move applies on pointer-up,
//   and a pointer that comes up outside a column cancels, as does Escape.
//
// NODES ARE UPDATED IN PLACE. A board that rebuilds itself after every move
// destroys the focused element, and a keyboard move then works exactly once —
// the second press goes to <body>. Cards are reused by id and only their text
// changes; nodes are moved between columns rather than recreated.

import { $, el, clear } from '../dom.js';
import { COLUMNS, TYPES, sortForBoard } from '../derive.js';
import * as store from '../store.js';
import { openPanel, close, registerPanel, say } from './panels.js';

const cardNodes = new Map();
let onEdit = () => {};
let moveTargetId = null;

export function initBoard({ onEditJob }) {
  onEdit = onEditJob;
  registerPanel('dlg-move', { onClose: () => { moveTargetId = null; } });

  const board = $('#board');
  for (const column of COLUMNS) board.append(buildColumn(column));

  for (const chip of document.querySelectorAll('.chip')) {
    chip.addEventListener('click', () => {
      const type = chip.dataset.type;
      const active = new Set(store.state.prefs.typeFilter);
      if (active.has(type)) active.delete(type);
      else active.add(type);
      // Never let the reader filter everything away with no way to tell an empty
      // board from a hidden one — the last chip cannot be switched off.
      if (active.size === 0) {
        say('At least one job type has to stay shown.');
        return;
      }
      store.savePrefs({ typeFilter: [...active] });
    });
  }

  wireDrag(board);
}

function buildColumn(column) {
  const collapsed = column.id === 'archived';
  const list = el('ul', { class: 'column-list', id: `col-${column.id}`, 'aria-labelledby': `colh-${column.id}` });
  const count = el('span', { class: 'column-count', id: `count-${column.id}`, text: '0' });

  // The accessible name NAMES ITS COLUMN. Six toggles all called "Hide" is a coin
  // toss for anyone driving by voice or stepping through a list, and the visible
  // word stays inside the name so SC 2.5.3 still holds.
  const toggle = el('button', {
    type: 'button',
    class: 'column-toggle',
    'aria-expanded': String(!collapsed),
    'aria-controls': `col-${column.id}`,
    'aria-label': `${collapsed ? 'Show' : 'Hide'} the ${column.label} column`,
    text: collapsed ? 'Show' : 'Hide',
  });

  const node = el(
    'section',
    { class: `column${collapsed ? ' is-collapsed' : ''}`, dataset: { column: column.id } },
    el(
      'div',
      { class: 'column-head' },
      el('h3', { class: 'column-title', id: `colh-${column.id}`, text: column.label }),
      el('div', { class: 'column-head-right' }, count, ' ', toggle),
    ),
    list,
  );

  toggle.addEventListener('click', () => {
    const nowCollapsed = !node.classList.contains('is-collapsed');
    node.classList.toggle('is-collapsed', nowCollapsed);
    toggle.setAttribute('aria-expanded', String(!nowCollapsed));
    toggle.textContent = nowCollapsed ? 'Show' : 'Hide';
    toggle.setAttribute('aria-label', `${nowCollapsed ? 'Show' : 'Hide'} the ${column.label} column`);
  });

  return node;
}

export function renderBoard() {
  const { jobs, prefs } = store.state;
  const shown = new Set(prefs.typeFilter);
  const visible = sortForBoard(jobs.filter((j) => shown.has(j.type)));

  for (const chip of document.querySelectorAll('.chip')) {
    chip.setAttribute('aria-pressed', String(shown.has(chip.dataset.type)));
  }

  for (const column of COLUMNS) {
    const list = document.getElementById(`col-${column.id}`);
    const wanted = visible.filter((j) => j.column === column.id);
    document.getElementById(`count-${column.id}`).textContent = String(wanted.length);

    // Reuse the node for each job; only its text is rewritten. Appending an
    // existing node moves it rather than recreating it.
    const seen = new Set();
    wanted.forEach((job, index) => {
      let node = cardNodes.get(job.id);
      if (!node) {
        node = buildCard(job);
        cardNodes.set(job.id, node);
      }
      updateCard(node, job);
      const at = list.children[index];
      if (at !== node) list.insertBefore(node, at || null);
      seen.add(job.id);
    });

    for (const child of Array.from(list.children)) {
      if (!seen.has(child.dataset.jobId)) child.remove();
    }
  }

  for (const [id, node] of cardNodes) {
    if (!node.isConnected) cardNodes.delete(id);
  }

  $('#board-empty').hidden = jobs.length > 0;
  $('#board-filtered').hidden = !(jobs.length > 0 && visible.length === 0);
}

function buildCard(job) {
  const grip = el(
    'button',
    { type: 'button', class: 'card-grip', dataset: { grip: '1' } },
    el('span', { 'aria-hidden': 'true', text: '⠿' }),
    el('span', { class: 'sr-only' }),
  );

  const title = el('h4', { class: 'card-title' });
  const badge = el('span', { class: 'badge' });
  const meta = el('p', { class: 'card-meta' });
  const moveBtn = el('button', { type: 'button', class: 'btn' }, 'Move');
  const editBtn = el('button', { type: 'button', class: 'btn' }, 'Open');

  const node = el(
    'li',
    { class: 'card', dataset: { jobId: job.id } },
    el('div', { class: 'card-top' }, el('div', { class: 'card-topmain' }, badge, title), grip),
    meta,
    el('div', { class: 'card-actions' }, moveBtn, editBtn),
  );

  node._parts = { grip, title, badge, meta, moveBtn, editBtn };

  moveBtn.addEventListener('click', () => openMove(job.id, moveBtn));
  editBtn.addEventListener('click', () => onEdit(node.dataset.jobId));

  // The grip is draggable, but it is also a real button: pressing it with a
  // keyboard opens the same move list, so the grip is never a dead control for
  // anyone who cannot drag.
  grip.addEventListener('click', (event) => {
    if (event.detail === 0) openMove(node.dataset.jobId, grip); // keyboard activation
  });

  return node;
}

function updateCard(node, job) {
  const p = node._parts;
  const type = TYPES.find((t) => t.id === job.type);
  node.dataset.jobId = job.id;

  p.title.textContent = job.title || 'Untitled job';
  p.badge.textContent = type?.label || job.type;
  p.badge.className = `badge badge-${job.type}`;

  const bits = [];
  if (job.printer) bits.push(`Printer: ${job.printer}`);
  bits.push(`Quantity: ${job.quantity}`);
  if (job.type === 'request' && job.requester) bits.push(`For: ${job.requester}`);
  clear(p.meta);
  for (const bit of bits) p.meta.append(el('span', { text: bit }));

  p.moveBtn.setAttribute('aria-label', `Move ${job.title || 'this job'} to another column`);
  p.editBtn.setAttribute('aria-label', `Open ${job.title || 'this job'}`);
  p.grip.querySelector('.sr-only').textContent = `Drag ${job.title || 'this job'}, or press to choose a column`;
}

// ------------------------------------------------------------- the move list

function openMove(jobId, opener) {
  const job = store.state.jobs.find((j) => j.id === jobId);
  if (!job) return;
  moveTargetId = jobId;

  $('#move-what').textContent = `${job.title || 'This job'} is in ${labelFor(job.column)}.`;

  const list = $('#move-list');
  clear(list);
  for (const column of COLUMNS) {
    if (column.id === job.column) continue;
    const button = el('button', { type: 'button', class: 'btn' }, `Move to ${column.label}`);
    button.addEventListener('click', async () => {
      close('dlg-move');
      await store.moveJob(jobId, column.id);
      say(`${job.title || 'Job'} moved to ${column.label}.`);
    });
    list.append(button);
  }

  openPanel('dlg-move', opener);
}

function labelFor(id) {
  return COLUMNS.find((c) => c.id === id)?.label || id;
}

// ------------------------------------------------------------------- drag

function wireDrag(board) {
  let drag = null;

  board.addEventListener('pointerdown', (event) => {
    const grip = event.target.closest('[data-grip]');
    if (!grip || event.button > 0) return;
    const card = grip.closest('.card');
    if (!card) return;

    // Nothing is committed here. This only records that a drag COULD begin.
    drag = { card, id: card.dataset.jobId, x: event.clientX, y: event.clientY, active: false, pointerId: event.pointerId };
    grip.setPointerCapture(event.pointerId);
  });

  board.addEventListener('pointermove', (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    if (!drag.active) {
      // A distance threshold, not a time one. Nothing expires.
      if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 8) return;
      drag.active = true;
      drag.card.classList.add('is-dragging');
    }
    highlight(findColumnAt(event.clientX, event.clientY));
  });

  board.addEventListener('pointerup', async (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const wasActive = drag.active;
    const id = drag.id;
    const card = drag.card;
    drag = null;
    card.classList.remove('is-dragging');
    highlight(null);
    if (!wasActive) return;

    // Commit on pointer-UP, and only over a real target. A pointer that comes up
    // anywhere else cancels the move.
    const column = findColumnAt(event.clientX, event.clientY);
    if (!column) {
      say('Move cancelled.');
      return;
    }
    const beforeId = insertionPoint(column, event.clientY, id);
    await store.moveJob(id, column.dataset.column, beforeId);
    say(`Moved to ${labelFor(column.dataset.column)}.`);
  });

  const cancel = () => {
    if (!drag) return;
    drag.card.classList.remove('is-dragging');
    drag = null;
    highlight(null);
  };
  board.addEventListener('pointercancel', cancel);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && drag) {
      cancel();
      say('Move cancelled.');
    }
  });
}

function findColumnAt(x, y) {
  for (const column of document.querySelectorAll('.column')) {
    const r = column.getBoundingClientRect();
    if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return column;
  }
  return null;
}

function highlight(column) {
  for (const node of document.querySelectorAll('.column')) {
    node.classList.toggle('is-target', node === column);
  }
}

/** Which card the dragged one should land above, by midpoint. */
function insertionPoint(column, y, draggedId) {
  const cards = Array.from(column.querySelectorAll('.card')).filter((c) => c.dataset.jobId !== draggedId);
  for (const card of cards) {
    const r = card.getBoundingClientRect();
    if (y < r.top + r.height / 2) return card.dataset.jobId;
  }
  return null;
}
