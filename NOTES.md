# NOTES — print-tracker

The source of truth for this repo. Read it first, every session.

---

## Thesis

One place to run a 3D printing hobby that has started earning: what is being
printed and for whom, what filament is left, and which models have made money.

Three things it refuses to be:

- **Not a slicer, and not a printer controller.** It never talks to a printer.
- **Not tied to a brand.** Printer is free text. No vendor APIs, no accounts with
  anyone, no integrations to break when the machine changes.
- **Not a server product.** There is no account, no sync, and nothing leaves the
  device. Everything is in IndexedDB in the browser that opened it.

The one number the app exists to keep honest is **how much filament is left on a
spool**, and the whole data model is arranged around never storing it.

---

## Settled decisions

**A change to what the app SERVES has to carry a version, or it reaches nobody.**
Four stylesheets had their dimmed-text colours corrected on staging with no bump,
so `public/sw.js` stayed byte-identical and kept the cache name production
already ran. An installed app only goes looking for a new copy when the worker
differs; an unchanged worker IS "no update". The fix was correct in the repo,
live at the address, and would have been invisible on every device that already
had the app — which is the population it was for. **Nothing caught it, and every
relevant gate was green**: `pwa-check` asserts the cache name carries a release,
which it did, and `changelog.mjs --check` holds the version, CHANGELOG and the
in-app notes to each other, which all agreed — on the old number. Those are
checks of internal consistency, and **a release that forgets to happen is
perfectly self-consistent.** `tools/shipped-version-check.mjs` reads the SHELL
list out of `sw.js` rather than keeping a second copy of it, and refuses a commit
where a precached file differs from `origin/main` and the version does not.
Planted red against the exact state staging was in.

**Every link between records goes both ways, and a count is not a route.**
A job card said which model it printed and opened it. A model card said "3 jobs
use this model." and stopped — it named something the reader could now see existed
and gave them no way to reach it, so the route was read the number, go to the
board, find the cards by eye. **A number about records the app is holding is a
promise it can produce them.** Added in 1.2.0, with `checkJobsOnModel` pressing a
row and asserting the job that opens is the one the row named.

**A fixture that cannot express the bug makes the check decorative.**
That check's first version pressed the first job on a model card — and every model
in the seed had exactly one job, so "each row opens the job it names" and "every
row opens the first one" were the same observation. It passed a plant of the real
bug. The seed grew a second job on one model, the check presses the LAST row, and
it FAILS rather than skips if no model has two. **Plant against the fixture, not
only against the code**: a green check on a fixture with one of everything has
answered a question nobody asked.

**No two controls in one row start with the same word.**
Three on a job card read as "Open", "Open the model" and a bare site name, so the
reader had to know the answer to read the buttons. They are `Edit`, `Model` and
`On <site>` now, and `checkCardActionsDistinct` asserts the first word of every
control in an actions row is distinct — plus that the one which LEAVES THE APP is
not drawn as a button like the two that do not. Both are things a later release
undoes without noticing, because each label reads fine alone.

**Decoration goes in the stylesheet, because text is what gates compare.**
The external link's ↗ was an `aria-hidden` span for about ten minutes, and in that
time two gates in this repo disagreed about whether it was part of the visible
label: the a11y gate strips `aria-hidden` before an SC 2.5.3 comparison, the
data-safety walk did not, and one failed markup the other passed. It is a
`::after` now. The same shape bit the model card's job rows, where two adjacent
spans with no text node between them compute a name of "BenchyResearch" — a flex
gap is a painting instruction and text needs text.

**The (i) is a menu of five destinations, and five is the ceiling.**
It was one scroll of eleven headings until 1.1.0, which meant everything except
the welcome was reached by scrolling past the welcome — right on the day somebody
installs it and wrong every day after. The menu is what a reader meets, and the
accessibility gate bounds it at 900px rather than bounding the prose, because an
(i) does not become a manual by growing paragraphs. It becomes one by growing
CHAPTERS, and a chapter is visible here as a destination. The bar for a sixth is a
thing a reader will go looking for, not a thing that would be nice to document.

**One dialog that swaps its body, not six dialogs.**
Five `<dialog>` elements would have been measured for free — the a11y gate derives
its surface list from `<dialog id>` in the markup — but they stack modals on
modals and give "back" and "close" the same job. One dialog keeps a single focus
trap and a single way out. The cost is that the derivation stops covering the new
screens, so `checkInfoMenu` re-makes that assertion by hand in both directions: a
section no menu item reaches, and a menu item pointing at a section that does not
exist. **A release that moves screens out from under a derived gate has to put the
gate back by hand in the same commit, or it has quietly removed a check while
adding the thing the check was for.** Planted red on both directions before
shipping.

**Export and Import live under the (i), and the nag stays on the page.**
They were footer buttons while the welcome told a newcomer to use "Export in the
information panel" — a sentence that had been wrong since it was written and cost
nothing to the one person who already knew. Moving the controls made it true. What
did NOT move is the line saying when a copy was last kept: that is the only part
that works by being seen without being looked for, and burying it would have made
the restructure a net loss for the one thing this app cannot recover from. It is a
button now, and the route.

**Remaining weight is computed, never stored.**
Filament usage is recorded only on the job, in `job.spoolLinks`. A spool's
remaining weight is `totalWeightG` minus the sum of every job's links to it,
derived on every read by `remainingFor()` in `public/app/derive.js`. There is no
field to write, so nothing can drift it. It is a pure function called on demand
rather than a value assigned inside a render — a derived value cached by a render
is only as fresh as that render, and four surfaces read this one.

**Logged grams count immediately, whatever column the job is in.**
The alternative — counting filament only from `printing` onward — hides state:
grams would sit logged and invisible until a card moved. The inventory says this
in plain words rather than leaving it to be discovered.

**Model revenue keys on `deliveredAt`, not on the current column.**
A job stamps `deliveredAt` the first time it enters `delivered`, and keeps the
stamp when it is archived. Summing by current column instead would make a model's
earnings drop every time a delivered job was archived — money appearing to vanish
from the catalog. The model shows the job count beside the total so the number can
be checked.

**Import is atomic, and validation asks every question the write will ask.**
Shape, schema version, required fields, duplicate ids within each store, and
whether every `spoolId` and `modelId` resolves — all before anything is touched.
Then clear-and-refill in a single IndexedDB transaction spanning every store.
Validation alone cannot rule out a quota or disk failure halfway through; the
transaction can. A "replace" that clears before it writes will eventually clear
and then fail.

**The safety copy is written twice.**
The automatic pre-import export downloads *and* is written to the `snapshots`
store, because a browser download can be blocked or fail silently and that must
not be the only copy. Snapshots are bounded so the database cannot grow without
limit, and are re-downloadable from the information panel.

**Drag starts from a handle, never from a press-and-hold.**
Timed gestures are banned outright (SC 2.2.1), and a handle with
`touch-action: none` separates dragging from scrolling without a timer. Every
drag also has a non-drag path — the Move button on each card — which is what
keyboard and assistive technology use. Both are declared in `INTERACTIONS.json`
and checked.

**Undo is a snapshot of what was there, and it is memory only.**
Shipped in 0.3.0 — one gesture is one entry, cascades included. The reasoning, and
why the inverse-operation shape was rejected, is under *Undo (0.3.0)* below. This
paragraph said "no undo, deliberately, for now" until 0.4.0, three days after undo
shipped, which is what a settled-decision list does when a decision is unsettled
and nothing goes back to close it.

---

## What it cannot do now

- No per-currency formatting or conversion — a symbol you choose, and plain numbers.
- Undo does not survive closing the app or reloading the page, and an import clears
  it. Yesterday's deletion comes back from a backup, not from the Undo button.
- Restoring a backup cannot itself be undone; the way back is the safety copy taken
  immediately before it.
- No printing or PDF output.
- No multi-device sync, by design rather than by omission.
- No files attached to a model — pictures and links only.
- A picture has to be added by hand — but from 0.7.0 that can be done on the job
  form as well as the model's own screen, so it is one screen rather than two.
  Pasting an address still cannot pull the photo: reading the PAGE needs a server,
  and reading a picture's own address needs that CDN to permit a cross-origin
  read. Both would end "nothing is fetched". See "A picture's address contains no
  name" below for what was measured.

---

## Data sources

**There are none, and that is a design property rather than an omission.**
Nothing is fetched at runtime, no dataset ships with the app, and no third-party
service is contacted. Everything the app holds is what was typed into it. The
doctrine's obligations to the services we depend on are discharged here by
depending on none.

If that ever changes, this section becomes an inventory of the alternatives by
capability, with the rejected ones and the reason each was rejected.

---

## Project facts

- **Version** lives in `public/app/version.js` and is carried by the service
  worker's cache name. Both move with `CHANGELOG.md`'s top entry, in one commit.
- **`sw.js` must differ byte-for-byte between releases.** A browser replaces a
  worker by re-fetching the script and comparing bytes; identical bytes mean no
  update, ever. The version is inline in that file for exactly this reason, never
  in a registration query string.
- **The a11y gate derives its surface list from the markup.** Every `<dialog id>`
  must have a state that opens it, and every state must name a surface that
  exists. It fails both ways, on purpose.
- **Type in `rem`; size touch targets in `px`.** A px-only stylesheet ignores a
  reader who raises their default text size, but a 44px floor written in `rem`
  doubles every control when they do.
- **Media-query thresholds stay in `px`.** `rem` inside a media query resolves
  against the initial root font size, not the reader's.

---

## The lit chip was not lit, and the gate that checked it asked the wrong question (1.0.2)

0.8.1 lit a filter chip by swapping its text and border to the accent over
`--surface-raised`, leaving the unlit ones transparent on the page's own ground.
That reads as lit in a screenshot taken by whoever built it and does not read as
lit on a device.

