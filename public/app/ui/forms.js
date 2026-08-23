// The add/edit forms for jobs, spools and models.
//
// Deleting anything says out loud what else it will touch before it asks, because
// the answer to "delete this spool?" depends entirely on how many jobs have drawn
// on it — and the app, not the reader, is the one that knows.

import { $, el, clear, grams } from '../dom.js';
import { COLUMNS, MATERIALS, TYPES_WITH_RECIPIENT, TYPES_WITH_PRICE, remainingFor, num } from '../derive.js';
import * as store from '../store.js';
import { readUrl } from '../fromurl.js';
import { openPanel, close, registerPanel, confirmThen, say } from './panels.js';
import { pictureField } from './picture.js';

let editing = { job: null, spool: null, model: null };

/**
 * Whether the reader has typed in the job form's Title and Model boxes themselves.
 *
 * THE TWO BOXES MIRROR EACH OTHER, in both directions, and each stops for good the
 * moment the reader touches the box being written to — the same rule `offerFromUrl`
 * follows further down, and for the same reason: a suggestion that overwrites what
 * somebody typed destroys data at the moment they were looking elsewhere. Clearing
 * a box counts as touching it, so "this job is not a print of a model" sticks
 * rather than being refilled on the next keystroke of the title.
 *
 * IT WAS ONE-WAY UNTIL 0.7.0 and the asymmetry was invisible from inside the code:
 * a pasted link filled the Title and the Title filled the Model, so the whole
 * request arrived from one paste — but naming a model that already exists filled
 * nothing, and the same words had to be typed a second time into the Title. Every
 * gate was green, because no gate asks whether two halves of a mirror are the same
 * size.
 */
let modelTouched = false;
let titleTouched = false;

export function initForms() {
  registerPanel('dlg-job');
  registerPanel('dlg-spool');
  registerPanel('dlg-model');

  // Column options, once.
  const columnSelect = $('#job-f-column');
  for (const column of COLUMNS) columnSelect.append(el('option', { value: column.id }, column.label));

  const materials = $('#materials');
  for (const material of MATERIALS) materials.append(el('option', { value: material }));

  // `change` bubbles from a radio, so the fieldset hears all three.
  $('#job-f-type').addEventListener('change', syncJobFields);
  // The printer box follows the column, so the column has to say when it moves.
  columnSelect.addEventListener('change', syncJobFields);
  $('#job-f-addlink').addEventListener('click', () => addLinkRow());

  // A pasted link fills the Title, which then fills the Model box — so one paste
  // is the whole of an ordinary request. `paste` is deferred by a tick because the
  // value is not in the box yet when the event fires.
  const link = $('#job-f-link');
  link.addEventListener('paste', () => setTimeout(offerFromLink, 0));
  for (const event of ['input', 'change']) link.addEventListener(event, offerFromLink);

  // Each box fills the other until the reader touches the one being filled. Most
  // jobs here are a print OF the thing the job is named after, so the common case
  // is no typing at all — and the one that is not is a box they clear once.
  $('#job-f-title').addEventListener('input', () => {
    titleTouched = true;
    if (modelTouched || editing.job) return;
    $('#job-f-model').value = $('#job-f-title').value;
    renderModelField();
  });
  for (const event of ['input', 'change']) {
    $('#job-f-model').addEventListener(event, () => {
      modelTouched = true;
      // THE MATCHED MODEL'S OWN NAME, not the letters typed to find it. Choosing
      // "benchy" from the list is choosing Benchy, and a title reading "benchy"
      // is the sort of thing nobody notices until it is on the board.
      if (!titleTouched && !editing.job) {
        const typed = $('#job-f-model').value.trim();
        $('#job-f-title').value = (typed && store.modelNamed(typed)?.name) || $('#job-f-model').value;
      }
      renderModelField();
    });
  }
  // The tick decides what the hint below it promises, so it redraws the hint.
  $('#job-f-model-save').addEventListener('change', renderModelField);
  const modelLink = $('#model-f-link');
  modelLink.addEventListener('paste', () => setTimeout(offerFromModelLink, 0));
  for (const event of ['input', 'change']) modelLink.addEventListener(event, offerFromModelLink);

  $('#model-f-addsource').addEventListener('click', () => addSourceRow());
  $('#model-f-addlisting').addEventListener('click', () => addListingRow());

  $('#job-form').addEventListener('submit', onSaveJob);
  $('#spool-form').addEventListener('submit', onSaveSpool);
  $('#model-form').addEventListener('submit', onSaveModel);

  $('#job-delete').addEventListener('click', onDeleteJob);
  $('#spool-delete').addEventListener('click', onDeleteSpool);
  $('#model-delete').addEventListener('click', onDeleteModel);

  $('#job-new').addEventListener('click', (e) => openJob(null, e.currentTarget));
  $('#spool-new').addEventListener('click', (e) => openSpool(null, e.currentTarget));
  $('#model-new').addEventListener('click', (e) => openModel(null, e.currentTarget));
}

