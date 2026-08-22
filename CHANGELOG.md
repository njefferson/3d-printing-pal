# Changelog

The single source for what changed. `tools/changelog.mjs` generates the in-app
patch notes from this file, and `--check` fails the build if the two drift apart
or if the top entry disagrees with the version constant.

Every release is exactly one kind — VERSION, CAPABILITY or ITERATION — and the
triplet is `version.capability.iteration`. Releases do not have names.

---

## 0.5.0 — CAPABILITY — 2026-08-22

A request usually arrives as a link and nothing else. The link is now the first
thing the app asks for, and the last thing you need to type.

### New

- **Link** is the first box on a job. Paste the address somebody sent and the name
  fills itself in from it, the model fills in from the name, and the address is
  kept with the model when the job is saved. For an ordinary request that leaves
  who asked for it, and nothing else.
- The address is kept on the model rather than the job, because the model is the
  thing that exists on somebody's site. Print it again next month for somebody
  else and it is the same address, already there.
- Job cards now carry a button to where the file came from — the site's name,
  opening in a new tab. Choosing what to print next no longer means reading the
  board, leaving it for the Models tab, and coming back.
- A second job for the same thing does not file the same address twice.

### Fixed

- The name taken from an address was often the wrong word. A Printables link
  copied from the Files tab — the one you send to somebody who is going to print
  the thing — offered the name "Files". It now reads the part of the address that
  is the name, and keeps a year inside a name instead of dropping it as if it were
  an id number.
- Links under a model in the Models tab were too small to press reliably. They are
  now full-height targets like every other control.
- Web address boxes were a third of the height of every other box, which made them
  hard to hit and out of step with the rest of the form.

### Still not right

- Only the name and the site can be read from an address. The picture and the
  description cannot: a browser is not allowed to read another site's pages, so
  those need a server this app does not have and will not get without that being
  a deliberate trade.
- The Link box on a job is for adding an address, and it starts empty when you
  reopen a job. The addresses a model has are listed under it in Models, which is
  where they are changed.
- A job with no model has nowhere to keep a link, because a link is kept on the
  model. Turning off *Save this as a model* with a link pasted says so before you
  save.
- Undo lasts for as long as the app is open. Closing it, or reloading the page,
  starts again with nothing to undo — something deleted yesterday comes back from
  a backup, not from here.
- Restoring a backup cannot be undone. It replaces everything on purpose, and the
  way back is the safety copy the app downloads immediately before it does so.
- Changing a filter, the currency or the sort order is not a change undo tracks.
  It covers jobs, spools and models — the things a wrong press loses.
- A picture has to be added by hand.
- Filament counts as used the moment it is logged against a job, whichever column
  that job is sitting in. That is the honest answer to how much is left on a
  spool, but it means a job parked in research with grams already logged has spent
  that filament as far as the inventory is concerned.
- Costs and prices are plain numbers with a currency symbol you choose. There is
  no per-currency formatting and no conversion.
- An installed app on iPadOS will not always let a waiting update take over while
  the app is open. If the version at the bottom of the screen is not the one you
  expect, close the app fully and open it again.

---

## 0.4.1 — ITERATION — 2026-08-22

Saving a job no longer decides on your behalf whether the name in the Model box
becomes a model.

### Fixed

- A tick box under the Model box, on by default, for a name that is not in your
  models yet. Turn it off and the job is saved with no model and nothing is added
  to the catalog — for a one-off that is not worth keeping, or a job that is not a
  print of anything. Clearing the box still works too; this is the way that does
  not mean deleting text you just watched appear.
- The tick is only there when there is something to decide. A name already in your
  models is linked either way, and an empty box means no model, so the question is
  asked in the one case where it has an answer.
- The line under the box says which of the three things saving will do, and
  changes as soon as the tick does.

### Still not right

- The tick starts on again every time a job form is opened. It is a decision about
  that job rather than a setting, so a job you meant to keep out of the catalog
  needs it turned off each time.
- A name you decline is not kept anywhere. The job's own title still says what was
  printed, but there is no second place recording a model name without a model.
- The Model box never renames anything. Editing it points the job at a different
  model, or makes one; a model is renamed in Models, where the rest of its details
  are. That is on purpose, because a box on a job that could rename a model would
  quietly rewrite it everywhere.
- A model added this way has only a name. Designer, tags, links and listings are
  filled in on the model itself when there is something to put there.
- Undo lasts for as long as the app is open. Closing it, or reloading the page,
  starts again with nothing to undo — something deleted yesterday comes back from
  a backup, not from here.
- Restoring a backup cannot be undone. It replaces everything on purpose, and the
  way back is the safety copy the app downloads immediately before it does so.
- Changing a filter, the currency or the sort order is not a change undo tracks.
  It covers jobs, spools and models — the things a wrong press loses.
- A picture has to be added by hand. Dropping in an address cannot pull the photo
  from the page, because a browser is not allowed to read another site's pages.
