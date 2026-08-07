// DOM helpers.
//
// Everything here builds nodes and sets text. Nothing in this app interpolates
// into innerHTML: that is safe only while every input is a literal somebody
// wrote, and this app's inputs are whatever the reader typed into a job title.

export function $(sel, root = document) {
  return root.querySelector(sel);
}

export function $$(sel, root = document) {
  return Array.from(root.querySelectorAll(sel));
}

/** el('p', {class: 'note'}, 'text', anotherNode) */
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    // Styles are applied through the CSSOM, never as a style="" attribute. The
    // app ships `style-src 'self'` with no 'unsafe-inline', which blocks a parsed
    // inline style attribute; assigning properties on element.style is not
    // blocked. Passing a string here would be silently dropped by the browser.
    else if (key === 'style') Object.assign(node.style, value);
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), value);
    else if (value === true) node.setAttribute(key, '');
    else node.setAttribute(key, String(value));
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

/** Money, as a symbol and a plain number. No locale guessing, no conversion. */
export function money(value, currency) {
  const n = Number(value);
  if (!Number.isFinite(n) || n === 0) return '';
  return `${currency}${n.toFixed(2)}`;
}

export function grams(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0 g';
  return `${Math.round(n)} g`;
}

/** A date a person reads, from an ISO string. Empty in, empty out. */
export function readableDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
