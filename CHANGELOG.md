# Changelog

The single source for what changed. `tools/changelog.mjs` generates the in-app
patch notes from this file, and `--check` fails the build if the two drift apart
or if the top entry disagrees with the version constant.

Every release is exactly one kind — VERSION, CAPABILITY or ITERATION — and the
triplet is `version.capability.iteration`. Releases do not have names.

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