- Filament counts as used the moment it is logged against a job, whichever column
  that job is sitting in. That is the honest answer to how much is left on a
  spool, but it means a job parked in research with grams already logged has spent
  that filament as far as the inventory is concerned.
- Costs and prices are plain numbers with a currency symbol you choose. There is
  no per-currency formatting and no conversion.
- An installed app on iPadOS will not always let a waiting update take over while
  the app is open. If the version at the bottom of the screen is not the one you
  expect, close the app fully and open it again.

---

## 0.4.0 — CAPABILITY — 2026-08-22

A model no longer has to exist before a job can name it. Adding the job adds the
model.

### New

- The Model box on a job is a name you type rather than a list you pick from. If
  the name is not in your models yet, saving the job adds it — no leaving the
  form, adding a model, and coming back.
- The box fills itself in from the job's title, so a job named after the thing
  being printed needs no typing at all. Type over it or clear it whenever the two
  are not the same.
- Under the box it says which of the two things saving will do — "Links to Benchy,
  already in your models" or "Benchy will be added to your models" — before you
  save rather than after. A name that differs only in capitals or spacing counts
  as the same model, so a stray space does not make a second one.
- Undo takes back both together. A job that added a model, undone, leaves neither.
- The names you already have are offered as suggestions as you type.

### Fixed

- A job could only be attached to a model that had already been entered, which
  made adding a model a prerequisite for recording work rather than something to
  do when there was a reason to.

### Still not right

- The Model box never renames anything. Editing it points the job at a different
  model, or makes one; a model is renamed in Models, where the rest of its details
  are. That is on purpose, because a box on a job that could rename a model would
  quietly rewrite it everywhere.
- A model added this way has only a name. Designer, tags, links and listings are
  filled in on the model itself when there is something to put there.
- Undo lasts for as long as the app is open. Closing it, or reloading the page,
  starts again with nothing to undo — something deleted yesterday comes back from
  a backup, not from here.
- Restoring a backup cannot be undone. It replaces everything on purpose, and the
  way back is the safety copy the app downloads immediately before it does so.
- Changing a filter, the currency or the sort order is not a change undo tracks.
  It covers jobs, spools and models — the things a wrong press loses.
- A picture has to be added by hand. Dropping in an address cannot pull the photo
  from the page, because a browser is not allowed to read another site's pages.
- Filament counts as used the moment it is logged against a job, whichever column
  that job is sitting in. That is the honest answer to how much is left on a
  spool, but it means a job parked in research with grams already logged has spent
  that filament as far as the inventory is concerned.
- Costs and prices are plain numbers with a currency symbol you choose. There is
  no per-currency formatting and no conversion.
- An installed app on iPadOS will not always let a waiting update take over while
  the app is open. If the version at the bottom of the screen is not the one you
  expect, close the app fully and open it again.

---

## 0.3.0 — CAPABILITY — 2026-08-22

There is a way back. Every change to a job, a spool or a model can be undone, and
a card's position in its column can now be set without dragging it.

### New

- An undo strip under the tabs, which says what it would put back — "Last change:
  deleting Benchy" — rather than offering a bare Undo and leaving you to remember
  which of the last few things you did was the last one. It appears with the first
  change and stays there; it is not a message that vanishes while you are reading
  it.
- One press undoes the whole change, including everything it took with it.
  Deleting a spool that four jobs drew on unlinks it from all four, and undoing
  that brings back the spool and all four links together.
- The last twenty changes are kept, so a run of wrong presses can be walked back
  one at a time.
- The Move panel now sets a card's place inside its column as well as which column
  it is in — "Put before Calibration cube", "Put last in Printing". Each position
  is named and takes one press, so the card lands where the button said it would
  even though the panel is covering the board.

### Fixed

- Reordering cards within a column was possible by dragging and by nothing else,
  which made it unusable with a keyboard, with a screen reader, or by anyone who
  cannot hold a drag steady. The Move panel now does everything the drag does.
- Adding a picture to a model wrote the picture before it wrote the model. Undoing
  such a change would have left the picture in the app with nothing pointing at
  it, taking up room in every backup from then on.

### Still not right

- Undo lasts for as long as the app is open. Closing it, or reloading the page,
  starts again with nothing to undo — something deleted yesterday comes back from
  a backup, not from here.
- Restoring a backup cannot be undone. It replaces everything on purpose, and the
  way back is the safety copy the app downloads immediately before it does so.
- Changing a filter, the currency or the sort order is not a change undo tracks.
  It covers jobs, spools and models — the things a wrong press loses.
- A picture has to be added by hand. Dropping in an address cannot pull the photo
  from the page, because a browser is not allowed to read another site's pages.
- Filament counts as used the moment it is logged against a job, whichever column
  that job is sitting in. That is the honest answer to how much is left on a
  spool, but it means a job parked in research with grams already logged has spent
  that filament as far as the inventory is concerned.
- Costs and prices are plain numbers with a currency symbol you choose. There is
  no per-currency formatting and no conversion.
