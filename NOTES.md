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

**Undo is a snapshot of what was there, and it is memory only.**
Shipped in 0.3.0 — one gesture is one entry, cascades included. The reasoning, and
why the inverse-operation shape was rejected, is under *Undo (0.3.0)* below. This
paragraph said "no undo, deliberately, for now" until 0.4.0, three days after undo
shipped, which is what a settled-decision list does when a decision is unsettled
and nothing goes back to close it.

---

## What it cannot do now

- No per-currency formatting or conversion — a symbol you choose, and plain numbers.
- Undo does not survive closing the app or reloading the page, and an import clears
  it. Yesterday's deletion comes back from a backup, not from the strip.
- Restoring a backup cannot itself be undone; the way back is the safety copy taken
  immediately before it.
- No printing or PDF output.
- No multi-device sync, by design rather than by omission.
- No files attached to a model — pictures and links only.
- A picture has to be added by hand; dropping in an address cannot pull the photo
  from the page. Doing that needs a server to read the page's Open Graph tags,
  which would end "nothing is fetched" — a trade the owner has not been asked to
  make yet.

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

## A job can make its model (0.4.0, 0.4.1)

**The Model box takes a NAME, not an id.** It was a `<select>` over models that
already existed, which made entering a model a *prerequisite* for recording a
job — leave the form, go to Models, add it, come back. The name is now enough.

**The store creates the model, not the form**, in the same transaction and the
same undo entry as the job. This is the picture defect from 0.3.0 in a worse key:
an orphaned picture wastes bytes, but a job whose model was rolled back
separately is a **dangling reference, which `backup.js` refuses on import** — the
reader would discover it on the day they needed the backup. `saveJob` uses
`db.writeMany(['jobs','models'])` when it creates one, so there is no instant in
which the job points at a model that is not there.

**It can never rename a model, and that is the shape rather than a rule.**
`saveJob` only ever finds a model by the typed name or makes a new one; there is
no path from the job form that writes a name onto an existing model. Editing the
box re-points the job. Renaming happens in Models, where the rest of the model is.

**Matching is on a normalised name** — trimmed, inner whitespace collapsed, case
folded — because somebody typing a model's name is naming a thing they can see,
not quoting a key. Nothing has ever held model names unique, so ties are possible
in existing data; the oldest wins, which makes the answer stable rather than
dependent on read order.

**The title fills the box until the reader touches it**, the same rule
`offerFromUrl` follows — a suggestion that overwrites what somebody typed destroys
data at the moment they were looking elsewhere. Clearing counts as touching, so
"not from a model" sticks.

**The tick box is only there for a name that is new (0.4.1).** An existing name
links whichever way it is set and an empty box means no model, so the question
"save this as a model?" has an answer in exactly one case — and a control on
screen while it cannot do anything is one nobody trusts. Declining is expressed by
withholding the name from `saveJob` rather than by a second flag the store would
have to be trusted to honour: the store's rule is *a name that matches nothing
becomes a model*, and the way to not create one is to not pass a name.

**The always-visible hint is what lets the box be free text at all.** It says
which of the three things saving will do before it does it. A hint that appeared
only on a mismatch would teach nobody what the field does, and would be a state
that is usually absent — which is a state nothing measures.

**`hidden` needs `!important`, and three controls were on screen because it did
not have it.** The UA rule is `[hidden] { display: none }`, which any class setting
`display` outbids. `.field` is `display: flex` and `.btn` is `display: inline-flex`
— so the new tick box sat in the form permanently, **and `#job-delete` had been
visible on the ADD form all along**, a Delete control for a job that did not exist
yet. Four classes in the stylesheet had each been given their own `[hidden]` rule
one at a time as they hit this; those are gone and one `[hidden] { display: none
!important }` replaces them, so the next conditional element needs nobody to
remember. Found by the target-size check reporting two controls 7px apart in a
state where one of them was supposed to be absent, and then by a registry selector
matching nothing once the fix landed.

**The add form and the edit form are separate a11y states**, because they differ
by exactly the control that was wrong: `job-edit` is the only one where Delete is
on screen, and it asserts that it is.

