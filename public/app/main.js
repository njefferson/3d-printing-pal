// Boot.
//
// errlog is imported FIRST and wraps console.error on import, so an app that
// fails to start still has something to report.

import './errlog.js';

import { $ } from './dom.js';
import { VERSION } from './version.js';
import * as store from './store.js';
import { wireOpeners, initConfirm, say } from './ui/panels.js';
import { initBoard, renderBoard } from './ui/board.js';
import { initInventory, renderInventory } from './ui/inventory.js';
import { initModels, renderModels } from './ui/models.js';
import { initForms, openJob, openJobForModel, openSpool, openModel } from './ui/forms.js';
import { initBackup, renderLastExport, renderSnapshots } from './ui/backup-ui.js';
import { initInfo, maybeFirstRun } from './ui/info.js';
import { initDiagnostic } from './ui/diagnostic.js';
import { initUndo } from './ui/undo.js';
import { initUpdates } from './ui/update.js';

// The build stamp is written AT BOOT, not when a panel opens. The whole point is
// that it lands in a screenshot nobody thought to compose — an app that fills it
// in inside the About handler is blank until somebody opens About, which is
// useless in exactly the unplanned screenshot the rule exists for.
$('#version-stamp').textContent = VERSION;

const views = ['board', 'inventory', 'models'];

function showView(name) {
  for (const view of views) {
    document.getElementById(`view-${view}`).hidden = view !== name;
    const tab = document.getElementById(`tab-${view}`);
    if (view === name) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  }
}

function renderAll() {
  renderBoard();
  renderInventory();
  renderModels();
  renderLastExport();
}

async function start() {
  wireOpeners();
  initConfirm();
  initForms();
  initBoard({
    onEditJob: (id) => openJob(id, document.activeElement),
    // Straight from the card to the model, without the Models tab and a hunt.
    onOpenModel: (id, opener) => { showView('models'); openModel(id, opener); },
  });
  initInventory({ onEditSpool: (id) => openSpool(id, document.activeElement) });
  initModels({
    onEditModel: (id) => openModel(id, document.activeElement),
    // The catalog answers "what shall I print", so it is where printing it starts.
    // The board is shown first because that is where the new job will appear.
    onStartJob: (id, opener) => { showView('board'); openJobForModel(id, opener); },
    // The other direction, which did not exist until 1.2.0: a model listed how
    // many jobs used it and offered no way to reach one. Same shape as
    // `onOpenModel` above — show the tab the record lives on, then open it, so
    // closing the form leaves the reader looking at the thing they just changed.
    onOpenJob: (id, opener) => { showView('board'); openJob(id, opener); },
  });
  initBackup({ onImported: renderAll });
  initInfo();
  initDiagnostic();
  initUndo();

  for (const view of views) {
    document.getElementById(`tab-${view}`).addEventListener('click', () => showView(view));
  }

  store.subscribe(renderAll);

  try {
    await store.load();
  } catch (error) {
    console.error('Could not open the database:', error.message);
    say('The app could not open its storage. The diagnostic report under the version number says why.');
  }

  renderAll();
  showView('board');
  maybeFirstRun();

  // Registered after the app is usable, so a worker problem can never stop the
  // app from opening.
  initUpdates();
}

start().catch((error) => {
  console.error('print-tracker failed to start:', error.message);
});
