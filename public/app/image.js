// Pictures, prepared on the device before anything is stored.
//
// WHY A THUMBNAIL AND NOT THE FILE. A tile is a couple of hundred CSS pixels
// wide. Storing what a phone camera or a model site hands over — often several
// megabytes — would put that weight in IndexedDB, then again in the JSON export,
// then again in each of the snapshots the backup keeps. The picture the reader
// wants and the file they happen to have are not the same object, and the whole
// storage budget for this feature rests on never confusing them.
//
// THE MULTIPLIER IS WHY THE BUDGET IS TIGHT. Every stored image is held roughly
// four times over — once live and once inside each retained snapshot's JSON —
// and base64 adds about a third on top of each copy. A picture that looks
// harmless at 2MB is most of a hundred megabytes by the time it has been through
// that. Downscaling here is not an optimisation, it is what makes the feature
// affordable at all.
//
// THREE THINGS IN HERE ARE NOT OBVIOUS AND EACH IS A REAL DEFECT AVOIDED:
//
//   1. `imageOrientation: 'from-image'` on the decode. A photograph taken on a
//      phone carries its rotation in EXIF rather than in the pixels. Decode
//      without this and every portrait photo of a finished print is on its side,
//      and it is on its side FOREVER, because the rotation is dropped the moment
//      it is drawn to a canvas.
//
//   2. The encoded type is READ BACK rather than assumed. `toBlob` takes the
//      requested type as a hint: an engine with no WebP encoder does not fail,
//      it quietly hands back a PNG — several times larger than the JPEG we would
//      have asked for, which is the opposite of what this file exists to do.
//
//   3. Nothing is ever scaled UP. A small source stays its own size. Upscaling
//      adds bytes and no detail.

// Longest edge, in device pixels. Enough for a tile at 2x and honest at the size
// a model panel shows it; not a second, larger copy for the detail view, because
// two sizes is two budgets.
export const MAX_EDGE = 512;

// A hard ceiling after encoding. Reached only by busy photographs; the retry
// below steps quality down rather than refusing the picture.
export const MAX_BYTES = 200 * 1024;

const QUALITY = [0.78, 0.62, 0.48];

/** Anything the file picker, a paste or a drop can hand us that we can use. */
export function isUsable(file) {
  return Boolean(file) && typeof file.type === 'string' && file.type.startsWith('image/');
}

/**
 * Pull the first usable image out of a paste, a drop, or a file input.
 * Returns null rather than throwing — "there was no picture in that" is an
 * ordinary outcome of pasting, not an error.
 */
export function firstImage(source) {
  if (!source) return null;
  const files = source.files ? Array.from(source.files) : [];
  const items = source.items ? Array.from(source.items) : [];
  for (const file of files) if (isUsable(file)) return file;
  for (const item of items) {
    if (item.kind !== 'file') continue;
    const file = typeof item.getAsFile === 'function' ? item.getAsFile() : null;
    if (isUsable(file)) return file;
  }
  return null;
}

function scaleTo(width, height, maxEdge) {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width, height }; // never upscale
  const factor = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(width * factor)),
    height: Math.max(1, Math.round(height * factor)),
  };
}

function encode(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('The browser could not encode that picture.'))),
      type,
      quality,
    );
  });
}

/**
 * Decode, rotate, downscale and re-encode. Returns a record ready to store:
 * `{ blob, type, width, height, bytes }`.
 *
 * Throws with a sentence a reader can act on. Every failure here is something
 * they did — picked a file that is not an image, or one this browser cannot
 * decode — so the message says which.
 */
export async function prepare(file) {
  if (!isUsable(file)) {
    throw new Error('That file is not a picture. Choose a JPEG, PNG, WebP or HEIC image.');
  }

  let bitmap;
  try {
    // 'from-image' honours EXIF rotation. Without it, phone photographs are
    // stored sideways permanently — the canvas keeps pixels, not metadata.
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error('This browser could not read that picture. A JPEG or PNG will work.');
  }

  try {
    const size = scaleTo(bitmap.width, bitmap.height, MAX_EDGE);
    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('This browser could not prepare that picture.');
    ctx.drawImage(bitmap, 0, 0, size.width, size.height);

    // Ask for WebP, then CHECK. A browser without a WebP encoder returns PNG
    // from the same call, with no error and roughly four times the bytes.
    let best = null;
    for (const quality of QUALITY) {
      let blob = await encode(canvas, 'image/webp', quality);
      if (blob.type !== 'image/webp') blob = await encode(canvas, 'image/jpeg', quality);
      best = blob;
      if (blob.size <= MAX_BYTES) break;
    }

    return {
      blob: best,
      type: best.type,
      width: size.width,
      height: size.height,
      bytes: best.size,
    };
  } finally {
    // Bitmaps hold decoded pixels outside the JS heap; without this a few large
    // pictures in a row are megabytes the collector cannot see.
    if (typeof bitmap.close === 'function') bitmap.close();
  }
}

// ------------------------------------------------------- export and restore
//
// A Blob is not JSON, and the backup is ONE JSON file on purpose — that is the
// property the whole restore guarantee is built on. So images travel as base64
// and come back as Blobs, and the pair below is the only place that conversion
// is written.

export function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error('Could not read a stored picture.'));
    reader.onload = () => {
      const result = String(reader.result);
      const comma = result.indexOf(',');
      resolve(comma === -1 ? result : result.slice(comma + 1));
    };
    reader.readAsDataURL(blob);
  });
}

export function base64ToBlob(base64, type) {
  // atob throws on anything that is not base64, which is exactly the check the
  // import validator wants — a truncated or hand-edited file fails HERE rather
  // than producing an image record that renders as nothing.
  const binary = atob(String(base64));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: type || 'application/octet-stream' });
}

/** Bytes, said the way a person reads them. */
export function describeBytes(n) {
  const bytes = Number(n) || 0;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