**Both walks assert the ARITHMETIC of their seed, not a count.** The a11y seed
makes 3 models (1 entered + 2 from job titles, with the repeated name matching)
and the backup walk 2. A four in either means matching by name broke and the
catalog is quietly doubling; a bare "expected 3" would be a number nobody could
check (hub LESSONS §119).

---

## Undo (0.3.0)

**The journal holds what was there, not how to reverse what happened.** The other
shape — every mutation paired with an un-mutation — is smaller and wrong more
often: the pairs drift, and the cascading ones need an inverse that reproduces the
cascade exactly. A snapshot of the affected records taken before the write
reverses all of them by one piece of code, and it is provable rather than clever.

**One gesture is one entry, cascades included.** Deleting a spool four jobs drew
on is one entry holding the spool and those four jobs. An undo that needed
pressing five times would be an accounting of the implementation.

**It is memory only, and that is a decision.** Undo is a correction within a
sitting. Something deleted yesterday is a restore from a backup, which export
already does properly with a file the reader holds. Persisting it would also force
a question with no good answer — whether the journal belongs in the export.

**`putImage` and `deleteImage` are no longer exported, and that is the fix.** The
picture field wrote the image itself and passed the id to `saveModel`, so the
image write sat outside the model write and therefore outside its undo entry:
undoing put the old model back and left the new blob in the database with nothing
pointing at it, costing space in every export from then on. The field now hands
over the prepared bytes and the store writes both together. Closing the export is
what stops the next caller reintroducing it.

**Reordering within a column was drag-only until this release**, and
`INTERACTIONS.json` described the gap accurately in the drag's `what` while the
`alternative` beside it did not. No gate could see it: a gate can tell that an
alternative exists and not that it does less than the drag it stands in for. The
a11y gate now presses for both halves — a column move and a position within a
column — rather than pressing whichever button happens to be first in the list.

**The proof is the same one the restore gets.** `tools/backup-walk.mjs` exports,
makes four changes of four shapes (an edit, a reorder, a cascading delete, and a
create that writes a picture), undoes all four, exports again, and compares byte
for byte. Both halves were planted red before being believed: dropping the new
picture's tombstone made the images differ and left an orphan, and a strip that
never showed failed the assertion that it had appeared.

---

## Pictures (0.2.0)

**Nothing is still fetched, and that sentence is still true.** A picture is one
the reader supplies — chosen, pasted or photographed — prepared on their own
device and stored locally. No image is ever loaded from another site, and
`img-src` carries `blob:` but no remote host, so a hotlink cannot creep in later.

**Why a URL cannot fill in the rest.** Reading a model page's title and photo
means reading a cross-origin response, which a browser refuses unless that site
sends `Access-Control-Allow-Origin` — and none of them do for their HTML. That is
the same-origin policy, not a header we control, so page metadata needs a server
this app does not have. What a URL *can* give offline is in `public/app/fromurl.js`:
the site name from the hostname, and a title guess from the path slug. Both are
offered into empty fields only, never over something typed.

**The budget is the feature.** `public/app/image.js` downscales to a 512px longest
edge before anything is stored, because every picture is held about four times
over — once live and once inside each retained snapshot's base64 — so a 2MB
original is most of a hundred megabytes by the time the backup ring has it. Three
things in that file are non-obvious and each is a real defect avoided: EXIF
orientation is applied at decode or portrait photos are sideways forever; the
encoded type is read back because `toBlob` returns PNG rather than failing when
WebP is unavailable; and nothing is ever scaled up.

**Snapshots are bounded by BYTES now, not by count.** Three snapshots of a picture
catalog is three more copies of every image, so a count-bound ring grew without
limit in the only dimension that runs out. The newest is always kept whatever it
weighs — dropping the copy taken seconds ago to satisfy a budget defeats the point
of taking it.

**`images` is a DATA store**, which is what puts it inside the atomic replace, the
export and the validator's duplicate and reference checks with no special case
anywhere. Pictures live in their own store rather than on the model record so
listing models does not drag every blob into memory to draw a text row, and they
are never held in `state`.

**A backup from before pictures existed still restores.** Schema 1 has no images
list and is filled forward, because the old file is exactly the one reached for in
a crisis.

---

## The artwork

