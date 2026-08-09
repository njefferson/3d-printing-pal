// The one copy of the data in memory, and every write that touches it.
//
// Views read `state` and subscribe to changes. Nothing else talks to db.js
// directly, so there is exactly one place to look for "what happens when a spool
// is deleted" — and exactly one place where referential integrity is kept.

import * as db from './db.js';
import { COLUMN_IDS, TYPE_IDS, num } from './derive.js';

// PICTURES ARE NEVER HELD IN `state`. Every other store is small enough to keep
// in memory; images are not, and a board that loaded every blob to draw a row of
// text would spend the whole budget on records nobody is looking at. Instead the
// ids are known and the bytes are fetched one at a time, on demand, and the
// object URLs are cached and revoked.
const imageUrls = new Map();

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
  // Ids only. Enough to know whether a picture exists without reading its bytes;
  // the weight is measured on demand by `measureImages`.
  imageIds: [],
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
  const [spools, models, jobs, imageIds] = await Promise.all([
    db.getAll('spools'),
    db.getAll('models'),
    db.getAll('jobs'),
    db.getAllKeys('images'),
  ]);
  state.spools = spools;
  state.models = models;
  state.jobs = jobs;
  state.imageIds = imageIds;
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

// ---------------------------------------------------------------- pictures

/**
 * A displayable URL for a stored picture, or null if there is not one.
 *
 * Cached, because a board redraw asks for the same picture repeatedly and a new
 * object URL each time is a new blob reference the browser must keep alive — an
 * unrevoked URL per render is a leak that grows with how much the reader scrolls.
 */
export async function imageUrl(id) {
  if (!id) return null;
  if (imageUrls.has(id)) return imageUrls.get(id);
  const record = await db.get('images', id);
  if (!record?.blob) return null;
  const url = URL.createObjectURL(record.blob);
  imageUrls.set(id, url);
  return url;
}

function forgetImageUrl(id) {
  const url = imageUrls.get(id);
  if (url) URL.revokeObjectURL(url);
  imageUrls.delete(id);
}

function forgetAllImageUrls() {
  for (const id of [...imageUrls.keys()]) forgetImageUrl(id);
}

/** Store a picture prepared by image.js. Returns its id. */
export async function putImage(prepared) {
  const record = {
    id: newId(),
    blob: prepared.blob,
    type: prepared.type,
    width: prepared.width,
    height: prepared.height,
    bytes: prepared.bytes,
    addedAt: nowIso(),
  };
  await db.put('images', record);
  state.imageIds = await db.getAllKeys('images');
  return record.id;
}

export async function deleteImage(id) {
  if (!id) return;
  forgetImageUrl(id);
  await db.remove('images', id);
  state.imageIds = await db.getAllKeys('images');
}

/**
 * How much room the pictures take, MEASURED rather than tracked.
 *
 * A running total kept in meta would be one more number that can drift out of
 * step with the thing it describes — the same reason a spool's remaining weight
 * has no field. This reads the records, so it is only called where the figure is
 * actually shown.
 */
export async function measureImages() {
  const rows = await db.getAll('images');
  let bytes = 0;
  for (const row of rows) bytes += Number(row.bytes) || row.blob?.size || 0;
  return { count: rows.length, bytes };
}

/**
 * Ask the browser to treat this data as worth keeping.
 *
 * Without it, an origin's storage is "best effort" and can be evicted under
 * pressure — on iOS that is a real way to lose everything, and pictures make the
 * origin large enough to be worth evicting. It is a request, not a guarantee, and
 * the answer is reported honestly rather than assumed.
 */
export async function askToPersist() {
  if (!navigator.storage?.persist) return null;
  try {
    if (await navigator.storage.persisted?.()) return true;
    return await navigator.storage.persist();
  } catch {
    return null;
  }
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
    imageId: input.imageId || '',
    createdAt: existing?.createdAt || nowIso(),
    updatedAt: nowIso(),
  };

  // Replacing a picture drops the old one. Without this every re-pick would leave
  // a blob nobody points at, and the export would carry all of them forever.
  if (existing?.imageId && existing.imageId !== record.imageId) {
    await deleteImage(existing.imageId);
  }

  await db.put('models', record);
  upsert(state.models, record);
  announce('models');
  return record;
}

export async function deleteModel(id) {
  const model = state.models.find((m) => m.id === id);
  const touched = state.jobs
    .filter((j) => j.modelId === id)
    .map((j) => ({ ...j, modelId: '', updatedAt: nowIso() }));

  await db.writeMany(['models', 'jobs'], ({ models, jobs }) => {
    models.delete(id);
    for (const job of touched) jobs.put(job);
  });

  // AFTER the transaction, deliberately. Rolling a picture back into a store is
  // not something an aborted transaction can do for us, so the record goes first
  // and the picture follows — an orphaned blob is a wasted kilobyte, while a
  // model whose picture was deleted by a transaction that then aborted is a gap.
  if (model?.imageId) await deleteImage(model.imageId);

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
  state.imageIds = (payload.images || []).map((row) => row.id);

  // EVERY CACHED URL IS NOW WRONG. They point at blobs from the database that
  // was just replaced; an id reused across the two files would otherwise render
  // the OLD picture with no error anywhere, which is the kind of restore fault
  // that looks like a rendering bug for weeks.
  forgetAllImageUrls();

  announce('import');
}

export { db };
