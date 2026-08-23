// The probe.
//
// THREE SEPARATE QUESTIONS PER ADDRESS, and keeping them apart is the whole value
// of this. A single "did it work" answer is what leaves everyone guessing which
// layer said no:
//
//   1. Does it DISPLAY?  A plain <img>. Needs only that the address is reachable
//      and is an image. This is what hotlinking would use, and it is not enough.
//   2. Can `fetch` READ it? Needs that host to send Access-Control-Allow-Origin.
//   3. Can a CANVAS read it? An <img crossorigin="anonymous"> drawn to a canvas
//      and read back. Needs the same header, and fails DIFFERENTLY — the canvas is
//      tainted and the read throws, rather than the request being refused. Both
//      are here because a host can satisfy one path and not the other, and being
//      told only about `fetch` would close the question early.
//
// AND ONE ABOUT US: every Content-Security-Policy refusal is recorded and
// attributed, because a refusal by our own policy looks exactly like the other
// site saying no, and would be read as an answer about them.

const $ = (sel) => document.querySelector(sel);

const EXAMPLE = 'https://makerworld.bblmw.com/makerworld/model/USb4cd954e75f587/design/3ad2d89093fc967b.jpg?x-oss-process=image/resize,w_1000/format,webp';

// Filled by the listener below and read when a result is built. A violation
// arrives asynchronously and does not always name the element that caused it, so
// this is matched on the blocked address rather than assumed.
const violations = [];
document.addEventListener('securitypolicyviolation', (event) => {
  violations.push({
    uri: String(event.blockedURI || ''),
    directive: String(event.effectiveDirective || event.violatedDirective || ''),
  });
});

function violationFor(url, directives) {
  return violations.find((v) => {
    if (!directives.some((d) => v.directive.startsWith(d))) return false;
    // A blocked URI is often truncated to the origin, so both directions.
    return url.startsWith(v.uri) || v.uri.startsWith(url) || url.includes(v.uri);
  });
}

/** Bytes, in words a person reads rather than a raw count. */
function size(bytes) {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Question 1: does the browser display it at all? */
function canDisplay(url) {
  return new Promise((resolve) => {
    const img = new Image();
    const done = (ok, note) => resolve({ ok, note, width: img.naturalWidth, height: img.naturalHeight });
    img.onload = () => done(true, `${img.naturalWidth}×${img.naturalHeight}`);
    img.onerror = () => done(false, 'the browser would not load it');
    img.src = url;
    // Nothing here is worth waiting on forever; a host that never answers is a
    // "no" for this purpose and saying so beats a spinner that never stops.
    setTimeout(() => done(false, 'no answer within 15 seconds'), 15000);
  });
}

/** Question 2: can `fetch` read the bytes? */
async function canFetch(url) {
  try {
    const response = await fetch(url, { mode: 'cors', credentials: 'omit' });
    if (!response.ok) return { ok: false, note: `the server answered ${response.status}` };
    const blob = await response.blob();
    return { ok: true, note: `${size(blob.size)}, ${blob.type || 'type not stated'}` };
  } catch (error) {
    return { ok: false, note: String(error && error.message ? error.message : error) };
  }
}

/** Question 3: can a canvas read it back? */
function canCanvas(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    let settled = false;
    const done = (result) => { if (!settled) { settled = true; resolve(result); } };

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        canvas.getContext('2d').drawImage(img, 0, 0);
        canvas.toBlob((blob) => {
          if (!blob) return done({ ok: false, note: 'the canvas produced nothing' });
          done({ ok: true, note: `${size(blob.size)}, re-encoded as ${blob.type}` });
        }, 'image/webp');
      } catch (error) {
        // The canvas is tainted: the picture drew, and reading it back is refused.
        done({ ok: false, note: `drawn but not readable — ${error && error.name ? error.name : 'blocked'}` });
      }
    };
    // With crossOrigin set, a host that sends no CORS header fails to LOAD at all,
    // which is a different message from the plain <img> above succeeding. Saying
    // both is what tells you it is CORS rather than the address.
    img.onerror = () => done({ ok: false, note: 'refused the cross-origin request' });
    img.src = url;
    setTimeout(() => done({ ok: false, note: 'no answer within 15 seconds' }), 15000);
  });
}

function row(label, result, blocked) {
  const line = document.createElement('p');
  line.className = `line ${result.ok ? 'is-yes' : 'is-no'}`;
  const strong = document.createElement('b');
  strong.textContent = `${label}: ${result.ok ? 'yes' : 'no'}`;
  line.append(strong);
  const rest = document.createElement('span');
  rest.textContent = blocked
    ? ` — refused by THIS PAGE'S policy (${blocked.directive}), so this says nothing about that site`
    : (result.note ? ` — ${result.note}` : '');
  line.append(rest);
  return line;
}