**`icon.svg` at the root is the one source.** `tools/render-icons.mjs` writes
`public/icon.svg` from it alongside the four PNGs, and `--check` fails if the
served copy has drifted. Edit the root file, run the render, commit what it
writes. The check needs no browser so it runs in CI; it does **not** prove the
PNGs were re-rendered, because that needs a browser the runner does not have —
but one command writes both, so a stale served copy is the signature of a render
that never ran.

**The card's art is its own drawing, not a copy of the icon.** The icon is a
favicon before it is anything else and carries one shape; the card is wide enough
to carry a scene. So the icon is a nozzle and the card is a printer farm. Inside
the card the machine is drawn ONCE, in `<defs>`, and placed three times with
`<use>`; the receded pair differs only by three custom properties set on the
instance. `social-card.html` is never served, so that is a Chromium-only path
rather than a cross-browser bet.

**Two values in the card that look arbitrary and are not.** The machine's bounding
box bottom is **y406, the uprights — not y378, the bed rail**; a box taken from
the bed cuts the legs off every instance, which reads as machines sinking through
the floor rather than as a crop. And the receded pair is `#565656` / `#4a4a4a`
because they have to survive being seen at a quarter size, which is where a link
is most often met; darker and the flanks dissolve, leaving one printer and no
farm.

**Why the mark was redrawn.** The first icon was a filament spool seen face-on: a
dark hub with a light centre, inside a rounded body. That is the shape of a pupil,
and read cold the icon was thread with an eye in it. No gate catches that, and the
session that drew it was the one party that could not see it.

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
- **`tools/shell-check.mjs`** — every module the app ships is in the service
  worker's precache list, and every listed path exists. Adding a module is
  ordinary; adding it to `SHELL` is a second step nothing reminds you about, and
  missing it fails only for a reader who is offline — invisible to whoever caused
  it. It fails the other way too, because `cache.addAll` rejects the whole batch
  on one bad path, so a stale entry empties the cache rather than shrinking it.
  Planted red both ways.
- **`tools/update-walk.mjs`** — drives genuinely different second and third
  service workers through the browser's own update machinery, then runs the app
  offline. A mocked registration proves the mock works and nothing else.

**Not verified from here, and needing the owner's hands:** the real feel on a device, the
share sheet, home-screen install, and the iPadOS behaviour below.

## The status page (Doctrine §7i)

This work has run across several releases, so it carries a live status artifact:

    https://claude.ai/code/artifact/825e4c39-f855-4ff1-b515-fd65f8544b4e

**Redeploy that SAME URL at each stage — never publish a new one.** A fresh link
per update is a new thing to lose, which is the problem the page solves. From a
conversation that did not publish it, pass the URL back as `url`; from one that
did, republishing the same file path keeps it.

**Hand the link over in every reply that reports progress.** Not once at
creation — every time. Being asked for it is the signal this was skipped.

It has to carry the version on staging, the version in production, and the last
SHA verified green; what is waiting on THE OWNER marked apart from what is waiting on
the work; and what was found and NOT fixed alongside what was checked and found
not to be a defect. A page that only lists wins is an advertisement.

---

## What a release has to go back and close

**A release that removes a limitation removes it from every list that states it**,
in the same commit. The lists are named here because a session cannot grep for a
sentence it does not know exists, and this file drifts in one direction only: it
accumulates limitations and never sheds them. `CHANGELOG.md` does not have that
problem, because the version gate holds it to the version constant. Nothing holds
these.

- **Settled decisions**, above — a decision that has been unsettled has to say so.
  It read "no undo, deliberately, for now" for three days after undo shipped.
- **What it cannot do now**, above — the entries that say *cannot* are the
  load-bearing ones, because *cannot* is what stops the next session building the
  thing. It still said the Move button could not reorder within a column.
- **The staged candidate** and **Shipped to production**, below.
- The **Found and not fixed** section of the live status page, whose address is
  recorded above.

Both stale entries were found by a later feature happening to touch the same file.
Nothing looked for them and nothing would have, and the next thing that would have
used them is a plan. Hub LESSONS §122, and §120 for what that plan costs.

---

## Deployment

