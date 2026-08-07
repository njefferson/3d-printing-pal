# print-tracker

Track 3D print jobs, filament and models — on your own device, offline, with no account.

A job kanban, a filament spool inventory and a model catalog, in one small web app.
Free, works offline after the first visit, installs to a home screen, and keeps
everything in your browser's own storage. Nothing is uploaded, nothing is fetched,
and there is nobody to sign up with.

It is deliberately **company-agnostic**: the printer is a free-text field, and there
are no printer-brand integrations or vendor APIs to break when you change machines.

## What it does

- **Board** — jobs across six fixed columns: research, staged, printing, complete,
  delivered, archived. Cards move by drag or by a Move button, and filter live by
  job type (request, wanted, fun).
- **Inventory** — spools with brand, material, colour, weight and cost. Remaining
  weight is **computed** from the filament you have logged against jobs, never
  stored, so it cannot drift out of step with reality.
- **Models** — a catalog with where the file came from, where you have it listed,
  and what you have charged across everything you delivered from it.
- **Export and import** — one JSON file holds the lot. Import replaces everything,
  asks first, and takes a safety copy of your current data before it does.

## Structure

- `public/` — the deployed app. No build step; it runs as it sits.
  - `index.html`, `styles.css`, `sw.js`, `manifest.webmanifest`, `_headers`
  - `app/` — the ES modules the page loads
- `tools/` — this repo's own gates and generators (accessibility, patch notes,
  interaction declarations, icons)
- `palettes/3d-printing-pal.json` — the colour spec the hub's palette gate measures
- `CHANGELOG.md` — the single source the in-app patch notes are generated from

## Working on it

```
npm ci
npm run check
```

`npm run check` is the whole gate set, and it is the same entry point CI uses.
Individual gates: `npm run a11y`, `npm run pwa`, `npm run palette`, `npm run docs`,
`npm run privacy`, `npm run notes:check`, `npm run voice`, `npm run interactions`.

The shared gates are invoked from the hub checkout beside this repo rather than
copied into it, so there is only ever one version of each.

```
npm run serve
```

serves `public/` on http://localhost:8099 for a real look at it — the app is made
of ES modules, so opening `index.html` from the filesystem will not boot.

## One-time setup

1. Add two repository secrets under Settings → Secrets and variables → Actions:
   - `CLOUDFLARE_API_TOKEN` — an account-wide **Cloudflare Pages: Edit** token.
   - `CLOUDFLARE_ACCOUNT_ID` — the account ID in the Cloudflare dashboard sidebar
     under Workers & Pages.
2. Push to `main`.

The deploy workflow skips gracefully until both secrets exist, so it never fails
while the repo is still being set up. On the first push with both present it
creates the Pages project and deploys.

## Licence

PolyForm Noncommercial 1.0.0 — see [`LICENSE.md`](LICENSE.md). Use it, change it,
share it; do not sell it. Your data is yours and is not covered by it.
