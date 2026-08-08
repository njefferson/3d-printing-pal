# NOTES — print-tracker

The source of truth for this repo. Read it first, every session.

---

## Thesis

One place to run a 3D printing hobby that has started earning: what is being
printed and for whom, what filament is left, and which models have made money.

Three things it refuses to be:

- **Not a slicer, and not a printer controller.** It never talks to a printer.
- **Not tied to a brand.** Printer is free text. No vendor APIs, no accounts with
  anyone, no integrations to break when the machine changes.
- **Not a server product.** There is no account, no sync, and nothing leaves the
  device. Everything is in IndexedDB in the browser that opened it.

The one number the app exists to keep honest is **how much filament is left on a
spool**, and the whole data model is arranged around never storing it.

---

## Settled decisions

**Remaining weight is computed, never stored.**
Filament usage is recorded only on the job, in `job.spoolLinks`. A spool's
remaining weight is `totalWeightG` minus the sum of every job's links to it,
derived on every read by `remainingFor()` in `public/app/derive.js`. There is no
field to write, so nothing can drift it. It is a pure function called on demand
rather than a value assigned inside a render — a derived value cached by a render
is only as fresh as that render, and four surfaces read this one.

**Logged grams count immediately, whatever column the job is in.**
The alternative — counting filament only from `printing` onward — hides state:
grams would sit logged and invisible until a card moved. The inventory says this
in plain words rather than leaving it to be discovered.

**Model revenue keys on `deliveredAt`, not on the current column.**
A job stamps `deliveredAt` the first time it enters `delivered`, and keeps the
stamp when it is archived. Summing by current column instead would make a model's
earnings drop every time a delivered job was archived — money appearing to vanish
from the catalog. The model shows the job count beside the total so the number can
be checked.

**Import is atomic, and validation asks every question the write will ask.**
Shape, schema version, required fields, duplicate ids within each store, and
whether every `spoolId` and `modelId` resolves — all before anything is touched.
Then clear-and-refill in a single IndexedDB transaction spanning every store.
Validation alone cannot rule out a quota or disk failure halfway through; the
transaction can. A "replace" that clears before it writes will eventually clear
and then fail.

**The safety copy is written twice.**
The automatic pre-import export downloads *and* is written to the `snapshots`
store, because a browser download can be blocked or fail silently and that must
not be the only copy. Snapshots are bounded so the database cannot grow without
limit, and are re-downloadable from the information panel.

**Drag starts from a handle, never from a press-and-hold.**
Timed gestures are banned outright (SC 2.2.1), and a handle with
`touch-action: none` separates dragging from scrolling without a timer. Every
drag also has a non-drag path — the Move button on each card — which is what
keyboard and assistive technology use. Both are declared in `INTERACTIONS.json`
and checked.

**No undo, deliberately, for now.**
The doctrine wants one gesture to be one undo step. This release does not have it.
Destructive actions ask first and name exactly what they will unlink, and export
is the way back. Recorded here as owed, not as done.

---

## What it cannot do now

- No undo stack.
- No per-currency formatting or conversion — a symbol you choose, and plain numbers.
- No reordering of cards within a column by the Move button (it appends to the end);
  drag inserts at the drop position.
- No printing or PDF output.
- No multi-device sync, by design rather than by omission.
- No photos or files attached to a model — links only.

---

## Data sources

**There are none, and that is a design property rather than an omission.**
Nothing is fetched at runtime, no dataset ships with the app, and no third-party
service is contacted. Everything the app holds is what was typed into it. The
doctrine's obligations to the services we depend on are discharged here by
depending on none.

If that ever changes, this section becomes an inventory of the alternatives by
capability, with the rejected ones and the reason each was rejected.

---

## Project facts

- **Version** lives in `public/app/version.js` and is carried by the service
  worker's cache name. Both move with `CHANGELOG.md`'s top entry, in one commit.
- **`sw.js` must differ byte-for-byte between releases.** A browser replaces a
  worker by re-fetching the script and comparing bytes; identical bytes mean no
  update, ever. The version is inline in that file for exactly this reason, never
  in a registration query string.
