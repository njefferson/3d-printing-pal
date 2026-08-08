// GENERATED — do not edit.
//
// Written by tools/changelog.mjs from CHANGELOG.md, which is the one source.
// `npm run notes:check` fails if this file and CHANGELOG.md disagree, or if the
// newest version here does not match public/app/version.js and the service
// worker's cache name.

export const RELEASES = [
  {
    "version": "0.1.1",
    "kind": "ITERATION",
    "date": "2026-08-08",
    "summary": "Sharing a link to the app now shows a proper card instead of a bare address.",
    "added": [
      "A link preview card, so sending someone the address shows the app's name and what it does rather than just a domain. The same card is what shows on the repository page."
    ],
    "fixed": [],
    "broken": [
      "Filament counts as used the moment it is logged against a job, whichever column that job is sitting in. That is the honest answer to how much is left on a spool, but it means a job parked in research with grams already logged has spent that filament as far as the inventory is concerned.",
      "There is no undo yet. Deletions ask first and say what they will unlink, but once a thing is gone the way back is an export taken beforehand.",
      "Costs and prices are plain numbers with a currency symbol you choose. There is no per-currency formatting and no conversion.",
      "An installed app on iPadOS will not always let a waiting update take over while the app is open. If the version at the bottom of the screen is not the one you expect, close the app fully and open it again."
    ]
  },
  {
    "version": "0.1.0",
    "kind": "CAPABILITY",
    "date": "2026-08-07",
    "summary": "The first release.",
    "added": [
      "Track print jobs on a board with six columns: research, staged, printing, complete, delivered and archived. Move a card by dragging its handle, or with the Move button on the card — whichever suits the moment and the device.",
      "Filter the board by job type, so a board full of your own projects can show only the ones somebody is waiting on.",
      "Keep a filament inventory. Remaining weight is worked out from the grams logged against your jobs rather than stored, so it cannot quietly drift away from what is actually on the spool.",
      "Keep a model catalog with where a file came from, where it is listed, and what you have charged across everything delivered from it.",
      "Export everything to one file, and import it back. Import replaces what is there, asks first, and saves a copy of your current data before it starts.",
      "Works offline once it has loaded, and installs to a home screen."
    ],
    "fixed": [],
    "broken": [
      "Filament counts as used the moment it is logged against a job, whichever column that job is sitting in. That is the honest answer to how much is left on a spool, but it means a job parked in research with grams already logged has spent that filament as far as the inventory is concerned.",
      "There is no undo yet. Deletions ask first and say what they will unlink, but once a thing is gone the way back is an export taken beforehand.",
      "Costs and prices are plain numbers with a currency symbol you choose. There is no per-currency formatting and no conversion.",
      "An installed app on iPadOS will not always let a waiting update take over while the app is open. If the version at the bottom of the screen is not the one you expect, close the app fully and open it again."
    ]
  }
];
