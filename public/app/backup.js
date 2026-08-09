// Export and import.
//
// The requirement is that import can never silently destroy state. That is met by
// four separate things, and removing any one of them breaks it:
//
//   1. Validation runs BEFORE anything is touched, and asks every question the
//      write will ask — including the ones the storage layer asks. A file with two
//      records sharing an id passes a validator that only checks shape, and then
//      the unique-key constraint fires AFTER the clear. That is not hypothetical;
//      it is how a sibling app destroyed real data in the feature whose entire
//      purpose was data safety.
//
//   2. The reader is told what is about to happen, in counts, and has to confirm.
//
//   3. The current data is exported first, automatically — to a file AND into the
//      snapshots store, because a browser download can be blocked or fail silently
//      and that must not be the only copy.
//
//   4. The clear and the refill are ONE transaction. Validation cannot rule out a
//      quota or a disk failure halfway through. Atomicity can.

import * as db from './db.js';
import { VERSION } from './version.js';
import { COLUMN_IDS, TYPE_IDS, stampFor } from './derive.js';
import { blobToBase64, base64ToBlob } from './image.js';

export const FORMAT = 'print-tracker-backup';

// 2 added the images store. A schema-1 backup is still readable — see the
// forward-fill in `validate` — because a backup taken before a feature existed
// is the ONE file a reader is most likely to reach for in a crisis, and refusing
// it because it predates a picture would be the restore failing at the only
// moment it matters.
export const SCHEMA = 2;

// Snapshots used to be bounded by COUNT, and with text-only records that was the
// same thing as being bounded. Pictures broke that: three snapshots of a catalog
// with images is three more base64 copies of every one of them, so a count-bound
// ring grows without limit in the dimension that actually runs out. The bound is
// now bytes first, with a count as the outer stop.
const MAX_SNAPSHOTS = 3;
const MAX_SNAPSHOT_BYTES = 12 * 1024 * 1024;

/** Build the whole dataset as one plain object. One instant, used everywhere. */
export async function buildExport(at = new Date()) {
  const everything = await db.readEverything();
  const stamp = stampFor(at);
  const prefs = (everything.meta || []).find((row) => row.key === 'prefs')?.value || null;

  // Blobs are not JSON, and the backup being ONE file is the property the whole
  // restore guarantee rests on. So pictures travel as base64 here and are turned
  // back into Blobs by the validator.
  const images = [];
  for (const record of everything.images || []) {
    images.push({
      id: record.id,
      type: record.type || record.blob?.type || 'image/webp',
      width: record.width || null,
      height: record.height || null,
      bytes: record.bytes || record.blob?.size || 0,
      addedAt: record.addedAt || null,
      data: record.blob ? await blobToBase64(record.blob) : '',
    });
  }

  const payload = {
    format: FORMAT,
    schema: SCHEMA,
    app: 'print-tracker',
    version: VERSION,
    exportedAt: stamp.iso,
    exportedOn: stamp.localDate,
    counts: {
      spools: (everything.spools || []).length,
      models: (everything.models || []).length,
      jobs: (everything.jobs || []).length,
      images: images.length,
    },
    spools: everything.spools || [],
    models: everything.models || [],
    jobs: everything.jobs || [],
    images,
    prefs,
  };

  // The filename's stamp and the file's own exportedAt come from the SAME call.
  // Deriving them separately is how a file ends up named for one day while its
  // contents claim another, and the name is the part a person sees in Files.
  return { payload, filename: `print-tracker-backup-${stamp.filenameStamp}.json`, stamp };
}

export function toJson(payload) {
  return JSON.stringify(payload, null, 2);
}

/** Hand the file to the browser. Returns false if the browser refused outright. */
export function download(text, filename) {
  try {
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Revoking immediately can cancel the download on some WebViews.
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
    return true;
  } catch {
    return false;
  }
}

