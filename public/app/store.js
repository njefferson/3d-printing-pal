// The one copy of the data in memory, and every write that touches it.
//
// Views read `state` and subscribe to changes. Nothing else talks to db.js
// directly, so there is exactly one place to look for "what happens when a spool
// is deleted" — and exactly one place where referential integrity is kept.

import * as db from './db.js';
import { COLUMN_IDS, TYPE_IDS, num, sortForBoard } from './derive.js';
import { siteFrom } from './fromurl.js';

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
    // The types that existed when typeFilter was last written — see the load path
    // for why the filter alone cannot tell a new type from a rejected one.
    typeFilterKnown: [...TYPE_IDS],
    archivedOpen: false,
  },
  // Ids only. Enough to know whether a picture exists without reading its bytes;
  // the weight is measured on demand by `measureImages`.
  imageIds: [],
  lastExportAt: null,
  firstRunDone: false,
  ready: false,
};

// ------------------------------------------------------------------- undo
//
// THE JOURNAL HOLDS WHAT WAS THERE, not how to reverse what happened.
//
// The other shape — record each operation and its inverse — is smaller and is
// wrong more often: every mutation needs a matching un-mutation, the two drift,
// and the ones that cascade (deleting a spool unlinks it from every job that drew
// on it) need an inverse that reproduces the cascade exactly. A snapshot of the
// affected records before the change reverses ALL of them by the same code, and
// it is provable rather than clever: undo puts back precisely what was read.
//
// ONE GESTURE IS ONE ENTRY, cascades included. Deleting a spool that four jobs
// used is one entry holding the spool and those four jobs, so one undo returns
// all five. An undo that needed pressing five times would be an accounting of the
// implementation rather than of what the reader did.
//
// IT IS MEMORY ONLY, AND THAT IS A DECISION. Undo is a correction within a
// sitting — the wrong button a moment ago. Something deleted yesterday is a
// restore from a backup, which export already does properly, with a file the
// reader holds. Persisting this would also force a question with no good answer:
// whether the journal belongs in the export, and a backup carrying its own undo
// history is a strange object to hand somebody.
const MAX_UNDO = 20;
const journal = [];

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

  /* A TYPE THAT DID NOT EXIST WHEN THE FILTER WAS SAVED IS ON.
   *
   * The filter is stored as the list of types to SHOW, which is the natural
   * spelling and quietly wrong across a release that adds one: a reader whose
   * prefs say ['request','wanted','fun'] has a stored answer that predates
   * `ordered`, so every Ordered job would be filtered off their board — invisible,
   * on the release that introduced them, with the chips looking untouched.
   *
   * IT CANNOT BE FIXED BY UNIONING, because "not in the list" is also exactly what
   * a chip the reader turned OFF looks like. The two states are identical in the
   * stored array and are opposite in meaning, so the array cannot answer it.
   *
   * `typeFilterKnown` is the missing fact: the types that EXISTED when the filter
   * was last written. Anything current and unknown is new, and new is on. A reader
   * who then turns it off writes a `known` that contains it, and it stays off.
   *
   * Absent entirely means prefs written before 0.8.0, where the same rule gives
   * the right answer for the same reason. */
  const known = Array.isArray(state.prefs.typeFilterKnown) ? state.prefs.typeFilterKnown : [];
  const unseen = TYPE_IDS.filter((id) => !known.includes(id) && !state.prefs.typeFilter.includes(id));
  if (unseen.length) {
    state.prefs.typeFilter = [...state.prefs.typeFilter, ...unseen];
    state.prefs.typeFilterKnown = [...TYPE_IDS];
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

/**
 * Store a picture prepared by image.js. Returns its id.
 *
 * NOT EXPORTED, and that is the fix rather than a preference. The picture field
 * called this directly and passed the id on to `saveModel`, which put the image
 * write outside the model write and therefore outside its undo entry — undo
 * restored the old model and left the new blob orphaned in the database. Every
 * picture now enters through `saveModel`, so there is no door left to walk
 * around it.
 */
async function putImage(prepared) {
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

// Not exported either, and for the same reason as putImage: a picture removed
// outside the call that removes the thing pointing at it is a removal outside the
// undo entry, which undo then cannot put back.
async function deleteImage(id) {
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

/**
 * Read the records a gesture is about to touch, exactly as they are now.
 *
 * A record that does not exist yet is captured as `null`, which is what makes a
 * CREATE undoable by the same code that undoes an edit: undo writes the record
 * back, or deletes the id when there was nothing there.
 */
async function capture(affected) {
  const before = {};
  for (const [store, ids] of Object.entries(affected)) {
    const rows = [];
    for (const id of new Set(ids.filter(Boolean))) {
      // Images live only in IndexedDB — they are deliberately never held in
      // `state`, so they are the one store that has to be read to be captured.
      const record = store === 'images'
        ? (await db.get('images', id)) || null
        : (state[store] || []).find((r) => r.id === id) || null;
      rows.push({ id, record });
    }
    before[store] = rows;
  }
  return before;
}

function remember(label, before) {
  journal.push({ id: newId(), at: nowIso(), label, before });
  // Oldest out. Bounded by COUNT rather than bytes: an entry holding a deleted
  // model's picture is the heavy case, and pictures are already capped at a
  // couple of hundred kilobytes each, so the worst this ring can hold is a few
  // megabytes — small beside the database it protects.
  while (journal.length > MAX_UNDO) journal.shift();
}

/** What the next undo would reverse, in the reader's words, or null. */
export function undoLabel() {
  return journal.length ? journal[journal.length - 1].label : null;
}

/**
 * The identity of the change the strip is currently offering to undo.
 *
 * The strip can be dismissed, and a dismissal has to last exactly until the NEXT
 * change rather than for the sitting. Keying that on the label would hide the
 * strip for a second change that happened to be described identically — adding
 * two jobs called the same thing, which is a normal afternoon here.
 */
export function undoId() {
  return journal.length ? journal[journal.length - 1].id : null;
}

export function canUndo() {
  return journal.length > 0;
}

/**
 * Put back what the last gesture changed.
 *
 * ONE TRANSACTION across every store the gesture touched, for the same reason the
 * import is one transaction: a half-applied undo is a worse state than the one
 * being undone, and only atomicity rules it out.
 *
 * State is then re-read from the database rather than patched in memory. Patching
 * would be faster and would be a second implementation of the same restore, able
 * to disagree with the first.
 */
export async function undo() {
  const entry = journal.pop();
  if (!entry) return null;

  const stores = Object.keys(entry.before);
  await db.writeMany(stores, (handles) => {
    for (const [store, rows] of Object.entries(entry.before)) {
      for (const { id, record } of rows) {
        if (record) handles[store].put(record);
        else handles[store].delete(id);
      }
    }
  });

  // Any cached object URL for a touched picture now points at a blob that may
  // have been replaced or removed. A stale one renders the OLD image with no
  // error, which reads as a rendering bug rather than a data one.
  for (const row of entry.before.images || []) forgetImageUrl(row.id);

  await load();
  announce('undo');
  return entry.label;
}

/** Emptied by anything that makes the journal meaningless — an import. */
function forgetUndo() {
  journal.length = 0;
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
  const before = await capture({ spools: [existing?.id || input.id].filter(Boolean) });
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
  remember(existing ? `editing ${record.brand || 'a spool'}` : `adding ${record.brand || 'a spool'}`,
           existing ? before : { spools: [{ id: record.id, record: null }] });
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
  const spool = state.spools.find((s) => s.id === id);
  const touched = state.jobs
    .filter((j) => (j.spoolLinks || []).some((l) => l.spoolId === id))
    .map((j) => ({ ...j, spoolLinks: (j.spoolLinks || []).filter((l) => l.spoolId !== id), updatedAt: nowIso() }));

  // Captured BEFORE the write, and covering the cascade: the spool and every job
  // it was unlinked from are one entry, so one undo returns all of them.
  const before = await capture({ spools: [id], jobs: touched.map((j) => j.id) });

  await db.writeMany(['spools', 'jobs'], ({ spools, jobs }) => {
    spools.delete(id);
    for (const job of touched) jobs.put(job);
  });

  state.spools = state.spools.filter((s) => s.id !== id);
  for (const job of touched) upsert(state.jobs, job);
  remember(`deleting ${spool?.brand || 'a spool'}`, before);
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

/**
 * `input.picture` is `{ prepared, removed }` from the picture field — the bytes,
 * NOT an id.
 *
 * The picture is written HERE rather than by the form, so that creating it is
 * inside the same gesture as the model save and therefore inside the same undo
 * entry. When the form stored it first, undoing a picture change put the old one
 * back and left the new one in the database with nothing pointing at it — an
 * orphan that the export then carried forever.
 */
export async function saveModel(input) {
  const existing = state.models.find((m) => m.id === input.id);
  const picture = input.picture || null;

  // Captured before anything is written. The new picture's id cannot be known
  // yet, so its tombstone is added below once it exists.
  const before = await capture({
    models: [existing?.id].filter(Boolean),
    images: [existing?.imageId].filter(Boolean),
  });

  let imageId = existing?.imageId || '';
  if (picture?.prepared) {
    imageId = await putImage(picture.prepared);
    // It did not exist a moment ago, so undo deletes it rather than restoring it.
    before.images = [...(before.images || []), { id: imageId, record: null }];
  } else if (picture?.removed) {
    imageId = '';
  } else if (input.imageId !== undefined) {
    imageId = input.imageId || '';
  }

  const record = {
    id: input.id || newId(),
    name: (input.name || '').trim(),
    designer: (input.designer || '').trim(),
    tags: normaliseTags(input.tags),
    notes: (input.notes || '').trim(),
    sources: normaliseSources(input.sources),
    listings: normaliseListings(input.listings),
    imageId,
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
  remember(existing ? `editing ${record.name || 'a model'}` : `adding ${record.name || 'a model'}`,
           existing ? before : { ...before, models: [{ id: record.id, record: null }] });
  announce('models');
  return record;
}

export async function deleteModel(id) {
  const model = state.models.find((m) => m.id === id);
  const touched = state.jobs
    .filter((j) => j.modelId === id)
    .map((j) => ({ ...j, modelId: '', updatedAt: nowIso() }));

  const before = await capture({
    models: [id],
    jobs: touched.map((j) => j.id),
    images: [model?.imageId].filter(Boolean),
  });

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
  remember(`deleting ${model?.name || 'a model'}`, before);
  announce('models');
}

export function modelDeletionImpact(id) {
  return { jobs: state.jobs.filter((j) => j.modelId === id).length };
}

// ---------------------------------------------------------------- jobs

/**
 * The model with this name, or null.
 *
 * Compared on a NORMALISED name — trimmed, inner runs of whitespace collapsed,
 * case folded — because the reader typing a model's name into the job form is
 * naming a thing they can see, not quoting a key. "benchy " and "Benchy" are the
 * same model to them, and a match that says otherwise makes a second one.
 *
 * Nothing has ever held model names unique, so a tie is possible in data that
 * already exists. The oldest wins, which at least makes the answer stable rather
 * than dependent on the order records came back in.
 */
export function modelNamed(name) {
  const wanted = normaliseName(name);
  if (!wanted) return null;
  const hits = state.models.filter((m) => normaliseName(m.name) === wanted);
  if (hits.length < 2) return hits[0] || null;
  return [...hits].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))[0];
}

function normaliseName(name) {
  return String(name || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

/**
 * `input.modelName` is what the job form's Model box says — a NAME, never an id.
 *
 * A name that matches nothing becomes a model HERE, inside the same transaction
 * and the same undo entry as the job. Doing it in the form instead is the defect
 * this repo has already paid for once with pictures: the write lands outside the
 * gesture, so undo puts the job back and leaves the model behind, and — worse
 * than an orphaned picture — a job whose model was rolled back separately is a
 * DANGLING REFERENCE, which `backup.js` refuses on import. The reader would find
 * that out when they tried to restore.
 *
 * `input.modelId` is still honoured when no name is given, so nothing that sets
 * the link directly had to change.
 */
export async function saveJob(input) {
  const existing = state.jobs.find((j) => j.id === input.id);
  const column = COLUMN_SAFE(input.column, COLUMN_IDS, 'research');

  let modelId = input.modelId || '';
  let createdModel = null;
  let updatedModel = null;
  if (input.modelName !== undefined) {
    const named = normaliseName(input.modelName) ? modelNamed(input.modelName) : null;
    if (named) {
      modelId = named.id;
    } else if (normaliseName(input.modelName)) {
      createdModel = {
        id: newId(),
        name: String(input.modelName).trim(),
        designer: '',
        tags: [],
        notes: '',
        sources: [],
        listings: [],
        imageId: '',
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      modelId = createdModel.id;
    } else {
      modelId = '';
    }
  }

  // THE LINK GOES ON THE MODEL, because the model is the thing that exists on
  // somebody else's site and the job is one instance of printing it. Print it
  // again next month for somebody else and it is the same link — a copy on each
  // job would be the same address written down N times, drifting apart the moment
  // one of them was corrected.
  //
  // Which is also why a job with no model has nowhere to keep a link, and that is
  // the right answer rather than a gap: a thing with a source page IS a model.
  const link = String(input.sourceUrl || '').trim();
  if (link) {
    const source = { label: siteFrom(link) || 'Source', url: link };
    if (createdModel) {
      createdModel.sources = [source];
    } else if (modelId) {
      const target = state.models.find((m) => m.id === modelId);
      // Compared as written, after dropping a fragment and a trailing slash.
      // `/model/x` and `/model/x/files` stay two links: deciding they are one
      // means knowing `files` is a tab rather than a different page, which is
      // exactly the per-site knowledge this app refuses to carry.
      if (target && !(target.sources || []).some((s) => sameLink(s.url, link))) {
        updatedModel = {
          ...target,
          sources: [...(target.sources || []), source],
          updatedAt: nowIso(),
        };
      }
    }
  }

  // THE PICTURE FOLLOWS THE LINK'S RULE and for the same reason: it belongs to the
  // model, because the model is the thing that exists on somebody's site with a
  // photograph of it, and every job printing it should show that same picture
  // rather than each keeping a copy.
  //
  // EXCEPT WHEN THE MODEL ALREADY HAS ONE, and then it goes on the job. A job form
  // must never silently replace the picture of a model somebody set up
  // deliberately. The board has always preferred a job's own picture over its
  // model's and the import validator has always checked the reference — a
  // precedence written, validated, and until now unreachable, because nothing in
  // the app could give a job a picture of its own.
  const picture = input.picture || null;
  const linkedModel = !createdModel && modelId ? state.models.find((m) => m.id === modelId) : null;
  const pictureGoesOnModel = Boolean(picture?.prepared)
    && (Boolean(createdModel) || Boolean(linkedModel && !linkedModel.imageId));

  // Removing clears the JOB's own picture only. A model's picture is the model's
  // business and is removed where it was set.
  let jobImageId = picture?.removed ? '' : (existing?.imageId || '');

  const record = {
    id: input.id || newId(),
    title: (input.title || '').trim(),
    type: COLUMN_SAFE(input.type, TYPE_IDS, 'fun'),
    requester: (input.requester || '').trim(),
    modelId,
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

  // A picture landing on an existing model makes it an updated one, whether or not
  // the link already did. Built on top of `updatedModel` rather than beside it,
  // because two objects for the same model means the second write wins and the
  // first change is lost — silently, and only when both happen at once.
  if (pictureGoesOnModel && linkedModel) {
    updatedModel = { ...(updatedModel || linkedModel), updatedAt: nowIso() };
  }

  // Captured HERE rather than at the top, because a model gaining a link has to
  // be read as it was before that decision was made. The picture a record is
  // giving up goes in too, or undo would put the record back pointing at a blob
  // that had been deleted underneath it.
  const before = await capture({
    jobs: [existing?.id].filter(Boolean),
    ...(updatedModel ? { models: [updatedModel.id] } : {}),
    images: [
      ...(pictureGoesOnModel && updatedModel ? [updatedModel.imageId] : []),
      ...(picture?.prepared && !pictureGoesOnModel ? [existing?.imageId] : []),
      ...(picture?.removed ? [existing?.imageId] : []),
    ].filter(Boolean),
  });

  // Written AFTER the capture, like saveModel: the id cannot be known before it
  // exists, so its tombstone is added here. It did not exist a moment ago, so undo
  // deletes it rather than restoring it.
  if (picture?.prepared) {
    const newImageId = await putImage(picture.prepared);
    before.images = [...(before.images || []), { id: newImageId, record: null }];
    if (pictureGoesOnModel) {
      if (createdModel) createdModel.imageId = newImageId;
      else updatedModel.imageId = newImageId;
    } else {
      jobImageId = newImageId;
    }
  }
  record.imageId = jobImageId;

  // A picture the job is letting go of is deleted, or every re-pick would leave a
  // blob nobody points at and the export would carry all of them forever. Only the
  // JOB's own — a model's is dropped where a model's is set.
  if (existing?.imageId && existing.imageId !== record.imageId) {
    await deleteImage(existing.imageId);
  }

  // ONE TRANSACTION whether or not a model is being made or changed, so there is
  // no state in which the job points at a model that is not there yet, or at one
  // that does not yet carry the link the job was saved with.
  const touchesModels = Boolean(createdModel || updatedModel);
  await db.writeMany(touchesModels ? ['jobs', 'models'] : ['jobs'], (handles) => {
    handles.jobs.put(record);
    if (createdModel) handles.models.put(createdModel);
    if (updatedModel) handles.models.put(updatedModel);
  });
  upsert(state.jobs, record);
  if (createdModel) upsert(state.models, createdModel);
  if (updatedModel) upsert(state.models, updatedModel);

  // The entry is built ONCE rather than chosen between two branches. It used to
  // be a ternary, and a ternary is where a new store gets added to the branch the
  // author was looking at and not to the other one.
  const entry = existing ? { ...before } : { ...before, jobs: [{ id: record.id, record: null }] };
  if (createdModel) entry.models = [{ id: createdModel.id, record: null }];
  remember(existing ? `editing ${record.title || 'a job'}` : `adding ${record.title || 'a job'}`, entry);

  // Both, because a new model changes the models view and the inventory's model
  // column as well as the board.
  announce(touchesModels ? 'models' : 'jobs');
  return record;
}

/** Two links the same, ignoring a fragment and a trailing slash. */
function sameLink(a, b) {
  const tidy = (u) => String(u || '').trim().split('#')[0].replace(/\/+$/, '').toLowerCase();
  return Boolean(tidy(a)) && tidy(a) === tidy(b);
}

export async function deleteJob(id) {
  const job = state.jobs.find((j) => j.id === id);
  const before = await capture({ jobs: [id] });
  await db.remove('jobs', id);
  state.jobs = state.jobs.filter((j) => j.id !== id);
  remember(`deleting ${job?.title || 'a job'}`, before);
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

  // sortForBoard, not a local sort: the board and the move list both read the
  // column through it, and a second ordering here would put a card somewhere
  // other than where the reader was shown it would land whenever two rows share
  // an `order` — which an import can produce.
  const siblings = sortForBoard(state.jobs.filter((j) => j.column === target && j.id !== id));

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

  // Every renumbered sibling is in the entry, not just the card that moved —
  // undoing a move has to put the whole column's order back.
  const before = await capture({ jobs: updated.map((j) => j.id) });

  await db.writeMany(['jobs'], ({ jobs }) => {
    for (const j of updated) jobs.put(j);
  });
  for (const j of updated) upsert(state.jobs, j);
  remember(`moving ${job.title || 'a job'}`, before);
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

  // Every entry describes records from the database that was just replaced, so
  // undoing one would write a row from the old dataset into the new one.
  forgetUndo();

  announce('import');
}

export { db };