// --------------------------------------------------------------------- job

export function openJob(id, opener) {
  const job = id ? store.state.jobs.find((j) => j.id === id) : null;
  editing.job = job?.id || null;

  $('#job-title').textContent = job ? 'Edit job' : 'Add job';
  $('#job-f-title').value = job?.title || '';
  setJobType(job?.type || 'fun');
  $('#job-f-requester').value = job?.requester || '';
  $('#job-f-printer').value = job?.printer || '';
  $('#job-f-quantity').value = job?.quantity ?? 1;
  $('#job-f-price').value = job?.priceCharged ? String(job.priceCharged) : '';
  $('#job-f-column').value = job?.column || 'research';
  $('#job-f-notes').value = job?.notes || '';
  $('#job-delete').hidden = !job;
  // Not restored from the model on an edit: the box is for adding a link, and
  // showing one already filed would invite editing it here, which is the model's
  // business. The links a model has are listed under it in Models.
  $('#job-f-link').value = '';

  // The NAME of the linked model, not its id — the box is what the reader would
  // say out loud, and an id in a text field is a thing they can accidentally
  // destroy. A job whose model has since been deleted comes back empty, which is
  // the truth about it.
  const modelInput = $('#job-f-model');
  const linked = job?.modelId ? store.state.models.find((m) => m.id === job.modelId) : null;
  modelInput.value = linked?.name || '';
  // Both halves of the mirror, reset together — a flag left set from the previous
  // job is a form that silently stops filling itself, which reads as a defect in
  // the feature rather than in the reopening.
  modelTouched = Boolean(modelInput.value);
  titleTouched = Boolean($('#job-f-title').value);

  $('#job-f-model-save').checked = true;

  const options = $('#job-f-model-options');
  clear(options);
  for (const model of store.state.models) {
    if (model.name) options.append(el('option', { value: model.name }));
  }

  // The picture shown is the one the CARD shows — the job's own if it has one,
  // otherwise its model's. Anything else would be a form disagreeing with the
  // board about what the picture of this job is.
  ensureJobPicture().set(job?.imageId || linked?.imageId || '');
  renderModelField();

  const links = $('#job-f-links');
  clear(links);
  for (const link of job?.spoolLinks || []) addLinkRow(link);
  $('#job-f-nospools').hidden = store.state.spools.length > 0;
  $('#job-f-addlink').disabled = store.state.spools.length === 0;

  fillPrinterOptions();
  syncJobFields();
  openPanel('dlg-job', opener);
  $('#job-f-title').focus();
}

let jobPicture = null;

function ensureJobPicture() {
  if (jobPicture) return jobPicture;
  jobPicture = pictureField({ label: 'Picture', describe: 'this print' });
  $('#job-f-picture').append(jobPicture.node);
  return jobPicture;
}

/**
 * Where the picture will be kept, said before it is kept there.
 *
 * NOT GUESSABLE, and the answer moves as the Model box is typed in: the same
 * pasted picture goes on a model being created, on a model that has none, or on
 * the job itself when the model already has its own. A reader who is not told
 * cannot know which, and the difference matters the next time they print the
 * same thing.
 */
function renderPictureHint() {
  const hint = $('#job-f-picture-hint');
  const typed = $('#job-f-model').value.trim();
  const found = typed ? store.modelNamed(typed) : null;
  const saving = $('#job-f-model-save').checked;

  if (found?.imageId) {
    hint.textContent = `${found.name} already has a picture, so one added here is kept on this job and is what its card shows.`;
    return;
  }
  if (found) {
    hint.textContent = `Kept on ${found.name}, so every job printing it shows it.`;
    return;
  }
  if (typed && saving) {
    hint.textContent = `Kept on ${typed}, the model this job is about to make.`;
    return;
  }
  hint.textContent = 'Kept on this job. With no model to hold it, the picture belongs to the job itself.';
}

