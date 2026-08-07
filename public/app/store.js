// The one copy of the data in memory, and every write that touches it.
//
// Views read `state` and subscribe to changes. Nothing else talks to db.js
// directly, so there is exactly one place to look for "what happens when a spool
// is deleted" — and exactly one place where referential integrity is kept.

import * as db from './db.js';
import { COLUMN_IDS, TYPE_IDS, num } from './derive.js';

export const state = {
  spools: [],
  models: [],
  jobs: [],
  prefs: {
    currency: '£',
    inventorySort: 'material',
    hideFinished: false,
    typeFilter: [...TYPE_IDS],
    archivedOpen: false,
  },
  lastExportAt: null,
  firstRunDone: false,
  ready: false,
};

const listeners = new Set();

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function announce(reason) {
  for (const fn of listeners) fn(reason);
}

export function newId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  // Older WebViews. Enough entropy for records that never leave one device.
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

function nowIso() {
  return new Date().toISOString();
}

export async function load() {
  const [spools, models, jobs] = await Promise.all([
    db.getAll('spools'),
    db.getAll('models'),
    db.getAll('jobs'),
  ]);
  state.spools = spools;
  state.models = models;
  state.jobs = jobs;
  const prefs = await db.readMeta('prefs', null);
  if (prefs) state.prefs = { ...state.prefs, ...prefs };
  // A filter that has lost every option would show an empty board with no way to
  // tell an empty board from a hidden one.
  if (!Array.isArray(state.prefs.typeFilter) || state.prefs.typeFilter.length === 0) {
    state.prefs.typeFilter = [...TYPE_IDS];
  }
  state.lastExportAt = await db.readMeta('lastExportAt', null);
  state.firstRunDone = (await db.readMeta('firstRunDone', false)) === true;
  state.ready = true;
  announce('load');
}

export async function savePrefs(patch) {
  state.prefs = { ...state.prefs, ...patch };
  await db.writeMeta('prefs', state.prefs);
  announce('prefs');
}

export async function markFirstRunDone() {
  state.firstRunDone = true;
  await db.writeMeta('firstRunDone', true);
}

export async function noteExport(iso) {
  state.lastExportAt = iso;
  await db.writeMeta('lastExportAt', iso);
  announce('export');
}

// ---------------------------------------------------------------- spools

export async function saveSpool(input) {
  const existing = state.spools.find((s) => s.id === input.id);
  const record = {
    id: input.id || newId(),
    brand: (input.brand || '').trim(),
    material: (input.material || '').trim(),
    colorName: (input.colorName || '').trim(),
    colorHex: (input.colorHex || '').trim(),
    totalWeightG: num(input.totalWeightG),
    cost: num(input.cost),
    dateOpened: input.dateOpened || '',
    status: COLUMN_SAFE(input.status, ['sealed', 'open', 'finished'], 'sealed'),
    notes: (input.notes || '').trim(),
    createdAt: existing?.createdAt || nowIso(),
    updatedAt: nowIso(),
  };
  await db.put('spools', record);
  upsert(state.spools, record);
  announce('spools');
  return record;
}

/**
 * Deleting a spool that jobs have drawn on.
 *
 * The links are removed from those jobs IN THE SAME TRANSACTION as the spool
 * itself, so there is never an instant where a job points at a spool that is not
 * there. The caller has already told the reader how many jobs and grams this
 * touches — this function does not decide, it executes.
 */
export async function deleteSpool(id) {
  const touched = state.jobs
    .filter((j) => (j.spoolLinks || []).some((l) => l.spoolId === id))
    .map((j) => ({ ...j, spoolLinks: (j.spoolLinks || []).filter((l) => l.spoolId !== id), updatedAt: nowIso() }));

  await db.writeMany(['spools', 'jobs'], ({ spools, jobs }) => {
    spools.delete(id);
    for (const job of touched) jobs.put(job);
  });

  state.spools = state.spools.filter((s) => s.id !== id);
  for (const job of touched) upsert(state.jobs, job);
  announce('spools');
}

/** What deleting this spool would take with it. The dialog says this out loud. */
export function spoolDeletionImpact(id) {
  let jobs = 0;
  let grams = 0;
  for (const job of state.jobs) {
    const g = (job.spoolLinks || []).filter((l) => l.spoolId === id).reduce((s, l) => s + num(l.grams), 0);
    if (g > 0 || (job.spoolLinks || []).some((l) => l.spoolId === id)) {
      jobs += 1;
      grams += g;
    }
  }
  return { jobs, grams };
}

// ---------------------------------------------------------------- models

export async function saveModel(input) {
  const existing = state.models.find((m) => m.id === input.id);
  const record = {
    id: input.id || newId(),
    name: (input.name || '').trim(),
    designer: (input.designer || '').trim(),
    tags: normaliseTags(input.tags),
    notes: (input.notes || '').trim(),
    sources: normaliseSources(input.sources),
    listings: normaliseListings(input.listings),
    createdAt: existing?.createdAt || nowIso(),
    updatedAt: nowIso(),
  };
  await db.put('models', record);
  upsert(state.models, record);
  announce('models');
  return record;
}