Cloudflare Pages, project `3d-printing-pal`, from `.github/workflows/deploy.yml`.
The workflow skips every deploy step until `CLOUDFLARE_API_TOKEN` and
`CLOUDFLARE_ACCOUNT_ID` exist, so it exits 0 rather than failing red during setup
— which means a green run is not by itself evidence that anything deployed. Read
the log and check whether the steps ran or were skipped.

### The staged candidate

**There is none right now.** `staging` and `main` are the same commit — 0.3.0,
0.4.0 and 0.4.1 were promoted together on 2026-08-22 — so
https://staging.3d-printing-pal.pages.dev currently serves exactly what production
serves. The next candidate goes here.

Leaving a promoted candidate recorded here is how the next session concludes
something is waiting when nothing is.

**0.1.1 never reached production on its own, and that was deliberate.** Its entire
content was the link preview card, which 0.1.2 redrew; promoting it separately
would have shipped artwork already replaced. Both went in the same promotion.

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

### A CI step naming a hub gate has two inputs, and adding it supplies one

The pin at the top of `gates.yml` is the other one. A step reading
`node .hub/<gate>.mjs` is character-for-character what runs locally, where the hub
is a sibling clone at its own HEAD — so it can be watched passing on the only path
that says nothing about a pinned checkout. `third-person-check.mjs` was wired in
against a pin from before that file existed and could only ever print
`Cannot find module`.

**Move the pin in the same commit as the step, and verify the file is present at
the new SHA** (`git cat-file -e <sha>:<file>` in the hub clone). The remedy is
written beside the pin too. Hub LESSONS §117.

### A red gate does not stop a deploy — known, and not yet fixed

`Gates` and `Deploy` are separate workflows with no dependency between them, so a
push whose gates FAIL still deploys. That happened on 0.1.1: the social-card check
was ordered before the step that installs the browser it needs, so it failed on
the runner, every gate after it was SKIPPED, and the candidate deployed anyway
having been measured by almost none of them.

The ordering is fixed. **The structural gap is not**, and it is worth stating
plainly rather than leaving to be rediscovered: nothing currently stops a build
that failed its own gates from reaching production.

The fix is to move the deploy job into `gates.yml` with `needs: [gates, security]`
so the dependency is structural rather than remembered. It is deliberately not
done here, because coupling a deploy to a gate is exactly how a release silently
stops arriving, and that trade is the owner's to make rather than a session's to
slip in at the end of an unrelated change.

### Shipped to production

**0.3.0, 0.4.0 and 0.4.1 reached production on 2026-08-22**, at
https://3d-printing-pal.pages.dev

Undo and a non-drag reorder; a job that makes its own model; and the choice not
to. Promoted with `git push origin staging:main` on the owner's explicit say-so, as
a clean fast-forward of nine commits — `git merge-base --is-ancestor` was checked
before pushing rather than after, and the remote was read back rather than the
push output believed.

The head promoted was `7d3bad0`, and it is also the commit whose gates were read:
22 gate steps and 4 security steps confirmed to have EXECUTED. The deploy's steps
RAN rather than skipped, and its log printed:

    npx wrangler pages deploy public --project-name=3d-printing-pal --branch=main
    ✨ Deployment complete! Take a peek over at https://5c2ccc75.3d-printing-pal.pages.dev

**Three releases went together because they build on each other.** 0.4.0's model
creation is undoable only because 0.3.0 exists, and 0.4.1 is the choice not to
create. Shipping any one alone would have put a half-finished idea in front of a
reader.

**One defect in here predates all three.** `[hidden]` is a UA rule at zero
specificity, so `.btn { display: inline-flex }` outbid it and the Delete button
had been on the ADD job form since that form was written. Fixed in 0.4.1 by one
global rule rather than a fifth per-class one. Hub LESSONS §123.

**0.2.0 reached production on 2026-08-09**, at https://3d-printing-pal.pages.dev

Pictures on models and job cards. Promoted with `git push origin staging:main` on
the owner's explicit say-so, as a clean fast-forward of the one release commit.
The deploy's steps RAN rather than skipped, and its log printed:

    npx wrangler pages deploy public --project-name=3d-printing-pal --branch=main
    ✨ Deployment complete! Take a peek over at https://d3620631.3d-printing-pal.pages.dev

