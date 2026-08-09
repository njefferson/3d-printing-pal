#!/usr/bin/env node
// The data-safety walk. This is the gate for the one thing the app must never do.
//
// It drives a real browser through the real controls:
//
//   1. Seed data through the forms, export it, WIPE the database the way clearing
//      site data does, import the file back, and export again — then compare the
//      two exports record for record. "Restores everything identically" is a
//      claim about bytes, so it is checked against bytes.
//
//   2. Offer five BROKEN files — a duplicate id, a reference to a spool that is
//      not in the file, a truncated one, one from another app, one from a newer
//      format — and assert each is refused AND that the data already in the app
//      is untouched afterwards. That is the real requirement: a validator that
//      only checks shape passes a file whose duplicate ids the storage layer will
//      reject, and by then the clear has already happened.
//
//   3. Assert the safety copy is taken before a good import, and that it survives
//      inside the app as well as being downloaded — a browser download can be
//      blocked or fail silently, and that must not be the only copy.
//
//   4. Prove the two derived numbers, because they are the app's whole point and
//      neither is stored: remaining weight is recomputed after a restore rather
//      than carried in the file, and a model's earnings survive its delivered job
//      being archived.

import { chromium } from 'playwright-core';
import { readFileSync, writeFileSync, existsSync, mkdtempSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { serve } from './serve.mjs';

// A REAL PNG, BUILT HERE RATHER THAN COMMITTED AS A FIXTURE.
//
// The walk needs a picture that is genuinely bigger than the thumbnail budget,
// so the downscale, the re-encode and the byte-for-byte round trip are all
// actually exercised. A checked-in binary would do that too, but it would be a
// file nobody can read in a diff and nobody would notice going stale. This is
// twenty lines of the PNG spec and it says exactly what it produces.
function makePng(width, height) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc32 = (buf) => {
    let c = 0xffffffff;
    for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 2;  // colour type: truecolour RGB
  // 10..12 stay zero: deflate, adaptive filtering, no interlace.

  // Scanlines with a leading filter byte. A gradient rather than a flat fill, so
  // the encoder has something to do and the result is not trivially compressible
  // into a size that would pass any budget by accident.
  const raw = Buffer.alloc(height * (1 + width * 3));
  let at = 0;
  for (let y = 0; y < height; y += 1) {
    raw[at] = 0;
    at += 1;
    for (let x = 0; x < width; x += 1) {
      raw[at] = (x * 255) / width;
      raw[at + 1] = (y * 255) / height;
      raw[at + 2] = ((x + y) * 255) / (width + height);
      at += 3;
    }
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const BROWSER = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';
const scratch = mkdtempSync(join(tmpdir(), 'print-tracker-walk-'));

const failures = [];
const passes = [];
const fail = (m) => failures.push(m);
const pass = (m) => passes.push(m);

async function seed(page) {
  await page.evaluate(() => { for (const d of document.querySelectorAll('dialog[open]')) d.close(); });
  await page.waitForTimeout(150);

  await page.click('#tab-inventory');
  await page.click('#spool-new');
  await page.fill('#spool-f-brand', 'Polymaker');
  await page.fill('#spool-f-material', 'PLA');
  await page.fill('#spool-f-color', 'Galaxy Black');
  await page.fill('#spool-f-weight', '1000');
  await page.click('#spool-save');
  await page.waitForTimeout(160);

  await page.click('#tab-models');
  await page.click('#model-new');
  await page.fill('#model-f-name', 'Dragon egg');
  await page.fill('#model-f-designer', 'Ada Lovelace');

  // A picture, through the real file input. 900x600 is comfortably past the
  // thumbnail budget, so this exercises the downscale rather than storing what
  // it was handed.
  await page.setInputFiles('.pic-file', {
    name: 'dragon-egg.png',
    mimeType: 'image/png',
    buffer: makePng(900, 600),
  });
  await page.waitForFunction(
    () => /Ready —/.test(document.querySelector('.pic-status')?.textContent || ''),
    null,
    { timeout: 8000 },
  );

  await page.click('#model-save');
  await page.waitForTimeout(220);

  await page.click('#tab-board');
  for (const job of [
    { title: 'Benchy', type: 'fun' },
    { title: 'Dragon egg', type: 'request', grams: '240', price: '18.00' },
  ]) {
    await page.click('#job-new');
    await page.fill('#job-f-title', job.title);
    await page.selectOption('#job-f-type', job.type);
    if (job.type === 'request') await page.fill('#job-f-requester', 'Ada Lovelace');
    await page.fill('#job-f-printer', 'Prusa MK4');
    if (job.price) await page.fill('#job-f-price', job.price);
    if (job.grams) {
      await page.click('#job-f-addlink');
      await page.fill('#job-f-links .linkrow input[type="number"]', job.grams);
    }
    await page.click('#job-save');
    await page.waitForTimeout(160);
  }
}

async function counts(page) {
  return page.evaluate(async () => {
    const open = () => new Promise((resolve, reject) => {
      const r = indexedDB.open('print-tracker');
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    const db = await open();
    const read = (store) => new Promise((resolve) => {
      const req = db.transaction(store, 'readonly').objectStore(store).getAll();
      req.onsuccess = () => resolve(req.result.length);
    });
    const out = { jobs: await read('jobs'), spools: await read('spools'), models: await read('models') };
    db.close();
    return out;
  });
}

/** Export through the real button, and hand back what the file actually contained. */
async function exportThroughTheButton(page) {
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 15000 }),
    page.click('#export-run'),
  ]);
  const path = join(scratch, `export-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.json`);
  await download.saveAs(path);
  return { path, filename: download.suggestedFilename(), text: readFileSync(path, 'utf8') };
}

/** Import a file that is expected to be REFUSED, and prove nothing was touched. */
async function expectRefusal(page, label, text, before) {
  const path = join(scratch, `bad-${label}.json`);
  writeFileSync(path, text);

  await page.click('#import-open');
  await page.waitForTimeout(120);
  await page.setInputFiles('#import-file', path);
  await page.waitForTimeout(320);

  const state = await page.evaluate(() => ({
    reportShown: !document.getElementById('import-report').hidden,
    reportText: document.getElementById('import-report').innerText,
    goDisabled: document.getElementById('import-go').disabled,
  }));

  if (!state.goDisabled) {
    fail(`${label}: the "Replace everything" button was ENABLED for a file that should be refused`);
  }
  if (!state.reportShown || !/not imported|could not be read/i.test(state.reportText)) {
    fail(`${label}: no refusal was shown to the reader`);
  }
  if (!/nothing has been changed/i.test(state.reportText)) {
    fail(`${label}: the refusal does not tell the reader their data is untouched`);
  }

  await page.evaluate(() => { for (const d of document.querySelectorAll('dialog[open]')) d.close(); });
  await page.waitForTimeout(150);

  const after = await counts(page);
  if (JSON.stringify(after) !== JSON.stringify(before)) {
    fail(`${label}: the data changed after a REFUSED import — ${JSON.stringify(before)} became ${JSON.stringify(after)}`);
  } else {
    pass(`${label}: refused before anything was touched, data intact (${after.jobs} jobs, ${after.spools} spools, ${after.models} models)`);
  }
}

async function main() {
  const { server, url } = await serve(0);
  const browser = await chromium.launch({
    ...(existsSync(BROWSER) ? { executablePath: BROWSER } : {}),
    args: ['--no-sandbox'],
  });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true, hasTouch: true });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));

  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForSelector('#version-stamp');
  await seed(page);

  const seeded = await counts(page);
  if (seeded.jobs !== 2 || seeded.spools !== 1 || seeded.models !== 1) {
    fail(`seeding through the forms produced ${JSON.stringify(seeded)}, expected 2 jobs, 1 spool, 1 model`);
  }

  // ---------------------------------------------------------------- export
  const first = await exportThroughTheButton(page);
  const parsed = JSON.parse(first.text);

  if (!/^print-tracker-backup-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.json$/.test(first.filename)) {
    fail(`the export filename is not a timestamped backup name: ${first.filename}`);
  } else {
    pass(`export downloaded as ${first.filename}`);
  }

  // One instant, two renderings. A file named for one day whose contents claim
  // another is the failure this checks for, and the NAME is the part a person
  // sees in Files.
  const stampInName = first.filename.match(/(\d{4}-\d{2}-\d{2})T/)[1];
  if (stampInName !== parsed.exportedOn) {
    fail(`the filename says ${stampInName} and the contents say ${parsed.exportedOn} — they must come from one computation`);
  } else {
    pass(`filename date and file contents agree (${stampInName})`);
  }

  if (parsed.jobs.length !== seeded.jobs || parsed.spools.length !== seeded.spools || parsed.models.length !== seeded.models) {
    fail('the export does not contain every record that was in the app');
  }

  // ------------------------------------------------------- refuse bad files
  const dupe = JSON.parse(first.text);
  dupe.jobs.push({ ...dupe.jobs[0] });
  await expectRefusal(page, 'duplicate-id', JSON.stringify(dupe), seeded);

  const dangling = JSON.parse(first.text);
  const withLinks = dangling.jobs.find((j) => (j.spoolLinks || []).length);
  withLinks.spoolLinks[0].spoolId = 'a-spool-that-is-not-in-this-file';
  await expectRefusal(page, 'dangling-spool', JSON.stringify(dangling), seeded);

  await expectRefusal(page, 'truncated', first.text.slice(0, Math.floor(first.text.length / 2)), seeded);

  const wrongApp = JSON.parse(first.text);
  wrongApp.format = 'some-other-app-backup';
  await expectRefusal(page, 'wrong-format', JSON.stringify(wrongApp), seeded);

  const fromTheFuture = JSON.parse(first.text);
  fromTheFuture.schema = 99;
  await expectRefusal(page, 'newer-schema', JSON.stringify(fromTheFuture), seeded);

  // ------------------------------------------------- wipe and restore
  // The acceptance criterion, done the way it is written: clear the site's data
  // the way a browser does, then import.
  await page.evaluate(() => new Promise((resolve) => {
    const req = indexedDB.deleteDatabase('print-tracker');
    req.onsuccess = resolve;
    req.onerror = resolve;
    req.onblocked = resolve;
  }));
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('#version-stamp');
  await page.evaluate(() => { for (const d of document.querySelectorAll('dialog[open]')) d.close(); });
  await page.waitForTimeout(200);

  const wiped = await counts(page);
  if (wiped.jobs !== 0 || wiped.spools !== 0 || wiped.models !== 0) {
    fail(`the wipe left data behind: ${JSON.stringify(wiped)}`);
  } else {
    pass('site data wiped — the app came back empty');
  }

  await page.click('#import-open');
  await page.waitForTimeout(120);
  await page.setInputFiles('#import-file', first.path);
  await page.waitForTimeout(320);

  const enabled = await page.evaluate(() => !document.getElementById('import-go').disabled);
  if (!enabled) fail('a good backup did not enable the import button');

  // The confirmation is required, and the safety export downloads on the way.
  const safety = page.waitForEvent('download', { timeout: 15000 }).catch(() => null);
  await page.click('#import-go');
  await page.waitForTimeout(200);

  const confirmOpen = await page.evaluate(() => document.getElementById('dlg-confirm').open);
  if (!confirmOpen) fail('the import ran without asking for an explicit confirmation');

  await page.click('#confirm-go');
  await page.waitForTimeout(700);
  const safetyFile = await safety;
  if (!safetyFile) fail('no safety copy was downloaded before the import replaced everything');
  else pass(`safety copy downloaded before the replace: ${safetyFile.suggestedFilename()}`);

  const snapshotCount = await page.evaluate(() => new Promise((resolve) => {
    const r = indexedDB.open('print-tracker');
    r.onsuccess = () => {
      const req = r.result.transaction('snapshots', 'readonly').objectStore('snapshots').getAll();
      req.onsuccess = () => { resolve(req.result.length); r.result.close(); };
    };
  }));
  if (snapshotCount < 1) fail('the safety copy was not also kept inside the app — a blocked download would leave nothing');
  else pass(`safety copy also kept in the app (${snapshotCount} snapshot)`);

  const restored = await counts(page);
  if (JSON.stringify(restored) !== JSON.stringify(seeded)) {
    fail(`restore counts differ: had ${JSON.stringify(seeded)}, restored ${JSON.stringify(restored)}`);
  }

  // ------------------------------------------------------ compare the exports
  const second = await exportThroughTheButton(page);
  const a = JSON.parse(first.text);
  const b = JSON.parse(second.text);

  // IMAGES ARE IN THE COMPARISON. Leaving them out would mean this assertion —
  // the one the whole feature's safety rests on — passed while saying nothing
  // about the only thing that changed. The base64 must match byte for byte,
  // which is the real question: a picture that survives as "an image of roughly
  // the right size" is a picture that has been silently re-encoded.
  const strip = (o) => ({
    spools: o.spools, models: o.models, jobs: o.jobs, images: o.images,
  });
  const before = JSON.stringify(strip(a));
  const after = JSON.stringify(strip(b));

  if (before !== after) {
    fail('the data after export -> wipe -> import is NOT identical to the data before');
    const ia = JSON.stringify((a.images || []).map((i) => ({ ...i, data: `${String(i.data).length} chars` })));
    const ib = JSON.stringify((b.images || []).map((i) => ({ ...i, data: `${String(i.data).length} chars` })));
    if (ia !== ib) fail(`  images differ:\n    before ${ia.slice(0, 400)}\n    after  ${ib.slice(0, 400)}`);
    const ja = JSON.stringify(a.jobs);
    const jb = JSON.stringify(b.jobs);
    if (ja !== jb) fail(`  jobs differ:\n    before ${ja.slice(0, 400)}\n    after  ${jb.slice(0, 400)}`);
    const sa = JSON.stringify(a.spools);
    const sb = JSON.stringify(b.spools);
    if (sa !== sb) fail(`  spools differ:\n    before ${sa.slice(0, 400)}\n    after  ${sb.slice(0, 400)}`);
    const ma = JSON.stringify(a.models);
    const mb = JSON.stringify(b.models);
    if (ma !== mb) fail(`  models differ:\n    before ${ma.slice(0, 400)}\n    after  ${mb.slice(0, 400)}`);
  } else {
    pass(`export -> wipe -> import -> export is byte-identical across ${a.jobs.length} jobs, ${a.spools.length} spools, ${a.models.length} models, ${(a.images || []).length} pictures`);

    // A picture that round-trips but was never there is not evidence of anything.
    const picture = (a.images || [])[0];
    if (!picture) {
      fail('no picture reached the export, so the round trip proved nothing about pictures');
    } else if (!picture.data || picture.data.length < 200) {
      fail(`the exported picture carries ${picture.data ? picture.data.length : 0} characters of data, which is not an image`);
    } else if (!(picture.width <= 512 && picture.height <= 512)) {
      fail(`the stored picture is ${picture.width}x${picture.height} — it was not downscaled, so the file kept what the reader handed over`);
    } else {
      pass(`the picture was downscaled to ${picture.width}x${picture.height} (${picture.type}) and restored byte for byte`);
    }
  }

  // ---------------------------------------- the deliveredAt interpretation
  // The requirement is "a computed total of price-charged across its delivered
  // jobs". Read as "current column is delivered", that total silently drops the
  // moment a delivered job is archived — money appearing to vanish from the
  // catalog. This proves the stamp survives archiving, which is the whole reason
  // it exists.
  await page.click('#tab-models');
  await page.waitForTimeout(200);
  await page.click('#model-new');
  await page.fill('#model-f-name', 'Gift box');
  await page.click('#model-save');
  await page.waitForTimeout(200);

  await page.click('#tab-board');
  await page.click('#job-new');
  await page.fill('#job-f-title', 'Gift box run');
  await page.selectOption('#job-f-type', 'request');
  await page.fill('#job-f-requester', 'Ada Lovelace');
  await page.selectOption('#job-f-model', { label: 'Gift box' });
  await page.fill('#job-f-price', '18.00');
  await page.selectOption('#job-f-column', 'delivered');
  await page.click('#job-save');
  await page.waitForTimeout(300);

  const delivered = await page.evaluate(() => {
    document.getElementById('tab-models').click();
    return Array.from(document.querySelectorAll('#models-list .rowcard'))
      .find((c) => c.textContent.includes('Gift box'))?.querySelector('.remaining')?.textContent || '';
  });
  if (!/18\.00/.test(delivered) || !/1 delivered job/.test(delivered)) {
    fail(`a delivered job did not reach its model's total: "${delivered}"`);
  } else {
    pass(`a delivered job reaches its model: "${delivered}"`);
  }

  // Now archive it. The money must not move.
  await page.evaluate(() => { document.getElementById('tab-board').click(); });
  await page.waitForTimeout(200);
  await page.evaluate(() => {
    const card = Array.from(document.querySelectorAll('.card')).find((c) => c.textContent.includes('Gift box run'));
    card.querySelector('.card-actions button').click();
  });
  await page.waitForTimeout(250);
  await page.evaluate(() => {
    Array.from(document.querySelectorAll('#move-list button')).find((b) => /Archived/.test(b.textContent)).click();
  });
  await page.waitForTimeout(400);

  const archived = await page.evaluate(() => {
    document.getElementById('tab-models').click();
    return Array.from(document.querySelectorAll('#models-list .rowcard'))
      .find((c) => c.textContent.includes('Gift box'))?.querySelector('.remaining')?.textContent || '';
  });
  if (archived !== delivered) {
    fail(`archiving a delivered job changed its model's total from "${delivered}" to "${archived}" — money vanished from the catalog`);
  } else {
    pass('archiving a delivered job leaves the model total alone — deliveredAt, not the current column');
  }

  // And the derived number survived, because it is derived rather than stored.
  await page.click('#tab-inventory');
  await page.waitForTimeout(200);
  const remaining = await page.evaluate(() => document.querySelector('#inventory-list .remaining')?.textContent || '');
  if (!/760\s*g/.test(remaining)) fail(`after the restore, remaining weight reads "${remaining}" rather than 760 g`);
  else pass('remaining weight is 760 g after the restore — recomputed from the jobs, not carried in the file');

  for (const e of pageErrors) fail(`page error: ${e}`);

  await browser.close();
  server.close();

  for (const p of passes) console.log(`  ok   ${p}`);
  if (failures.length) {
    console.error(`\nbackup walk: FAIL — ${failures.length} problem(s)\n`);
    for (const f of failures) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log('\nbackup walk: pass — export restores identically, and every broken file is refused before anything is touched.');
}

main().catch((error) => {
  console.error('backup walk: could not run.');
  console.error(error);
  process.exit(2);
});