export async function deleteModel(id) {
  const touched = state.jobs
    .filter((j) => j.modelId === id)
    .map((j) => ({ ...j, modelId: '', updatedAt: nowIso() }));

  await db.writeMany(['models', 'jobs'], ({ models, jobs }) => {
    models.delete(id);
    for (const job of touched) jobs.put(job);
  });

  state.models = state.models.filter((m) => m.id !== id);
  for (const job of touched) upsert(state.jobs, job);
  announce('models');
}

export function modelDeletionImpact(id) {
  return { jobs: state.jobs.filter((j) => j.modelId === id).length };
}

// ---------------------------------------------------------------- jobs

export async function saveJob(input) {
  const existing = state.jobs.find((j) => j.id === input.id);
  const column = COLUMN_SAFE(input.column, COLUMN_IDS, 'research');
  const record = {
    id: input.id || newId(),
    title: (input.title || '').trim(),
    type: COLUMN_SAFE(input.type, TYPE_IDS, 'fun'),
    requester: (input.requester || '').trim(),
    modelId: input.modelId || '',
    printer: (input.printer || '').trim(),
    quantity: Math.max(1, Math.round(num(input.quantity) || 1)),
    priceCharged: num(input.priceCharged),
    notes: (input.notes || '').trim(),
    spoolLinks: normaliseLinks(input.spoolLinks),
    column,
    order: existing ? num(existing.order) : nextOrder(column),
    createdAt: existing?.createdAt || nowIso(),
    // Stamped the first time it reaches delivered, and kept thereafter — see
    // chargedForModel() in derive.js for why the current column is not enough.
    deliveredAt: existing?.deliveredAt || (column === 'delivered' ? nowIso() : null),
    updatedAt: nowIso(),
  };
  await db.put('jobs', record);
  upsert(state.jobs, record);
  announce('jobs');
  return record;
}

export async function deleteJob(id) {
  await db.remove('jobs', id);
  state.jobs = state.jobs.filter((j) => j.id !== id);
  announce('jobs');
}

/**
 * Move a card. `beforeId` is the card it should land above, or null for the end.
 *
 * Returns the updated record so a caller can put focus back where the reader left
 * it — the board updates nodes in place rather than rebuilding, but a move can
 * still change which column a button lives in.
 */
export async function moveJob(id, column, beforeId = null) {
  const job = state.jobs.find((j) => j.id === id);
  if (!job) return null;
  const target = COLUMN_SAFE(column, COLUMN_IDS, job.column);

  const siblings = state.jobs
    .filter((j) => j.column === target && j.id !== id)
    .sort((a, b) => num(a.order) - num(b.order));

  let index = siblings.length;
  if (beforeId) {
    const at = siblings.findIndex((j) => j.id === beforeId);
    if (at >= 0) index = at;
  }
  siblings.splice(index, 0, job);

  const updated = siblings.map((j, i) => ({
    ...j,
    column: target,
    order: i,
    deliveredAt: j.deliveredAt || (target === 'delivered' && j.id === id ? nowIso() : j.deliveredAt),
    updatedAt: j.id === id ? nowIso() : j.updatedAt,
  }));

  await db.writeMany(['jobs'], ({ jobs }) => {
    for (const j of updated) jobs.put(j);
  });
  for (const j of updated) upsert(state.jobs, j);
  announce('jobs');
  return state.jobs.find((j) => j.id === id);
}

function nextOrder(column) {
  const rows = state.jobs.filter((j) => j.column === column);
  return rows.length ? Math.max(...rows.map((j) => num(j.order))) + 1 : 0;
}

// ---------------------------------------------------------------- helpers

function upsert(list, record) {
  const at = list.findIndex((r) => r.id === record.id);
  if (at >= 0) list[at] = record;
  else list.push(record);
}

function COLUMN_SAFE(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

function normaliseTags(tags) {
  if (Array.isArray(tags)) return tags.map((t) => String(t).trim()).filter(Boolean);
  return String(tags || '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

function normaliseSources(sources) {
  return (Array.isArray(sources) ? sources : [])
    .map((s) => ({ label: String(s.label || '').trim(), url: String(s.url || '').trim() }))
    .filter((s) => s.label || s.url);
}

function normaliseListings(listings) {
  return (Array.isArray(listings) ? listings : [])
    .map((l) => ({
      site: String(l.site || '').trim(),
      url: String(l.url || '').trim(),
      unitsSold: l.unitsSold === '' || l.unitsSold == null ? null : num(l.unitsSold),
      revenue: l.revenue === '' || l.revenue == null ? null : num(l.revenue),
    }))
    .filter((l) => l.site || l.url);
}

function normaliseLinks(links) {
  return (Array.isArray(links) ? links : [])
    .map((l) => ({ spoolId: String(l.spoolId || ''), grams: num(l.grams) }))
    .filter((l) => l.spoolId);
}

// Replacing everything, after an import. The in-memory copy is refilled from the
// payload rather than re-read, so a caller cannot show stale rows between the
// commit and the next load.
export function adoptImported(payload) {
  state.spools = payload.spools || [];
  state.models = payload.models || [];
  state.jobs = payload.jobs || [];
  announce('import');
}

export { db };