**This is the release that moved the database.** `DB_VERSION` went 1 to 2 and the
export `SCHEMA` went 1 to 2. A reader arriving from 0.1.2 keeps everything they
had — the upgrade only creates the missing `images` store — and a backup written
by 0.1.2 still restores, because `validate` fills the absent images list forward
rather than refusing the file.

**0.1.2 reached production on 2026-08-08**, at https://3d-printing-pal.pages.dev

Promoted with `git push origin staging:main` on the owner's explicit say-so. The
production deploy's steps RAN rather than skipped, and its log printed:

    npx wrangler pages deploy public --project-name=3d-printing-pal --branch=main
    ✨ Deployment complete! Take a peek over at https://5e3cdabf.3d-printing-pal.pages.dev

**The promoted commit was `2623a6b`, not the release commit `d1147f6`.** A
NOTES-and-marker commit had landed on top of the release, and a promotion ships
the branch HEAD rather than the release commit — so the HEAD is what has to be
green, and it was checked as such rather than assuming the release commit's run
covered it.

This carried 0.1.1 to production too. It had been on staging unpromoted, and its
only content — the link preview card — was redrawn by 0.1.2, so promoting it
alone would have shipped artwork already replaced.

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

## The privacy scrub, 2026-08-20

**This repo was scanned for the first time and came back clean of content.**
Both halves of the rule were checked: nothing personal about the owner, and no
quotation or attribution of anybody's words — the owner's or a third party's.

What was actually run, and what each returned:

- `node ../noahjefferson/privacy-check.mjs --repo .` — 0 disclosures across
  tracked files.
- `node ../noahjefferson/quote-check.mjs --repo .` — 6 tracked markdown files
  read, 0 set-apart quotations, so 0 declarations owed and no `.quote-allow`
  needed here yet.
- A wider sweep than either gate performs, over every tracked `.md`, `.ts`,
  `.mjs`, `.js`, `.html` and `.yml`, for any quotation of 20 to 300 characters
  carrying a first- or second-person pronoun or sitting after a speech cue:
  **17 candidates, all read, all legitimate.** Sixteen are the app's own patch
  notes in `public/app/releases.js`, which address the reader in the second
  person on purpose; one is the reader's own voice in a design comment in
  `public/app/ui/backup-ui.js`; one is `tools/notes-voice.mjs` citing product
  copy to explain its own rule.
- A grep for facts about the owner or any third party — a person's device, a
  family member, a friend, reported speech. Every hit was a process fact about
  the release gate or the licence notice, not a fact about a person.

**The scan is the scrub; the gates are its floor.** Both gates were green on
this repo before any of the above ran, and the wider sweep is what makes that
green mean something. A scan returning nothing is indistinguishable from a scan
pointed the wrong way, so the sweep's shape is recorded here rather than its
result alone.

**The gates now run in CI, and each was watched failing first.** `gates.yml`
already ran `privacy-check.mjs`; it now also runs `quote-check.mjs` beside it
and `branch-guard.mjs --repo . --artefact`. Each was verified by planting a
SYNTHETIC violation — a fabricated sentence, never a real one, because planting
a real quotation to prove the gate catches quotations puts it back in a tracked
file permanently. All three exited 1 on the plant and 0 once it was removed.

**The hub pin in `gates.yml` was stale, and would have failed the two new
steps.** It named a hub commit that carries `privacy-check.mjs` and neither
`quote-check.mjs` nor `branch-guard.mjs`, and which is not an ancestor of the
hub's current `main` at all. Both checkout steps now pin
`6da5c6e765538fed5dd702e9d9e40a5d80001fea`, which carries all three. A
cross-repo gate depends on the other repo's published history: check that the
pinned SHA carries the file before adding a step that runs it.

**The branch guard is installed.** `.branch-guard` declares `work=staging`,
`promote=main`, `escape=PAL_PROMOTE`, and `package.json` gained a `prepare`
script so `npm ci` reinstalls the hook into `.git/hooks` in every fresh clone
and every CI job.

**Git history is out of scope and the question is settled.** A history scan
coming back red is not new information and is not a reason to reopen it.

---

## Roadmap

- Undo for destructive actions.
- Reordering within a column from the Move control, not only by drag.
- A low-filament warning threshold that can be set per material.