/**
 * A new job that is already a print of this model.
 *
 * The model is carried by NAME rather than by id, because that is what `saveJob`
 * takes and what the box shows — the same decision as everywhere else here, and it
 * means this route has no privileged path into the store that the typed one lacks.
 * If the two ever disagree, they disagree in one place.
 *
 * Both mirror flags are set, so nothing rewrites either box afterwards: the reader
 * asked for this exact model, and a title they then edit is theirs.
 */
export function openJobForModel(modelId, opener) {
  const model = store.state.models.find((m) => m.id === modelId);
  openJob(null, opener);
  if (!model) return;

  $('#job-f-title').value = model.name || '';
  $('#job-f-model').value = model.name || '';
  titleTouched = true;
  modelTouched = true;
  renderModelField();
  $('#job-f-title').focus();
}

/* The type is three radios rather than a select, so it has no `.value` of its
 * own. One reader and one writer here, so no call site has to know the shape —
 * which is what let the select become radios without touching anything else. */
function jobType() {
  return document.querySelector('input[name="job-type"]:checked')?.value || 'fun';
}

function setJobType(value) {
  const wanted = document.querySelector(`input[name="job-type"][value="${value}"]`)
    || document.querySelector('input[name="job-type"][value="fun"]');
  if (wanted) wanted.checked = true;
}

/**
 * Show only the boxes this job actually has.
 *
 * DRIVEN BY THE LISTS rather than by `=== 'request'`. A gift has a recipient too,
 * and the version of this that named one id is why adding the second one meant
 * finding every place that had made the same assumption. Money went in the same
 * way: `hasPrice` on TYPES, one list, one reader.
 *
 * THE PRINTER IS DRIVEN BY THE COLUMN, not by the type — a printer is a fact
 * about a print that exists, and a Research job is by definition not on one.
 * Every type can end up on a machine, so this is the wrong question to ask of the
 * category and the right one to ask of the state.
 */
function syncJobFields() {
  $('#job-f-requester-field').hidden = !TYPES_WITH_RECIPIENT.includes(jobType());
  $('#job-f-price-field').hidden = !TYPES_WITH_PRICE.includes(jobType());
  $('#job-f-printer-field').hidden = $('#job-f-column').value === 'research';
}

/**
 * The printers this board already knows about, offered as a list.
 *
 * READ FROM THE JOBS, never stored. There is no printers table and there must not
 * be one: a second record of which machines exist is a second thing that can
 * disagree with the jobs, and renaming a printer would then need a migration. The
 * set of printers IS whatever the jobs say, which is the same rule remaining
 * weight follows.
 *
 * Case-insensitively deduplicated on the way in, keeping the spelling used most
 * recently — two machines of the same make are told apart by what they were
 * called, so "Left" and "left" being offered as two choices is noise.
 */
function fillPrinterOptions() {
  const seen = new Map();
  for (const job of store.state.jobs) {
    const name = (job.printer || '').trim();
    if (name) seen.set(name.toLowerCase(), name);
  }
  const list = $('#job-f-printer-options');
  clear(list);
  for (const name of [...seen.values()].sort((a, b) => a.localeCompare(b))) {
    list.append(el('option', { value: name }));
  }
}

// ------------------------------------------------------------- the model box

/**
 * Read a pasted link and offer what it says, into EMPTY boxes only.
 *
 * The same rule `offerFromUrl` follows for a model's own source rows: a guess
 * that overwrites something typed destroys data at the moment the reader was
 * looking elsewhere. So a link pasted over a title somebody wrote changes
 * nothing, and the link is still kept.
 *
 * A link also means there IS a thing on somebody's site, which is what a model
 * is — so it re-ticks *Save this as a model*, because declining now costs the
 * link as well and the hint below says so.
 */
function offerFromLink() {
  const url = $('#job-f-link').value.trim();
  const { title } = readUrl(url);
  const titleBox = $('#job-f-title');

  if (title && !titleBox.value.trim()) {
    titleBox.value = title;
    // The title now holds something the reader asked for by pasting, so naming a
    // model afterwards links the job WITHOUT rewriting it. A link to a page called
    // "Bolt EUV 2022 privacy screen post replacement", filed under a model called
    // "Privacy screen", should keep both names rather than collapse to one.
    titleTouched = true;
    if (!modelTouched && !editing.job) $('#job-f-model').value = title;
  }
  if (url) $('#job-f-model-save').checked = true;
  renderModelField();
}