**THE FILLS DIFFERED BY 1.63:1 IN THE DARK THEME AND 1.54:1 IN THE LIGHT ONE.**
SC 1.4.11 asks 3:1 for a non-text difference that carries meaning. So the fill was
contributing nothing and the entire state rested on a hue change from grey to
colour — which is precisely the cue a colour-blind reader may not get, and the one
the tick it replaced had been covering.

**The gate said it was fine, and the gate was the real defect.** `checkChips`
asserted that the two fills were DIFFERENT. They were — as strings,
`rgba(0,0,0,0)` against `rgb(65,65,65)`. It never asked whether the difference was
large enough for an eye. **Inequality is not perceptibility**, and a check that
confuses the two is measuring the stylesheet rather than the reader.

It measures the ratio now, against a 3:1 floor, walking up to the first opaque
ancestor because a transparent chip's own `backgroundColor` is `rgba(0,0,0,0)` and
the thing an eye compares is what shows THROUGH it. Planted red by restoring
exactly what 0.8.1 shipped: 1.17:1, refused.

**The fix is a real fill.** A lit chip carries its accent as its background with
the label knocked out in `--chip-ink` — the page's own ground, the one colour that
has to work against all four accents. Measured: 9.14–10.35:1 against the page in
the dark theme, 5.04–7.83:1 in the light one, with the label at 8.25:1 or better
on every accent in both.

**And the difference is LUMINANCE rather than hue**, which is the whole point.
Brightness survives colour blindness, greyscale and a screen in sunlight. A hue
survives none of them.

**`font-weight: 600` on the lit state lasted about a minute** — it changes the
chip's width, and the same check asserts the two states measure the same, because
a chip that grows on press moves the ones after it under a finger already on its
way. The gate written for one hazard caught another.

**The general shape, and it is the expensive one: a gate can be green because the
thing it measures is not the thing that matters.** "Are these two values
different" is answerable and useless. "Can a person tell these two states apart"
is the question, and it has a number — so ask for the number.

---

## The last filter chip could not be switched off, and the guard was pointless (1.0.1)

Turning every type off was refused, with `At least one job type has to stay shown.`
The comment above it said why: never let the reader filter everything away "with
no way to tell an empty board from a hidden one".

**That reason was false when it was written.** The board has TWO empty messages and
always did — `#board-empty` says there are no jobs, `#board-filtered` says every
job is hidden by the filters above. The distinction the guard existed to protect
was already being made, in words, ten lines further down the same file.

**So all it did was refuse an ordinary act.** Clear the lot, then turn on the one
thing you want to look at, is how anybody uses a filter. The guard forced the
other order and left the reader working out which chip the app would not release.

**0.8.1 made it worse in a way nothing measured.** A chip that will not turn off is
indistinguishable from a press that did not register — and the lit state that
replaced the tick made every other press visibly land, so the one that did not
reads as a fault in the app rather than a rule.

**The load-time reset went too, and for a stronger reason.** An empty
`typeFilter` was overwritten with every type on the next launch, so the choice was
undone silently between sessions. A setting that reverts on its own is worse than
one that is refused: the refusal at least says something. A non-array is still
repaired, because that is damage rather than a decision.

**The general shape: a guard is a claim that something bad happens without it, and
that claim can be checked.** This one named a confusion the app had already solved
in the same file. Before writing a rule that refuses the reader an action, look for
the thing that would have made the outcome legible — it is often already there.

---

## The welcome is for a stranger now (1.0.0)

**This app has an audience beyond its author, and that is what 1.0.0 means here.**
The doctrine leaves the VERSION slot to the owner, and the owner's own test for it
was documentation a newcomer can start from.

**The architecture did not change, because §7e already had it right.** One block —
`#info-orientation` — is shown as the welcome on first run and then MOVED, never
copied, into the (i) panel. There is one text to keep true rather than two that
drift, and `returnOrientation` in `info.js` puts it back when the welcome closes.

**What changed is who it is addressed to.** It used to open with what the app is
and then explain job types to somebody who already knew what a job type was here.
It now runs in the order a newcomer needs: what it is; the one fact that will lose
their data if nobody tells them; what it will not do; how to keep it; and only
then the two things about this app that cannot be guessed from any other app.

**NOT A MANUAL, DELIBERATELY, and that is written into the release notes as a
defect report route.** Everything in the welcome earns its place by being
unguessable or expensive to learn the hard way. Anything the app cannot explain
where the reader is standing is a defect in that screen rather than a missing
chapter — so "it sent me looking for documentation" is a bug report.

## The app's own explanation of itself was wrong for a day (1.0.0)

0.8.0 added Ordered and left the welcome saying **"Asked, Gift and Fun"**, that
they answer "one question — who is it for, and did they ask", and that the filters
hide "any of the three". The form offered four types while the app's own
orientation described three. Nothing failed; it was found by reading the panel.

**Prose cannot be held to code in general. This much can.** `checkOrientationTypes`
asserts that every label in `TYPES` appears in the orientation text, and that no
count word below the real number follows "the", "any of the" or "all". Both halves
were planted red against the exact 0.8.0 wording.

**Its first run failed on the install instructions** — "press the three-dot menu"
matched the count pattern. That is a false positive on honest prose, which is the
thing that teaches people to route around a gate, so the pattern narrowed to
exclude a hyphen rather than the rule loosening. Same reasoning the privacy gate
is built on.

**The general shape: a release that changes what the app IS has to change what the
app SAYS it is, and only one of those two is in the diff you are looking at.**

---

## The filter chips light up rather than carrying a tick (0.8.1)

A tick is unambiguous and asks the reader to READ a mark. A lit button is seen.
The tick also put the whole answer in a glyph about the width of a fingertip's
own shadow, on a control sized for a finger.

**The light is the type's own accent**, so the chip and the badge on the card
teach each other — a reader who has learned that cyan means Ordered on a tile
knows what the cyan chip is filtering for without reading it.

**THE RISK IN DROPPING THE TICK IS COLOUR ALONE**, and it is the whole reason the
tick was safe. If on and off differ only in which accent the text is, then
greyscale, colour blindness and a bright screen outdoors all lose the answer
(SC 1.4.1). So the states differ in FILL as well — a raised surface against the
page's own ground — and `aria-pressed` carries it to anything not looking at
pixels. `checkChips` in the a11y gate asserts the fill differs and was planted red
by making both states transparent.

**Both states keep the same border width and weight**, so nothing reflows under a
finger already moving to the next chip. That is the same reasoning that made the
old tick permanently visible rather than toggled, kept after the tick itself went.

---

## Ordered is where the money lives, and the other three stopped asking (0.8.0)

**Price charged sat on EVERY job from the first release**, so three categories in
four carried a money box that is never filled in. A form of boxes that do not
apply is how a reader learns to skim the ones that do — the same defect 0.7.1
fixed one axis over, where a category with no consequence taught them the type
did not matter either.

**The axis is now three questions rather than two:** who it is for, whether they
asked, and whether they are paying.

- `ordered` — **Ordered.** They asked and money is involved. A job of work.
- `request` — **Asked.** They asked and nothing is charged. A favour.
- `wanted` — **Gift.** For somebody else who did not ask.
- `fun` — **Fun.** For you.

**A FLAG PER FACT, NEVER A LIST OF IDS.** `hasPrice` sits beside `hasRecipient` on
`TYPES`, and `TYPES_WITH_PRICE` is what the form and the card read. The version of
this that spelled `=== 'request'` in three places is why adding the second
recipient meant finding all three; the same mistake about money would have been
worse, because the wrong answer there is a NUMBER rather than a blank.

**NOTHING WAS MIGRATED.** A job that was Asked with a price on it is still Asked,
and its price is no longer shown. Reclassifying by guessing — "it had money, so it
must have been an order" — would rewrite the reader's own record of what happened,
and the one thing worse than a wrong category is a wrong category nobody chose.

**Switching a type away from Ordered CLEARS the price**, exactly as switching away
from Asked clears the recipient. The alternative is a value the form does not show
and the app still holds, which survives into the export and into a model's
earnings with nothing on screen to explain it. Undo puts it back in one press.

## The printer was a question a research job cannot answer (0.8.0)

Two complaints, one field. It was asked on every job, and most jobs did not have
one yet — a print in Research is not on a machine by definition.

**The box is gone until the job leaves Research**, driven by the COLUMN rather
than the type. A printer is a fact about a print that exists; every type can end
up on a machine, so it is the wrong question to ask of the category and the right
one to ask of the state.

**And the printers already used are offered as a list**, read from the jobs, with
no printers table anywhere. A second record of which machines exist is a second
thing that can disagree, and renaming one would then need a migration — the same
rule remaining weight follows. Two machines of the same make are told apart by
whatever they were called, never by the make, so the list is the only thing that
can help and the app cannot invent the names.

## A saved filter cannot tell a new type from a rejected one (0.8.0)

**The nastiest thing in this release, and it would have shipped silently.** The
board's type filter is stored as the list of types to SHOW. A reader whose prefs
said `['request','wanted','fun']` has an answer that predates `ordered` — so every
Ordered job would have been filtered off their board, on the release that
introduced them, with the chips looking untouched.

**It cannot be fixed by unioning**, because "not in the list" is also exactly what
a chip the reader turned OFF looks like. The two states are identical in the
stored array and opposite in meaning, so the array cannot answer the question.

`typeFilterKnown` is the missing fact: the types that EXISTED when the filter was
last written. Anything current and unknown is new, and new is on. Turning a chip
off then writes a `known` containing it, so it stays off. Absent entirely means
prefs written before 0.8.0, where the same rule gives the right answer for the
same reason.

**The general shape: a stored preference that enumerates the things it applies to
is a snapshot of a vocabulary, and the vocabulary moves.** Store what it knew, or
store the exceptions rather than the selections.

## Five accents on a wheel that was already full (0.8.0)

Four job types plus danger, and every candidate for the fifth collided with
something. Measured rather than chosen, with `palette-check.mjs` doing the
measuring:

- **Violet** put Asked and Ordered 2.4 apart for a deutan reader — the two most
  similar categories made the hardest to tell apart.
- **Pink** sat 5.2 from danger.
- **Orange** failed a hard contrast floor outright in the light theme.
- **Cyan** leaves no badge pair as the tightest in either theme, and its
  collisions are with `danger`, which is a button colour and never a badge.

The light value is `#063036` rather than the mid-teal tried first, which measured
4.16 as text on the page and failed. Every day accent here is a dark ink on cream;
a mid-tone was the wrong family as well as the wrong number.

**The remaining note is accepted and stated:** a protan reader cannot separate
Ordered from danger. Every badge carries its WORD, so nothing here rests on colour
alone — which is the condition the gate's own note asks for.

---

## The middle job type had no meaning until it was given one (0.7.1)

**"Asked, Wanted and Fun" was confusing, and better wording was not the fix.** The
type drove exactly one thing with a consequence — `request` turned on the
Requester field and put "For: <name>" on the card. `wanted` and `fun` were
identical in every respect the app acted on: same behaviour, a different word and
colour on a badge, a different filter chip. So the reader was being asked to make
a distinction the app then ignored, every single time they added a job. That is
what it felt like, and it was accurate.

**The axis was always who it is for, and whether they asked.** With that said out
loud there are three real categories rather than two-and-a-shade:

- `request` — **Asked.** Somebody asked and is waiting on it.
- `wanted` — **Gift.** For somebody else who did NOT ask, and may not know.
- `fun` — **Fun.** For you.

**`wanted` becoming "Gift" is not a relabel; it is the category getting a
recipient.** It now asks who it is for and the card shows it, exactly as Asked
does — which is the whole difference between a category and a coloured word.
`hasRecipient` on `TYPES` is the fact, and `TYPES_WITH_RECIPIENT` is what the form
and the card read, because the version that spelled it `=== 'request'` in three
places is why adding the second one meant finding all three.

**THE ID DID NOT MOVE.** `wanted` is still `wanted` in every record, so nothing was
migrated and no export changed. Labels are display; ids are data, and keeping them
apart is what let a confusing word be corrected for free.

**THE FIRST VERSION OF THE GATE HAD THE HOLE IT WAS WRITTEN TO CLOSE.** Renaming
`Request` to `Asked` meant editing two files, so a check was added that the two
lists agree — and it compared the FORM's label against the CHIP's label, both of
which live in `index.html`. The badge's word comes from `derive.js` and was never
compared to anything. Planted red by making derive.js disagree, it passed.

It now reads `derive.js` **from the page**, with a dynamic `import()`, so the badge,
the form and the filter are held to each other rather than two of them to
themselves. The lesson is the general one: a check comparing two copies has to
compare the copy that is actually SERVED, and "two places" was itself the wrong
count — there were three.

**And the type check is behavioural rather than textual.** Every type that claims a
recipient must actually show the field, and the one that does not must not.
Otherwise "Gift" is a word with nothing behind it, which is precisely the state the
old "Wanted" was in.

---

## One screen does the whole job (0.7.0)

Five reports arrived in one sitting and four of them were the SAME DEFECT wearing
different clothes: an affordance built in one place and not in the mirror-image
place next to it. Worth naming as a class, because each one individually looked
like a feature request and the pattern is what makes them cheap to find.

- **The Title/Model mirror ran one way.** A pasted link filled the Title and the
  Title filled the Model box, so a request arrived from one paste. Naming a model
  that already exists filled nothing, and the same words were typed twice. Both
  directions now, and choosing "benchy" puts "Benchy" in the title — the model's
  own spelling, not the letters typed to find it.
- **Card to model existed; model to job did not.** 0.6.0 put a button on every
  card that opens its model. The catalog had no way to act on what it showed, so
  deciding to print something meant going to the board and typing a name the app
  already knew.
- **The job form could make a model and file its link, but not give it a
  picture.** So the one thing that makes a board card readable was the one thing
  that still needed a second trip to Models and an edit.
- **The job form had a one-paste Link box since 0.5.0; the model form never got
  one.** The short way to catalogue a link was to add a job you did not want.

**Where a picture added on the job form is KEPT, which is the only hard part.** On
the model when the job makes one, on the model when it links to one that has no
picture, and on the JOB when that model already has its own. A job form must never
silently replace the picture of a model set up deliberately — the next job for it
would show somebody else's photograph. The board has always preferred a job's own
picture over its model's and the importer has always validated the reference; that
precedence was written, checked, and unreachable, because nothing could give a job
a picture. The hint under the field says which record will hold it, and it changes
as the Model box is typed in, because the answer does.

**The undo strip was a copy of the update strip and should never have been.** Same
raised ground, same two 2px rails — right for a message about the app, wrong for
one describing what the reader just did on purpose, 9% of a phone screen tall,
permanently, on every screen. 0.7.0 made it small type on the page's own ground at
7%, with a ✕ that hid it until the next change.

**Twice on the way there, a fix was worse than what it replaced, and only a
measurement said so.** Cutting the strip's padding put the Undo button 7px under
the Models tab, under the 8px separation floor — a mis-tap on a control that
undoes things. And making its rails a hairline measured 1.49:1 against SC 1.4.11's
3:1, the same number on the same token as the time before; the comment written to
justify it argued that a strip on the page's own ground is no longer a bounded
component, and the gate disagreed. Quieter is a matter of WEIGHT and GROUND. The
colour of a boundary is not where to find it.

**And in 0.7.2 the strip was removed, which is what all of that was circling.**
Three releases were spent making a band quieter, and each fix was a smaller
version of the same wrong thing. The form was never the question a reader asks —
they know what they just did, and what they want is somewhere to take it back.
That is a button in the chrome, which is where every other program on the device
keeps it, and no amount of tuning a band arrives at one. Worth writing down as a
shape rather than an incident: **when a fix has to be repeated at decreasing size,
the thing being fixed is the wrong object.**

What the button had to keep, and does: it never expires; it says what it would put
back, in its accessible name and its title, rather than permanently on screen; and
it is there BEFORE the first change, which the strip never was. What it dropped
is a ✕ that used to cost the reader that one undo — nothing to hide, nothing to
give up. It also dropped a piece of focus management: the strip removed itself
from under the finger when the last change was undone, dropping focus to the body,
and needed code to catch that. A control that never leaves has no such problem.

---

## MEASURED: MakerWorld is display-only (2026-08-23)

**The question is answered, on real hardware, against real addresses.** Run from
the standalone copy on the owner's own machine:

    https://makerworld.bblmw.com/…/3ad2d89093fc967b.jpg
    Displays:          yes — 1000×750
    Bytes, by fetch:   no  — Failed to fetch
    Bytes, by canvas:  no  — refused the cross-origin request

**DISPLAY ONLY.** MakerWorld's image CDN serves the picture to anybody and permits
no cross-origin read of it. So there is nothing the app could copy in, and the
only thing a fetch would buy is hotlinking — pointing at their server, which tells
them every time a board is drawn, breaks when the CDN moves, and shows nothing
offline. That is the thing this app already refuses on purpose.

**So the "fetch the picture from a link" idea is CLOSED for MakerWorld**, and it is
closed for a better reason than the one everybody assumed. It was never about our
policy, or about CORS being hard; it is that the host does not permit it, and no
amount of building here changes that. Nothing was built, and now nothing needs to
be talked out of being built.

**Three of the four addresses tried were PAGE addresses**, and the probe said so
rather than reporting a CORS failure — `NOTHING CAME BACK. Check the address is
the picture itself and not the page it sits on.` That distinction is doing real
work: a page address failing looks identical to a picture being refused, and
reading the second as the first would have closed the question wrongly.

**ONE CAVEAT, and it is on the page.** A file:// page has no origin, so a host that
permits only certain sites would refuse it there and might not refuse the real
one. Hosts that permit cross-origin reads normally permit all of them, so a no
from disk is almost certainly a no anywhere — but "almost certainly" is not
"always", and if this ever needs to be conclusive for our origin specifically, the
hosted copy is the run to do.

**Still worth trying for other sites.** This is a fact about MakerWorld's CDN, not
about the web. Printables, Thangs and the rest each have their own answer and the
probe is there to get it.

---

## The disk copy reported a working run as unexplained (2026-08-23)

The standalone copy reads its own response headers to say which policy it is under —
and from `file://` a page cannot fetch its own URL, so that threw, and it printed
**"Unknown policy. Treat every result below as unexplained"** over a run that was
working perfectly and had just produced the answer above.

**That is the same defect as blaming the wrong party, pointed at itself.** The page
was built so a refusal by us could never be read as a refusal by them; crying wolf
about its own soundness is the other half of the same failure, and it very nearly
made a real measurement look untrustworthy.

It now recognises `file:` and says no policy applies, which is the point of that
copy — and shows the origin caveat there, which is the one thing that makes a
"no" from disk less than total. `probe-walk --standalone` asserts both: that the
word "unknown" never appears, and that the caveat is on screen.

---

## The probe: can a picture's address be read? (0.7.0)

`public/probe.html` answers, on a REAL machine against a REAL address, the one
question nobody here can answer by reasoning: given a picture's address, can the
browser read its BYTES, or only display it. That is a fact about the other site's
CORS headers, it differs per host and per bucket, and this sandbox reaches no
external host at all.

**It exists because reasoning about this has already been wrong once, expensively.**
A session concluded that dragging a picture from a browser into the app could not
work, from the code plus an assumption about what a browser hands over. It already
worked. The drop probe settled it in one look, and this is the same shape.

**THREE QUESTIONS PER ADDRESS, kept apart on purpose**, because a single
did-it-work answer leaves everyone guessing which layer said no. Does it DISPLAY,
as a plain `<img>` — the hotlinking case, and not enough. Can `fetch` READ it. Can
a CANVAS read it back, via `<img crossorigin>`, which needs the same header and
fails DIFFERENTLY: the canvas is tainted and the read throws rather than the
request being refused. A host can satisfy one path and not the other.

