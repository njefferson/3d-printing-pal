// The model catalog.
//
// The charged total is computed from jobs that HAVE BEEN delivered — jobs
// carrying a `deliveredAt` stamp — rather than from jobs currently sitting in the
// delivered column. Archiving a delivered job must not make its money disappear
// from the catalog. The count is shown beside the total so the figure can be
// checked rather than trusted.

import { $, el, clear, money } from '../dom.js';
import { chargedForModel, jobsForModel } from '../derive.js';
import * as store from '../store.js';
import { thumbFor } from './thumb.js';

let onEdit = () => {};
let onStart = () => {};

export function initModels({ onEditModel, onStartJob }) {
  onEdit = onEditModel;
  onStart = onStartJob;
}

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

  const edit = el('button', { type: 'button', class: 'btn' }, 'Open');
  edit.setAttribute('aria-label', `Open ${name}`);
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

  if (made.length) {
    body.append(el('p', { class: 'note', text: `${made.length} ${made.length === 1 ? 'job uses' : 'jobs use'} this model.` }));
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