/**
 * What the Model box says it will do, and the one case where it offers a choice.
 *
 * THREE OUTCOMES, and the reader can see which one they are getting before they
 * commit to it: link to a model that exists, make a new one, or have no model at
 * all. The hint is always visible — a hint that only appears on a mismatch
 * teaches nobody what the field does, and a state that is usually absent is a
 * state usually nothing measures.
 *
 * The tick box appears ONLY for a name that is new, because that is the only
 * case where there is anything to decide. An existing name links whatever it is
 * set to, and an empty box means no model; offering the question there would be a
 * control that does nothing, which is worse than no control.
 */
function renderModelField() {
  const typed = $('#job-f-model').value.trim();
  const hint = $('#job-f-model-hint');
  const saveField = $('#job-f-model-save-field');
  const saveBox = $('#job-f-model-save');

  const found = typed ? store.modelNamed(typed) : null;
  saveField.hidden = !typed || Boolean(found);

  // The picture hint answers the same question about a different record, and it
  // moves for the same reasons, so it is redrawn from the same place. Two hints
  // updated from two call sites is how one of them stops being updated.
  renderPictureHint();

  if (!typed) {
    hint.textContent = 'Not from a saved model. Type a name and it is added to your models if it is not there already.';
    return;
  }
  if (found) {
    hint.textContent = `Links to ${found.name}, already in your models.`;
    return;
  }
  // The WORDS carry it, not a colour. These read differently from one another;
  // a colour variant would be a state that only appears sometimes.
  const link = $('#job-f-link').value.trim();
  if (saveBox.checked) {
    hint.textContent = link
      ? `${typed} will be added to your models, with the link.`
      : `${typed} will be added to your models.`;
    return;
  }
  // THE LINK GOES WITH IT, and that is worth saying rather than discovering. A
  // link is kept on the model, so no model means nowhere to keep it.
  hint.textContent = link
    ? `${typed} will not be saved, and the link goes with it. The job is kept.`
    : `${typed} will not be saved, and this job will have no model. The job's own title still says what it is.`;
}

function addLinkRow(link = null) {
  const spools = store.state.spools;
  if (!spools.length) return;

  const select = el('select', { 'aria-label': 'Spool' });
  for (const spool of spools) {
    const left = remainingFor(spool, store.state.jobs);
    const name = [spool.brand, spool.material, spool.colorName].filter(Boolean).join(' ') || 'Unnamed spool';
    select.append(el('option', { value: spool.id }, `${name} — ${grams(left)} left`));
  }
  if (link?.spoolId) select.value = link.spoolId;

  const gramsInput = el('input', {
    type: 'number', min: '0', step: '1', inputmode: 'numeric',
    'aria-label': 'Grams used', value: link ? String(num(link.grams)) : '',
  });

  const row = el('div', { class: 'linkrow' },
    el('div', { class: 'field' }, el('span', { class: 'sr-only' }), select),
    el('div', { class: 'field' }, gramsInput),
  );
  const removeBtn = el('button', { type: 'button', class: 'btn btn-danger' }, 'Remove');
  // Numbered, because several of these can be on screen at once and two controls
  // answering to one name is a coin toss for anyone driving by voice.
  removeBtn.setAttribute('aria-label', `Remove spool ${$('#job-f-links').children.length + 1} from the job`);
  removeBtn.addEventListener('click', () => row.remove());
  row.append(removeBtn);

  row._read = () => ({ spoolId: select.value, grams: num(gramsInput.value) });
  $('#job-f-links').append(row);
}

