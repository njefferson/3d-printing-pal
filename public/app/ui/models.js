// The model catalog.
//
// The charged total is computed from jobs that HAVE BEEN delivered — jobs
// carrying a `deliveredAt` stamp — rather than from jobs currently sitting in the
// delivered column. Archiving a delivered job must not make its money disappear
// from the catalog. The count is shown beside the total so the figure can be
// checked rather than trusted.

import { $, el, clear, money } from '../dom.js';
import { chargedForModel, jobsForModel, COLUMNS } from '../derive.js';
import * as store from '../store.js';
import { thumbFor } from './thumb.js';

let onEdit = () => {};
let onStart = () => {};
let onOpenJob = () => {};

export function initModels({ onEditModel, onStartJob, onOpenJob: openJob }) {
  onEdit = onEditModel;
  onStart = onStartJob;
  onOpenJob = openJob;
}

const columnLabel = (id) => COLUMNS.find((c) => c.id === id)?.label || id;

export function renderModels() {
  const { models, jobs, prefs } = store.state;
  const list = $('#models-list');
  clear(list);

  const sorted = [...models].sort((a, b) => String(a.name).localeCompare(String(b.name), undefined, { sensitivity: 'base' }));
  for (const model of sorted) list.append(buildModelRow(model, jobs, prefs.currency));

  $('#models-empty').hidden = models.length > 0;
}

function buildModelRow(model, jobs, currency) {
  const charged = chargedForModel(model.id, jobs);
  const made = jobsForModel(model.id, jobs);
  const name = model.name || 'Unnamed model';

  // "EDIT", NOT "OPEN". Open says a panel will appear and nothing about what is
  // in it, which is survivable on a card with one button and useless on a card
  // with several — the board's job card had three controls that all read as some
  // flavour of "open" and none of them named what they opened. A verb the reader
  // already knows costs the same width.
  const edit = el('button', { type: 'button', class: 'btn' }, 'Edit');
  edit.setAttribute('aria-label', `Edit ${name}`);
  edit.addEventListener('click', () => onEdit(model.id));

  // THE CATALOG IS WHERE "what shall I print" IS ANSWERED, so it is where the
  // answer has to be actionable. Without this, deciding to print something meant
  // going to the board, pressing Add job, and typing a name the app already knew —
  // which is the same friction as having to hunt the Models tab for a job's model,
  // in the other direction.
  //
  // The visible words are a PREFIX of the accessible name rather than merely
  // inside it (SC 2.5.3), so "start a job" said out loud reaches this control.
  const start = el('button', { type: 'button', class: 'btn btn-primary' }, 'Start a job');
  start.setAttribute('aria-label', `Start a job printing ${name}`);
  start.addEventListener('click', (e) => onStart(model.id, e.currentTarget));

  // PICTURE AND NAME, never picture instead of name. The picture is what makes a
  // model recognisable at a glance; the name is what makes it findable, what is
  // read aloud, and what is there when the picture is not.
  const head = el('div', { class: 'rowcard-head' },
    thumbFor(model.imageId, name),
    el('div', {},
      el('h3', { class: 'rowcard-title', text: name }),
      el('p', { class: 'rowcard-sub', text: [model.designer && `by ${model.designer}`, (model.tags || []).join(', ')].filter(Boolean).join(' · ') }),
    ),
  );

  const body = el('div', { class: 'rowcard-body' });

  body.append(
    el('p', { class: 'remaining' },
      charged.count === 0
        ? 'Nothing delivered from this yet'
        : `${money(charged.total, currency) || `${currency}0.00`} charged across ${charged.count} delivered ${charged.count === 1 ? 'job' : 'jobs'}`),
  );

  // THE JOBS, REACHABLE, not counted at.
  //
  // This said "3 jobs use this model." and stopped there — a sentence that names
  // something the reader can now see exists and gives them no way to get to it.
  // The route was: read the number, go to the board, and find the cards by eye.
  // Every other link in this app is bidirectional (a job says which model, a
  // model said how many jobs) and this was the one direction that dead-ended.
  //
  // Each one presses through to the job on the board, which is where a job lives
  // — so closing the form leaves the reader looking at it rather than back on a
  // catalogue page wondering whether the change took.
  if (made.length) {
    body.append(el('h4', { class: 'rowcard-sub', text: made.length === 1 ? 'Printed as one job' : `Printed as ${made.length} jobs` }));
    body.append(el('ul', { class: 'rowcard-jobs' }, ...made.map((job) => {
      const title = job.title || 'Untitled job';
      const where = columnLabel(job.column);
      const go = el('button', { type: 'button', class: 'btn joblink' },
        el('span', { class: 'joblink-title', text: title }),
        // A REAL SPACE BETWEEN THEM, not just a flex gap. The two spans sit at
        // opposite ends of the row and look like separate words, but with nothing
        // between them in the DOM the name computed from this button's contents
        // is "BenchyResearch" — one nonsense word, which is what a reader with no
        // aria-label would hear and what SC 2.5.3 compares against. The gap is a
        // painting instruction; text needs text.
        document.createTextNode(' '),
        el('span', { class: 'joblink-where', text: where }),
      );
      // The visible words are the job's title then its column, so the accessible
      // name opens with them (SC 2.5.3) and then says what pressing does.
      go.setAttribute('aria-label', `${title} ${where} — open this job on the board`);
      go.addEventListener('click', (e) => onOpenJob(job.id, e.currentTarget));
      return el('li', {}, go);
    })));
  }

  if ((model.sources || []).length) {
    body.append(el('h4', { class: 'rowcard-sub', text: 'Where the file came from' }));
    body.append(el('ul', { class: 'rowcard-links' }, ...model.sources.map((s) => el('li', {}, linkOrText(s.url, s.label || s.url)))));
  }

  if ((model.listings || []).length) {
    body.append(el('h4', { class: 'rowcard-sub', text: 'Where it is listed' }));
    body.append(el('ul', { class: 'rowcard-links' }, ...model.listings.map((l) => {
      const extras = [];
      if (l.unitsSold != null && l.unitsSold !== '') extras.push(`${l.unitsSold} sold`);
      if (l.revenue != null && l.revenue !== '') extras.push(`${money(l.revenue, currency)} revenue`);
      const item = el('li', {}, linkOrText(l.url, l.site || l.url));
      if (extras.length) item.append(document.createTextNode(` — ${extras.join(', ')}`));
      return item;
    })));
  }

  if (model.notes) body.append(el('p', { class: 'note', text: model.notes }));

  return el('li', { class: 'rowcard' },
    el('div', { class: 'rowcard-head' }, head, el('div', { class: 'rowcard-actions' }, start, edit)),
    body);
}

function linkOrText(url, label) {
  const text = label || url || 'Untitled';
  if (!url) return document.createTextNode(text);
  // Only http(s) becomes a link. A javascript: or data: URL typed into a text
  // field must never become something the app will follow on a press.
  let safe = false;
  try {
    const parsed = new URL(url, location.href);
    safe = parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    safe = false;
  }
  if (!safe) return document.createTextNode(text);
  return el('a', { href: url, rel: 'noopener noreferrer', target: '_blank' }, text);
}
