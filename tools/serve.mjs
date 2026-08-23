#!/usr/bin/env node
// A static server for public/.
//
// The app is made of ES modules, so opening index.html from the filesystem does
// not work: a file:// origin is opaque, every import is blocked by CORS, and the
// app never boots. A gate pointed at file:// would report an empty shell as clean
// in both themes at every viewport, forever — so both this and tools/a11y.mjs
// serve over HTTP instead.

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');

/**
 * The deployed security headers, from public/_headers, sent by this server too.
 *
 * Without this the gate would boot the app with no Content-Security-Policy and
 * prove nothing about the one that actually ships — and a CSP is the header most
 * able to break an app silently. Parsing the real file rather than restating it
 * means the two cannot drift.
 *
 * EVERY BLOCK, NOT JUST `/*`. This read only the global block until a page needed
 * a policy of its own, and the failure that would have caused is the nastiest
 * shape there is: the page passes locally under a policy it will never be served,
 * or fails locally under one it will never be served, and either way the number it
 * reports is about the test rig. A per-path block that this cannot see is a header
 * nobody has ever run.
 */
function deployedBlocks() {
  const text = readFileSync(join(ROOT, '_headers'), 'utf8');
  const blocks = [];
  let current = null;
  for (const line of text.split('\n')) {
    if (/^\s*#/.test(line) || !line.trim()) continue;
    if (/^\S/.test(line)) {
      current = { path: line.trim(), headers: {} };
      blocks.push(current);
      continue;
    }
    if (!current) continue;
    const at = line.indexOf(':');
    if (at > 0) current.headers[line.slice(0, at).trim()] = line.slice(at + 1).trim();
  }
  return blocks;
}

export const BLOCKS = deployedBlocks();

/** The global block on its own, for anything that only wants the app's policy. */
export const HEADERS = (BLOCKS.find((b) => b.path === '/*') || { headers: {} }).headers;

/**
 * Every block whose path matches, merged in FILE ORDER so a later, more specific
 * block overrides the global one — which is how Cloudflare Pages resolves a header
 * named twice, and why the specific blocks are written below `/*` in that file.
 *
 * Only the two forms actually used are supported — an exact path and a trailing
 * `*` — rather than a general glob. A matcher that quietly does not understand a
 * pattern would send the wrong policy and look like it worked.
 */
function headersFor(path) {
  const merged = {};
  for (const block of BLOCKS) {
    const pattern = block.path;
    const hit = pattern.endsWith('*')
      ? path.startsWith(pattern.slice(0, -1))
      : path === pattern;
    if (hit) Object.assign(merged, block.headers);
  }
  return merged;
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.txt': 'text/plain; charset=utf-8',
};

/**
 * @param extra Same-origin files to serve alongside public/, as
 *   { '/path': { body, type } }. The a11y gate uses this to serve axe-core from
 *   node_modules: the app ships `script-src 'self'` with no 'unsafe-inline', so
 *   injecting axe as inline script content is refused — correctly. Serving it
 *   from this origin keeps the gate running under the REAL policy rather than a
 *   relaxed one, which is the whole point of sending these headers here.
 */
export function serve(port = 0, { root = ROOT, extra = {} } = {}) {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      let path = decodeURIComponent(url.pathname);

      if (extra[path]) {
        res.writeHead(200, { 'content-type': extra[path].type, 'cache-control': 'no-store' });
        res.end(extra[path].body);
        return;
      }

      if (path.endsWith('/')) path += 'index.html';

      // Keep requests inside the served directory.
      const resolved = join(root, normalize(path).replace(/^(\.\.[/\\])+/, ''));
      if (!resolved.startsWith(root)) {
        res.writeHead(403).end('forbidden');
        return;
      }

      const info = await stat(resolved).catch(() => null);
      if (!info || !info.isFile()) {
        res.writeHead(404).end('not found');
        return;
      }

      const body = await readFile(resolved);
      res.writeHead(200, {
        ...headersFor(path),
        'content-type': TYPES[extname(resolved)] || 'application/octet-stream',
        // No caching from the dev server: a stale module is the last thing a gate
        // measuring a service worker needs.
        'cache-control': 'no-store',
        'service-worker-allowed': '/',
      });
      res.end(body);
    } catch (error) {
      res.writeHead(500).end(String(error.message));
    }
  });

  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      resolve({ server, port: server.address().port, url: `http://127.0.0.1:${server.address().port}/` });
    });
  });
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const { url } = await serve(Number(process.env.PORT) || 8099);
  console.log(`print-tracker is being served at ${url}`);
  console.log('Press Control-C to stop.');
}
