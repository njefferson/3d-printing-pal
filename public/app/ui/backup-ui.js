// Export and import, as the reader meets them.
//
// The order below is the whole safety story and none of it is optional:
// validate everything -> show the counts -> confirm -> safety copy -> atomic
// replace. The button that does the replacing stays disabled until a file has
// actually passed validation, so the destructive control is never live over a
// file nobody has checked.

import { $, el, clear, readableDate } from '../dom.js';
import * as backup from '../backup.js';
import * as store from '../store.js';
import { registerPanel, close, confirmThen, say, reportInto } from './panels.js';

let pending = null;

export function initBackup({ onImported }) {
  registerPanel('dlg-import', { onClose: resetImport });

  $('#export-run').addEventListener('click', runExport);
  $('#import-file').addEventListener('change', onFileChosen);
  $('#import-go').addEventListener('click', () => startImport(onImported));
}

export async function runExport() {
  const { payload, filename } = await backup.buildExport(new Date());
  const ok = backup.download(backup.toJson(payload), filename);
  if (!ok) {
    say('This browser would not save the file. Try again from a normal browser tab rather than an installed app window.');
    return;
  }
  await store.noteExport(payload.exportedAt);
  renderLastExport();
  say(`Exported ${payload.counts.jobs} jobs, ${payload.counts.spools} spools, ${payload.counts.models} models and ${payload.counts.images || 0} pictures.`);
}

export function renderLastExport() {
  const node = $('#last-export');
  const when = store.state.lastExportAt;
  // A value written and never read is how "when did I last save a copy?" becomes
  // unanswerable. It is recorded, so it is shown.
  const state = when
    ? `Last export from this device: ${readableDate(when)}. Clearing this site's data removes everything the app holds, so keep that file somewhere safe.`
    : 'No copy has been exported from this device yet. Clearing this site’s data would remove everything the app holds.';

  // TWO PARTS, AND ONLY THE SECOND LOOKS PRESSABLE. The whole line became a
  // button in 1.1.0 so that the sentence naming the risk is itself the route to
  // the remedy — but a paragraph-length underline reads as a mistake, and a
  // sentence with no affordance at all reads as text. So the state is prose and
  // the action is a short underlined phrase inside the same control.
  //
  // Both are visible text inside the button, so the accessible name is the whole
  // line and SC 2.5.3 holds without an aria-label competing with it.
  clear(node);
  node.append(
    el('span', { class: 'lastexport-state', text: state }),
    el('span', { class: 'lastexport-go', text: 'Keep a copy' }),
  );
}

function resetImport() {
  pending = null;
  $('#import-go').disabled = true;
  $('#import-file').value = '';
  const report = $('#import-report');
  report.hidden = true;
  clear(report);
}

async function onFileChosen(event) {
  const file = event.target.files?.[0];
  const report = $('#import-report');
  pending = null;
  $('#import-go').disabled = true;
  if (!file) {
    report.hidden = true;
    return;
  }

  let text;
  try {
    text = await file.text();
  } catch {
    reportInto(report, { heading: 'That file could not be read', lines: ['Nothing has been changed.'], bad: true });
    return;
  }

  // Everything is asked BEFORE anything is touched.
  const result = backup.validate(text);
  if (!result.ok) {
    reportInto(report, {
      heading: 'That backup was not imported',
      lines: [...result.errors, 'Nothing has been changed.'],
      bad: true,
    });
    return;
  }

  pending = result;
  const now = {
    spools: store.state.spools.length,
    models: store.state.models.length,
    jobs: store.state.jobs.length,
    images: store.state.imageIds.length,
  };

  report.hidden = false;
  report.replaceChildren(
    el('h3', { text: 'Ready to import' }),
    el('ul', {},
      el('li', { text: `Jobs: ${now.jobs} now, ${result.counts.jobs} in the file` }),
      el('li', { text: `Spools: ${now.spools} now, ${result.counts.spools} in the file` }),
      el('li', { text: `Models: ${now.models} now, ${result.counts.models} in the file` }),
      el('li', { text: `Pictures: ${now.images} now, ${result.counts.images || 0} in the file` }),
    ),
    el('p', { class: 'note', text: `Written by version ${result.payload.version || 'unknown'} on ${result.payload.exportedOn || 'an unrecorded date'}.` }),
  );
  $('#import-go').disabled = false;
}

function startImport(onImported) {
  if (!pending) return;
  const counts = pending.counts;
  const now = store.state.jobs.length + store.state.spools.length + store.state.models.length + store.state.imageIds.length;

  confirmThen(
    {
      title: 'Replace everything?',
      body: `This removes all ${now} records in the app and puts back ${counts.jobs} jobs, ${counts.spools} spools, ${counts.models} models and ${counts.images || 0} pictures from the file. A copy of what you have now is saved first — both as a download and inside the app.`,
      action: 'Replace everything',
    },
    async () => {
      const payload = pending.payload;
      try {
        const result = await backup.replaceEverything(payload);
        store.adoptImported(payload);
        await store.load();
        onImported?.();
        close('dlg-import');

        const parts = [
          `Restored ${result.restored.jobs} jobs, ${result.restored.spools} spools and ${result.restored.models} models.`,
        ];
        parts.push(result.safety.downloaded
          ? `Your previous data was saved as ${result.safety.filename}.`
          : 'The browser would not download the safety copy of your previous data, so it was kept inside the app instead — it is under the i button.');
        say(parts.join(' '));
      } catch (error) {
        // The transaction aborted, so the old data is still there. Say so, because
        // the reader's first thought will be that they have lost everything.
        reportInto($('#import-report'), {
          heading: 'The import stopped part-way and your data was left alone',
          lines: [
            String(error?.message || error),
            'Nothing was replaced. What was in the app before is still in the app.',
          ],
          bad: true,
        });
        say('The import stopped and nothing was replaced.');
      }
    },
  );
}

/** The safety copies, listed in the information panel and re-downloadable. */
export async function renderSnapshots() {
  const node = $('#info-snapshots');
  clear(node);
  const rows = await backup.listSnapshots();
  if (!rows.length) {
    node.append(el('p', { class: 'note', text: 'No safety copies yet. One is made automatically the first time you import.' }));
    return;
  }
  for (const row of rows) {
    const button = el('button', { type: 'button', class: 'btn' }, 'Download this copy');
    button.setAttribute('aria-label', `Download the safety copy taken on ${readableDate(row.takenAt)}`);
    button.addEventListener('click', () => {
      backup.download(row.json, row.filename);
      say('Safety copy downloaded.');
    });
    node.append(el('div', { class: 'snapshot' },
      el('span', { class: 'snapshot-when', text: `${readableDate(row.takenAt)} — ${row.counts.jobs} jobs, ${row.counts.spools} spools, ${row.counts.models} models, ${row.counts.images || 0} pictures` }),
      button,
    ));
  }
}
