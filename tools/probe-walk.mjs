#!/usr/bin/env node
// Does public/probe.html actually tell the three cases apart?
//
// DEVELOPER-TIME, like render:icons — not in `npm run check` and not in CI. It
// needs a throwaway TLS certificate, and making CI depend on `openssl` to test a
// diagnostic page is a dependency out of all proportion to what it protects.
// `npm run pages` is what holds the page itself in CI: that it renders, that its
// colours clear their floors, that its policy is scoped to its own path, and that
// the worker keeps no copy of it. This walk covers the one thing that cannot be
// read from the source — whether its logic is right.
//
// THE HOSTS ARE MADE HERE, because the whole variable is a header another site
// sends and no real site is reachable from a sandbox. One sends
// Access-Control-Allow-Origin, one does not, and one is missing. If the probe
// cannot separate those three it is decoration.
//
// HTTPS, NOT HTTP, and that is not fussiness. The shipped policy widens `https:`
// and nothing else, so an http test host is refused by our OWN CSP — which the
// probe reported correctly and clearly, and which would have made this walk fail
// for a reason that has nothing to do with the code under test.
//
//   npm run probe:walk

import { chromium } from 'playwright-core';
import { createServer } from 'node:https';
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from './serve.mjs';
import { makePng } from './png.mjs';

const BROWSER = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const scratch = mkdtempSync(join(tmpdir(), 'print-tracker-probe-'));
const key = join(scratch, 'key.pem');
const cert = join(scratch, 'cert.pem');

try {
  execFileSync('openssl', [
    'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
    '-keyout', key, '-out', cert, '-days', '1',
    '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost',
  ], { stdio: 'ignore' });
} catch {
  console.error('probe walk: needs `openssl` on PATH to make a throwaway certificate. Nothing was measured.');
  rmSync(scratch, { recursive: true, force: true });
  process.exit(1);
}

const PNG = makePng(240, 160);
const other = createServer(
  { key: readFileSync(key), cert: readFileSync(cert) },
  (req, res) => {
    if (req.url.startsWith('/open')) {
      res.writeHead(200, { 'content-type': 'image/png', 'access-control-allow-origin': '*' });
      res.end(PNG);
    } else if (req.url.startsWith('/closed')) {
      res.writeHead(200, { 'content-type': 'image/png' });
      res.end(PNG);
    } else {
      res.writeHead(404).end('no');
    }
  },
);
await new Promise((resolve) => other.listen(0, '127.0.0.1', resolve));
// `localhost` rather than `127.0.0.1`: they are different origins to a browser,
// which is what makes this cross-origin rather than a same-origin test that would
// pass for every host and mean nothing.
const host = `https://localhost:${other.address().port}`;

const failures = [];
const passes = [];

const { server, url } = await serve(0);
const browser = await chromium.launch({
  ...(process.env.CHROMIUM_PATH || BROWSER ? { executablePath: BROWSER } : {}),
  args: ['--no-sandbox'],
});
const context = await browser.newContext({ viewport: { width: 390, height: 900 }, ignoreHTTPSErrors: true });
const page = await context.newPage();
page.on('pageerror', (error) => failures.push(`the page threw: ${error}`));

// BOTH ROUTES, because the hosted one rests on a header rule that was already
// wrong once. `file://` is the one that cannot fail: no policy applies there.
const ROUTE = process.argv.includes('--standalone')
  ? { name: 'standalone, from disk', href: `file://${join(ROOT, 'public/probe-standalone.html')}` }
  : { name: 'hosted, under its own header', href: new URL('probe.html', url).href };

await page.goto(ROUTE.href, { waitUntil: 'load' });
await page.waitForTimeout(400);

// It reads its own policy off its own response, so a wrong one is named rather
// than silently turning every answer below into a refusal by us.
const csp = (await page.textContent('#policy')).trim();
if (ROUTE.name.startsWith('standalone')) {
  // From disk it cannot read its own headers, and there are none to read. What
  // matters is only that nothing refuses the requests below.
  passes.push(`running ${ROUTE.name}, where no Content-Security-Policy applies at all`);
} else if (!/img-src[^;]*https:/.test(csp) || !/connect-src[^;]*https:/.test(csp)) {
  failures.push(`the page was served the app's policy rather than its own: ${csp.slice(0, 90)}`);
} else {
  passes.push('the page is running under its own widened policy, and says so from its own response headers');
}

await page.fill('#urls', `${host}/open.png\n${host}/closed.png\n${host}/missing.png`);
await page.click('#run');
await page.waitForFunction(() => document.querySelectorAll('#results .verdict').length === 3, null, { timeout: 90000 });

const results = await page.evaluate(() => [...document.querySelectorAll('#results .result')].map((card) => ({
  name: card.querySelector('.result-url').textContent.split('/').pop().split('.')[0],
  verdict: card.querySelector('.verdict').textContent.trim(),
  lines: [...card.querySelectorAll('.line')].map((l) => l.textContent.trim()),
})));

const want = [
  ['open', 'CAN BE READ', 'a host that sends Access-Control-Allow-Origin'],
  ['closed', 'DISPLAY ONLY', 'a host that sends the picture and no CORS header'],
  ['missing', 'NOTHING CAME BACK', 'an address that is not there'],
];
for (const [name, phrase, why] of want) {
  const got = results.find((r) => r.name === name);
  if (!got) failures.push(`no result for ${name}`);
  else if (!got.verdict.includes(phrase)) failures.push(`${why} was reported as "${got.verdict.split('.')[0]}", not "${phrase}"`);
  else passes.push(`${why} reads as ${phrase}`);
}

// The one that matters most: a refusal must never be attributed to the other site
// when it was ours. Nothing here should mention this page's own policy.
if (results.some((r) => r.lines.some((l) => l.includes("THIS PAGE'S policy")))) {
  failures.push('a result blamed this page\'s own policy while the policy is the widened one — the attribution is wrong');
} else {
  passes.push('no result was misattributed to this page\'s own policy');
}

await context.close();
await browser.close();
server.close();
other.close();
rmSync(scratch, { recursive: true, force: true });

for (const p of passes) console.log(`  ok   ${p}`);
for (const f of failures) console.error(`  FAIL ${f}`);
if (failures.length) {
  console.error(`\nprobe walk: ${failures.length} failure(s).`);
  process.exit(1);
}
console.log(`\nprobe walk (${ROUTE.name}): pass — the three answers are told apart, against real cross-origin hosts.`);