- An installed app on iPadOS will not always let a waiting update take over while
  the app is open. If the version at the bottom of the screen is not the one you
  expect, close the app fully and open it again.

---

## 0.2.0 — CAPABILITY — 2026-08-09

Models and jobs can carry a picture, so the board can be read by sight instead of
by name.

### New

- A picture on a model, and on the cards for the jobs that print it. Add one by
  choosing a file, by pasting, or by dropping it in. On a phone or tablet the
  picker also offers the camera, so a finished print can be photographed.
- Pictures are shrunk to a thumbnail on your own device before they are kept.
  Nothing is uploaded, nothing is fetched, and a picture works offline like the
  rest of the app because it lives on the device rather than on somebody's site.
- Pasting an address into a model fills in the site it came from, and offers a
  name taken from the address itself. It only ever fills a box you have left
  empty, and everything it suggests can be typed over.
- Backups now carry your pictures, and restoring one brings them back exactly as
  they were.

### Still not right

- A picture has to be added by hand. Dropping in an address cannot pull the photo
  from the page, because a browser is not allowed to read another site's pages.
- Filament counts as used the moment it is logged against a job, whichever column
  that job is sitting in. That is the honest answer to how much is left on a
  spool, but it means a job parked in research with grams already logged has spent
  that filament as far as the inventory is concerned.
- There is no undo yet. Deletions ask first and say what they will unlink, but once
  a thing is gone the way back is an export taken beforehand.
- Costs and prices are plain numbers with a currency symbol you choose. There is
  no per-currency formatting and no conversion.
- An installed app on iPadOS will not always let a waiting update take over while
  the app is open. If the version at the bottom of the screen is not the one you
  expect, close the app fully and open it again.

---

## 0.1.2 — ITERATION — 2026-08-08

The app has a new icon, and the link preview card has new artwork.

### Fixed

- A new icon: a print nozzle laying down layers. The old one was a filament spool
  seen face-on, and at a glance it read as an eye rather than a spool.
- The link preview card now shows a row of printers instead of the spool, so
  sending someone the address shows something that looks like what the app is for.

### Still not right

- Filament counts as used the moment it is logged against a job, whichever column
  that job is sitting in. That is the honest answer to how much is left on a
  spool, but it means a job parked in research with grams already logged has spent
  that filament as far as the inventory is concerned.
- There is no undo yet. Deletions ask first and say what they will unlink, but once
  a thing is gone the way back is an export taken beforehand.
- Costs and prices are plain numbers with a currency symbol you choose. There is
  no per-currency formatting and no conversion.
- An installed app on iPadOS will not always let a waiting update take over while
  the app is open. If the version at the bottom of the screen is not the one you
  expect, close the app fully and open it again.

---

## 0.1.1 — ITERATION — 2026-08-08

Sharing a link to the app now shows a proper card instead of a bare address.

### New

- A link preview card, so sending someone the address shows the app's name and
  what it does rather than just a domain. The same card is what shows on the
  repository page.

### Still not right

- Filament counts as used the moment it is logged against a job, whichever column
  that job is sitting in. That is the honest answer to how much is left on a
  spool, but it means a job parked in research with grams already logged has spent
  that filament as far as the inventory is concerned.
- There is no undo yet. Deletions ask first and say what they will unlink, but once
  a thing is gone the way back is an export taken beforehand.
- Costs and prices are plain numbers with a currency symbol you choose. There is
  no per-currency formatting and no conversion.
- An installed app on iPadOS will not always let a waiting update take over while
  the app is open. If the version at the bottom of the screen is not the one you
  expect, close the app fully and open it again.

---

## 0.1.0 — CAPABILITY — 2026-08-07

The first release.

### New

- Track print jobs on a board with six columns: research, staged, printing,
  complete, delivered and archived. Move a card by dragging its handle, or with
  the Move button on the card — whichever suits the moment and the device.
- Filter the board by job type, so a board full of your own projects can show
  only the ones somebody is waiting on.
- Keep a filament inventory. Remaining weight is worked out from the grams logged
  against your jobs rather than stored, so it cannot quietly drift away from what
  is actually on the spool.
- Keep a model catalog with where a file came from, where it is listed, and what
  you have charged across everything delivered from it.
- Export everything to one file, and import it back. Import replaces what is
  there, asks first, and saves a copy of your current data before it starts.
- Works offline once it has loaded, and installs to a home screen.

### Still not right

- Filament counts as used the moment it is logged against a job, whichever column
  that job is sitting in. That is the honest answer to how much is left on a
  spool, but it means a job parked in research with grams already logged has spent
  that filament as far as the inventory is concerned.
- There is no undo yet. Deletions ask first and say what they will unlink, but once
  a thing is gone the way back is an export taken beforehand.
- Costs and prices are plain numbers with a currency symbol you choose. There is
  no per-currency formatting and no conversion.
- An installed app on iPadOS will not always let a waiting update take over while
  the app is open. If the version at the bottom of the screen is not the one you
  expect, close the app fully and open it again.