- **The a11y gate derives its surface list from the markup.** Every `<dialog id>`
  must have a state that opens it, and every state must name a surface that
  exists. It fails both ways, on purpose.
- **Type in `rem`; size touch targets in `px`.** A px-only stylesheet ignores a
  reader who raises their default text size, but a 44px floor written in `rem`
  doubles every control when they do.
- **Media-query thresholds stay in `px`.** `rem` inside a media query resolves
  against the initial root font size, not the reader's.

---

## How this is verified

`npm run check` runs every gate, and it is the same entry point CI uses — a gate
that lives only in a workflow is a gate the developer never sees until it is red
on a push.

- **`tools/a11y.mjs`** — 13 states x 2 themes x 2 viewports. It derives its state
  list from the markup and fails both ways, presses the controls in mouse AND
  touch modes, and asks an outcome question at 320px with 200% text rather than
  only minimums. Every check in it has been planted red once: a low-contrast
  pair, an undersized target, an unaudited dialog, an inert Move button, a
  diagnostic that leaked a job title, and a first-run that copied the orientation
  instead of moving it. Each produced its own message.
- **`tools/backup-walk.mjs`** — seeds through the forms, exports, wipes the
  database the way clearing site data does, imports, exports again, and compares
  record for record. Then offers five broken files — duplicate id, dangling spool
  reference, truncated, wrong format, newer schema — and asserts each is refused
  AND that the existing data is untouched afterwards.
- **`tools/update-walk.mjs`** — drives genuinely different second and third
  service workers through the browser's own update machinery, then runs the app
  offline. A mocked registration proves the mock works and nothing else.

**Not verified from here, and needing his hands:** the real feel on a device, the
share sheet, home-screen install, and the iPadOS behaviour below.

## Deployment

Cloudflare Pages, project `3d-printing-pal`, from `.github/workflows/deploy.yml`.
The workflow skips every deploy step until `CLOUDFLARE_API_TOKEN` and
`CLOUDFLARE_ACCOUNT_ID` exist, so it exits 0 rather than failing red during setup
— which means a green run is not by itself evidence that anything deployed. Read
the log and check whether the steps ran or were skipped.

### The staged candidate

**Version 0.1.1**, at https://staging.3d-printing-pal.pages.dev — the link
preview card and its Open Graph tags, waiting on a pass before promotion.

That alias is the candidate's standing address and is the only one worth writing
down here. **Every deploy also gets its own immutable `<hash>.3d-printing-pal.pages.dev`
address, and that one is printed in that deploy's own log** — so it is never
recorded in this file, which would make it one release stale the moment the next
push landed. Read it from the run when a specific build needs pinning.

**If the alias does not resolve, the per-deployment address will.**

**What is confirmed and what is not.** Every deploy's steps are read from the run
rather than inferred from the workflow exiting 0, which a fully-skipped deploy also
does. Whether any of these addresses actually renders in a browser has **not** been
confirmed from a session: this sandbox reaches no external site at all — a
known-good address returns the same failure as a new one — so a session not loading
the app says nothing about the app.

**The Cloudflare secrets already existed on this repo.** The first push to
`staging` deployed with no setup step and created the Pages project as it went.

### Shipped to production

**0.1.0 reached production on 2026-08-08**, at https://3d-printing-pal.pages.dev

Promoted with `git push origin staging:main` on the owner's explicit say-so, which
is what the staging gate waits for. The production deploy's steps RAN rather than
skipped, and its log printed the deployment:

    npx wrangler pages deploy public --project-name=3d-printing-pal --branch=main
    ✨ Deployment complete! Take a peek over at https://9a6e32b1.3d-printing-pal.pages.dev

**Ordering worth keeping.** The deploy concurrency group is per-ref, so a second
push to `main` cancels the first's in-flight deploy — and a cancelled run concludes
`cancelled` rather than `failure`, which reads like nothing happened. Promote, read
the deploy, and only then push anything else to `main`.

---

## Roadmap

- Promote 0.1.1 once the card and its tags have passed on a device.
- Undo for destructive actions.
- Reordering within a column from the Move control, not only by drag.
- A low-filament warning threshold that can be set per material.