async function onSaveJob(event) {
  event.preventDefault();
  const links = Array.from($('#job-f-links').children).map((row) => row._read());

  // Asked BEFORE the save, so the answer is about what was there a moment ago
  // rather than about the model the save may have just made.
  const typed = $('#job-f-model').value.trim();
  const found = typed ? store.modelNamed(typed) : null;
  const isNewModel = Boolean(typed) && !found && $('#job-f-model-save').checked;

  // A name the reader declined to save is not passed on at all. The store's rule
  // is "a name that matches nothing becomes a model", so declining has to be
  // expressed by withholding the name rather than by a second flag the store
  // would have to be trusted to honour.
  const modelName = (found || isNewModel) ? typed : '';

  // The BYTES, never an id — the same contract the model form has, so the store
  // writes the picture inside the call that writes the record and one undo takes
  // back both. Storing it here and passing an id would put the write outside the
  // undo entry and orphan the blob, which is what the model form did once.
  const field = ensureJobPicture();

  // A NAME, never an id — see the note above saveJob for why the store is what
  // creates the model rather than this form.
  const job = await store.saveJob({
    id: editing.job,
    title: $('#job-f-title').value,
    type: jobType(),
    requester: TYPES_WITH_RECIPIENT.includes(jobType()) ? $('#job-f-requester').value : '',
    modelName,
    sourceUrl: $('#job-f-link').value,
    printer: $('#job-f-printer').value,
    quantity: $('#job-f-quantity').value,
    // CLEARED WHEN THE CATEGORY HAS NO MONEY, exactly as the recipient is. A value
    // the form does not show and the app still holds is the shape this codebase
    // refuses everywhere else — it survives into the export and into the model's
    // earnings, where nothing on screen explains it. Undo puts it back in one
    // press if the type was changed by mistake.
    priceCharged: TYPES_WITH_PRICE.includes(jobType()) ? $('#job-f-price').value : '',
    column: $('#job-f-column').value,
    notes: $('#job-f-notes').value,
    spoolLinks: links,
    picture: field.read(),
  });
  // Whichever record ended up holding it — the job's own, or its model's.
  const model = job?.modelId ? store.state.models.find((m) => m.id === job.modelId) : null;
  field.saved(job?.imageId || model?.imageId || '');
  if (job?.imageId || model?.imageId) store.askToPersist();

  close('dlg-job');
  // Named out loud. A record appearing in another view without being mentioned is
  // how somebody discovers their catalog has doubled a week later.
  say(isNewModel ? `Job saved, and ${typed} added to your models.` : 'Job saved.');
}

function onDeleteJob() {
  const job = store.state.jobs.find((j) => j.id === editing.job);
  if (!job) return;
  confirmThen(
    {
      title: 'Delete this job?',
      body: `"${job.title || 'Untitled job'}" will be removed. Any filament logged on it goes back to the spools it came from, because remaining weight is worked out from the jobs.`,
      action: 'Delete job',
    },
    async () => {
      await store.deleteJob(job.id);
      close('dlg-job');
      say('Job deleted.');
    },
  );
}

// ------------------------------------------------------------------- spool

export function openSpool(id, opener) {
  const spool = id ? store.state.spools.find((s) => s.id === id) : null;
  editing.spool = spool?.id || null;

  $('#spool-title').textContent = spool ? 'Edit spool' : 'Add spool';
  $('#spool-f-brand').value = spool?.brand || '';
  $('#spool-f-material').value = spool?.material || '';
  $('#spool-f-color').value = spool?.colorName || '';
  $('#spool-f-hex').value = spool?.colorHex || '#8fd6a4';
  $('#spool-f-weight').value = spool ? String(num(spool.totalWeightG)) : '1000';
  $('#spool-f-cost').value = spool?.cost ? String(spool.cost) : '';
  $('#spool-f-opened').value = spool?.dateOpened || '';
  $('#spool-f-status').value = spool?.status || 'sealed';
  $('#spool-f-notes').value = spool?.notes || '';
  $('#spool-delete').hidden = !spool;

  // Remaining is shown, never edited: there is no field for it to be typed into.
  $('#spool-f-remaining').textContent = spool
    ? `${grams(remainingFor(spool, store.state.jobs))} left. That is worked out from the jobs, so it is not something to type in here.`
    : 'Remaining weight is worked out from the filament you log against jobs — there is nothing to enter for it.';

  openPanel('dlg-spool', opener);
  $('#spool-f-brand').focus();
}

async function onSaveSpool(event) {
  event.preventDefault();
  await store.saveSpool({
    id: editing.spool,
    brand: $('#spool-f-brand').value,
    material: $('#spool-f-material').value,
    colorName: $('#spool-f-color').value,
    colorHex: $('#spool-f-hex').value,
    totalWeightG: $('#spool-f-weight').value,
    cost: $('#spool-f-cost').value,
    dateOpened: $('#spool-f-opened').value,
    status: $('#spool-f-status').value,
    notes: $('#spool-f-notes').value,
  });
  close('dlg-spool');
  say('Spool saved.');
}

