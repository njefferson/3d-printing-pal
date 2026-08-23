#!/usr/bin/env node
// Everything that runs INSIDE the page, as source, shared by the gates that
// evaluate it.
//
// It lives in its own file rather than in tools/a11y.mjs because importing it
// from there RUNS that gate: a11y.mjs calls its main() at module load, so
// `import { PAGE_HELPERS } from './a11y.mjs'` executed all 64 measurements as a
// side effect of wanting one string. tools/png.mjs was split out for the same
// reason.
//
// CONTRAST IS COMPUTED HERE, NOT TAKEN FROM AXE, which reports color-contrast as
// `incomplete` rather than a violation on transformed or gradient content — so a
// green axe run over such content proves nothing. `backdrops()` is the part that
// earns this file: it collects every opaque colour an element could be drawn
// over, including each stop of a gradient in the ancestor chain, and REFUSES TO
// GUESS when it finds nothing opaque. A second, hand-rolled version of this was
// written for the status page and compared dark text against an assumed-black
// body — because a gradient background has no backgroundColor — reporting 1.32:1
// in light mode and clean in dark. Both numbers were fictional.

export const PAGE_HELPERS = `
function parseColor(value) {
  const m = String(value).match(/rgba?\\(([^)]+)\\)/);
  if (!m) return null;
  const parts = m[1].split(/[,\\s/]+/).filter(Boolean).map(Number);
  return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
}

function lum(c) {
  const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
}

function ratio(a, b) {
  const la = lum(a), lb = lum(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function over(fg, bg) {
  if (fg.a >= 1) return fg;
  return {
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1,
  };
}

/* Every opaque background an element could actually be drawn over, including
   every colour stop of any gradient in the ancestor chain. The worst is used.
   Anything below full alpha is NOT opaque and the walk continues — measuring
   against a translucent layer gives a number that is wrong in a direction
   nobody notices. If nothing opaque is found the caller REFUSES TO GUESS. */
function backdrops(el) {
  const found = [];
  let node = el;
  while (node && node !== document.documentElement.parentNode) {
    const cs = getComputedStyle(node);
    const bg = parseColor(cs.backgroundColor);
    const image = cs.backgroundImage || '';
    for (const stop of image.matchAll(/rgba?\\([^)]+\\)/g)) {
      const c = parseColor(stop[0]);
      if (c && c.a > 0.95) found.push(c);
    }
    if (bg && bg.a >= 1) { found.push(bg); return found; }
    if (bg && bg.a > 0) found.push(bg);
    node = node.parentElement;
  }
  return found;
}

function visible(el) {
  const r = el.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return false;
  const cs = getComputedStyle(el);
  return cs.visibility !== 'hidden' && cs.display !== 'none';
}

/* A rect clipped by every scrolling ancestor. A control inside a scroll
   container has a bounding rect that runs past the container, which produces
   spacing failures against neighbours it can never actually touch. */
function clippedRect(el) {
  let r = el.getBoundingClientRect();
  let node = el.parentElement;
  while (node) {
    const cs = getComputedStyle(node);
    if (cs.overflow !== 'visible' || cs.overflowX !== 'visible' || cs.overflowY !== 'visible') {
      const c = node.getBoundingClientRect();
      const left = Math.max(r.left, c.left), right = Math.min(r.right, c.right);
      const top = Math.max(r.top, c.top), bottom = Math.min(r.bottom, c.bottom);
      r = { left, right, top, bottom, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
    }
    node = node.parentElement;
  }
  return r;
}

function accessibleName(el) {
  const labelledby = el.getAttribute('aria-labelledby');
  if (labelledby) {
    const parts = labelledby.split(/\\s+/).map((id) => document.getElementById(id)?.textContent || '').join(' ');
    if (parts.trim()) return parts.trim();
  }
  const aria = el.getAttribute('aria-label');
  if (aria && aria.trim()) return aria.trim();
  if (el.id) {
    const label = document.querySelector('label[for="' + CSS.escape(el.id) + '"]');
    if (label) return label.textContent.trim();
  }
  const closestLabel = el.closest('label');
  if (closestLabel) return closestLabel.textContent.trim();
  const text = (el.innerText || el.textContent || '').trim();
  if (text) return text;
  const title = el.getAttribute('title');
  return title ? title.trim() : '';
}

/* Only text a sighted reader can actually see: aria-hidden subtrees and
   .sr-only text are not visible words for SC 2.5.3 to be about. */
function visibleWords(el) {
  const clone = el.cloneNode(true);
  for (const hidden of clone.querySelectorAll('[aria-hidden="true"], .sr-only')) hidden.remove();
  return (clone.textContent || '').replace(/\\s+/g, ' ').trim();
}

/* The root of a modal is the open dialog when there is one: everything behind it
   is inert, and sweeping the whole document produces dozens of imaginary
   collisions with controls nobody can reach. */
function auditRoot() {
  /* :modal returns dialogs in the top layer, in stacking order, so the LAST is
     the one actually on top. Taking the first open dialog in DOM order audited
     the panel underneath a stacked confirmation and reported every selector in
     the real top panel as matching nothing. */
  let stack = [];
  try { stack = Array.from(document.querySelectorAll('dialog:modal')); } catch { stack = []; }
  if (!stack.length) stack = Array.from(document.querySelectorAll('dialog[open]'));
  return stack.length ? stack[stack.length - 1] : document.body;
}
`;
