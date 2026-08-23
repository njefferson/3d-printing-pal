#!/usr/bin/env node
// Build public/probe-standalone.html from probe.html + probe.css + probe.js.
//
// WHY A SECOND COPY EXISTS AT ALL. The hosted probe needs a widened
// Content-Security-Policy, which needs a per-path rule in `_headers` to override
// the app's — and the first attempt at that was written on an assumption about
// how Cloudflare resolves two matching rules. It was wrong: the deployed page was
// served the app's policy and could measure nothing. The reordered rule is a
// better bet and is still a bet.
//
// From a file:// page there is no Content-Security-Policy at all, so the
// standalone copy needs no rule to be right about. It is the route that cannot
// fail, and `_headers` serves it as an attachment so the only way to run it is
// from disk.
//
// A COPY IS A LIABILITY AND THIS ONE IS GENERATED, which is the difference. It is
// built from the three source files rather than maintained beside them, and
// `--check` fails the build if it has drifted — the same shape as the icon, where
// one command writes both and a stale served copy is the signature of a render
// that never ran.
//
//   npm run render:probe     write it
//   npm run probe            fail if it is stale

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public/probe-standalone.html');

const html = readFileSync(join(ROOT, 'public/probe.html'), 'utf8');
const css = readFileSync(join(ROOT, 'public/probe.css'), 'utf8');
const js = readFileSync(join(ROOT, 'public/probe.js'), 'utf8');

const NOTE = `
<!--
  GENERATED — DO NOT EDIT. Written by tools/render-probe.mjs from probe.html,
  probe.css and probe.js. Edit those and run \`npm run render:probe\`; \`npm run
  probe\` fails if this file has drifted from them.

  This is the copy that runs from your DISK. Opening a file:// page applies no
  Content-Security-Policy, so the measurement below never depends on a response
  header being right — which is the one thing the hosted copy does depend on.
-->
`;

function build() {
  let out = html;

  // The stylesheet and the script go inline, which is exactly what the app's own
  // policy forbids and exactly what a file:// page permits.
  out = out.replace(
    /<link rel="stylesheet" href="\.\/probe\.css">/,
    `<style>\n${css}\n</style>`,
  );
  out = out.replace(
    /<script src="\.\/probe\.js"><\/script>/,
    `<script>\n${js}\n</script>`,
  );

  // The icon is a request to a server that is not there when this runs from disk.
  out = out.replace(/<link rel="icon"[^>]*>\n?/, '');

  // Its own name, so a downloaded file in a folder of downloads says what it is.
  out = out.replace(
    /<title>[^<]*<\/title>/,
    '<title>print-tracker — probe (standalone, runs from your disk)</title>',
  );

  // The download offer is about the hosted page and is nonsense once you ARE the
  // downloaded page. Removed by id rather than by position.
  out = out.replace(/\s*<div id="fallback"[\s\S]*?<\/div>\n/, '\n');

  out = out.replace('<body>\n', `<body>\n${NOTE}`);
  return out;
}

const built = build();

if (process.argv.includes('--check')) {
  let current = '';
  try {
    current = readFileSync(OUT, 'utf8');
  } catch {
    console.error('  FAIL public/probe-standalone.html does not exist. Run `npm run render:probe`.');
    process.exit(1);
  }
  if (current !== built) {
    console.error('  FAIL public/probe-standalone.html has drifted from probe.html, probe.css or probe.js.');
    console.error('       The served copy would measure something different from the source. Run `npm run render:probe`.');
    process.exit(1);
  }
  // Belt and braces: the inlining must actually have happened. A regex that stops
  // matching would produce a file that is "in step" and refers to files that are
  // not there beside it.
  if (/href="\.\/probe\.css"/.test(current) || /src="\.\/probe\.js"/.test(current)) {
    console.error('  FAIL the standalone copy still LINKS to probe.css or probe.js, so it is not standalone at all.');
    process.exit(1);
  }
  if (!current.includes('<style>') || !current.includes('canCanvas')) {
    console.error('  FAIL the standalone copy is missing its inlined style or script.');
    process.exit(1);
  }
  console.log('probe standalone: in step with probe.html, probe.css and probe.js.');
} else {
  writeFileSync(OUT, built);
  console.log(`wrote public/probe-standalone.html (${(built.length / 1024).toFixed(0)} KB, everything inlined)`);
}
