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

import { $, el, clear, money } from '../dom.js';
import { COLUMNS, TYPES, TYPE_IDS, TYPES_WITH_RECIPIENT, TYPES_WITH_PRICE, num, sortForBoard } from '../derive.js';
import * as store from '../store.js';
import { thumbFor } from './thumb.js';
import { openPanel, close, registerPanel, say } from './panels.js';

const cardNodes = new Map();
let onEdit = () => {};
let onOpenModel = () => {};
let moveTargetId = null;

export function initBoard({ onEditJob, onOpenModel: openModelFor }) {
  onEdit = onEditJob;
  onOpenModel = openModelFor;
  registerPanel('dlg-move', { onClose: () => { moveTargetId = null; } });

  const board = $('#board');
  for (const column of COLUMNS) board.append(buildColumn(column));

  for (const chip of document.querySelectorAll('.chip')) {
    chip.addEventListener('click', () => {
      const type = chip.dataset.type;
      const active = new Set(store.state.prefs.typeFilter);
      if (active.has(type)) active.delete(type);
      else active.add(type);
      /* THE LAST CHIP CAN BE SWITCHED OFF, and refusing that was a guard against a
       * confusion this app does not have.
       *
       * It was written to stop a reader filtering everything away "with no way to
       * tell an empty board from a hidden one" — but the board has TWO empty
       * messages and always did. `#board-empty` says there are no jobs;
       * `#board-filtered` says every job is hidden by the filters above. The
       * distinction the guard protected was already being made, in words, ten
       * lines further down this file.
       *
       * So all it did was refuse an ordinary act — clear the lot, then pick the
       * one thing you want to look at — and make the reader work out which chip
       * the app would not let go of. 0.8.1 made that worse in a way nothing
       * measured: a chip that will not turn off looks exactly like a chip that
       * did not register the press.
       */
      // The known-types list travels with every write, so turning a chip OFF is
      // recorded as a decision about a type that existed rather than as an absence.
      store.savePrefs({ typeFilter: [...active], typeFilterKnown: [...TYPE_IDS] });
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
  // A class rather than a position: the actions row gained a third child and
  // `button:last-child` silently stopped matching anything.
  // THREE CONTROLS ON THIS CARD ALL READ AS "OPEN" UNTIL 1.2.0, and each opened
  // something different: this job, the model it prints, and a web page on
  // somebody else's site. "Open", "Open the model" and a bare site name sat in one
  // row, so the reader had to already know the answer to read the buttons.
  //
  // Each one names its object now, and the two verbs are different words: EDIT
  // this record, go to the MODEL, leave for the SITE. Nothing was added or taken
  // away — the same three destinations, said in three distinguishable ways.
  const editBtn = el('button', { type: 'button', class: 'btn card-open' }, 'Edit');
  // WHERE THE FILE IS, on the card that makes you want it. The link lives on the
  // model, which is a different tab — so choosing something to print meant
  // reading the board, leaving it, finding the model, and coming back. Hidden
  // when the model has no link, or the job has no model.
  //
  // AND IT IS DRAWN AS A LINK, NOT AS A BUTTON. It is the only control on the
  // card that leaves the app, and dressing it identically to the two that do not
  // was the whole reason a site's name in a row of buttons read as a third
  // mystery button. The arrow is aria-hidden so the accessible name still opens
  // with the visible site name (SC 2.5.3).
  const sourceLink = el('a', { class: 'card-source', rel: 'noopener noreferrer', target: '_blank' });
  sourceLink.hidden = true;
  // WHICH MODEL, AND A WAY INTO IT. The card showed a model's picture without
  // ever naming it, so the only route from a job to the thing it prints was the
  // Models tab and a hunt. This says which and opens it. Hidden when the job has
  // no model, like the source link beside it.
  const modelBtn = el('button', { type: 'button', class: 'btn card-model' });
  modelBtn.hidden = true;

  const thumb = el('div', { class: 'card-thumb' });

  /* A CARD WITH NO PICTURE HAD NOTHING TO LOOK AT, only words, and beside a card
   * carrying a photograph it stopped registering as an item at all — 155px against
   * 345px, and the tall one is the one the eye goes to. 0.5.1 took the empty
   * 128px band off these cards for good reason and that measurement still holds;
   * this is not it coming back. It is a 56px mark in the card's HEAD, where the
   * eye already is, so the card has an anchor without a picture-sized hole.
   *
   * The letter is the job's own initial, so a column of them is scannable rather
   * than a wall of one repeated glyph. aria-hidden, because the title it is taken
   * from is the next thing read out. */
  const mark = el('div', { class: 'card-mark', 'aria-hidden': 'true' });

  const node = el(
    'li',
    { class: 'card', dataset: { jobId: job.id } },
    el('div', { class: 'card-top' }, mark, el('div', { class: 'card-topmain' }, badge, title), grip),
    thumb,
    meta,
    el('div', { class: 'card-actions' }, moveBtn, editBtn, modelBtn, sourceLink),
  );

  node._parts = { grip, title, badge, meta, moveBtn, editBtn, thumb, sourceLink, modelBtn, mark };

  moveBtn.addEventListener('click', () => openMove(job.id, moveBtn));
  editBtn.addEventListener('click', () => onEdit(node.dataset.jobId));
  modelBtn.addEventListener('click', () => {
    const current = store.state.jobs.find((j) => j.id === node.dataset.jobId);
    if (current?.modelId) onOpenModel(current.modelId, modelBtn);
  });

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

  // A job shows its own picture if it has one, and otherwise the picture of the
  // model it prints — which is where the picture usually is, since that is the
  // thing that came from a site with a photograph on it.
  const model = job.modelId ? store.state.models.find((m) => m.id === job.modelId) : null;
  const imageId = job.imageId || model?.imageId || '';
  // Cards are recycled rather than rebuilt, so the thumbnail is only replaced
  // when the picture it should be showing has actually changed. Rebuilding it on
  // every redraw would re-read the blob and flicker on every filter press.
  if (node._thumbId !== imageId) {
    node._thumbId = imageId;
    clear(p.thumb);
    // keepSpace false: a card with no picture takes no picture-sized hole. See
    // the note over thumbFor for the measurement.
    p.thumb.append(thumbFor(imageId, job.title || 'this job', { keepSpace: false }));
  }

  // The mark stands in for the picture and is hidden the moment there is one, so
  // no card ever carries both. A letter only — never the whole word, which at this
  // size becomes an unreadable smudge that looks like a rendering fault.
  const initial = (job.title || '').trim().replace(/^[^\p{L}\p{N}]+/u, '').charAt(0);
  p.mark.textContent = initial ? initial.toUpperCase() : '·';
  p.mark.hidden = Boolean(imageId);

  /* WHAT THIS JOB ACTUALLY HAS, and nothing else. Every line here is conditional
   * except the quantity, because a card that prints "Printer: —" or "For: —" is
   * spending its scarcest thing — a line of a tile on a phone — to say that a
   * field is empty.
   *
   * The price is gated on the TYPE rather than on the number being present, which
   * is the same rule the form follows. A stray price on a Gift is a record from
   * before 0.8.0 and is not the card's job to surface. */
  const bits = [];
  if (job.printer) bits.push(`Printer: ${job.printer}`);
  bits.push(`Quantity: ${job.quantity}`);
  if (TYPES_WITH_RECIPIENT.includes(job.type) && job.requester) bits.push(`For: ${job.requester}`);
  if (TYPES_WITH_PRICE.includes(job.type) && num(job.priceCharged) > 0) {
    bits.push(money(job.priceCharged, store.state.prefs.currency));
  }
  clear(p.meta);
  for (const bit of bits) p.meta.append(el('span', { text: bit }));

  /* Named on the card rather than only implied by its picture — but NOT when the
   * name is the job's own title, which is now the ordinary case, because the Model
   * box fills itself from the title. Printing the same words twice cost three
   * lines of a card and told the reader nothing; the button still says what it
   * opens, and the accessible name carries the model's name either way so anyone
   * who cannot see the title above it still hears which model this is. */
  if (model) {
    const name = model.name || 'unnamed';
    const same = normalise(name) === normalise(job.title);
    p.modelBtn.hidden = false;
    // WHEN THE NAME REPEATS THE TITLE, THE BUTTON IS JUST "MODEL" — a noun, so it
    // reads as a destination beside "Edit" rather than as a second verb. It said
    // "Open the model", which put a third "open" in a row of three.
    p.modelBtn.textContent = same ? 'Model' : `Model: ${name}`;
    p.modelBtn.setAttribute('aria-label', same ? `Model ${name} — open it` : `Model: ${name} — open it`);
  } else {
    p.modelBtn.hidden = true;
    p.modelBtn.textContent = '';
  }

  // The first source the model carries. `http(s)` only, checked here rather than
  // trusted from the record, because an imported file is somebody else's bytes.
  const source = (model?.sources || []).find((s) => isWebLink(s.url));
  if (source) {
    const site = source.label || 'The file';
    p.sourceLink.hidden = false;
    p.sourceLink.href = source.url;
    // "On Printables", not "Printables". A site's name alone is a label with no
    // grammar — it could equally be a heading, a tag, or a filter. The preposition
    // is what makes it read as somewhere you are being taken.
    //
    // THE ARROW IS DRAWN BY CSS, not written here. It was an aria-hidden span for
    // about ten minutes, and in that time two gates disagreed about whether it was
    // part of the visible label: this repo's a11y gate strips aria-hidden before
    // comparing, the data-safety walk did not, and one of them failed SC 2.5.3 on
    // markup the other passed. The arrow is decoration, decoration belongs in the
    // stylesheet, and putting it there leaves nothing for two checks to disagree
    // about. The explicit aria-label means pseudo content cannot reach the name.
    p.sourceLink.textContent = `On ${site}`;
    // The visible words open the accessible name (SC 2.5.3), which then says what
    // pressing it does and that it leaves the app.
    p.sourceLink.setAttribute(
      'aria-label',
      `On ${site} — where ${job.title || 'this job'} came from, opens in a new tab`,
    );
  } else {
    p.sourceLink.hidden = true;
    p.sourceLink.removeAttribute('href');
    p.sourceLink.replaceChildren();
  }

  p.moveBtn.setAttribute('aria-label', `Move ${job.title || 'this job'} to another column`);
  p.editBtn.setAttribute('aria-label', `Edit ${job.title || 'this job'}`);
  p.grip.querySelector('.sr-only').textContent = `Drag ${job.title || 'this job'}, or press to choose a column`;
}

// ------------------------------------------------------------- the move list
//
// TWO KINDS OF MOVE, because the drag has always done two things. Dragging a card
// carries it to another column AND to a place within that column, and this panel
// used to answer only the first — so the order of a column was reachable by drag
// and by nothing else, which is the exact shape SC 2.5.7 exists to forbid. It
// passed the interactions gate because an alternative existed; the gate cannot
// tell that the alternative does less than the drag it stands in for.
//
// EACH POSITION IS NAMED AND TAKES ONE PRESS. The other spelling — a pair of
// up/down buttons pressed repeatedly — moves a card the reader cannot see, since
// the panel is modal and covers the board. "Put before Calibration cube" says
// where the card lands before it lands there.

function openMove(jobId, opener) {
  const job = store.state.jobs.find((j) => j.id === jobId);
  if (!job) return;
  moveTargetId = jobId;

  const here = labelFor(job.column);
  const siblings = sortForBoard(store.state.jobs.filter((j) => j.column === job.column))
    .filter((j) => j.id !== jobId);

  $('#move-what').textContent = siblings.length
    ? `${job.title || 'This job'} is in ${here}, ${ordinalOf(job, siblings)} of ${siblings.length + 1}.`
    : `${job.title || 'This job'} is the only job in ${here}.`;

  const list = $('#move-list');
  clear(list);

  // The card immediately after this one: putting it before that card is where it
  // already is, so offering it would be a button that does nothing.
  const currentNext = nextSiblingOf(job, siblings);

  if (siblings.length) {
    list.append(el('h3', { class: 'movelist-head', text: `Order within ${here}` }));
    for (const other of siblings) {
      if (other.id === currentNext?.id) continue;
      addMove(list, `Put before ${other.title || 'the untitled job'}`, job.column, other.id,
              `${job.title || 'Job'} moved before ${other.title || 'the untitled job'}.`);
    }
    if (currentNext) {
      addMove(list, `Put last in ${here}`, job.column, null, `${job.title || 'Job'} moved to the end of ${here}.`);
    }
  }

  list.append(el('h3', { class: 'movelist-head', text: 'Another column' }));
  for (const column of COLUMNS) {
    if (column.id === job.column) continue;
    addMove(list, `Move to ${column.label}`, column.id, null, `${job.title || 'Job'} moved to ${column.label}.`);
  }

  openPanel('dlg-move', opener);

  function addMove(into, label, column, beforeId, spoken) {
    const button = el('button', { type: 'button', class: 'btn' }, label);
    button.addEventListener('click', async () => {
      close('dlg-move');
      await store.moveJob(jobId, column, beforeId);
      say(spoken);
    });
    into.append(button);
  }
}

/** Where this job sits among its column, in words rather than an index. */
function ordinalOf(job, siblings) {
  const all = sortForBoard(store.state.jobs.filter((j) => j.column === job.column));
  const at = all.findIndex((j) => j.id === job.id);
  if (at === 0) return 'first';
  if (at === siblings.length) return 'last';
  return `number ${at + 1}`;
}

function nextSiblingOf(job, siblings) {
  const all = sortForBoard(store.state.jobs.filter((j) => j.column === job.column));
  const at = all.findIndex((j) => j.id === job.id);
  const next = all[at + 1];
  return next && siblings.some((s) => s.id === next.id) ? next : null;
}

function labelFor(id) {
  return COLUMNS.find((c) => c.id === id)?.label || id;
}

/** Trimmed, inner whitespace collapsed, case folded — the same comparison the
 *  store uses to decide whether a typed name is a model it already has. */
function normalise(text) {
  return String(text || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

/** Only http(s) reaches an href. A `javascript:` source row is a stored hazard. */
function isWebLink(url) {
  try {
    const parsed = new URL(String(url || ''), location.href);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
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