**AND ONE ABOUT US.** Every Content-Security-Policy refusal is captured from
`securitypolicyviolation` and attributed in words, because a refusal by our own
policy looks exactly like the other site saying no and would be read as an answer
about them. The page also prints the policy it was actually served, read from its
own response headers — so if the `/probe.html` block ever stops applying, it says
so instead of producing a wall of failures that look like the internet refusing.
That is not decoration: the first run of `tools/probe-walk.mjs` used an `http`
test host, our policy widens `https:` only, and the page correctly reported the
refusal as ours. The rig was wrong and the probe said so.

**THE HEADER RULE WAS WRITTEN ON AN ASSUMPTION AND THE ASSUMPTION WAS WRONG.** The
`/probe.html` block went BELOW `/*`, reasoning that a later and more specific rule
overrides the global one. On the deployed site the page was served the APP's
policy and could measure nothing. `tools/serve.mjs` had been taught the same
assumption, so the local run agreed with the guess rather than with production —
a rig is only worth its fidelity, and one built on a guess hands the guess back
with a passing grade. Both are now first-match-wins, the specific block is above
`/*`, and the gate asserts that order with the reason attached.

**AND THE ANSWER NO LONGER DEPENDS ON IT.** `public/probe-standalone.html` is the
same probe with the CSS and JS inlined, served with `Content-Disposition:
attachment` so it downloads rather than opening — on a `file://` page there is no
Content-Security-Policy at all and no header behaviour to be right about. That
header is additive, so unlike the policy block it does not depend on which rule
wins. Two routes, because one of them still rests on something unverified: this
sandbox cannot reach Cloudflare to confirm the ordering, and a second round of
"try it and see" was not an acceptable thing to hand over.

**The standalone copy is GENERATED, which is what makes a second copy tolerable.**
`tools/render-probe.mjs` builds it from the three source files and `--check` fails
on drift, the same shape as the icon. It also asserts the inlining actually
happened — a regex that stopped matching would produce a file that is "in step"
and still points at two files that are not beside it. Planted red both ways.

**The widened policy is ONE PATH.** Only `img-src` and `connect-src`, only on
`/probe.html`. The gate fails if the block is missing, is a wildcard, sits below
`/*`, if the standalone copy loses its attachment header, or if the app's own
policy ever gains permission to talk to another host.

**`tools/serve.mjs` had to learn about per-path blocks first**, and that ordering
matters more than it looks. It parsed only `/*`, so the probe would have been
exercised locally under a policy it is never served — passing or failing for a
reason about the test rig. A per-path header the local server cannot see is a
header nobody has ever run.

**`npm run probe:walk` is developer-time**, like `render:icons`. It stands up two
real cross-origin hosts over HTTPS — one sending `Access-Control-Allow-Origin`,
one not, one missing — and asserts the three verdicts come out different. It is
not in CI because making CI depend on `openssl` to test a diagnostic page is out
of proportion; `npm run pages` and `npm run probe` hold the page itself there.
**`--standalone` runs the SAME walk against the downloaded copy from `file://`**,
because the route that cannot fail is worth nothing if nobody ever ran it. Both
routes pass.

**Nothing about fetching is built, and this changes none of that.** The app makes
no request to any other host, the app's own policy still forbids it, there is no
setting, and no privacy copy was written because nothing needs it yet. The probe
is how the question gets an answer before any of that is proposed — and its own
page says what a yes would cost, so a green result is never mistaken for a
decision.

---

## A picture's address contains no name (0.7.0)

Pasting the link to an IMAGE rather than to its page offered `3ad2d89093fc967b` as
a model's name. Rejecting hashes made it offer `Design`. Rejecting route words
made it offer `Makerworld`, the host repeated as a path segment. **Three separate
wrong answers from one link, each of which looked like an answer**, and the
scoring the 0.5.0 work added could not have caught any of them: scoring picks the
best segment, and every segment here is scaffolding. Some rules have to REJECT
rather than rank.

The route-word list is the one thing here that contradicts what this file used to
say — that a list like it would be the per-vendor coupling the app refuses. That
was right about SITES and wrong about this: `files`, `design`, `download` are the
vocabulary of web paths, not knowledge about anybody's site. The host-echo rule
needs no list at all, being derived from the address itself.

**And the answer to "can the picture and the details be filled in from an image
link" is no, in two separate parts.** The details: that address contains no words
— only opaque ids — so there is nothing to read, with or without a network. The
picture: storing the bytes needs `fetch` or a canvas read, and both need that CDN
to send `Access-Control-Allow-Origin`; the app's own policy also blocks it
(`img-src 'self' blob:`, `connect-src 'self'`). Whether a given CDN allows it is a
fact about that CDN and is TESTABLE on a real machine, which this sandbox cannot
reach. Nothing has been built for it, and the trade it would cost — telling that
CDN your address every time you catalogue something, and the end of "nothing is
fetched" — is not a session's to make.

**An image cannot be read for its contents either.** There is no OCR here and
adding one would not help: a photograph of a print carries no title, no designer
and no address. Asking a model to look at the picture and describe it means
sending it somewhere, which is the same trade again.

---

## A card with no picture takes no picture-sized hole (0.5.1)

**FOUND BY RENDERING THE BOARD AND LOOKING AT IT**, which is the only way it could
have been. Hub LESSONS §124 landed the same day and says exactly this: a suite can
ask whether a thing exists, is named, is reachable by finger, contrasts in both
themes, meets the target floor and says the right words — and none of that asks
how much room it takes. Twenty-two gate steps were green over four releases while
the empty placeholder took **128px of a 291px card, 44% of every card without a
picture**, and four such cards filled 1.42 phone screens.

**The reasoning behind the placeholder was right and was being applied to the
wrong case.** `thumb.js` holds the box open so a board does not reflow as blobs
arrive — correct for a card whose picture is LOADING. A card with no `imageId`
has nothing loading and never will, so it was paying a loading cost forever.
`thumbFor` now takes `keepSpace`: false on a board card, true in the catalog,
where the picture is a column of a row and its absence would leave the list
ragged.

**The gate asserts a RELATIONSHIP, not a number** — a card carrying a picture is
taller than one that is not, and one that is not shows no thumbnail. A pixel count
would be a snapshot the next font change invalidates. Planted red: putting the
placeholder back reported 311px against 330px and named what it costs.

**And the seed had never had a picture in it.** The board state measured empty
cards exclusively, which is why nothing here could have caught this even in
principle. `makePng` moved out of the data-safety walk into `tools/png.mjs` so both
walks share one copy rather than the accessibility gate growing a second.

---

## A request arrives as a link (0.5.0)

**THE ENTRY ORDER WAS THE REVERSE OF THE ARRIVAL ORDER, and that is the whole
defect.** A request turns up as one thing: an address. The form began with Title,
so cataloguing it meant typing out a name you were holding a copy of, filling five
more boxes, saving, going to the Models tab, finding the model that had just been
made, opening it, adding a source row, and pasting the address there. Ten steps
across two screens, with the one piece of information that was actually sent
entered last.

**Link is now the first box.** It fills Title, Title fills Model, and the address
is filed on the model by `saveJob` — in the same transaction and the same undo
entry as the job, for the same reason the model itself is. For an ordinary request
that leaves who asked for it, and nothing else.

**The address goes on the MODEL.** The model is the thing that exists on somebody
else's site; the job is one instance of printing it. Print it again next month for
somebody else and it is the same address. A copy per job would be one address
written down N times, drifting apart the moment one was corrected. That is also
why a job with no model has nowhere to keep a link — and that is the right answer
rather than a gap: a thing with a source page IS a model. The hint says so before
the save rather than after.

**Deduplicated on the address as written**, minus a fragment and a trailing slash.
`/model/x` and `/model/x/files` stay two links, because deciding they are one
means knowing that `files` is a tab rather than a different page — the per-site
knowledge this app refuses to carry.

**The other end was just as backward.** The link lived only in the Models tab, so
choosing what to print next meant reading the board, leaving it, finding the
model, and coming back to move the card. Cards now carry the source as a button
labelled with the site.

**`fromurl.js` had no check of its own, and shipped returning "Files".** It was
exercised only through a browser walk that pasted one URL into one form, which
proved the wiring and nothing about the parsing. The real link somebody sends is
copied from the Files tab — `/model/905441-…-replacement/files` — and the parser
walked from the END and took the first word-looking segment. `tools/fromurl-check.mjs`
is nine URL SHAPES rather than a list of sites, each carrying the reason it is
there, and it was planted red with the old behaviour before it was believed.

Two more defects the same rewrite fixed: an interior number was dropped as if it
were an id, so "bolt-euv-2022-privacy-screen" lost its year; and the segment is
now chosen by score — an id-prefixed slug beats a multi-word segment beats a lone
word — which is structural rather than a list of route words to maintain.

**Two pre-existing defects surfaced only because a seeded model finally had a
link:** the source links under a model measured 79x19px against a 44px floor, and
`input[type="url"]` was outside the CSS list that sizes inputs, so the new box
rendered 21px tall. That list is now an EXCLUSION — every input except a checkbox,
a colour well and a hidden one — because a list of the types that count goes
narrow in exactly the direction §119 describes, and this is the second time in two
releases (§123 was the first).

---

## A job can make its model (0.4.0, 0.4.1)

**The Model box takes a NAME, not an id.** It was a `<select>` over models that
already existed, which made entering a model a *prerequisite* for recording a
job — leave the form, go to Models, add it, come back. The name is now enough.

**The store creates the model, not the form**, in the same transaction and the
same undo entry as the job. This is the picture defect from 0.3.0 in a worse key:
an orphaned picture wastes bytes, but a job whose model was rolled back
separately is a **dangling reference, which `backup.js` refuses on import** — the
reader would discover it on the day they needed the backup. `saveJob` uses
`db.writeMany(['jobs','models'])` when it creates one, so there is no instant in
which the job points at a model that is not there.

