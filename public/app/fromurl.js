// What a URL can tell you WITHOUT fetching it.
//
// The obvious way to fill fields from a model page is to fetch the page and read
// its Open Graph tags. A browser cannot do that: reading a cross-origin response
// requires that site to send Access-Control-Allow-Origin, and none of these sites
// do for their HTML. That is the same-origin policy, not a setting — so page
// metadata needs a server, and this app does not have one.
//
// But a URL is not opaque. The hostname says which site it came from, and these
// sites all put a human-readable slug in the path because it is good for search.
// That is a real slice of "it filled itself in", it costs nothing, and it works
// with the network off — which the fetching version never can.
//
// EVERYTHING HERE IS A GUESS OFFERED INTO AN EDITABLE FIELD, never a value
// written behind the reader's back. A guess that silently becomes data is worse
// than no guess, because it is wrong in a place nobody looks again.

// Presentation only. A site absent from this list still works — its hostname is
// tidied and used — so this is not a list anything depends on, and adding to it
// is never required to support a new site. That distinction is what keeps it from
// being the per-vendor coupling this app refuses to have.
const KNOWN = {
  'makerworld.com': 'MakerWorld',
  'cults3d.com': 'Cults3D',
  'thingiverse.com': 'Thingiverse',
  'printables.com': 'Printables',
  'gambody.com': 'Gambody',
  'thangs.com': 'Thangs',
  'myminifactory.com': 'MyMiniFactory',
  'thebasement.org': 'The Basement',
  'patreon.com': 'Patreon',
  'etsy.com': 'Etsy',
};

/** `www.makerworld.com` -> `makerworld.com`. */
function bareHost(host) {
  return String(host || '').toLowerCase().replace(/^www\./, '');
}

/** A readable site name. Falls back to the hostname rather than to nothing. */
export function siteFrom(url) {
  const parsed = parse(url);
  if (!parsed) return '';
  const host = bareHost(parsed.hostname);
  if (KNOWN[host]) return KNOWN[host];
  // Unknown site: use the registrable-looking part, capitalised. "grabcad.com"
  // becomes "Grabcad" — plain, obviously derived, and easy to correct.
  const core = host.split('.').slice(0, -1).pop() || host;
  return core ? core.charAt(0).toUpperCase() + core.slice(1) : '';
}

/**
 * A title guess from the path.
 *
 * `/models/1234-articulated-dragon` becomes "Articulated Dragon".
 *
 * IT PICKS THE BEST SEGMENT, NOT THE LAST ONE, and that is the whole of it. The
 * first version walked from the end and took the first word-looking segment, so
 * the link somebody actually sends —
 * `/model/905441-bolt-euv-2022-privacy-screen-post-replacement/files`, copied
 * from the Files tab, which is the tab you send to a person who is going to
 * print it — offered the title **"Files"**. The name was in the URL the whole
 * time, one segment earlier.
 *
 * The signal is structural rather than a list of route words, because a list of
 * route words is the per-vendor coupling this file exists to avoid:
 *
 *   2 — the segment begins with digits and a dash. Every site here mints slugs
 *       that way, and nothing else in a path looks like it.
 *   1 — the segment is more than one word. A route is `files`, `download`,
 *       `comments`; a name is not.
 *   0 — a single word. Taken only when nothing scores higher, so `/models/dragon`
 *       still reads, and `/…/slug/files` no longer does.
 *
 * A Thingiverse `thing:2478331/files` still yields "Files": that path carries no
 * title in any segment, so there is nothing better to find. It is a guess in an
 * editable field and it is wrong there — recorded rather than hidden.
 */
export function titleFrom(url) {
  const parsed = parse(url);
  if (!parsed) return '';

  const segments = parsed.pathname.split('/').filter(Boolean);
  if (!segments.length) return '';

  let best = null;
  for (const segment of segments) {
    const raw = decodeSafe(segment);

    // A `route:id` segment — Thingiverse's `thing:2478331` — carries no title at
    // all. Squeezing one out of it produces "Thing:2478331", which is worse than
    // an empty field because it looks like an answer.
    if (raw.includes(':')) continue;

    const idPrefixed = /^\d+-/.test(raw);
    let parts = raw
      .replace(/\.[a-z0-9]{2,4}$/i, '')     // a trailing file extension
      .replace(/[_+]/g, '-')
      .split('-');

    // Only a LEADING run of digits is an id. An interior number is part of the
    // name — "bolt-euv-2022-privacy-screen" is a 2022 model, and dropping every
    // pure-number part deleted the year along with the id.
    while (parts.length && /^\d+$/.test(parts[0])) parts.shift();
    parts = parts.filter(Boolean);
    if (!parts.length) continue;

    // A single short token is more likely a route than a name — "models", "p", "m".
    if (parts.length === 1 && parts[0].length <= 3) continue;

    const score = idPrefixed ? 2 : (parts.length > 1 ? 1 : 0);
    // `>=` so that among equal scores the LAST segment wins, which is where a
    // name sits when a path has no id at all.
    if (!best || score >= best.score) best = { score, parts };
  }
  if (!best) return '';

  return best.parts
    .map((word) => (word.length <= 2 ? word : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(' ')
    .trim();
}

/** Both guesses at once. Empty strings where there is nothing to say. */
export function readUrl(url) {
  return { site: siteFrom(url), title: titleFrom(url) };
}

function parse(url) {
  const text = String(url || '').trim();
  if (!text) return null;
  try {
    const parsed = new URL(text);
    // http(s) only. A javascript: or data: URL has no site and no title, and
    // treating one as a source link is how a field becomes a hazard.
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed;
  } catch {
    return null;
  }
}

function decodeSafe(part) {
  try {
    return decodeURIComponent(part);
  } catch {
    return part;
  }
}