/** Keep a copy inside the app, bounded, so a failed download is not the end of it. */
export async function storeSnapshot(payload, filename, reason) {
  const record = {
    id: `snap-${payload.exportedAt}-${Math.random().toString(36).slice(2, 8)}`,
    takenAt: payload.exportedAt,
    reason,
    filename,
    counts: payload.counts,
    json: toJson(payload),
  };
  await db.put('snapshots', record);

  // Newest first, then keep taking while BOTH budgets allow it. The byte budget
  // is the one that does the work once pictures exist; the count is the outer
  // stop so a catalog of nothing but text does not accumulate forever either.
  // The newest snapshot is always kept, whatever it weighs — dropping the copy
  // taken seconds ago to satisfy a budget would defeat the point of taking it.
  const all = (await db.getAll('snapshots')).sort((a, b) => String(b.takenAt).localeCompare(String(a.takenAt)));
  let kept = 0;
  let bytes = 0;
  for (const snap of all) {
    const size = String(snap.json || '').length;
    const first = kept === 0;
    if (first || (kept < MAX_SNAPSHOTS && bytes + size <= MAX_SNAPSHOT_BYTES)) {
      kept += 1;
      bytes += size;
      continue;
    }
    await db.remove('snapshots', snap.id);
  }
  return record;
}

export async function listSnapshots() {
  const all = await db.getAll('snapshots');
  return all.sort((a, b) => String(b.takenAt).localeCompare(String(a.takenAt)));
}

// ------------------------------------------------------------------ validation

/**
 * Ask every question the write will ask.
 *
 * Returns { ok, errors, counts, payload }. Nothing is touched either way — this
 * runs to completion before the reader is even offered the confirmation.
 */