function onDeleteSpool() {
  const spool = store.state.spools.find((s) => s.id === editing.spool);
  if (!spool) return;
  const impact = store.spoolDeletionImpact(spool.id);
  const name = [spool.brand, spool.material, spool.colorName].filter(Boolean).join(' ') || 'this spool';

  confirmThen(
    {
      title: 'Delete this spool?',
      body: impact.jobs === 0
        ? `${name} will be removed. No job has logged filament from it.`
        : `${name} will be removed, and ${grams(impact.grams)} logged across ${impact.jobs} ${impact.jobs === 1 ? 'job' : 'jobs'} will be unlinked at the same time. Those jobs stay; only the filament record goes.`,
      action: 'Delete spool',
    },
    async () => {
      await store.deleteSpool(spool.id);
      close('dlg-spool');
      say('Spool deleted.');
    },
  );
}

// ------------------------------------------------------------------- model

let modelPicture = null;

function ensureModelPicture() {
  if (modelPicture) return modelPicture;
  modelPicture = pictureField({ label: 'Picture', describe: 'this model' });
  $('#model-f-picture').append(modelPicture.node);
  return modelPicture;
}

export function openModel(id, opener) {
  const model = id ? store.state.models.find((m) => m.id === id) : null;
  editing.model = model?.id || null;

  $('#model-title').textContent = model ? 'Edit model' : 'Add model';
  // Cleared on every open, like the job form's. The box is for ADDING an address;
  // showing one already filed would invite editing it here while the real rows sit
  // below saying something different.
  $('#model-f-link').value = '';
  $('#model-f-name').value = model?.name || '';
  $('#model-f-designer').value = model?.designer || '';
  $('#model-f-tags').value = (model?.tags || []).join(', ');
  $('#model-f-notes').value = model?.notes || '';
  $('#model-delete').hidden = !model;

  ensureModelPicture().set(model?.imageId || '');

  clear($('#model-f-sources'));
  for (const source of model?.sources || []) addSourceRow(source);
  clear($('#model-f-listings'));
  for (const listing of model?.listings || []) addListingRow(listing);

  openPanel('dlg-model', opener);
  $('#model-f-name').focus();
}

/**
 * Fill what a URL can say on its own — the site it came from, and a title guess
 * from the path. No network: see fromurl.js for why fetching the page is not
 * something a browser can do.
 *
 * ONLY EMPTY FIELDS ARE FILLED. A guess that overwrites something typed is a
 * guess that destroys data, and it would do it at the exact moment the reader was
 * looking somewhere else.
 */
function offerFromUrl(url, { label, site } = {}) {
  const { site: siteName, title } = readUrl(url);
  if (!siteName) return;
  if (label && !label.value.trim()) label.value = siteName;
  if (site && !site.value.trim()) site.value = siteName;

  const name = $('#model-f-name');
  if (title && name && !name.value.trim()) name.value = title;
}

/**
 * One paste catalogues a model: the name is offered and the address is filed.
 *
 * The job form has had this since 0.5.0 and the model form did not, so the SHORT
 * way to catalogue a link was to add a job you did not want. What it does is
 * deliberately the same three things `offerFromLink` does, in the same order and
 * under the same rule — only ever into an EMPTY box, because a guess that
 * overwrites what somebody typed destroys it at the moment they looked away.
 *
 * It fills the FIRST source row rather than adding one per keystroke: this fires
 * on `input` as well as `paste`, and a row per character is not a feature.
 */
function offerFromModelLink() {
  const url = $('#model-f-link').value.trim();
  const { title, site } = readUrl(url);

  const nameBox = $('#model-f-name');
  if (title && !nameBox.value.trim()) nameBox.value = title;

  if (!url) return;
  const rows = $('#model-f-sources');
  if (!rows.children.length) addSourceRow();
  const first = rows.children[0];
  const [labelBox, urlBox] = first.querySelectorAll('input');
  // The row the reader is typing into by hand is theirs; only an empty one is
  // filled from up here.
  if (!urlBox.value.trim()) urlBox.value = url;
  if (!labelBox.value.trim()) labelBox.value = site || 'Source';
}

