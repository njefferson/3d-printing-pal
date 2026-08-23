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
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { serve } from './serve.mjs';
import { makePng } from './png.mjs';

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
    await page.check(`input[name="job-type"][value="${job.type}"]`);
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

  // TWO MODELS, AND THE ARITHMETIC IS THE CHECK. "Dragon egg" was entered
  // directly. Then two jobs, and the Model box fills from the title — so "Benchy"
  // made a model and "Dragon egg" MATCHED the one already there. 1 + 1 = 2, and a
  // 3 means matching by name broke and the catalog is quietly doubling.
  const seeded = await counts(page);
  if (seeded.jobs !== 2 || seeded.spools !== 1 || seeded.models !== 2) {
    fail(`seeding through the forms produced ${JSON.stringify(seeded)}, expected 2 jobs, 1 spool, and 2 models — "Dragon egg" entered directly, "Benchy" made by its job, and the second "Dragon egg" matching rather than duplicating`);
  } else {
    pass('seeding gives 2 models: one entered, one made by a job, and a repeated name matched rather than duplicated');
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

  // ------------------------------------------------------------------ undo
  //
  // THE SAME ASSERTION THE RESTORE GETS, because undo is the same promise: put
  // the data back exactly as it was. Four changes of four different shapes — an
  // edit, a reorder, a cascading delete and a create that writes a picture — then
  // four undos, then an export compared byte for byte against the one taken
  // before any of it. Anything undo leaves behind shows up here: an orphaned
  // image, a column whose order never came back, a job whose link to a deleted
  // spool was not restored, a timestamp rewritten on the way through.
  //
  // The create-with-a-picture is in the list on purpose. It is the one that was
  // actually broken: the form wrote the image before calling saveModel, so the
  // write sat outside the undo entry and the blob stayed in the database with
  // nothing pointing at it. A count would have missed it — the model was gone and
  // the totals looked right. Only comparing the whole export sees it.
  const beforeUndo = JSON.parse(second.text);

  await page.click('#tab-inventory');
  await page.waitForTimeout(200);
  await page.click('#inventory-list .rowcard .btn');
  await page.waitForTimeout(200);
  await page.fill('#spool-f-color', 'Midnight Blue');
  await page.click('#spool-save');
  await page.waitForTimeout(250);

  // The reorder that had no non-drag path until this release.
  await page.click('#tab-board');
  await page.waitForTimeout(200);
  await page.click('.card .card-actions button');
  await page.waitForTimeout(250);
  // "Put before X" or "Put last in X" depending on where this card already sits —
  // the panel omits the option that would do nothing, so which one is offered
  // depends on the seeded order. Either is the reorder; neither is a column move.
  const reordered = await page.evaluate(() => {
    const button = Array.from(document.querySelectorAll('#move-list button'))
      .find((b) => /^Put (before|last) /.test(b.textContent));
    if (!button) return null;
    button.click();
    return button.textContent;
  });
  if (!reordered) {
    fail('the Move panel offered no way to change a card\'s position within its column — reordering is drag-only');
  } else {
    pass(`the Move panel reorders without a drag: "${reordered}"`);
  }
  await page.waitForTimeout(300);

  // The cascade: every job that drew on this spool loses the link.
  await page.click('#tab-inventory');
  await page.waitForTimeout(200);
  await page.click('#inventory-list .rowcard .btn');
  await page.waitForTimeout(200);
  await page.click('#spool-delete');
  await page.waitForTimeout(220);
  await page.click('#confirm-go');
  await page.waitForTimeout(350);

  await page.click('#tab-models');
  await page.waitForTimeout(200);
  await page.click('#model-new');
  await page.fill('#model-f-name', 'Undo me');
  await page.setInputFiles('.pic-file', {
    name: 'undo-me.png',
    mimeType: 'image/png',
    buffer: makePng(800, 500),
  });
  await page.waitForFunction(
    () => /Ready —/.test(document.querySelector('.pic-status')?.textContent || ''),
    null,
    { timeout: 8000 },
  );
  await page.click('#model-save');
  await page.waitForTimeout(300);

  const named = await page.evaluate(() => ({
    hidden: document.getElementById('undo-strip').hidden,
    text: document.getElementById('undo-text').textContent,
  }));
  if (named.hidden) fail('four changes were made and the undo strip is still hidden — there is no route back');
  else if (!named.text.includes('Undo me')) fail(`the undo strip says "${named.text}", which does not name the change that was just made`);
  else pass(`the undo strip names the last change: "${named.text}"`);

  const midway = await counts(page);
  if (midway.spools !== 0 || midway.models !== beforeUndo.models.length + 1) {
    fail(`the four changes did not land as expected: ${JSON.stringify(midway)}`);
  }

  for (let i = 0; i < 4; i += 1) {
    const hidden = await page.evaluate(() => document.getElementById('undo-strip').hidden);
    if (hidden) { fail(`undo ran out after ${i} of 4 changes`); break; }
    await page.click('#undo-do');
    await page.waitForTimeout(320);
  }

  const third = await exportThroughTheButton(page);
  const afterUndo = JSON.parse(third.text);
  const undone = JSON.stringify(strip(afterUndo));

  if (undone !== after) {
    fail('four changes undone did NOT return the data to what it was');
    for (const key of ['spools', 'models', 'jobs', 'images']) {
      const was = JSON.stringify(beforeUndo[key] || []);
      const now = JSON.stringify(afterUndo[key] || []);
      if (was !== now) fail(`  ${key} differ:\n    before ${was.slice(0, 400)}\n    after  ${now.slice(0, 400)}`);
    }
  } else {
    pass(`an edit, a reorder, a cascading delete and a create-with-a-picture, all undone, restore the data byte for byte (${afterUndo.jobs.length} jobs, ${afterUndo.spools.length} spools, ${afterUndo.models.length} models, ${(afterUndo.images || []).length} pictures)`);
  }

  // Said separately because it is the failure that hides: the model can be gone
  // and its picture still be in the database, costing space in every export from
  // then on, with nothing on any screen to show for it.
  if ((afterUndo.images || []).length !== (beforeUndo.images || []).length) {
    fail(`undo left ${(afterUndo.images || []).length} picture(s) where there were ${(beforeUndo.images || []).length} — a blob nothing points at`);
  } else {
    pass('undoing a model that was created with a picture leaves no orphaned picture behind');
  }

  // Only meaningful if the strip was showing in the first place — "it is hidden
  // now" is trivially true of a control that is never shown, and a pass that a
  // broken feature also earns is worse than no check, because it reads as
  // coverage. The assertion above is what establishes it was there.
  const emptied = await page.evaluate(() => document.getElementById('undo-strip').hidden);
  if (named.hidden) fail('the undo strip never appeared, so there is nothing to say about it going away');
  else if (!emptied) fail('the undo strip is still offering an undo after every change was undone');
  else pass('the undo strip goes away when there is nothing left to undo');

  // ------------------------------------------- a model made by adding a job
  //
  // The job form's Model box takes a NAME, and a name that matches nothing makes
  // a model. The dangerous half is not the making, it is the UNDOING: the model
  // write has to be inside the job's transaction and inside its undo entry, or
  // undo puts the job back and leaves the model, or removes the model and leaves
  // a job pointing at nothing — and a job pointing at a missing model is exactly
  // what `backup.js` REFUSES on import. The reader would find that out on the day
  // they needed the backup.
  //
  // So this is checked the way the restore is: export, act, undo, export, compare.
  const beforeModelFromJob = await counts(page);
  const baseline = await exportThroughTheButton(page);

  await page.click('#tab-board');
  await page.waitForTimeout(200);
  await page.click('#job-new');
  await page.fill('#job-f-title', 'Widget Stand');

  // The title fills the box, so the common case costs no typing at all.
  const mirrored = await page.evaluate(() => ({
    value: document.getElementById('job-f-model').value,
    hint: document.getElementById('job-f-model-hint').textContent,
  }));
  if (mirrored.value !== 'Widget Stand') {
    fail(`typing a job title left the Model box as "${mirrored.value}" — the reader has to type the name twice`);
  } else if (!/will be added/.test(mirrored.hint)) {
    fail(`the Model box says "${mirrored.hint}" for a name that is not in the models — it has to say what saving will do BEFORE it does it`);
  } else {
    pass(`the job title fills the Model box, and it says: "${mirrored.hint}"`);
  }

  await page.click('#job-save');
  await page.waitForTimeout(320);

  const afterCreate = await counts(page);
  if (afterCreate.models !== beforeModelFromJob.models + 1) {
    fail(`adding a job that named a new model produced ${afterCreate.models} models, expected ${beforeModelFromJob.models + 1}`);
  } else {
    pass('adding a job that named an unknown model created exactly one model');
  }

  const linked = await page.evaluate(() => {
    document.getElementById('tab-models').click();
    return Array.from(document.querySelectorAll('#models-list .rowcard'))
      .some((c) => c.textContent.includes('Widget Stand'));
  });
  if (!linked) fail('the model created by adding a job does not appear in Models');
  else pass('the model created by adding a job is in the catalog, not only on the job');

  // A SECOND job naming the same model in different case and spacing must MATCH
  // rather than make a twin. This is the whole reason the box carries a hint.
  await page.click('#tab-board');
  await page.waitForTimeout(200);
  await page.click('#job-new');
  await page.fill('#job-f-title', 'Another run');
  await page.fill('#job-f-model', '  widget   stand ');
  const rematch = await page.evaluate(() => document.getElementById('job-f-model-hint').textContent);
  await page.click('#job-save');
  await page.waitForTimeout(320);

  const afterSecond = await counts(page);
  if (afterSecond.models !== afterCreate.models) {
    fail(`"  widget   stand " made a second model — ${afterSecond.models} where there were ${afterCreate.models}. Case and spacing are not a different model.`);
  } else if (!/Links to Widget Stand/.test(rematch)) {
    fail(`the Model box said "${rematch}" for a name that differs only in case and spacing`);
  } else {
    pass(`a name differing only in case and spacing links rather than duplicates: "${rematch}"`);
  }

  // A THIRD job that DECLINES the model. The tick is on by default, so this is
  // the case a reader reaches by turning something off — and the failure to guard
  // against is a name that gets saved anyway because the flag was read in the form
  // and not honoured by the store.
  await page.click('#tab-board');
  await page.waitForTimeout(200);
  await page.click('#job-new');
  await page.fill('#job-f-title', 'One off bracket');
  const offered = await page.evaluate(() => ({
    hidden: document.getElementById('job-f-model-save-field').hidden,
    checked: document.getElementById('job-f-model-save').checked,
  }));
  if (offered.hidden || !offered.checked) {
    fail(`a name that is not in the models offered ${offered.hidden ? 'no' : 'an unticked'} save-this-as-a-model choice`);
  }
  await page.uncheck('#job-f-model-save');
  const declinedHint = await page.evaluate(() => document.getElementById('job-f-model-hint').textContent);
  await page.click('#job-save');
  await page.waitForTimeout(320);

  const afterDeclined = await counts(page);
  const declinedLinked = await page.evaluate(() =>
    // Read from the database rather than from a screen: a job silently carrying a
    // modelId that no view happens to show is exactly the shape being ruled out.
    new Promise((resolve) => {
      const r = indexedDB.open('print-tracker');
      r.onsuccess = () => {
        const req = r.result.transaction('jobs', 'readonly').objectStore('jobs').getAll();
        req.onsuccess = () => {
          const job = req.result.find((j) => j.title === 'One off bracket');
          resolve(job ? Boolean(job.modelId) : null);
          r.result.close();
        };
      };
    }));

  if (afterDeclined.models !== afterSecond.models) {
    fail(`declining to save the model still made one — ${afterDeclined.models} models where there were ${afterSecond.models}`);
  } else if (afterDeclined.jobs !== afterSecond.jobs + 1) {
    fail('declining the model lost the job as well, which is not what was declined');
  } else if (declinedLinked !== false) {
    fail(`the declined job's modelId is ${declinedLinked === null ? 'unreadable' : 'set'} — it should point at nothing`);
  } else if (!/will not be saved/.test(declinedHint)) {
    fail(`the hint read "${declinedHint}" with the tick off — it has to say the model is not being kept`);
  } else {
    pass(`turning the tick off keeps the job and makes no model: "${declinedHint}"`);
  }

  // Three jobs now, and the one model, undone.
  await page.click('#undo-do');
  await page.waitForTimeout(320);

  // Both jobs and the one model, undone.
  for (let i = 0; i < 2; i += 1) {
    const hidden = await page.evaluate(() => document.getElementById('undo-strip').hidden);
    if (hidden) { fail(`undo ran out after ${i} of the 2 jobs that named models`); break; }
    await page.click('#undo-do');
    await page.waitForTimeout(320);
  }

  const undoneCounts = await counts(page);
  if (JSON.stringify(undoneCounts) !== JSON.stringify(beforeModelFromJob)) {
    fail(`undoing two jobs left ${JSON.stringify(undoneCounts)}, expected ${JSON.stringify(beforeModelFromJob)} — a model made by a job was not taken back with it`);
  }

  const afterJobUndo = await exportThroughTheButton(page);
  if (JSON.stringify(strip(JSON.parse(afterJobUndo.text))) !== JSON.stringify(strip(JSON.parse(baseline.text)))) {
    fail('undoing a job that created a model did NOT return the data to what it was');
  } else {
    pass('a job that creates a model is one gesture: undo takes both back, byte for byte');
  }

  // The failure this is really guarding: a model rolled back while the job that
  // pointed at it survives. That file imports nowhere.
  const settled = JSON.parse(afterJobUndo.text);
  const modelIds = new Set(settled.models.map((m) => m.id));
  const orphans = settled.jobs.filter((j) => j.modelId && !modelIds.has(j.modelId));
  if (orphans.length) {
    fail(`${orphans.length} job(s) point at a model that is not in the export — this backup would be refused on import`);
  } else {
    pass('no job points at a missing model, so the export still restores');
  }

  // ------------------------------------------------- the request as it arrives
  //
  // THE WHOLE WORKFLOW, in the order it actually happens. Somebody sends a link
  // and nothing else. Everything the app needs to file it is inside that link, so
  // this drives the form the way a reader would — paste first, then say who
  // asked — and asserts that nothing else had to be typed.
  //
  // The URL is the real shape people send: a Printables model page copied from
  // its FILES tab, which is the tab you send to somebody who is going to print
  // the thing. That trailing segment is what made the title guess return "Files".
  const LINK = 'https://www.printables.com/model/905441-bolt-euv-2022-privacy-screen-post-replacement/files';
  const LINK_TITLE = 'Bolt Euv 2022 Privacy Screen Post Replacement';

  const beforeRequest = await counts(page);
  const requestBaseline = await exportThroughTheButton(page);

  await page.click('#tab-board');
  await page.waitForTimeout(200);
  await page.click('#job-new');
  await page.fill('#job-f-link', LINK);
  await page.waitForTimeout(80);

  const filled = await page.evaluate(() => ({
    title: document.getElementById('job-f-title').value,
    model: document.getElementById('job-f-model').value,
    hint: document.getElementById('job-f-model-hint').textContent,
    tick: document.getElementById('job-f-model-save').checked,
  }));
  if (filled.title !== LINK_TITLE) {
    fail(`pasting the link filled the Title with "${filled.title}", expected "${LINK_TITLE}" — the name is in the link and nothing should have to be typed`);
  } else if (filled.model !== LINK_TITLE) {
    fail(`the Title filled but the Model box says "${filled.model}" — the chain from link to model is broken`);
  } else if (!filled.tick) {
    fail('a pasted link left the save-this-as-a-model tick off, which would throw the link away');
  } else if (!/with the link/.test(filled.hint)) {
    fail(`the hint reads "${filled.hint}" — it has to say the link is being kept, since a job with no model has nowhere to keep one`);
  } else {
    pass(`one paste fills the name and says what happens: "${filled.hint}"`);
  }

  await page.check('input[name="job-type"][value="request"]');
  await page.fill('#job-f-requester', 'John');
  await page.click('#job-save');
  await page.waitForTimeout(340);

  const afterRequest = await counts(page);
  if (afterRequest.models !== beforeRequest.models + 1) {
    fail(`the pasted request produced ${afterRequest.models} models, expected ${beforeRequest.models + 1}`);
  }

  // The link is on the MODEL, read from the database rather than from a screen.
  const stored = await page.evaluate(() => new Promise((resolve) => {
    const r = indexedDB.open('print-tracker');
    r.onsuccess = () => {
      const req = r.result.transaction('models', 'readonly').objectStore('models').getAll();
      req.onsuccess = () => {
        const model = req.result.find((m) => /Privacy Screen/.test(m.name || ''));
        resolve(model ? { name: model.name, sources: model.sources || [] } : null);
        r.result.close();
      };
    };
  }));
  if (!stored) {
    fail('no model was made from the pasted link');
  } else if (stored.sources.length !== 1 || stored.sources[0].url !== LINK) {
    fail(`the model carries ${JSON.stringify(stored.sources)} — expected exactly the link that was pasted`);
  } else if (stored.sources[0].label !== 'Printables') {
    fail(`the link was filed under "${stored.sources[0].label}" rather than the site it came from`);
  } else {
    pass(`the link is kept on the model, labelled ${stored.sources[0].label}, without a second screen`);
  }

  // And it is reachable from the CARD, which is the thing you are looking at when
  // you decide what to print next.
  const onCard = await page.evaluate(() => {
    const card = Array.from(document.querySelectorAll('.card'))
      .find((c) => /Privacy Screen/.test(c.textContent));
    if (!card) return null;
    const link = card.querySelector('.card-source');
    if (!link || link.hidden) return { missing: true };
    return { href: link.getAttribute('href'), text: link.textContent, name: link.getAttribute('aria-label') };
  });
  if (!onCard) {
    fail('the job did not reach the board');
  } else if (onCard.missing) {
    fail('the card has no link to where the file came from, so choosing what to print still means leaving the board');
  } else if (onCard.href !== LINK) {
    fail(`the card links to ${onCard.href} rather than the address that was pasted`);
  } else if (!onCard.name || !onCard.name.startsWith(onCard.text)) {
    fail(`the card link reads "${onCard.text}" and answers to "${onCard.name}", which does not start with it (SC 2.5.3)`);
  } else {
    pass(`the card carries the link: "${onCard.text}" to ${onCard.href}`);
  }

  // A second job for the same thing must not file the address twice.
  await page.click('#job-new');
  await page.fill('#job-f-link', LINK);
  await page.waitForTimeout(80);
  await page.click('#job-save');
  await page.waitForTimeout(340);

  const twice = await page.evaluate(() => new Promise((resolve) => {
    const r = indexedDB.open('print-tracker');
    r.onsuccess = () => {
      const req = r.result.transaction('models', 'readonly').objectStore('models').getAll();
      req.onsuccess = () => {
        const model = req.result.find((m) => /Privacy Screen/.test(m.name || ''));
        resolve(model ? (model.sources || []).length : -1);
        r.result.close();
      };
    };
  }));
  if (twice !== 1) fail(`printing the same thing twice filed the address ${twice} times`);
  else pass('a second job for the same model does not file the same address again');

  for (let i = 0; i < 2; i += 1) {
    await page.click('#undo-do');
    await page.waitForTimeout(340);
  }
  const afterRequestUndo = await exportThroughTheButton(page);
  if (JSON.stringify(strip(JSON.parse(afterRequestUndo.text))) !== JSON.stringify(strip(JSON.parse(requestBaseline.text)))) {
    fail('undoing a pasted request did NOT return the data to what it was');
  } else {
    pass('a request filed from a link is one gesture: undo takes the job, the model and the link back together');
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
  await page.check('input[name="job-type"][value="request"]');
  await page.fill('#job-f-requester', 'Ada Lovelace');
  // By NAME, and typed over whatever the title mirrored in. This existing model
  // must be MATCHED rather than duplicated — the assertion below reads the
  // model's own total, so a second "Gift box" would show £0.00 and fail.
  await page.fill('#job-f-model', 'Gift box');
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
