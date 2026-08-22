// The add/edit forms for jobs, spools and models.
//
// Deleting anything says out loud what else it will touch before it asks, because
// the answer to "delete this spool?" depends entirely on how many jobs have drawn
// on it — and the app, not the reader, is the one that knows.

import { $, el, clear, grams } from '../dom.js';
import { COLUMNS, MATERIALS, remainingFor, num } from '../derive.js';
import * as store from '../store.js';
import { readUrl } from '../fromurl.js';
import { openPanel, close, registerPanel, confirmThen, say } from './panels.js';
import { pictureField } from './picture.js';

let editing = { job: null, spool: null, model: null };

/**
 * Whether the reader has typed in the job form's Model box themselves.
 *
 * The title fills that box while this is false and stops for good the moment they
 * touch it — the same rule `offerFromUrl` follows further down, and for the same
 * reason: a suggestion that overwrites what somebody typed destroys data at the
 * moment they were looking elsewhere. Clearing the box counts as touching it, so
 * "this job is not a print of a model" sticks rather than being refilled on the
 * next keystroke of the title.
 */
let modelTouched = false;

export function initForms() {
  registerPanel('dlg-job');
  registerPanel('dlg-spool');
  registerPanel('dlg-model');

  // Column options, once.
  const columnSelect = $('#job-f-column');
  for (const column of COLUMNS) columnSelect.append(el('option', { value: column.id }, column.label));

  const materials = $('#materials');
  for (const material of MATERIALS) materials.append(el('option', { value: material }));

  $('#job-f-type').addEventListener('change', syncRequesterVisibility);
  $('#job-f-addlink').addEventListener('click', () => addLinkRow());

  // The title fills the Model box until the reader touches it. Most jobs here are
  // a print OF the thing the job is named after, so the common case is no typing
  // at all — and the one that is not is a box they clear once.
  $('#job-f-title').addEventListener('input', () => {
    if (modelTouched || editing.job) return;
    $('#job-f-model').value = $('#job-f-title').value;
    renderModelField();
  });
  for (const event of ['input', 'change']) {
    $('#job-f-model').addEventListener(event, () => {
      modelTouched = true;
      renderModelField();
    });
  }
  // The tick decides what the hint below it promises, so it redraws the hint.
  $('#job-f-model-save').addEventListener('change', renderModelField);
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
  $('#job-f-type').value = job?.type || 'fun';
  $('#job-f-requester').value = job?.requester || '';
  $('#job-f-printer').value = job?.printer || '';
  $('#job-f-quantity').value = job?.quantity ?? 1;
  $('#job-f-price').value = job?.priceCharged ? String(job.priceCharged) : '';
  $('#job-f-column').value = job?.column || 'research';
  $('#job-f-notes').value = job?.notes || '';
  $('#job-delete').hidden = !job;

  // The NAME of the linked model, not its id — the box is what the reader would
  // say out loud, and an id in a text field is a thing they can accidentally
  // destroy. A job whose model has since been deleted comes back empty, which is
  // the truth about it.
  const modelInput = $('#job-f-model');
  const linked = job?.modelId ? store.state.models.find((m) => m.id === job.modelId) : null;
  modelInput.value = linked?.name || '';
  modelTouched = Boolean(modelInput.value);

  $('#job-f-model-save').checked = true;

  const options = $('#job-f-model-options');
  clear(options);
  for (const model of store.state.models) {
    if (model.name) options.append(el('option', { value: model.name }));
  }
  renderModelField();

  const links = $('#job-f-links');
  clear(links);
  for (const link of job?.spoolLinks || []) addLinkRow(link);
  $('#job-f-nospools').hidden = store.state.spools.length > 0;
  $('#job-f-addlink').disabled = store.state.spools.length === 0;

  syncRequesterVisibility();
  openPanel('dlg-job', opener);
  $('#job-f-title').focus();
}

function syncRequesterVisibility() {
  const isRequest = $('#job-f-type').value === 'request';
  $('#job-f-requester-field').hidden = !isRequest;
}

// ------------------------------------------------------------- the model box

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
  hint.textContent = saveBox.checked
    ? `${typed} will be added to your models.`
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

  // A NAME, never an id — see the note above saveJob for why the store is what
  // creates the model rather than this form.
  await store.saveJob({
    id: editing.job,
    title: $('#job-f-title').value,
    type: $('#job-f-type').value,
    requester: $('#job-f-type').value === 'request' ? $('#job-f-requester').value : '',
    modelName,
    printer: $('#job-f-printer').value,
    quantity: $('#job-f-quantity').value,
    priceCharged: $('#job-f-price').value,
    column: $('#job-f-column').value,
    notes: $('#job-f-notes').value,
    spoolLinks: links,
  });
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