function addSourceRow(source = null) {
  const label = el('input', { type: 'text', 'aria-label': 'What this link is', value: source?.label || '', autocomplete: 'off' });
  const url = el('input', { type: 'url', 'aria-label': 'Address', value: source?.url || '', autocomplete: 'off', placeholder: 'https://' });
  const row = el('div', { class: 'linkrow' },
    el('div', { class: 'field' }, label),
    el('div', { class: 'field' }, url),
  );
  const remove = el('button', { type: 'button', class: 'btn btn-danger' }, 'Remove');
  remove.setAttribute('aria-label', `Remove source link ${$('#model-f-sources').children.length + 1}`);
  remove.addEventListener('click', () => row.remove());
  row.append(remove);

  // On paste and on leaving the field, not on every keystroke — a guess that
  // arrives letter by letter while someone is still typing is a fight.
  url.addEventListener('paste', () => setTimeout(() => offerFromUrl(url.value, { label }), 0));
  url.addEventListener('change', () => offerFromUrl(url.value, { label }));

  row._read = () => ({ label: label.value, url: url.value });
  $('#model-f-sources').append(row);
}

function addListingRow(listing = null) {
  const site = el('input', { type: 'text', 'aria-label': 'Site name', value: listing?.site || '', autocomplete: 'off' });
  const url = el('input', { type: 'url', 'aria-label': 'Listing address', value: listing?.url || '', autocomplete: 'off', placeholder: 'https://' });
  const units = el('input', { type: 'number', min: '0', step: '1', inputmode: 'numeric', 'aria-label': 'Units sold', value: listing?.unitsSold ?? '' });
  const revenue = el('input', { type: 'number', min: '0', step: '0.01', inputmode: 'decimal', 'aria-label': 'Revenue', value: listing?.revenue ?? '' });

  const row = el('div', { class: 'linkrow' },
    el('div', { class: 'field' }, site),
    el('div', { class: 'field' }, url),
    el('div', { class: 'field' }, units),
    el('div', { class: 'field' }, revenue),
  );
  const remove = el('button', { type: 'button', class: 'btn btn-danger' }, 'Remove');
  remove.setAttribute('aria-label', `Remove listing ${$('#model-f-listings').children.length + 1}`);
  remove.addEventListener('click', () => row.remove());
  row.append(remove);

  url.addEventListener('paste', () => setTimeout(() => offerFromUrl(url.value, { site }), 0));
  url.addEventListener('change', () => offerFromUrl(url.value, { site }));

  row._read = () => ({ site: site.value, url: url.value, unitsSold: units.value, revenue: revenue.value });
  $('#model-f-listings').append(row);
}

async function onSaveModel(event) {
  event.preventDefault();

  // The BYTES are handed over, never an id: the store writes the picture inside
  // the same call that writes the model, so one undo takes back both. This form
  // used to store the image first and pass the id, which put the write outside
  // the undo entry and orphaned the blob.
  const field = ensureModelPicture();

  const model = await store.saveModel({
    id: editing.model,
    name: $('#model-f-name').value,
    designer: $('#model-f-designer').value,
    tags: $('#model-f-tags').value,
    notes: $('#model-f-notes').value,
    sources: Array.from($('#model-f-sources').children).map((r) => r._read()),
    listings: Array.from($('#model-f-listings').children).map((r) => r._read()),
    picture: field.read(),
  });
  field.saved(model.imageId);

  // Only worth asking once there is something worth keeping.
  if (model.imageId) store.askToPersist();

  close('dlg-model');
  say('Model saved.');
}

function onDeleteModel() {
  const model = store.state.models.find((m) => m.id === editing.model);
  if (!model) return;
  const impact = store.modelDeletionImpact(model.id);
  confirmThen(
    {
      title: 'Delete this model?',
      body: impact.jobs === 0
        ? `"${model.name || 'This model'}" will be removed, along with its links and listings.`
        : `"${model.name || 'This model'}" will be removed, along with its links and listings. ${impact.jobs} ${impact.jobs === 1 ? 'job that names it will keep its own record but stop pointing at it' : 'jobs that name it will keep their own records but stop pointing at it'}.`,
      action: 'Delete model',
    },
    async () => {
      await store.deleteModel(model.id);
      close('dlg-model');
      say('Model deleted.');
    },
  );
}