**It can never rename a model, and that is the shape rather than a rule.**
`saveJob` only ever finds a model by the typed name or makes a new one; there is
no path from the job form that writes a name onto an existing model. Editing the
box re-points the job. Renaming happens in Models, where the rest of the model is.

**Matching is on a normalised name** — trimmed, inner whitespace collapsed, case
folded — because somebody typing a model's name is naming a thing they can see,
not quoting a key. Nothing has ever held model names unique, so ties are possible
in existing data; the oldest wins, which makes the answer stable rather than
dependent on read order.

**The title fills the box until the reader touches it**, the same rule
`offerFromUrl` follows — a suggestion that overwrites what somebody typed destroys
data at the moment they were looking elsewhere. Clearing counts as touching, so
"not from a model" sticks.

**The tick box is only there for a name that is new (0.4.1).** An existing name
links whichever way it is set and an empty box means no model, so the question
"save this as a model?" has an answer in exactly one case — and a control on
screen while it cannot do anything is one nobody trusts. Declining is expressed by
withholding the name from `saveJob` rather than by a second flag the store would
have to be trusted to honour: the store's rule is *a name that matches nothing
becomes a model*, and the way to not create one is to not pass a name.

**The always-visible hint is what lets the box be free text at all.** It says
which of the three things saving will do before it does it. A hint that appeared
only on a mismatch would teach nobody what the field does, and would be a state
that is usually absent — which is a state nothing measures.

**`hidden` needs `!important`, and three controls were on screen because it did
not have it.** The UA rule is `[hidden] { display: none }`, which any class setting
`display` outbids. `.field` is `display: flex` and `.btn` is `display: inline-flex`
— so the new tick box sat in the form permanently, **and `#job-delete` had been
visible on the ADD form all along**, a Delete control for a job that did not exist
yet. Four classes in the stylesheet had each been given their own `[hidden]` rule
one at a time as they hit this; those are gone and one `[hidden] { display: none
!important }` replaces them, so the next conditional element needs nobody to
remember. Found by the target-size check reporting two controls 7px apart in a
state where one of them was supposed to be absent, and then by a registry selector
matching nothing once the fix landed.

**The add form and the edit form are separate a11y states**, because they differ
by exactly the control that was wrong: `job-edit` is the only one where Delete is
on screen, and it asserts that it is.

**Both walks assert the ARITHMETIC of their seed, not a count.** The a11y seed
makes 3 models (1 entered + 2 from job titles, with the repeated name matching)
and the backup walk 2. A four in either means matching by name broke and the
catalog is quietly doubling; a bare "expected 3" would be a number nobody could
check (hub LESSONS §119).

---

## Undo (0.3.0)

**The journal holds what was there, not how to reverse what happened.** The other
shape — every mutation paired with an un-mutation — is smaller and wrong more
often: the pairs drift, and the cascading ones need an inverse that reproduces the
cascade exactly. A snapshot of the affected records taken before the write
reverses all of them by one piece of code, and it is provable rather than clever.

**One gesture is one entry, cascades included.** Deleting a spool four jobs drew
on is one entry holding the spool and those four jobs. An undo that needed
pressing five times would be an accounting of the implementation.

**It is memory only, and that is a decision.** Undo is a correction within a
sitting. Something deleted yesterday is a restore from a backup, which export
already does properly with a file the reader holds. Persisting it would also force
a question with no good answer — whether the journal belongs in the export.

**`putImage` and `deleteImage` are no longer exported, and that is the fix.** The
picture field wrote the image itself and passed the id to `saveModel`, so the
image write sat outside the model write and therefore outside its undo entry:
undoing put the old model back and left the new blob in the database with nothing
pointing at it, costing space in every export from then on. The field now hands
over the prepared bytes and the store writes both together. Closing the export is
what stops the next caller reintroducing it.

**Reordering within a column was drag-only until this release**, and
`INTERACTIONS.json` described the gap accurately in the drag's `what` while the
`alternative` beside it did not. No gate could see it: a gate can tell that an
alternative exists and not that it does less than the drag it stands in for. The
a11y gate now presses for both halves — a column move and a position within a
column — rather than pressing whichever button happens to be first in the list.

**The proof is the same one the restore gets.** `tools/backup-walk.mjs` exports,
makes four changes of four shapes (an edit, a reorder, a cascading delete, and a
create that writes a picture), undoes all four, exports again, and compares byte
for byte. Both halves were planted red before being believed: dropping the new
picture's tombstone made the images differ and left an orphan, and a strip that
never showed failed the assertion that it had appeared.

---

## Pictures (0.2.0)

**Nothing is still fetched, and that sentence is still true.** A picture is one
the reader supplies — chosen, pasted or photographed — prepared on their own
device and stored locally. No image is ever loaded from another site, and
`img-src` carries `blob:` but no remote host, so a hotlink cannot creep in later.

**Why a URL cannot fill in the rest.** Reading a model page's title and photo
means reading a cross-origin response, which a browser refuses unless that site
sends `Access-Control-Allow-Origin` — and none of them do for their HTML. That is
the same-origin policy, not a header we control, so page metadata needs a server
this app does not have. What a URL *can* give offline is in `public/app/fromurl.js`:
the site name from the hostname, and a title guess from the path slug. Both are
offered into empty fields only, never over something typed.

**The budget is the feature.** `public/app/image.js` downscales to a 512px longest
edge before anything is stored, because every picture is held about four times
over — once live and once inside each retained snapshot's base64 — so a 2MB
original is most of a hundred megabytes by the time the backup ring has it. Three
things in that file are non-obvious and each is a real defect avoided: EXIF
orientation is applied at decode or portrait photos are sideways forever; the
encoded type is read back because `toBlob` returns PNG rather than failing when
WebP is unavailable; and nothing is ever scaled up.

**Snapshots are bounded by BYTES now, not by count.** Three snapshots of a picture
catalog is three more copies of every image, so a count-bound ring grew without
limit in the only dimension that runs out. The newest is always kept whatever it
weighs — dropping the copy taken seconds ago to satisfy a budget defeats the point
of taking it.

**`images` is a DATA store**, which is what puts it inside the atomic replace, the
export and the validator's duplicate and reference checks with no special case
anywhere. Pictures live in their own store rather than on the model record so
listing models does not drag every blob into memory to draw a text row, and they
are never held in `state`.

**A backup from before pictures existed still restores.** Schema 1 has no images
list and is filled forward, because the old file is exactly the one reached for in
a crisis.

---

## The artwork

**`icon.svg` at the root is the one source.** `tools/render-icons.mjs` writes
`public/icon.svg` from it alongside the four PNGs, and `--check` fails if the
served copy has drifted. Edit the root file, run the render, commit what it
writes. The check needs no browser so it runs in CI; it does **not** prove the
PNGs were re-rendered, because that needs a browser the runner does not have —
but one command writes both, so a stale served copy is the signature of a render
that never ran.

**The card's art is its own drawing, not a copy of the icon.** The icon is a
favicon before it is anything else and carries one shape; the card is wide enough
to carry a scene. So the icon is a nozzle and the card is a printer farm. Inside
the card the machine is drawn ONCE, in `<defs>`, and placed three times with
`<use>`; the receded pair differs only by three custom properties set on the
instance. `social-card.html` is never served, so that is a Chromium-only path
rather than a cross-browser bet.

**Two values in the card that look arbitrary and are not.** The machine's bounding
box bottom is **y406, the uprights — not y378, the bed rail**; a box taken from
the bed cuts the legs off every instance, which reads as machines sinking through
the floor rather than as a crop. And the receded pair is `#565656` / `#4a4a4a`
because they have to survive being seen at a quarter size, which is where a link
is most often met; darker and the flanks dissolve, leaving one printer and no
farm.

**Why the mark was redrawn.** The first icon was a filament spool seen face-on: a
dark hub with a light centre, inside a rounded body. That is the shape of a pupil,
and read cold the icon was thread with an eye in it. No gate catches that, and the
session that drew it was the one party that could not see it.

---

## How this is verified

`npm run check` runs every gate, and it is the same entry point CI uses — a gate
that lives only in a workflow is a gate the developer never sees until it is red
on a push.

- **`tools/a11y.mjs`** — 13 states x 2 themes x 2 viewports. It derives its state
  list from the markup and fails both ways, presses the controls in mouse AND
  touch modes, and asks an outcome question at 320px with 200% text rather than
  only minimums. Every check in it has been planted red once: a low-contrast
  pair, an undersized target, an unaudited dialog, an inert Move button, a
  diagnostic that leaked a job title, and a first-run that copied the orientation
  instead of moving it. Each produced its own message.
- **`tools/backup-walk.mjs`** — seeds through the forms, exports, wipes the
  database the way clearing site data does, imports, exports again, and compares
  record for record. Then offers five broken files — duplicate id, dangling spool
  reference, truncated, wrong format, newer schema — and asserts each is refused
  AND that the existing data is untouched afterwards.
- **`tools/shell-check.mjs`** — every module the app ships is in the service
  worker's precache list, and every listed path exists. Adding a module is
  ordinary; adding it to `SHELL` is a second step nothing reminds you about, and
  missing it fails only for a reader who is offline — invisible to whoever caused
  it. It fails the other way too, because `cache.addAll` rejects the whole batch
  on one bad path, so a stale entry empties the cache rather than shrinking it.
  Planted red both ways.
- **`tools/update-walk.mjs`** — drives genuinely different second and third
  service workers through the browser's own update machinery, then runs the app
  offline. A mocked registration proves the mock works and nothing else.
