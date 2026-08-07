# Accessibility — print-tracker

Target: **WCAG 2.2 level AA**, with a few house floors set above it.

The shared statement for all of these apps is at
<https://noahjefferson.pages.dev/accessibility>, and the app's information panel
links to it. This file is the working register for **this** app: what the gate
enforces, what is bound at design time, and every finding with its number.

**Append-only.** Rows are never deleted and never silently edited. A fixed row
keeps its original number and gains a resolution line naming the release that
fixed it.

---

## Part 1 — What the gate enforces

`tools/a11y.mjs`, run by `npm run a11y` and by CI on every push and pull request.
It exits non-zero on any failure. That single property is the difference between a
gate and a reporter.

**It serves the app over HTTP and boots it.** A gate pointed at `file://` cannot
test an app made of ES modules — the origin is opaque, every import is blocked by
CORS, and the gate would report an empty shell as clean in both themes at every
viewport, forever.

**It audits states, not pages.** A single-page app's surfaces are its views and
its dialogs, and **a closed `<dialog>` is invisible to axe**. Each state is driven
into place by the same controls a reader uses, then measured.

**The state list is derived from the markup, and the comparison fails both ways.**
Every `<dialog id>` in `index.html` must have a state that opens it, and every
state must name a surface that still exists. Adding a screen and adding it to a
list are two separate acts, and only the first is forced by wanting the feature —
so the second gets skipped exactly when a session is busy. Deriving it removes the
second act.

**Per state, per theme, per viewport:**

- **Themes** — light and dark, both, every run.
- **Viewports** — 390x844 and 320x568, at `deviceScaleFactor: 2`, plus a
  320x568-at-200%-text pass for the outcome checks.
- **axe-core** — tags `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `best-practice`.
  Any violation fails.
- **Text contrast** — hand-computed per registered selector at 4.5:1, or 3:1 for
  large text. Computed rather than taken from axe, which reports `color-contrast`
  as *incomplete* rather than a violation on transformed elements, so a green axe
  run over such content proves nothing. Against a gradient, every colour stop is
  measured and the **worst** is used. If no opaque background can be determined the
  run **fails rather than guessing**.
- **Non-text contrast** — registered control boundaries at 3:1 (SC 1.4.11),
  measured as the best available boundary signal, border or fill, since the
  criterion asks whether the component is identifiable rather than whether one
  particular property passes.
- **Touch targets** — 44 **CSS pixels**. The inline-in-a-sentence exception
  (SC 2.5.8) is applied and every element it was applied to is **printed, never
  silent**.
- **Target spacing** — 8px between non-inline targets. This is our own floor for
  tremor overshoot, not a WCAG citation. Rects are intersected with their clipping
  ancestors first, because a control inside a scroll container has a bounding rect
  that runs past the container.
- **Structure** — `lang` present, exactly one `<h1>` per state, no `<img>` without
  an `alt` attribute, no interactive element without an accessible name, no page
  errors.
- **Duplicate accessible names** on one surface fail. Two controls answering to
  one name is a coin toss for anyone driving by voice.
- **SC 2.5.3 label in name** — visible words must appear in the accessible name,
  tokenised into words from `innerText` rather than compared as one substring,
  because a control built from two elements serialises with no separator. A
  control whose visible text is a single character **and** which carries an
  `aria-label` fails outright: `"information".includes("i")` is true, and one
  character is a symbol wearing a letter's clothing.

**The registry rule.** A registered selector that matches nothing **fails the
build** — it is never skipped, because renaming a class must not silently remove
coverage. Adding a new foreground/background pair means adding it to the registry
**in the same commit** that introduces it.

**It presses things.** A page that renders correctly can be a page that does
nothing. Moving a card, logging filament and filtering are each actually
performed, in **both touch and mouse** modes, because an emulated interaction is a
claim about one input path and says nothing about the others — and the device this
app is for has no mouse.

**Outcome checks, not only minimums.** If every check on a surface is a minimum,
nothing there is measuring the product. At 320px with 200% text the gate asserts a
job card and its Move control are on screen and hit-testable, rather than merely
that some button clears 44px.

**Dismiss checks for every interrupting surface** — first-run, the information
panel, every dialog. The way out is on screen without scrolling, present again at
the end, never conditional, hit-testing its centre returns the dismiss itself, the
surface is genuinely gone afterwards rather than merely flagged closed, focus
lands somewhere real, and the panel is under a stated height.

---

## Part 2 — Bound at design time

These are not gate assertions. They are decisions the gate cannot make.

- **Meaning never rides on hue alone.** Job type is carried by its **word** on
  every badge and chip; colour is redundant reinforcement. A grayscale render
  stays readable.
- **Every drag has a non-drag path** (SC 2.5.7) — the Move button on each card.
  Declared in `INTERACTIONS.json` and checked by `tools/interactions-check.mjs`,
  which fails on a declared drag with no alternative **and** on a declaration that
  matches nothing.
- **Nothing commits on pointer-down** (SC 2.5.2). A move applies on pointer-up,
  and a pointer that leaves a valid target before release cancels it, as does
  Escape.
- **No timed gestures** (SC 2.2.1). Drag is initiated from a handle, not by
  press-and-hold, and nothing expires while someone is still aiming.
- **A destructive control never sits beside a routine one.** Delete is separated
  from Edit and Move.
- **Controls do not move when used.** A chip's selected-state tick occupies its
  space in both states, with only visibility changing, so pressing one cannot
  reflow the row under a finger already on its way.
- **Type in `rem`; touch targets in `px`.** Page zoom scales `px`, so a px-only
  stylesheet does nothing for a reader who raised their default text size instead.
  But a 44px floor written as `2.75rem` doubles every control when they do — and
  the target-size check goes *greener* as that happens, because 88 is further above
  a floor of 44 than 44 is. A finger does not get bigger when text does.
- **Media-query thresholds in `px`.** `rem` inside a media query resolves against
  the initial root font size, not the reader's, so a breakpoint written for the
  200%-text case never matches.
- **No fixed size that ignores the space available.** Panels measure the space
  they actually have at the moment they open, content that cannot fit scrolls
  inside itself, and no floor is allowed to exceed the space available.
- **The way out is wired first.** A dismiss handler is attached as the first
  statement in a panel's setup, before anything that can throw.
- **`:focus-visible` rings are never removed**, and their contrast floor is held
  by the palette gate rather than measured here — `:focus-visible` never matches a
  scripted `.focus()` in Chromium, so a runtime assertion would be measuring
  nothing.
- **Reduced motion is honoured.**
- **Status messages** (SC 4.1.3) go through a live region without stealing focus —
  saved, exported, imported, offline, update ready. **Not machine-checkable**, so
  it is declared here and hand-checked, and saying so is the point: a check that
  always passes reads as coverage.

---

## Part 3 — Findings register

No findings recorded yet. This app has not shipped a release.

Rows are added as `F-01`, `F-02` … each naming what was measured, the number, and
the release that fixed it.
