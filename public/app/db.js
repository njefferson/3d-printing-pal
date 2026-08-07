// IndexedDB, wrapped just enough to be readable. No library.
//
// The surface used is open / transaction / objectStore / getAll / put / delete /
// clear. Everything else is arithmetic done in derive.js.
//
// The one thing worth reading before changing anything here: `replaceAll` does a
// clear and a refill inside ONE transaction spanning every store. That is not
// tidiness. A replace that clears before it writes will eventually clear and then
// fail — a quota error, a disk error, a constraint the validator did not think to
// ask about — and the data is gone. An aborted transaction rolls the clear back.

export const DB_NAME = 'print-tracker';
export const DB_VERSION = 1;

// Stores that hold the reader's own records. `snapshots` and `meta` are ours.
export const DATA_STORES = ['spools', 'models', 'jobs'];
export const ALL_STORES = [...DATA_STORES, 'snapshots', 'meta'];

let dbPromise = null;

function request(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function finish(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error || new Error('transaction aborted'));
    tx.onerror = () => reject(tx.error);
  });
}

export function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) {
      reject(new Error('This browser has no IndexedDB, so there is nowhere to keep your data.'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of DATA_STORES) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('snapshots')) {
        db.createObjectStore('snapshots', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta', { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Another tab has this app open on an older version. Close it and try again.'));
  });
  return dbPromise;
}

export async function getAll(store) {
  const db = await openDb();
  const tx = db.transaction(store, 'readonly');
  const rows = await request(tx.objectStore(store).getAll());
  await finish(tx);
  return rows;
}

export async function put(store, record) {
  const db = await openDb();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).put(record);
  await finish(tx);
  return record;
}

export async function remove(store, id) {
  const db = await openDb();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).delete(id);
  await finish(tx);
}

// Several stores, one transaction. Used wherever deleting one record has to
// amend another — deleting a spool unlinks it from every job in the same breath,
// so there is never a moment where a job points at a spool that is not there.
export async function writeMany(stores, work) {
  const db = await openDb();
  const tx = db.transaction(stores, 'readwrite');
  const handles = Object.fromEntries(stores.map((s) => [s, tx.objectStore(s)]));
  work(handles);
  await finish(tx);
}

export async function readMeta(key, fallback = null) {
  const db = await openDb();
  const tx = db.transaction('meta', 'readonly');
  const row = await request(tx.objectStore('meta').get(key));
  await finish(tx);
  return row === undefined ? fallback : row.value;
}

export async function writeMeta(key, value) {
  return put('meta', { key, value });
}

// Everything, in one read, for the export and for the diagnostic's counts.
export async function readEverything() {
  const db = await openDb();
  const tx = db.transaction(ALL_STORES, 'readonly');
  const out = {};
  for (const name of ALL_STORES) out[name] = await request(tx.objectStore(name).getAll());
  await finish(tx);
  return out;
}

// THE ATOMIC REPLACE.
//
// One transaction across every data store plus meta. If any part of it throws —
// a constraint, a quota, a disk error — the transaction aborts and the reader's
// existing data is still there, untouched. Nothing here may be split into
// separate transactions "for readability"; the single transaction IS the
// guarantee.
//
// `snapshots` is deliberately NOT cleared: the safety copy taken moments ago
// lives there, and wiping it as part of the restore would remove the one thing
// standing between a bad import and no data at all.
export async function replaceAll(payload) {
  const db = await openDb();
  const stores = [...DATA_STORES, 'meta'];
  const tx = db.transaction(stores, 'readwrite');
  for (const name of DATA_STORES) {
    const os = tx.objectStore(name);
    os.clear();
    for (const record of payload[name] || []) os.add(record);
  }
  // Meta is merged rather than cleared, so preferences and the snapshot bookkeeping
  // survive a restore. Only the schema marker is rewritten.
  tx.objectStore('meta').put({ key: 'schema', value: DB_VERSION });
  await finish(tx);
}