- **`tools/branch-state-check.mjs`** — the lines that say which version is on
  staging and which is in production, held against `public/sw.js` in this tree
  and at `origin/main`. It is a COMMIT GUARD declared in `.branch-guard`, not a
  step in the chain above and not in CI, because its assertion is true of a clone
  at a moment rather than of a tree: after a promote, `origin/main` on a runner is
  already the merge, so a CI step would be red by construction for a window on
  every release, and a gate that is red for a window teaches everyone to ignore
  red. A missing `origin/main` FAILS rather than skipping. Planted six ways,
  including the state where nothing is staged and the page still claims a
  candidate.

**Why that one exists at all.** On 2026-08-23 the status page said "0.7.0 is live,
nothing is waiting on staging" while 0.7.1 sat on staging, and nothing failed —
it was found by going to look. Quietkeep's equivalent block was wrong three times
in four days and all three discoveries were luck (hub LESSONS 128). Nothing about
a version number beside a URL looks stale: a broken link 404s, a generated file
fails its `--check`, a missing surface fails the walk, and a prose fact just sits
there being wrong. **Both numbers were derivable the whole time**, which is the
test worth applying to any hand-written fact in this file — a fact some file
already knows is not documentation, it is a second copy waiting to disagree.

**Not verified from here, and needing the owner's hands:** the real feel on a device, the
share sheet, home-screen install, and the iPadOS behaviour below.

## The status page (Doctrine §7i)

This work has run across several releases, so it carries a live status page. It
ships inside `public/` and deploys with the app:

    https://3d-printing-pal.pages.dev/status.html

**It used to be a published artifact and is not any more.** Every update to that
asked for permission again, so a page whose whole value is that it is always
current became a thing that had to be re-approved before it could be. It is now a
file in this repo, updated by editing it and pushing.

**Hand the link over in every reply that reports progress.** Not once at
creation — every time. Being asked for it is the signal this was skipped.

It has to carry the version on staging, the version in production, and the last
SHA verified green; what is waiting on THE OWNER marked apart from what is waiting on
the work; and what was found and NOT fixed alongside what was checked and found
not to be a defect. A page that only lists wins is an advertisement.

**It is in the deploy but not in the app, and that took two pieces.** It is absent
from the service worker's `SHELL`, which is the obvious half and is not enough on
its own: the fetch handler caches everything it successfully fetches, so one visit
would have pinned it inside the release cache and served that copy until a release
rotated the name. A page claiming to be always current would then have been stale
for exactly as long as nobody shipped. `sw.js` names both files in `LIVE` and
returns without responding, leaving them to the network. `tools/update-walk.mjs`
reads it twice against a real worker and asserts the cache kept none of it — with
the app's own `styles.css` as the control, because if nothing were cached the test
would pass while proving nothing.

**Nothing was measuring it, and it looked covered.** `tools/a11y.mjs` derives its
surfaces from `index.html`, and `palette-check` reads `palettes/3d-printing-pal.json`
rather than any stylesheet — so `status.css`, which is a hand copy of those tokens,
was checked by nothing at all. `tools/status-check.mjs` is that gate: contrast over
every gradient stop actually behind the text, bullet contrast for SC 1.4.11, axe,
that the stylesheet APPLIED rather than merely arrived, and no console errors under
the deployed headers — in both themes at two widths. It found the page had no
`main` landmark and five sections outside any landmark.

**The contrast helper is imported, not copied.** A second one was written for this
gate and it compared dark text against an assumed-black body, because the body's
background is a gradient and a gradient has no `backgroundColor` — it reported
1.32:1 in light mode and clean in dark, and both numbers were invented. Axe had
said as much by reporting `color-contrast` as `incomplete` rather than passing it.
`backdrops()` in `tools/page-helpers.mjs` is the code that gets this right; it
lives in its own file because importing it from `a11y.mjs` runs that whole gate as
a side effect of wanting one string.

---

## What a release has to go back and close

**A release that removes a limitation removes it from every list that states it**,
in the same commit. The lists are named here because a session cannot grep for a
sentence it does not know exists, and this file drifts in one direction only: it
accumulates limitations and never sheds them. `CHANGELOG.md` does not have that
problem, because the version gate holds it to the version constant. Nothing holds
these.

- **Settled decisions**, above — a decision that has been unsettled has to say so.
  It read "no undo, deliberately, for now" for three days after undo shipped.
- **What it cannot do now**, above — the entries that say *cannot* are the
  load-bearing ones, because *cannot* is what stops the next session building the
  thing. It still said the Move button could not reorder within a column.
- **The staged candidate** and **Shipped to production**, below. Both are part of
  the record commit, which is pushed straight after the promote rather than after
  a wait — see **Promoting: two waits, not three**.
- **`public/probe.html`** — the CORS probe. Hand-maintained and deployed with the
  app. If fetching is ever built or ruled out for good, this page's own "what a yes
  would cost" list is a claim about a decision that has since been made.
- **`public/status.html`** — the live status page, at
  https://3d-printing-pal.pages.dev/status.html. Hand-maintained and deployed with
  the app, so it is exactly the kind of file a release leaves behind. It replaced a
  document that had to be re-sent and re-approved every time it changed; the point
  of a live page is that there is ONE address that is always current, which is only
  true if it is actually updated.

Both stale entries were found by a later feature happening to touch the same file.
Nothing looked for them and nothing would have, and the next thing that would have
used them is a plan. Hub LESSONS §122, and §120 for what that plan costs.

---

## Promoting: two waits, not three

**A release costs a session real waiting, and the waiting is worth counting.**
There is no signal from Cloudflare that reaches a session, so every deploy is
sleep-then-read. Three deploys per release at roughly one hundred seconds each is
five minutes of a session sitting still, which is time the owner is paying for and
watching.

**The record commit is pushed IMMEDIATELY after the promote, and both are read in
one pass.** It cannot be folded into the release commit — `branch-state-check`
compares the tree against `origin/main`, so a tree claiming "1.2.0 is live" fails
the guard until 1.2.0 actually is. But nothing requires a wait *between* the two
promotes. The order is:

- push the release to `staging`, wait once, read the gates and the staging deploy
  by step. **This wait is load-bearing** — the owner tests on staging, and
  promoting an unverified candidate is the thing the branch model exists to stop.
- promote to `main`. Do not wait.
- write the record commit — `public/status.html` and this file's staged-candidate
  paragraph — push it to `staging`, promote it to `main`. It passes its guard
  because `origin/main` now carries the release.
- wait ONCE, then read both `main` deploys.

**WHAT THE SECOND PUSH CAN DO TO THE FIRST, and it must be reported rather than
absorbed.** BOTH workflows use `concurrency` with `cancel-in-progress`, so a
record commit pushed while the release's runs are still going can cancel EITHER
of them — and the two consequences are not the same size. This paragraph was
written naming only the deploy, and the first real instance was the other one, on
the very next release: Gates for `350a3ab` on `main` came back `cancelled` while
all three production deploys completed. **A hazard note that names one of two
workflows will be read as covering the case it does not.**

- **A cancelled GATES run on `main` costs nothing, and the reason has to be
  stated or it reads as a shrug.** That exact commit was already measured in full
  on `staging` — the same tree, the same 28 gate steps and 5 security steps, read
  one at a time before the promote. The `main` run is a re-measurement of a tree
  that has already passed. Say which staging run carries the evidence.
- **A cancelled DEPLOY is different, and is the one to actually check.** If the
  release's production deploy is cancelled, nothing has reached production for
  that SHA. The record commit's deploy usually covers it — its tree contains the
  release — so read THAT deploy and say plainly which SHA the log belongs to and
  that the release is its ancestor. If the record's deploy was also cancelled,
  **production is stale and the release has not shipped**: push again, or re-run,
  and read it.

A cancelled run measures nothing and is not red either, which is one of the four
ways a run lies (below). Never quote a cancelled run's URL as though it were
evidence of anything.

The staging wait stays. The saving is one wait per release, not two.

---

## Deployment

Cloudflare Pages, project `3d-printing-pal`, from `.github/workflows/deploy.yml`.
The workflow skips every deploy step until `CLOUDFLARE_API_TOKEN` and
`CLOUDFLARE_ACCOUNT_ID` exist, so it exits 0 rather than failing red during setup
— which means a green run is not by itself evidence that anything deployed. Read
the log and check whether the steps ran or were skipped.

### The staged candidate

**1.2.1 is the staged candidate**, at https://staging.3d-printing-pal.pages.dev —
the dimmed text is lighter in both themes, and the change now carries a version so
an installed app actually receives it.

**This paragraph is reset on every promotion, and a gate now checks that it was.**
Leaving a promoted candidate recorded here is how the next session concludes
something is waiting when nothing is — so `tools/branch-state-check.mjs` reads
this section's OPENING paragraph against `public/sw.js` in the tree and at
`origin/main`, on every commit.

**1.2.0 reached production on 2026-08-23.** A model card lists the jobs that print
it and each one opens on the board, and the three job-card controls that all read
as some flavour of "open" now say what they open. Promoted at `350a3ab` as a clean
fast-forward of one commit, ancestry checked with `git merge-base --is-ancestor`
BEFORE the push and the remote read back after; `origin/main:public/sw.js` carries
the 1.2.0 triplet. All 28 gate steps and 5 security steps executed and passed on
that exact commit, read one at a time; the production deploy's six steps ran and
its log named the deployment. The published address itself could not be fetched —
see the standing limit recorded under 1.1.0 below.

**1.1.0 reached production on 2026-08-23.** The (i) is a menu of five destinations
rather than one scroll of eleven headings, and Export and Import moved into "Your
data". Promoted at `3ba360a` as a clean fast-forward of one commit, ancestry
checked with `git merge-base --is-ancestor` BEFORE the push and the remote read
back after; `origin/main:public/sw.js` carries the 1.1.0 triplet. All 28 gate
steps and 5 security steps executed and passed on that exact commit, read one at a
time; the production deploy's six steps ran, and its log printed the deployment it
made. As with 1.0.2, the published address itself could not be fetched from the
session — the network proxy refuses `pages.dev` with a 403 on the CONNECT tunnel —
so the evidence is the deploy log for that commit and the triplet at `origin/main`.