export function validate(text) {
  const errors = [];
  let raw;

  try {
    raw = JSON.parse(text);
  } catch {
    return fail(['That file is not readable JSON, so nothing was changed.']);
  }

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return fail(['That file does not look like a print-tracker backup.']);
  }
  if (raw.format !== FORMAT) {
    return fail([`That file says it is "${String(raw.format ?? 'unlabelled')}" rather than a print-tracker backup.`]);
  }
  if (typeof raw.schema !== 'number' || !Number.isFinite(raw.schema)) {
    return fail(['That backup does not say which format version it is.']);
  }
  if (raw.schema > SCHEMA) {
    return fail([
      `That backup was written by a newer version of print-tracker (format ${raw.schema}; this one reads ${SCHEMA}). Update the app first.`,
    ]);
  }

  // A BACKUP FROM BEFORE A STORE EXISTED IS STILL A VALID BACKUP. Schema 1 has
  // no images list, and the file a reader reaches for in a crisis is exactly the
  // old one. Fill the gap forward rather than refusing it — the alternative is
  // the restore failing at the only moment it is ever needed.
  if (raw.schema < 2 && raw.images === undefined) raw.images = [];

  for (const name of db.DATA_STORES) {
    if (!Array.isArray(raw[name])) errors.push(`The backup has no "${name}" list.`);
  }
  if (errors.length) return fail(errors);

  // Ids: present, strings, and UNIQUE. The store's key constraint will ask this
  // question during the write; asking it here is the difference between a refusal
  // and a half-finished restore.
  const ids = {};
  for (const name of db.DATA_STORES) {
    const seen = new Set();
    const dupes = new Set();
    raw[name].forEach((record, i) => {
      if (!record || typeof record !== 'object' || Array.isArray(record)) {
        errors.push(`${name}: entry ${i + 1} is not a record.`);
        return;
      }
      const id = record.id;
      if (typeof id !== 'string' || !id) {
        errors.push(`${name}: entry ${i + 1} has no id.`);
        return;
      }
      if (seen.has(id)) dupes.add(id);
      seen.add(id);
    });
    if (dupes.size) {
      errors.push(
        `${name}: ${dupes.size} id${dupes.size === 1 ? ' is' : 's are'} used more than once, so the records cannot all be stored.`,
      );
    }
    ids[name] = seen;
  }

  // References must resolve, or the restore would create the dangling links the
  // app is built never to have.
  raw.jobs.forEach((job, i) => {
    if (!job || typeof job !== 'object') return;
    const where = `jobs: entry ${i + 1}`;
    if (typeof job.title !== 'string') errors.push(`${where} has no title.`);
    if (job.column != null && !COLUMN_IDS.includes(job.column)) {
      errors.push(`${where} is in a column this app does not have ("${String(job.column)}").`);
    }
    if (job.type != null && !TYPE_IDS.includes(job.type)) {
      errors.push(`${where} has a job type this app does not have ("${String(job.type)}").`);
    }
    if (job.modelId && !ids.models.has(job.modelId)) {
      errors.push(`${where} points at a model that is not in this backup.`);
    }
    if (job.spoolLinks != null && !Array.isArray(job.spoolLinks)) {
      errors.push(`${where} has a filament list that is not a list.`);
    } else {
      for (const link of job.spoolLinks || []) {
        if (!link || !ids.spools.has(link.spoolId)) {
          errors.push(`${where} logs filament from a spool that is not in this backup.`);
          break;
        }
      }
    }
  });

  raw.spools.forEach((spool, i) => {
    if (!spool || typeof spool !== 'object') return;
    const total = Number(spool.totalWeightG);
    if (!Number.isFinite(total)) errors.push(`spools: entry ${i + 1} has no usable total weight.`);
  });

  // A picture is a reference like any other, so it is checked like any other. A
  // model pointing at an image that is not in the file would restore as a tile
  // with a permanent gap where the picture goes.
  for (const name of ['models', 'jobs']) {
    raw[name].forEach((record, i) => {
      if (!record || typeof record !== 'object') return;
      if (record.imageId && !ids.images.has(record.imageId)) {
        errors.push(`${name}: entry ${i + 1} points at a picture that is not in this backup.`);
      }
    });
  }

  // DECODE EVERY PICTURE NOW, rather than trusting the base64 and discovering a
  // truncated file after the clear. `atob` throws on anything that is not
  // base64, which is precisely the question the write would have asked — this is
  // the same rule as the duplicate-id check, applied to bytes.
  raw.images.forEach((record, i) => {
    if (!record || typeof record !== 'object') return;
    const where = `images: entry ${i + 1}`;
    if (typeof record.data !== 'string' || !record.data) {
      errors.push(`${where} has no picture data.`);
      return;
    }
    try {
      record.blob = base64ToBlob(record.data, record.type);
    } catch {
      errors.push(`${where} is damaged and could not be read as a picture.`);
      return;
    }
    // The record that goes into the store carries the Blob, not the text.
    delete record.data;
  });

  if (errors.length) return fail(errors);

  return {
    ok: true,
    errors: [],
    counts: {
      spools: raw.spools.length,
      models: raw.models.length,
      jobs: raw.jobs.length,
      images: raw.images.length,
    },
    payload: raw,
  };

  function fail(list) {
    return { ok: false, errors: list, counts: null, payload: null };
  }
}

// ------------------------------------------------------------------ the restore

/**
 * Replace everything. Only ever called with a payload `validate` has passed.
 *
 * `onSafetyCopy` is handed the safety export so the caller can report whether the
 * download itself worked — the snapshot in the database is written either way.
 */
export async function replaceEverything(payload, { onSafetyCopy } = {}) {
  // 1. Safety copy of what is here NOW, before anything is touched.
  const safety = await buildExport(new Date());
  const snapshot = await storeSnapshot(safety.payload, safety.filename, 'before-import');
  const downloaded = download(toJson(safety.payload), safety.filename);
  onSafetyCopy?.({ ...safety, downloaded, snapshotId: snapshot.id });

  // 2. One transaction. Clear and refill together, or neither.
  await db.replaceAll(payload);

  // 3. Preferences travel with the data when the backup carried them.
  if (payload.prefs && typeof payload.prefs === 'object') {
    await db.writeMeta('prefs', payload.prefs);
  }

  return {
    restored: {
      spools: payload.spools.length,
      models: payload.models.length,
      jobs: payload.jobs.length,
    },
    safety: { filename: safety.filename, downloaded, snapshotId: snapshot.id },
  };
}
