# Changelog

The single source for what changed. `tools/changelog.mjs` generates the in-app
patch notes from this file, and `--check` fails the build if the two drift apart
or if the top entry disagrees with the version constant.

Every release is exactly one kind — VERSION, CAPABILITY or ITERATION — and the
triplet is `version.capability.iteration`. Releases do not have names.

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