**1.0.2 reached production on 2026-08-23.** A lit filter chip is filled with its
accent rather than tinted. Promoted at `97fecf4` as a clean fast-forward of two
commits, ancestry checked with `git merge-base --is-ancestor` BEFORE the push and
the remote read back after; `origin/main:public/sw.js` carries the 1.0.2 triplet.
All 28 gate steps and 5 security steps executed and passed on that exact commit,
read one at a time rather than taken from the run's conclusion; the production
deploy's six steps ran, and its log printed:

    ✨ Uploading _headers
    ✨ Deployment complete! Take a peek over at https://1f3a7422.3d-printing-pal.pages.dev

**The published address could not be fetched from this session** — the network
proxy refuses `pages.dev` with a 403 on the CONNECT tunnel. So the evidence that
1.0.2 is serving is the deploy log for that exact commit and the triplet in
`origin/main:public/sw.js`, not a request to the site. That is worth naming rather
than leaving the reader to assume the stronger check was made.

**1.0.0, 1.0.1 and 0.8.1 reached production on 2026-08-23** — the first release
meant for somebody other than its author. The welcome is written for a stranger,
the app is listed on the hub, the filter chips light up rather than carrying a
tick, and every one of them can be switched off. Promoted at `cd36645` as a clean
fast-forward of four commits, ancestry checked with
`git merge-base --is-ancestor` BEFORE the push and the remote read back after;
`origin/main:public/sw.js` carries the 1.0.1 triplet. All 28 gate steps and 5
security steps had executed and passed on that exact commit, read one at a time;
the production deploy's six steps ran, its command carried `--branch=main`, and
its log printed:

    ✨ Uploading _headers
    ✨ Deployment complete! Take a peek over at https://6c9b6f9b.3d-printing-pal.pages.dev

**THE HUB TILE WENT UP BEFORE THIS.** `noahjefferson` was pushed at `7c4d392`
while production was still 0.8.0, so for the window between the two a visitor
following the hub link got the OLD welcome — the one that said there were three
job types. Recorded because it is the §7i shape one level out: a pointer to a
thing is written before the thing it points at is ready, and only the pointer is
in the diff you are looking at. Landing them together is the fix, and it needed
the owner's word on the release to be possible.

**0.8.0 reached production on 2026-08-23** — Ordered is a fourth job type and the
one money belongs to; the printer is no longer asked for on a Research job; and a
saved type filter can no longer hide a type that did not exist when it was
written. Promoted at `1d71a08` as a clean fast-forward, ancestry checked with
`git merge-base --is-ancestor` BEFORE the push and the remote read back after. All
28 gate steps and 5 security steps had executed and passed on that exact commit,
read one at a time; the production deploy's six steps ran, its command carried
`--branch=main`, and its log printed:

    ✨ Success! Uploaded 0 files (39 already uploaded) (0.31 sec)
    ✨ Uploading _headers
    ✨ Deployment complete! Take a peek over at https://5cdcde18.3d-printing-pal.pages.dev

**0.7.2 reached production on 2026-08-23** — undo moved into the app's own bar and
the strip across the page was deleted. Promoted at `a03f721` as a clean
fast-forward of two commits, ancestry checked with `git merge-base --is-ancestor`
BEFORE the push and the remote read back after; `origin/main:public/sw.js` carries
the 0.7.2 triplet. All 28 gate steps and 5 security steps had executed and passed
on that exact commit, read one at a time; the production deploy's six steps ran,
its command carried `--branch=main`, and its log printed:

    ✨ Success! Uploaded 0 files (39 already uploaded) (0.27 sec)
    ✨ Uploading _headers
    ✨ Deployment complete! Take a peek over at https://ffd25fde.3d-printing-pal.pages.dev

**0.7.1 reached production on 2026-08-23** — the three job types renamed to Asked,
Gift and Fun, with Gift given the recipient that made it a category rather than a
colour, and the status page's own version lines put under a gate. Promoted at
`28246c1` as a clean fast-forward of two commits, ancestry checked with
`git merge-base --is-ancestor` BEFORE the push and the remote read back after. All
28 gate steps and 5 security steps had executed and passed on that exact commit,
read one at a time rather than taken from the run's conclusion; the production
deploy's six steps ran, its command carried `--branch=main`, and its log printed:

    ✨ Success! Uploaded 0 files (39 already uploaded) (0.29 sec)
    ✨ Uploading _headers
    ✨ Deployment complete! Take a peek over at https://0cf0977e.3d-printing-pal.pages.dev

**0.7.0 reached production on 2026-08-23** — one screen does the whole job, plus
the probe and the measurement it produced. Promoted at `1647c9e` as a clean
fast-forward of five commits, ancestry checked with `git merge-base --is-ancestor`
BEFORE the push and the remote read back after. All 28 gate steps and 5 security
steps had executed and passed on that exact commit; the production deploy's eight
steps ran, and `_headers` went up, which is what carries the probe's own policy:

    ✨ Uploading _headers
    ✨ Deployment complete! Take a peek over at https://055b1b2a.3d-printing-pal.pages.dev

**Every SHA in this section is evidence about a BUILD, and none of them is a
branch head.** The two differ by design and always will: the note recording a
release lands on `staging` on top of the thing it describes, so the head is later
than any SHA a paragraph here can name, and the next record moves it again. A SHA
is worth writing down when it names something that never moves — the commit whose
steps were read, the commit that was promoted. A head is worth reading with
`git rev-parse origin/staging` and never worth believing from a file. **The
paragraph that used to be here named one, and it dangled within a day**, because
the release it pointed at was replaced by the next one directly above it.

**0.6.0 reached production on 2026-08-23** — the model a job prints is named on
its card and opens from there, and the job type is three buttons instead of a
dropdown. Promoted at `caa3f6e` as a clean fast-forward of two commits, with the
ancestry checked using `git merge-base --is-ancestor` BEFORE the push rather than
inferred after, and the remote read back rather than the push output believed.

**Verified at `caa3f6e`.** All 21 gate steps and 5 security steps **executed** and
passed, read one by one rather than taken from the run's conclusion — nothing
skipped. The production deploy's eight steps all ran, its command carried
`--branch=main`, and its log printed:

    ✨ Success! Uploaded 0 files (35 already uploaded) (0.28 sec)
    ✨ Uploading _headers
    ✨ Deployment complete! Take a peek over at https://a9036a15.3d-printing-pal.pages.dev

**`Uploaded 0 files` is not a skipped deploy**, and it is worth knowing before it
is met at a bad moment. It is Cloudflare's content-addressed store recognising the
identical tree from the staging deploy of the same commit — every promotion that
is a clean fast-forward will say it. The deployment still happened, which is what
the `🌎 Deploying...` line and the address after it are. A genuinely skipped deploy
has no wrangler group in the log at all, which is the distinction §53 is about.

Three of those steps had never run in CI before this release: `App shell`,
`A pasted address becomes the right name` and the new `Status page`. The first two
were not new gates — they had been in the local chain for a release and longer,
passing on a laptop and nowhere else. See "A gate can be written, planted red, and
never run on a runner", below.

**0.5.1 reached production on 2026-08-22** — a job with no picture no longer
leaves a picture-sized gap. It is the release 0.6.0 replaced.

**0.1.1 never reached production on its own, and that was deliberate.** Its entire
content was the link preview card, which 0.1.2 redrew; promoting it separately
would have shipped artwork already replaced. Both went in the same promotion.

That alias is the candidate's standing address and is the only one worth writing
down here. **Every deploy also gets its own immutable `<hash>.3d-printing-pal.pages.dev`
address, and that one is printed in that deploy's own log** — so it is never
recorded in this file, which would make it one release stale the moment the next
push landed. Read it from the run when a specific build needs pinning.

**If the alias does not resolve, the per-deployment address will.**

**What is confirmed and what is not.** Every deploy's steps are read from the run
rather than inferred from the workflow exiting 0, which a fully-skipped deploy also
does. Whether any of these addresses actually renders in a browser has **not** been
confirmed from a session: this sandbox reaches no external site at all — a
known-good address returns the same failure as a new one — so a session not loading
the app says nothing about the app.

**The Cloudflare secrets already existed on this repo.** The first push to
`staging` deployed with no setup step and created the Pages project as it went.

### A CI step naming a hub gate has two inputs, and adding it supplies one

The pin at the top of `gates.yml` is the other one. A step reading
`node .hub/<gate>.mjs` is character-for-character what runs locally, where the hub
is a sibling clone at its own HEAD — so it can be watched passing on the only path
that says nothing about a pinned checkout. `third-person-check.mjs` was wired in
against a pin from before that file existed and could only ever print
`Cannot find module`.

**Move the pin in the same commit as the step, and verify the file is present at
the new SHA** (`git cat-file -e <sha>:<file>` in the hub clone). The remedy is
written beside the pin too. Hub LESSONS §117.

### A gate can be written, planted red, and never run on a runner

`npm run check` is one `&&` chain in `package.json`; `gates.yml` runs the same
gates as separate NAMED STEPS, deliberately, because a run that reports one red X
cannot be read by step and reading by step is what this repo learned the hard way.
The cost of that is two lists, and nothing was comparing them.

`shell` and `fromurl` were added to the chain and never to the workflow. Both were
written, both were planted red, both passed locally, and **neither had ever run in
CI** — `fromurl` for a release and `shell` for considerably longer. Nothing was
wrong with either gate. They simply were not there, and a green Gates run said so
in exactly the way it says everything else.

This is worse than a missing gate, because the chain passing locally reads as
coverage. It is the same shape as the deploy that never ran: the evidence that
something happened is a green thing that never looked.

`tools/gates-parity.mjs` compares the two lists in both directions and knows the
two spellings CI uses — `npm run --silent <name>`, and a hub gate invoked directly
as `node .hub/<file>.mjs` where the chain spells it `../noahjefferson/`.
Exemptions are a declared list with a reason each, not a pattern. It asserts its
OWN presence on both sides, so removing it from either is caught from the other.