async function test(url) {
  const card = document.createElement('div');
  card.className = 'card result';

  const heading = document.createElement('h3');
  heading.className = 'result-url';
  heading.textContent = url;
  card.append(heading);

  const pending = document.createElement('p');
  pending.className = 'note';
  pending.textContent = 'Trying…';
  card.append(pending);
  $('#results').append(card);

  const display = await canDisplay(url);
  const fetched = await canFetch(url);
  const canvas = await canCanvas(url);
  pending.remove();

  const imgBlocked = violationFor(url, ['img-src']);
  const connBlocked = violationFor(url, ['connect-src']);

  card.append(row('Displays', display, imgBlocked));
  card.append(row('Bytes, by fetch', fetched, connBlocked));
  card.append(row('Bytes, by canvas', canvas, imgBlocked));

  const readable = fetched.ok || canvas.ok;
  const verdict = document.createElement('p');
  verdict.className = `verdict ${readable ? 'is-yes' : 'is-no'}`;
  if (imgBlocked || connBlocked) {
    verdict.textContent = "This page's own policy refused the request, so nothing here is an answer about that site. The header block for /probe.html did not apply.";
    verdict.className = 'verdict is-warn';
  } else if (readable) {
    verdict.textContent = 'THE BYTES CAN BE READ. This host permits a cross-origin read, so the app could copy a picture in from an address like this — if that trade is made on purpose.';
  } else if (display.ok) {
    verdict.textContent = 'DISPLAY ONLY. The picture can be pointed at but not copied in, so there is nothing the app could store. Pointing at it is hotlinking, which this app refuses.';
  } else {
    verdict.textContent = 'NOTHING CAME BACK. Check the address is the picture itself and not the page it sits on, before concluding anything about that host.';
  }
  card.append(verdict);
}

async function run() {
  const button = $('#run');
  const urls = $('#urls').value.split('\n').map((s) => s.trim()).filter(Boolean);
  if (!urls.length) return;

  $('#results-empty').hidden = true;
  button.disabled = true;
  button.textContent = 'Trying…';
  violations.length = 0;
  // One at a time. In parallel the security-policy violations arrive interleaved
  // and cannot be matched back to the address that caused them, which is the one
  // thing this must not get wrong.
  for (const url of urls) await test(url);
  button.disabled = false;
  button.textContent = 'Test these addresses';
}

async function showPolicy() {
  const box = $('#policy');
  const verdict = $('#policy-verdict');
  try {
    // Same-origin, so allowed under either policy. Reading the header off this
    // page's own response is the only way to know which one was served.
    const response = await fetch(location.href, { cache: 'no-store' });
    const csp = response.headers.get('content-security-policy') || '';
    box.textContent = csp || 'No Content-Security-Policy was sent at all.';

    const imgOpen = /img-src[^;]*https:/.test(csp);
    const connectOpen = /connect-src[^;]*https:/.test(csp);
    if (imgOpen && connectOpen) {
      verdict.className = 'verdict is-yes';
      verdict.textContent = 'This is the probe\'s own policy: pictures and requests to other sites are permitted here, so a refusal below is theirs rather than ours.';
    } else if (!csp) {
      verdict.className = 'verdict is-warn';
      verdict.textContent = 'No policy at all, which is not what production sends. Results from here do not represent the deployed app.';
    } else {
      verdict.className = 'verdict is-no';
      verdict.textContent = "THIS IS THE APP'S POLICY, NOT THE PROBE'S. Every result below would be a refusal by this page and would say nothing about the sites being tested. Use the standalone copy below instead — it runs from your disk, where no policy applies at all.";
      // Only ever emphasised, never introduced: a route that appears when things
      // go wrong is a route nobody has seen working.
      document.getElementById('fallback')?.classList.add('is-urgent');
    }
  } catch (error) {
    box.textContent = `Could not read this page's own headers: ${error.message}`;
    verdict.className = 'verdict is-warn';
    verdict.textContent = 'Unknown policy. Treat every result below as unexplained.';
  }
}

$('#urls').value = EXAMPLE;
$('#run').addEventListener('click', run);
$('#clear').addEventListener('click', () => {
  $('#results').replaceChildren();
  $('#results-empty').hidden = false;
  violations.length = 0;
});
showPolicy();
