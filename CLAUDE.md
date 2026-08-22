# CLAUDE.md — 3d-printing-pal (print-tracker)

> **Inherits the Universal App Doctrine** — the canonical copy lives in the hub
> repo at [`noahjefferson/DOCTRINE.md`](https://github.com/njefferson/noahjefferson/blob/main/DOCTRINE.md).
> It is the single source of truth for the rules shared across all of the owner's
> apps: product values, taste, accessibility, honesty, verification, release
> discipline and taxonomy, licensing, privacy, the permanent **AskUserQuestion
> ban** (§0), and the **repo-metadata confirm rule** (§10).
> **Where anything below overlaps the Doctrine, the Doctrine wins.** This file
> keeps only what is specific to this repo. Never re-state a doctrine rule here —
> that is how they drift — and never fork the doctrine into this repo.

**Run this first, every session:**

```
node ../noahjefferson/doctrine-sync.mjs --repo .
```

It reports what has landed in the hub since this repo last reconciled, down to
which sections of `DOCTRINE.md` changed. `--adopt` moves the marker in
`.doctrine-sync` and is an assertion the drift was read.

## What this repo is

**print-tracker** — a local-first, single-user web app for running 3D printing:
a job kanban, a filament spool inventory, and a model catalog. Static
HTML/CSS/JS in `public/`, no build step, no framework, no runtime dependency.
Everything lives in IndexedDB on the device. Nothing is fetched, nothing is sent,
there is no account and no server.

It is **company-agnostic on purpose**: printer is free text, there are no
printer-brand integrations and no vendor APIs. That is a product decision, not a
gap to fill later.

## The facts a later session needs

- **Version is one constant**, `public/app/version.js`, and the service worker's
  cache name carries the same triplet. They are bumped together, in one commit,
  with `CHANGELOG.md`'s top entry (Doctrine §7).
- **`sw.js` must differ byte-for-byte between releases** or the browser never
  replaces it — the version lives inline in that file, never in a registration
  query string.
- **Spool remaining weight is computed, never stored.** There is no
  `remainingG` field anywhere; `remainingFor()` in `public/app/derive.js` is the
  only answer, and it is a pure function called on demand rather than a value
  assigned inside a render. Four surfaces read it.
- **Import is atomic.** Validation asks every question the write will ask,
  including duplicate ids, and the clear-and-refill is one IndexedDB transaction
  across every store. Do not split it "for readability".
- **Type in `rem`, size touch targets in `px`.** Both, and they pull opposite
  ways. See `ACCESSIBILITY.md`.
- **The a11y gate derives its surface list from the markup.** Adding a
  `<dialog id>` without a state that opens it fails the build, and so does a state
  naming a surface that no longer exists. That is deliberate — it is what stops a
  new screen shipping unmeasured.

## Gates

`npm run check` runs the lot. The shared gates are **invoked from the hub, never
copied** — they take `--repo .`:

- `npm run docs` — the no-grid rule over every `.md`.
- `npm run privacy` — the canonical hub privacy gate (Doctrine §9b).
- `npm run pins`, `npm run pwa`, `npm run palette`, `npm run textsize`.

This repo's own gates live in `tools/` because they are specific to this app:

- `tools/a11y.mjs` — the accessibility gate. The hub's `a11y-gate.mjs` is the one
  shared gate that does **not** serve siblings (no `--repo`, hub-specific
  selectors), so this is a per-repo gate modelled on it.
- `tools/changelog.mjs --check` — holds the in-app patch notes identical to
  `CHANGELOG.md` and to the version constant.
- `tools/notes-voice.mjs` — Doctrine §7d.1 over the release notes.
- `tools/interactions-check.mjs` — every drag declared in `INTERACTIONS.json` has
  a non-drag alternative that exists in the markup, and every declaration matches
  something.

## Working on this locally

No build step: `public/` is the app. Node 20 or newer, and two things that are
not obvious and both fail loudly the first time.

**The two repos must be siblings.** Seven gates invoke the hub by relative path
(`../noahjefferson/docs-check.mjs` and friends) rather than copying it, which is
what stops five divergent versions existing. So the parent folder has to hold
both:

```
git clone https://github.com/njefferson/noahjefferson.git
git clone https://github.com/njefferson/3d-printing-pal.git
cd 3d-printing-pal && npm ci
```

**Everything below runs INSIDE the clone**, not in the folder holding both. Run
`npm ci` a level up and it fails complaining about a lockfile, which names
nothing about directories and reads like a broken repo. If the path has spaces in
it, quote it.

**Five tools need a real browser** — the accessibility gate, both walks, the card
contrast check and the icon render. They look for the sandbox Chromium first and
fall back to Playwright's own, so install it once, AFTER `npm ci`:

```
npx --no-install playwright-core install chromium
```

**`playwright-core`, and `--no-install`, and both are load-bearing.** The obvious
spelling — `npx playwright install chromium` — fetches the current `playwright`
package and downloads whatever Chromium revision THAT wants. This repo pins
`playwright-core` (see the `//browser` note in `package.json`), and the two are a
matched pair: a playwright-core given a different revision connects and then hangs
on a protocol mismatch, with no error to read. So the wrong spelling costs a few
hundred megabytes and buys five gates that hang instead of failing. `--no-install`
is what makes npx use the copy `npm ci` just put in `node_modules` rather than
fetching its own.

CI runs the same command with `--with-deps` added, which installs Linux system
packages; on macOS and Windows it is unnecessary.

Without a matching browser those five fail, which is most of what `npm run check` is.

**Seeing the app.** `npm run serve` boots it through the REAL `_headers`, so the
Content-Security-Policy is exercised rather than assumed — that is how a policy
that silently broke the service worker was caught. Open the address it prints.

**`npm run check`** runs every gate, the same entry point CI uses.

**`npm run render:icons` and `npm run render:social` are developer-time**, not CI
steps: they launch a browser to write PNGs that are then committed. Run them after
editing `icon.svg` or `social-card.html`, and commit what they write.

## Branches and releases

`staging` and `main`. Push to `main` deploys; `staging` is the candidate the owner
passes on his own device before anything is promoted. A push is not a release —
the deploy for that exact commit has to be read and seen to conclude.

## Repo metadata (manual, confirm — Doctrine §10)

Description, website, topics, social preview and default branch are GitHub-UI
steps the session token cannot perform. The values live in the hub's
[`METADATA.md`](https://github.com/njefferson/noahjefferson/blob/main/METADATA.md)
— propose there, the owner applies from there, and the status flips to `set` only
on his say-so. Never report this repo set up while an item says proposed.