It went red on six real items the first time it ran, including one exemption that
was wrong: `guard` looked like a CI-only gate and is not — CI invokes
`branch-guard.mjs` directly rather than through npm, and the chain does not run it
at all.

### A red gate does not stop a deploy — known, and not yet fixed

`Gates` and `Deploy` are separate workflows with no dependency between them, so a
push whose gates FAIL still deploys. That happened on 0.1.1: the social-card check
was ordered before the step that installs the browser it needs, so it failed on
the runner, every gate after it was SKIPPED, and the candidate deployed anyway
having been measured by almost none of them.

The ordering is fixed. **The structural gap is not**, and it is worth stating
plainly rather than leaving to be rediscovered: nothing currently stops a build
that failed its own gates from reaching production.

The fix is to move the deploy job into `gates.yml` with `needs: [gates, security]`
so the dependency is structural rather than remembered. It is deliberately not
done here, because coupling a deploy to a gate is exactly how a release silently
stops arriving, and that trade is the owner's to make rather than a session's to
slip in at the end of an unrelated change.

### Shipped to production

**0.5.0 reached production on 2026-08-22**, at https://3d-printing-pal.pages.dev

A request arrives as a link, so the link is the first box on a job. Promoted with
`git push origin staging:main` on the owner's explicit say-so, as a clean
fast-forward of two commits — ancestry checked with `git merge-base --is-ancestor`
BEFORE pushing, and the remote read back afterwards rather than the push output
believed. The head promoted, `71a0707`, is also the commit whose gates were read:
22 gate steps and 4 security steps confirmed to have EXECUTED. The deploy's steps
ran rather than skipped, and its log printed:

    npx wrangler pages deploy public --project-name=3d-printing-pal --branch=main
    ✨ Deployment complete! Take a peek over at https://e8996e58.3d-printing-pal.pages.dev

**DRAGGING A PICTURE OUT OF A BROWSER INTO THIS APP ALREADY WORKS, and a session
said it did not.** The claim was reasoned from `firstImage()` — which accepts only
files — plus an assumption that a browser hands over a URL and not bytes when you
drag a web image. The assumption is wrong. Measured with a drop probe on a real
machine: the drop carries `file · image/webp` in `dataTransfer.files` alongside
`text/uri-list`, so `firstImage` finds it and the existing path stores it. Written
down because the shape of the error is expensive — a later session reading
"dragging does not work" would build a feature that already exists.

Two limits found the same way. Printables' carousel swallows the drag on its main
image, so that site needs copy-and-paste or the image opened in its own tab; and a
drag hands over the site's already-optimised file (112 KB webp) where a copy hands
over a re-encoded bitmap (1.04 MB PNG), which makes no difference after the
downscale but makes dragging the cheaper gesture.

**And the fetch idea is closed.** Loading the picture from a model-page link was
never blocked by CORS on images — it is blocked by not being able to read the PAGE
to find the image address. Even granted a perfect fetch, the app could only work
from an image address the reader pasted, which is more work than copying the image
itself. Nothing to build, and the app's "nothing is fetched" stays true.

**0.3.0, 0.4.0 and 0.4.1 reached production on 2026-08-22**, at
https://3d-printing-pal.pages.dev

Undo and a non-drag reorder; a job that makes its own model; and the choice not
to. Promoted with `git push origin staging:main` on the owner's explicit say-so, as
a clean fast-forward of nine commits — `git merge-base --is-ancestor` was checked
before pushing rather than after, and the remote was read back rather than the
push output believed.

The head promoted was `7d3bad0`, and it is also the commit whose gates were read:
22 gate steps and 4 security steps confirmed to have EXECUTED. The deploy's steps
RAN rather than skipped, and its log printed:

    npx wrangler pages deploy public --project-name=3d-printing-pal --branch=main
    ✨ Deployment complete! Take a peek over at https://5c2ccc75.3d-printing-pal.pages.dev

**Three releases went together because they build on each other.** 0.4.0's model
creation is undoable only because 0.3.0 exists, and 0.4.1 is the choice not to
create. Shipping any one alone would have put a half-finished idea in front of a
reader.

**One defect in here predates all three.** `[hidden]` is a UA rule at zero
specificity, so `.btn { display: inline-flex }` outbid it and the Delete button
had been on the ADD job form since that form was written. Fixed in 0.4.1 by one
global rule rather than a fifth per-class one. Hub LESSONS §123.

**0.2.0 reached production on 2026-08-09**, at https://3d-printing-pal.pages.dev

Pictures on models and job cards. Promoted with `git push origin staging:main` on
the owner's explicit say-so, as a clean fast-forward of the one release commit.
The deploy's steps RAN rather than skipped, and its log printed:

    npx wrangler pages deploy public --project-name=3d-printing-pal --branch=main
    ✨ Deployment complete! Take a peek over at https://d3620631.3d-printing-pal.pages.dev

**This is the release that moved the database.** `DB_VERSION` went 1 to 2 and the
export `SCHEMA` went 1 to 2. A reader arriving from 0.1.2 keeps everything they
had — the upgrade only creates the missing `images` store — and a backup written
by 0.1.2 still restores, because `validate` fills the absent images list forward
rather than refusing the file.

**0.1.2 reached production on 2026-08-08**, at https://3d-printing-pal.pages.dev

Promoted with `git push origin staging:main` on the owner's explicit say-so. The
production deploy's steps RAN rather than skipped, and its log printed:

    npx wrangler pages deploy public --project-name=3d-printing-pal --branch=main
    ✨ Deployment complete! Take a peek over at https://5e3cdabf.3d-printing-pal.pages.dev

**The promoted commit was `2623a6b`, not the release commit `d1147f6`.** A
NOTES-and-marker commit had landed on top of the release, and a promotion ships
the branch HEAD rather than the release commit — so the HEAD is what has to be
green, and it was checked as such rather than assuming the release commit's run
covered it.

This carried 0.1.1 to production too. It had been on staging unpromoted, and its
only content — the link preview card — was redrawn by 0.1.2, so promoting it
alone would have shipped artwork already replaced.

**0.1.0 reached production on 2026-08-08**, at https://3d-printing-pal.pages.dev

Promoted with `git push origin staging:main` on the owner's explicit say-so, which
is what the staging gate waits for. The production deploy's steps RAN rather than
skipped, and its log printed the deployment:

    npx wrangler pages deploy public --project-name=3d-printing-pal --branch=main
    ✨ Deployment complete! Take a peek over at https://9a6e32b1.3d-printing-pal.pages.dev

**Ordering worth keeping.** The deploy concurrency group is per-ref, so a second
push to `main` cancels the first's in-flight deploy — and a cancelled run concludes
`cancelled` rather than `failure`, which reads like nothing happened. Promote, read
the deploy, and only then push anything else to `main`.

---

## The privacy scrub, 2026-08-20

**This repo was scanned for the first time and came back clean of content.**
Both halves of the rule were checked: nothing personal about the owner, and no
quotation or attribution of anybody's words — the owner's or a third party's.

What was actually run, and what each returned:

- `node ../noahjefferson/privacy-check.mjs --repo .` — 0 disclosures across
  tracked files.
- `node ../noahjefferson/quote-check.mjs --repo .` — 6 tracked markdown files
  read, 0 set-apart quotations, so 0 declarations owed and no `.quote-allow`
  needed here yet.
- A wider sweep than either gate performs, over every tracked `.md`, `.ts`,
  `.mjs`, `.js`, `.html` and `.yml`, for any quotation of 20 to 300 characters
  carrying a first- or second-person pronoun or sitting after a speech cue:
  **17 candidates, all read, all legitimate.** Sixteen are the app's own patch
  notes in `public/app/releases.js`, which address the reader in the second
  person on purpose; one is the reader's own voice in a design comment in
  `public/app/ui/backup-ui.js`; one is `tools/notes-voice.mjs` citing product
  copy to explain its own rule.
- A grep for facts about the owner or any third party — a person's device, a
  family member, a friend, reported speech. Every hit was a process fact about
  the release gate or the licence notice, not a fact about a person.

**The scan is the scrub; the gates are its floor.** Both gates were green on
this repo before any of the above ran, and the wider sweep is what makes that
green mean something. A scan returning nothing is indistinguishable from a scan
pointed the wrong way, so the sweep's shape is recorded here rather than its
result alone.

**The gates now run in CI, and each was watched failing first.** `gates.yml`
already ran `privacy-check.mjs`; it now also runs `quote-check.mjs` beside it
and `branch-guard.mjs --repo . --artefact`. Each was verified by planting a
SYNTHETIC violation — a fabricated sentence, never a real one, because planting
a real quotation to prove the gate catches quotations puts it back in a tracked
file permanently. All three exited 1 on the plant and 0 once it was removed.

**The hub pin in `gates.yml` was stale, and would have failed the two new
steps.** It named a hub commit that carries `privacy-check.mjs` and neither
`quote-check.mjs` nor `branch-guard.mjs`, and which is not an ancestor of the
hub's current `main` at all. Both checkout steps now pin
`6da5c6e765538fed5dd702e9d9e40a5d80001fea`, which carries all three. A
cross-repo gate depends on the other repo's published history: check that the
pinned SHA carries the file before adding a step that runs it.

**The branch guard is installed.** `.branch-guard` declares `work=staging`,
`promote=main`, `escape=PAL_PROMOTE`, and `package.json` gained a `prepare`
script so `npm ci` reinstalls the hook into `.git/hooks` in every fresh clone
and every CI job.

**Git history is out of scope and the question is settled.** A history scan
coming back red is not new information and is not a reason to reopen it.

---

## Roadmap

- Undo for destructive actions.
- Reordering within a column from the Move control, not only by drag.
- A low-filament warning threshold that can be set per material.
