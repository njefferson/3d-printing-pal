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
 * Path words that are never the name of a thing.
 *
 * A LIST, and this file's header used to say a list like this was exactly the
 * per-vendor coupling it refused to have. That was right about SITES and wrong
 * about this: none of these words is about a site. They are the vocabulary of web
 * PATHS, and the same dozen appear on every model host there is.
 *
 * Scoring alone had it half-covered in a way that was easy to mistake for
 * covered: `files` scores 0 and loses to a real slug, so
 * `/model/905441-bolt-euv/files` came out right and the rule looked like it
 * worked. A route word only wins when there is nothing better in the whole path —
 * which is exactly what a picture's address is, all route and no name.
 */
const ROUTE_WORDS = new Set([
  'model', 'models', 'design', 'designs', 'thing', 'things', 'item', 'items',
  'file', 'files', 'download', 'downloads', 'image', 'images', 'img', 'photo',
  'photos', 'media', 'asset', 'assets', 'upload', 'uploads', 'static', 'cdn',
  'view', 'detail', 'details', 'product', 'products', 'page', 'index',
]);

/**
 * Is this one token an identifier rather than a word?
 *
 * Three shapes, each measured against real addresses rather than imagined: a long
 * run of hex (`3ad2d89093fc967b`), a long token carrying both digits and letters
 * with no separator (`USb4cd954e75f587`), and a long token with no vowel in it at
 * all. Length is part of every test on purpose — `mk4`, `a1`, `x1c` and `benchy3`
 * are names people actually give prints, and a rule reading "has a digit in it"
 * would throw all of them away.
 */
function looksOpaque(token) {
  if (token.length < 10) return false;
  if (/^[0-9a-f]{10,}$/i.test(token)) return true;
  if (/\d/.test(token) && /[a-z]/i.test(token) && token.length >= 12) return true;
  return !/[aeiou]/i.test(token);
}

/**
 * A title guess from the path.
 *
 * `/models/1234-articulated-dragon` becomes "Articulated Dragon".
 *
 * IT PICKS THE BEST SEGMENT, NOT THE LAST ONE. The first version walked from the
 * end and took the first word-looking segment, so the link somebody actually sends
 * — `/model/905441-bolt-euv-2022-privacy-screen-post-replacement/files`, copied
 * from the Files tab, which is the tab you send to a person who is going to print
 * it — offered the title **"Files"**. The name was in the URL the whole time, one
 * segment earlier.
 *
 *   2 — the segment begins with digits and a dash. Every site here mints slugs
 *       that way, and nothing else in a path looks like it.
 *   1 — the segment is more than one word. A route is `files`, `download`,
 *       `comments`; a name is not.
 *   0 — a single word. Taken only when nothing scores higher, so `/models/dragon`
 *       still reads.
 *
 * SCORING IS NOT ENOUGH ON ITS OWN, which a picture's address is what proved. In
 * `makerworld.bblmw.com/makerworld/model/USb4cd954e75f587/design/3ad2d89093fc967b.jpg`
 * every segment is route or hash, so the winner is whichever piece of scaffolding
 * scored least badly — and it offered "3ad2d89093fc967b", then "Design", then
 * "Makerworld", as the name of a model. Three rules below reject a segment
 * outright rather than ranking it, and with all of them the answer is an empty
 * box, which is the truth: that address contains no name.
 *
 * A Thingiverse `thing:2478331/files` also yields nothing now, for the same
 * reason. That path carries no title in any segment and never did.
 */
export function titleFrom(url) {
  const parsed = parse(url);
  if (!parsed) return '';

  const segments = parsed.pathname.split('/').filter(Boolean);
  if (!segments.length) return '';

  // A segment that repeats a piece of the HOST is branding or routing, not a name
  // — `makerworld.bblmw.com/makerworld/model/...`. Derived from the address rather
  // than from a list of sites, so it needs no per-site knowledge and works for the
  // next host as well as this one.
  const hostWords = new Set(parsed.hostname.toLowerCase().split('.').filter((w) => w && w !== 'www'));

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

    // AND A SINGLE LONG TOKEN WITH NO WORDS IN IT IS AN ID, not a name. A CDN
    // address for a picture is built entirely of these — the whole path of
    // `makerworld.bblmw.com/makerworld/model/USb4cd954e75f587/design/3ad2d89093fc967b.jpg`
    // is opaque, and the old rule produced "3ad2d89093fc967b" as a title and
    // offered it as a model's name. A hash that looks like an answer is worse than
    // an empty box, which is the same reason `thing:2478331` is skipped above.
    //
    // The test is for a run of hex or a long unbroken mixed-case-and-digits token,
    // NOT "has a digit in it" — "benchy3" and "mk4" are names.
    if (parts.length === 1 && looksOpaque(parts[0])) continue;
    if (parts.length === 1 && ROUTE_WORDS.has(parts[0].toLowerCase())) continue;
    if (parts.length === 1 && hostWords.has(parts[0].toLowerCase())) continue;

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
