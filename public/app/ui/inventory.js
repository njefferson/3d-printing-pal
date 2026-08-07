// The spool inventory.
//
// Remaining weight is asked for here, not stored here. Every number on this
// screen comes from derive.js at the moment it is drawn.

import { $, el, clear, grams, money } from '../dom.js';
import { remainingFor, remainingFraction, usageHistoryFor, sortSpools, num } from '../derive.js';
import * as store from '../store.js';

let onEdit = () => {};

export function initInventory({ onEditSpool }) {
  onEdit = onEditSpool;

  $('#inv-sort').addEventListener('change', (event) => {
    store.savePrefs({ inventorySort: event.target.value });
  });
  $('#inv-hide-finished').addEventListener('change', (event) => {
    store.savePrefs({ hideFinished: event.target.checked });
  });
}

export function renderInventory() {
  const { spools, jobs, prefs } = store.state;
  $('#inv-sort').value = prefs.inventorySort;
  $('#inv-hide-finished').checked = prefs.hideFinished === true;

  const rows = sortSpools(
    prefs.hideFinished ? spools.filter((s) => s.status !== 'finished') : spools,
    jobs,
    prefs.inventorySort,
  );

  const list = $('#inventory-list');
  clear(list);
  for (const spool of rows) list.append(buildSpoolRow(spool, jobs, prefs.currency));

  $('#inventory-empty').hidden = spools.length > 0;
}

function buildSpoolRow(spool, jobs, currency) {
  const left = remainingFor(spool, jobs);
  const total = num(spool.totalWeightG);
  const fraction = remainingFraction(spool, jobs);
  const used = total - left;
  const history = usageHistoryFor(spool.id, jobs);
  const low = total > 0 && fraction < 0.15;

  const name = [spool.brand, spool.material].filter(Boolean).join(' ') || 'Unnamed spool';
  const colour = spool.colorName || '';

  const title = el('h3', { class: 'rowcard-title' });
  if (spool.colorHex) title.append(el('span', { class: 'swatch', style: { background: spool.colorHex }, 'aria-hidden': 'true' }));
  title.append(document.createTextNode(name + (colour ? ` — ${colour}` : '')));

  const edit = el('button', { type: 'button', class: 'btn' }, 'Open');
  edit.setAttribute('aria-label', `Open ${name}${colour ? ` in ${colour}` : ''}`);
  edit.addEventListener('click', () => onEdit(spool.id));

  const bar = el('div', { class: 'bar', role: 'img', 'aria-label': `${Math.round(fraction * 100)} per cent of this spool is left` },
    el('div', { class: 'bar-fill', style: { width: `${(fraction * 100).toFixed(1)}%` } }));

  const details = [];
  if (total > 0) details.push(`${grams(used)} used of ${grams(total)}`);
  if (spool.cost) details.push(`Cost ${money(spool.cost, currency)}`);
  if (spool.dateOpened) details.push(`Opened ${spool.dateOpened}`);
  details.push(statusLabel(spool.status));

  const body = el('div', { class: 'rowcard-body' },
    bar,
    // The number is text, and "low" is said in words as well as coloured — the
    // colour is reinforcement, never the only signal.
    el('p', { class: `remaining${low ? ' remaining-low' : ''}` }, `${grams(left)} left${low ? ' — running low' : ''}`),
    el('p', { class: 'note', text: details.join(' · ') }),
  );

  if (history.length) {
    const items = history.slice(0, 6).map((row) => el('li', { text: `${row.job.title || 'Untitled job'} — ${grams(row.grams)}` }));
    body.append(el('h4', { text: 'Where it went', class: 'rowcard-sub' }), el('ul', {}, ...items));
    if (history.length > 6) body.append(el('p', { class: 'note', text: `and ${history.length - 6} more.` }));
  } else {
    body.append(el('p', { class: 'note', text: 'Nothing logged against this spool yet.' }));
  }

  if (spool.notes) body.append(el('p', { class: 'note', text: spool.notes }));

  return el('li', { class: 'rowcard' },
    el('div', { class: 'rowcard-head' }, el('div', {}, title), edit),
    body,
  );
}

function statusLabel(status) {
  if (status === 'open') return 'Open';
  if (status === 'finished') return 'Finished';
  return 'Sealed';
}
