// Everything that is worked out rather than stored.
//
// READ THIS BEFORE ADDING A FIELD.
//
// A spool's remaining weight is not a field and must never become one. It is
// `totalWeightG` minus the sum of every gram logged against it on every job, and
// it is computed HERE, on demand, every time somebody asks.
//
// Two things follow, and both are the point:
//
//   1. There is no remaining-weight value to write, so there is no code path that
//      can write a wrong one. Drift is not guarded against; it is impossible.
//
//   2. These are pure functions, called at the point of use — NOT values assigned
//      inside a render. A derived value cached by a render is only as fresh as
//      that render, and is silently stale everywhere else that reads it. Four
//      surfaces read remaining weight: the inventory list, the job form's spool
//      picker, the low-filament warning and the export. If one of them wrote it
//      down, the other three would be reading yesterday's number.
//
// Deriving on demand costs microseconds and cannot go stale.

export const COLUMNS = [
  { id: 'research', label: 'Research' },
  { id: 'staged', label: 'Staged' },
  { id: 'printing', label: 'Printing' },
  { id: 'complete', label: 'Complete' },
  { id: 'delivered', label: 'Delivered' },
  { id: 'archived', label: 'Archived' },
];

export const COLUMN_IDS = COLUMNS.map((c) => c.id);

/* The LABEL is what a reader sees; the ID is what is stored. They are separate so
 * the words can be corrected without rewriting anybody's records — `request` is
 * shown as "Asked" because that is the word people actually use for it, and no
 * job needed touching to do it.
 *
 * THE AXIS IS WHO IT IS FOR, AND WHETHER THEY ASKED. That is what makes three
 * categories rather than two-and-a-shade:
 *
 *   request — someone else, and they asked. They are waiting on it.
 *   wanted  — someone else, and they did NOT ask. A gift; they may not know.
 *   fun     — you.
 *
 * `wanted` used to be labelled "Wanted" with no stated meaning, and it and `fun`
 * were then identical in every respect the app acted on — same behaviour, a
 * different word and colour on a badge. Which made choosing between them a
 * decision with no consequence, and that is exactly what it felt like. Naming it
 * "Gift" is not a relabel: it is the category finally having a recipient, which is
 * what `hasRecipient` below is for.
 */
export const TYPES = [
  { id: 'request', label: 'Asked', hasRecipient: true },
  { id: 'wanted', label: 'Gift', hasRecipient: true },
  { id: 'fun', label: 'Fun', hasRecipient: false },
];

/** The types that are for somebody else, so the job carries their name. */
export const TYPES_WITH_RECIPIENT = TYPES.filter((t) => t.hasRecipient).map((t) => t.id);

export const TYPE_IDS = TYPES.map((t) => t.id);

export const MATERIALS = ['PLA', 'PETG', 'ABS', 'ASA', 'TPU', 'Nylon', 'PC', 'PVA', 'HIPS', 'Resin'];

export const SPOOL_STATUSES = [
  { id: 'sealed', label: 'Sealed' },
  { id: 'open', label: 'Open' },
  { id: 'finished', label: 'Finished' },
];

/** A number, or 0. Form fields hand back strings, and an empty one is not NaN grams. */
export function num(value) {
  const n = typeof value === 'number' ? value : parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

/** Grams logged against one spool, across every job. */
export function usedFor(spoolId, jobs) {
  let total = 0;
  for (const job of jobs) {
    for (const link of job.spoolLinks || []) {
      if (link.spoolId === spoolId) total += num(link.grams);
    }
  }
  return total;
}

/**
 * What is left on a spool. The whole reason this app exists.
 *
 * Grams count from the moment they are logged, whichever column the job sits in.
 * That is the honest reading of "what have I used" and the only one with no
 * hidden state — the alternative would leave grams logged but invisible until a
 * card moved. The inventory says so in words rather than leaving it to be found.
 */
export function remainingFor(spool, jobs) {
  return num(spool.totalWeightG) - usedFor(spool.id, jobs);
}

/** 0..1, for the bar beside a spool. Clamped, because an over-run is still empty. */
export function remainingFraction(spool, jobs) {
  const total = num(spool.totalWeightG);
  if (total <= 0) return 0;
  return Math.max(0, Math.min(1, remainingFor(spool, jobs) / total));
}

/** The jobs that consumed a spool, so the inventory can show where it went. */
export function usageHistoryFor(spoolId, jobs) {
  const out = [];
  for (const job of jobs) {
    const grams = (job.spoolLinks || [])
      .filter((l) => l.spoolId === spoolId)
      .reduce((sum, l) => sum + num(l.grams), 0);
    if (grams > 0) out.push({ job, grams });
  }
  return out.sort((a, b) => String(b.job.createdAt).localeCompare(String(a.job.createdAt)));
}

/**
 * What a model has earned.
 *
 * Keyed on `deliveredAt` — set the first time a job enters `delivered` and kept
 * when it is later archived — rather than on the job's CURRENT column. Summing by
 * current column would make this total drop every time a delivered job was
 * archived, which looks exactly like money vanishing from the catalog. The count
 * is returned alongside so the number can be checked rather than trusted.
 */
export function chargedForModel(modelId, jobs) {
  let total = 0;
  let count = 0;
  for (const job of jobs) {
    if (job.modelId !== modelId) continue;
    if (!job.deliveredAt) continue;
    total += num(job.priceCharged);
    count += 1;
  }
  return { total, count };
}

/** Jobs made from a model, newest first. */
export function jobsForModel(modelId, jobs) {
  return jobs
    .filter((j) => j.modelId === modelId)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

/** Spools a job draws on, with the grams and the spool record. Unknown ids are skipped. */
export function linkedSpools(job, spools) {
  const byId = new Map(spools.map((s) => [s.id, s]));
  return (job.spoolLinks || [])
    .map((link) => ({ link, spool: byId.get(link.spoolId) }))
    .filter((row) => row.spool);
}

/** Total grams a job has logged, across every spool it touches. */
export function gramsForJob(job) {
  return (job.spoolLinks || []).reduce((sum, l) => sum + num(l.grams), 0);
}

/** Board order: whatever `order` says, then by creation, so it is never arbitrary. */
export function sortForBoard(jobs) {
  return [...jobs].sort(
    (a, b) => num(a.order) - num(b.order) || String(a.createdAt).localeCompare(String(b.createdAt)),
  );
}

/** Inventory sorting. `remaining` needs the jobs; the others do not. */
export function sortSpools(spools, jobs, key) {
  const rows = [...spools];
  if (key === 'remaining') {
    rows.sort((a, b) => remainingFor(a, jobs) - remainingFor(b, jobs));
  } else if (key === 'brand') {
    rows.sort((a, b) => cmp(a.brand, b.brand) || cmp(a.material, b.material) || cmp(a.colorName, b.colorName));
  } else {
    rows.sort((a, b) => cmp(a.material, b.material) || cmp(a.brand, b.brand) || cmp(a.colorName, b.colorName));
  }
  return rows;
}

function cmp(a, b) {
  return String(a ?? '').localeCompare(String(b ?? ''), undefined, { sensitivity: 'base' });
}

/**
 * One instant, two renderings.
 *
 * The filename's stamp and the file's own `exportedAt` come from this single
 * call. Deriving them separately is how an export ends up named for one day while
 * its contents claim another — and the name is the part a person sees in Files,
 * so it is the one that has to be right.
 */
export function stampFor(date) {
  const pad = (n) => String(n).padStart(2, '0');
  const local = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const time = `${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
  return {
    iso: date.toISOString(),
    localDate: local,
    filenameStamp: `${local}T${time}`,
  };
}
