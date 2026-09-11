# Judgment calls made while executing the revamp plan

`docs/REVAMP.md` is the plan and the tracker. This file is neither — it is a
running log of judgment calls I made while carrying the plan out, wherever
the plan (or SPEC/DESIGN) left more than one reasonable path and it wasn't
worth stopping to ask. Each entry names the options, what I picked, and why,
so you can reverse a call later without having to reconstruct the reasoning
from a diff. Entries are removed once you've reviewed them and either
confirmed the call or told me to change it — this file should stay short.

Nothing here is a durable decision in the SPEC.md/DESIGN.md sense (AGENTS.md,
REVAMP.md §3). If a call below turns out to matter beyond this repo's
internal structure, it gets promoted into one of those documents instead of
staying here.

---

## §4.3 — Overview section removed rather than left empty

**Question:** the finding says "Overview: delete the tile row," not "delete
Overview." But the tile row was the section's entire content once
days-since-export moved to Data.

**Decision:** removed the section from `SETTINGS_SECTIONS` entirely rather
than ship a nav item that opens to nothing. `SETTINGS_SECTIONS[0]` (Roles)
is the new default wherever `?? 'overview'` used to be.

**If you'd reverse this:** re-add `{ id: 'overview', label: 'Overview',
render: renderOverview }` at the front of `SETTINGS_SECTIONS` with whatever
content should live there — the rest of the routing (default section,
`import-apply`/`reset-confirm`'s landing section) would want revisiting too,
since those were pointed at `'roles'`/`'data'` on the assumption Overview
was gone.

---

## §4.3 — deactivation confirms by arming, not a popover or `window.confirm`

**Question:** "says what uses it" before deactivating a role or country
needed some UI. A popover (already built, used for capacity cells) was one
option; a native `confirm()` another.

**Decision:** reused the Danger zone's existing arm → confirm/cancel
pattern instead — clicking Deactivate on something with a nonzero usage
count swaps the button for a usage count plus Yes/Cancel, in place. Nothing
nobody uses, and reactivating anything, still takes one click.

**Options considered and rejected:** a popover would have meant positioning
it off a table row and closing it on outside-click, more machinery than a
two-state row already gives for free; `window.confirm` is a native dialog
outside the design system entirely, blocks the main thread, and cannot
carry the "used by N people" detail as anything but part of an alert string.

**If you'd reverse this:** the arm state lives in `view.params.confirmDeactivate`
(one id at a time, shared between Roles and Countries) — a popover version
would replace `role-deactivate-arm`/`country-deactivate-arm`'s `navigate()`
call with `openPopover()` and keep the usage-count computation
(`E.roleUsageCount`/`E.countryUsageCount`) as is.

---

## §4.3 — the zero-rate warning checks only the current calendar year

**Question:** a country's `byYear` covers four years. Warning if *any* year
is at 0, or only the one that matters right now?

**Decision:** only `new Date().getFullYear()`. A zero rate in a past year
(backfilled work, presumably already costed and frozen) or a future year
(not yet reached) isn't the "everyone here is free *right now*" problem the
finding describes — checking every year would also fire for perfectly
reasonable historical data.

**If you'd reverse this:** `zeroRate` in `renderCountries()` is one line;
checking `Object.values(country.byYear).some(y => y.rate === 0)` instead
warns for any year, not just the current one.

---

## §4.3 — settings section nav scrolls only on a real navigation

**Question:** with every section rendered at once, when should the page
actually scroll to one — every re-render (e.g. typing a role's name), or
only when the section identity changes?

**Decision:** only on a real navigation — hooked into `announceNavigation()`
(already the "did the place actually change" signal hash routing uses) plus
once explicitly in `boot()` for a deep link's first paint. A quiet
`commit()`-triggered re-render from editing whatever section is already
open never re-scrolls, which is what stops an edit from yanking the
viewport back to the top of the section the reader is already partway down.

**Rejected:** true scroll-spy (an `IntersectionObserver` tracking which
section is in view, updating the nav's highlight live as you scroll by
hand). More correct for a long document, but it means re-registering
observers against DOM nodes that get replaced on nearly every `commit()`,
and the plan's own wording ("a sticky section nav") reads more like a
jump-to-section index than a live-tracking one. `aria-current` reflects
`view.params.section` only — the last section navigated to, not necessarily
what happens to be scrolled into view after manual scrolling.

**If you'd reverse this:** add an `IntersectionObserver` in `boot()`
watching each `#settings-section-*` node, re-observing after every
`renderSettings()` call, updating a module-level "current section" used for
the nav highlight independent of `view.params.section`.

---

## §4.3 — the narrow-viewport sticky bar's header clearance is a measured constant

**Question:** `.settings-nav`'s sticky `top` has to clear `.shell-header`,
which is also `position: sticky; top: 0` — CSS does not stack sequential
sticky elements on its own, and this app has no `--header-height` token to
read.

**Decision:** `3.5rem`, a measured approximation of the header's rendered
height, used both for the wide-viewport rail (`calc(3.5rem + var(--space-4))`)
and the narrow bar (`3.5rem` flush). Caught in browser verification: without
it, the rail's first item (Roles) rendered hidden behind the header once
scrolled.

**Watch for:** a change to `.shell-header`'s padding, font size, or content
(a second row, a taller wordmark) will silently reopen this — there's no
structural link between the two values, only this note.

**Superseded by §4.4:** it bit again. The initiative detail's panels are jump
targets, so their `scroll-margin-top` needs the same clearance, which would
have been a third literal `3.5rem`. The value is now a single
`--header-height` token in `:root`, read by both `.settings-nav` rules and by
`.panel`'s scroll margin. It is still a measured approximation rather than
something computed from the header — the watch-for above still applies — but
there is now one place to re-measure instead of three. Measured again while
building the rail: the header renders 55px against the token's 56px.

---

## §4.1 — split `app.js` into per-page render modules

**Question:** the plan said "per-page render modules" but didn't say what to
do with the large amount of code several pages share (the DOM/templating
primitives, the named-table registry, the year-navigation and stacked-bar
chart code, the per-phase estimate panel used by both the wizard and
initiative detail).

**Options considered:**
1. Leave shared code in `app.js`, only pull out what's genuinely
   page-exclusive. Keeps the diff smaller but leaves `app.js` still fairly
   large (~800–1000 lines) and mixes "shared render infrastructure" with
   "app state and wiring" in one file.
2. Duplicate the shared code into whichever page needs it. Rejected outright
   — duplication is exactly what a pure-move refactor should not introduce,
   and it would let the wizard's and initiative detail's phase panels drift.
3. Extract the shared pieces into a small `src/render/` module set
   (`dom.js`, `tables.js`, `charts.js`, `phase-panel.js`), alongside
   `src/pages/*.js` for what's genuinely per-page.

**Decision: option 3.** `app.js` now holds only state, the `render()`
dispatch, and event wiring — nothing page-shaped and nothing shared-but-not-
state. Reasoning: the whole point of this row is "keeps the rest reviewable"
(REVAMP.md §4.1), and a bloated `app.js` with three unrelated concerns
(state, wiring, shared rendering) would still be the thing later rows have
to fight. The extra four files are a small, well-named surface, not sprawl.

**If you'd reverse this:** fold `src/render/*.js` back into `app.js` as
plain (unexported) functions and have each `pages/*.js` file that needs them
duplicate the ~20–200 lines instead. I'd recommend against it, but it's a
mechanical change either way.

---

## §4.1 — one file per page vs. one per overview/detail pair

**Question:** `people`/`person` and `teams`/`team` are two `view.page`
values each (an overview and a detail), sharing a domain but almost no
render code (only `person.js`'s helpers are used by `renderPerson`, and only
`team.js`'s by `renderTeam`). Combine each pair into one file, or split by
page the way the dispatch table already does?

**Decision:** split by page (`pages/people.js` + `pages/person.js`,
`pages/teams.js` + `pages/team.js`), matching the ten branches in `render()`
one-to-one. Reasoning: DESIGN §5 already treats "overview" and "detail" as
distinct page kinds, `render()`'s dispatch already treats them as distinct
pages, and `pages/teams.js` in particular would be a 35-line file glued to a
280-line one for no shared code. One page, one file, is the least surprising
rule for whoever adds the eleventh page.

---

## §4.1 — circular imports between `app.js` and `pages/*`, `render/*`

**Question:** every page needs the shared `app`/`view` state and the
`navigate`/`commit` functions that live in `app.js`; `app.js`'s `render()`
dispatch needs every page's render function. That's unavoidably circular
however the files are drawn.

**Decision:** accept the circularity rather than restructure state behind
getters/setters to avoid it. ES modules resolve circular imports correctly
as long as nothing uses an imported binding while its module is still
initializing — and nothing here does; every use is inside a function body
called well after `boot()`. Getters/setters would have meant touching nearly
every read site in the app for no behavioural gain, which the row's "pure
move" scope ruled out.

**Watch for:** if a future row adds top-level (module-scope) code in any
`pages/*.js` or `render/*.js` file that reads `app`/`view` immediately on
import (rather than inside a function), the circularity could surface a
`undefined` instead of a live binding. Keep all such code inside functions.

---

## §4.1 — `pendingImport` stayed in `app.js`, not moved to `settings.js`

**Question:** `pendingImport` (the validated-import-awaiting-a-choice state)
is read by `settings.js`'s `renderData`/`importPreviewMarkup` but written by
`app.js`'s wiring (`import-mode`, `import-cancel`, `import-apply`,
`onFileChange`). Moving the variable to `settings.js` would need a setter
function for the wiring to call, since an imported `let` binding can't be
reassigned from outside its own module.

**Decision:** left `pendingImport` declared in `app.js`; `settings.js`
imports it read-only. Reasoning: it avoids inventing a setter-function
pattern that doesn't exist anywhere else in the codebase, for a piece of
state that is arguably "wiring state" (which file a picked import is
sitting in, mid-decision) as much as it is "Settings > Data state." No
behavioural difference either way — flag if you'd rather it lived beside
the render code that displays it.

---

## §4.1 — test fixtures updated to recurse into `src/`

**Question:** `test/shell.test.mjs`'s third test read only `src/app.js`
directly (not even the already-recursive-in-spirit pattern its first test
uses), and `test/smoke.test.mjs`'s staleness check did a non-recursive
`readdir('src')`. Splitting `app.js` into subdirectories breaks both silently
— the shell test would report every action newly "unhandled" once its
markup moved out of `app.js`, and the smoke test's mtime check would stop
noticing edits to files under `src/pages/` or `src/render/` (a directory's
own mtime doesn't change when a file inside it does).

**Decision:** updated both to recurse (`fs.readdir(dir, { recursive: true
})`, Node 20+, confirmed available here on Node 24). Treated this as part of
the same row rather than a separate "while I'm here" fix — the tests were
checking an invariant ("every action has a handler," "test the artifact your
sources actually produced") that a non-recursive scan can no longer uphold
once the split exists. Skipping it would have meant landing a row that
breaks its own gate, or landing a gate that silently stopped checking what
it claims to check.

---

## §4.1 — hash routing: what the hash encodes

**Question:** REVAMP.md said "Reload restores the page, Back works, an
initiative has a link" but didn't say whether *every* piece of `view.params`
(sort order, open filter text, an expanded country row, a danger-zone arm
state, the wizard's step-1 draft, a chart's year) should survive into the
URL, or only enough to identify *which page and which record*.

**Options considered:**
1. Encode all of `view.params` (e.g. JSON-blob it into a query string).
   Gives perfect state restoration on reload/Back, but produces opaque,
   unreadable URLs, and — worse — creates a real correctness hazard: several
   `navigate()` calls bundle a param that just changed (`expanded`, `armed`)
   together with params that didn't, and a handful of code paths call
   `navigate()` twice in quick succession (a redirect-on-missing-record, the
   async `hashchange` this file's own hash write triggers). Full-fidelity
   encoding means every one of those has to be re-examined for whether the
   second write clobbers state the first one just set.
2. Encode nothing beyond `page` — reload always lands on the page but never
   the record. Doesn't satisfy "an initiative has a link."
3. Encode identity only: `page`, plus `id` for a detail (person/team/
   initiative/wizard) or `section` for Settings. Everything else — sort,
   filter, month, chart year, an expanded row, the danger-zone arm state —
   stays in-memory `view.params` and resets on reload or Back, the same way
   most sites don't restore your table's sort order when you hit Back.

**Decision: option 3.** It's what the finding text's own example
(`#/initiative/abc`) implies, it keeps URLs readable, and — the reason this
is worth recording rather than assuming — it sidesteps a real bug I found
while designing option 1: every existing `navigate()` call that bundles a
transient param together with an identity change turns out to already be one
where the identity isn't actually changing in that call (you can only reach
the control that sets `expanded`/`armed`/etc. from the page that already has
that identity). That's what makes `navigate()` comparing `location.hash`
before and after safe to gate the hash write *and* the focus/announce call
on: a filter or sort tweak recomputes to the same hash string, so it's a
no-op on the address bar, and never steals focus from the input the user is
typing into.

**If you'd reverse this:** widening what the hash carries is possible later
without a rewrite — `hashFor`/`parseHash` are the only two functions that
would need to grow. Flag it if a future row wants a shareable filtered view
(e.g. "everyone over-allocated in March," linked from outside the app) —
that's the case most likely to justify it.


---

## §4.1 — the skip link is a button, not an anchor

**Question:** a skip link is conventionally `<a href="#main">`. This app's
router owns the address fragment (`#/portfolio`, `#/initiative/abc`), so an
`href="#root"` is parsed by `parseHash()` as an unrecognised route and
canonicalised — the reader clicks "skip to content" and lands on Portfolio.

**Options considered:**
1. Keep the anchor and intercept the click with `preventDefault()`. Preserves
   link semantics, but a middle-click, a ctrl-click or any path that bypasses
   the handler still writes the fragment and navigates the user somewhere they
   did not ask to go.
2. Keep the anchor and have the router tolerate `#root` as a non-route. Spreads
   knowledge of the skip link into `parseHash`, which should only know about
   places.
3. A `<button>` that moves focus to `<main>`, wired once in `boot()` alongside
   the other global listeners.

**Decision: option 3.** The fragment is the router's, and nothing else should
write to it. A button announces as a button rather than a link, which is the
only thing given up; it is still the first tab stop, still says what it does,
and still moves focus to `#root` (which already carries `tabindex="-1"` for
route announcements). The label is set from `boot()` rather than sitting in
`index.html`, so the shell stays free of copy.

**If you'd reverse this:** swap the element for an `<a href="#root">` and add a
`preventDefault()` to the same handler, plus a `#root` case in `parseHash`.

---

## §4.1 — the copy confirmation moved from an inline note to a toast

**Question:** the plan lists `toast` among the components to build "and use
everywhere", but nothing in the app raises a transient message. The only
candidate was the copy-to-clipboard confirmation, which rendered as a
`.copy-note` span beside the Copy button.

**Options considered:**
1. Ship the toast component unused, waiting for the interaction-patterns row
   (which brings undo) to give it a user. Rejected: dead CSS in a file whose
   whole promise is that it is small, and an undocumented component is not
   really documented.
2. Leave the inline note and skip the toast entirely. Contradicts the row.
3. Route the existing "Copied" / "Copy failed" strings to a toast.

**Decision: option 3.** The strings, the trigger and the `data-act` are all
unchanged; only where the message appears moved. It is also a fix on its own
terms — those buttons sit under tables that scroll inside their own box, so the
note could easily be off-screen from the row the reader was looking at. The
`aria-live` region moved with it, so the announcement is unchanged too.

**Watch for:** `.copy-note` and the `data-note` attribute are gone. If you'd
rather have the inline note back, `tableActions()` and the `copy-table` case in
`app.js` are the only two places to touch.

---

## §4.1 — a page-head component, which moved the primary action

**Question:** every page opened with a bare `<h1>`, a `<p class="muted">` and,
on the overviews, a "New person" / "New team" / "New initiative" button at the
*bottom*, under the table. Building one `pageHead` component meant deciding
where that button goes.

**Options considered:**
1. Leave each page's markup as it was and style `h1` alone. No consolidation,
   and the eye lands somewhere different on every page.
2. A page head that takes a title, a lede and a back link, with the create
   button left where it was at the bottom. Half a component: the one control a
   page exists for stays hard to find, below however many rows there are.
3. A page head that also owns the primary action, top-right.

**Decision: option 3.** It is a layout change rather than a behavioural one —
same `data-act`, same copy, same handler — and it is the convention every
overview in every tool of this kind already uses. The empty states keep their
own copy of the button, so a first-run page still invites the action where the
reader is looking.

**If you'd reverse this:** drop the `actions` argument at the four call sites
and re-append the button after the table. Flag it if you would rather the
create action stayed at the bottom; it is a two-line change per page.

---

## §4.1 — table cells hold one line by default

**Question:** at 375px the Portfolio table's rows were 114px tall — the browser
squeezes a nine-column table into the viewport and every cell wraps. Either the
cells wrap and the rows grow, or the cells do not wrap and the table scrolls.

**Decision:** cells do not wrap; the table scrolls. `.grid th, .grid td` carry
`white-space: nowrap`, and cells that genuinely hold sentences opt out with
`.cell--wrap` (five of them: a checklist item's description, an approval
track's requirement, a gate's skip reason, an over-commitment warning, a cost
item's name).

Reasoning: the horizontal scroll was already the decided answer for a narrow
viewport, and it is only worth having if it actually buys the density it was
paid for. A 114px row costs more screen than the scroll it was avoiding, and it
does it on every viewport, not just the narrow one. The opt-out list is short
and explicit rather than a heuristic, so a new prose column is a deliberate
choice rather than something that silently starts wrapping.

**Watch for:** a new table column carrying a sentence will run off the side
instead of wrapping. That is the intended failure — add `.cell--wrap` to it.

---

## §4.4 — the process rail is the page's navigation, and a dead step is not a button

**Question:** §4.4 wants "sections: real separation and a way to navigate
between them," and §4.3 had just built one for Settings — a sticky rail plus
one scrolling page. Copy it here?

**Decision: no rail, and no second navigation device for phases.** This page
already has a horizontal stepper across the top doing most of that job, and
Settings' rail was built because Settings had nothing. Instead:

- Every panel is a `<section>` with an id, rendered from **one list**
  (`panelsFor` in `src/pages/initiative.js`) so the page, the rail's jump
  targets and the jump menu can never disagree about what exists.
- A step on the rail scrolls to the panel behind its phase.
- Separation is `.panel-stack` — a wider gap between panels, and
  `scroll-margin-top` on every panel so a jump lands with the heading clear
  of the sticky header rather than under it. (That also fixes Settings'
  section jumps, which had the same defect and nobody had noticed.)

**A jump is a scroll, not a navigation.** `data-act="panel"` calls
`scrollIntoView` and nothing else: no `navigate()`, no re-render, nothing
written to the address bar, and no `aria-current` to keep honest. The section
identity in Settings' hash exists because a settings section is a place worth
linking someone to; a panel on one initiative is not — the initiative is the
place, and it already has a link.

**A step whose phase has nothing on the page is a `<span>`, not a button.**
A phase still ahead that carries no cost and has left no gate has no panel to
jump to. Rendering it as a disabled-looking button, or as one that silently
does nothing, is worse than a segment that only reads.

**If you'd reverse this:** the jump targets are computed in `stepDetail`'s
`target`; returning `'panel-gate'` as a fallback would make every step
clickable at the cost of three steps landing on the same panel. For a full
Settings-style rail, `panelsFor` already returns exactly the `{ id, label }`
pairs one would need.

---

## §4.4 — D2's two halves land as two different things

**Question:** D2 says "seed a costed phase from the previous costed phase's
allocations where there is one; otherwise show the team roster at 0%." The
second half is a render; the first is a write. When does the write happen?

**Decision:** the roster is always there while the phase is editable, and
the seed is a button.

- **The roster at 0%** is simply what the allocation table lists: every
  active member of the team, each with a percentage field. Allocating is
  typing a number next to a name. That removes the "Allocate…" select and
  with it the hardcoded 50%, which was a magic number with no explanation.
  A 0% row costs nothing and does not warn (D2's own caveat).
- **The seed** is offered as "Copy Validation's allocations" above an empty
  table, and writes on the click. Nothing seeds on render: a panel that
  wrote allocations into the dataset merely by being looked at would be a
  worse bug than the one D2 is fixing, and there is no other event to hang
  it on — `passGate` is too late, since a gate requiring estimates cannot
  pass until every costed phase is already estimated.

**Once a gate freezes the phase the roster is gone** and only the
allocations remain. The list of people you could still add is an editing
affordance and there is nothing left to edit.

**If you'd reverse this:** `allocationPeople()` in
`src/render/phase-panel.js` decides who is listed — returning only
`phase.allocations` would restore the old table, and the select would have
to come back with it. `seedSource()` decides what the copy offer points at.

---

## §4.4 — the copied allocation table keeps the columns the screen dropped

**Question:** Day rate and Factor leave the rendered table. Should they
leave the Copy/CSV table too, so what you copy is what you see?

**Decision:** no — the copied table keeps all eight columns.

Copying a table out is the bulk version of the per-row disclosure that
replaced those columns. Someone takes an allocation table to a spreadsheet
for exactly one reason: to check the arithmetic. The columns that are noise
while you are deciding how much of someone's time a phase needs are the
ones worth having when the figure is being questioned.

The other difference: only people with an allocation are exported. A roster
row at 0% is an empty field on screen, not a line in a costing.

**If you'd reverse this:** `registerAllocationTable()` in
`src/render/phase-panel.js` builds those rows itself now, so making the
export match the screen is a matter of dropping two columns from its
`headers` and two values from each row.

---

## D9 — the recompute writes back immediately, not on the next save

**Question:** the plan flagged this explicitly as a judgment call. Once
`store.load()` extends a stale dataset's window, does the extension get
written to storage right away, or only ride along whenever the app next
calls `save()` for an unrelated edit?

**Decision:** write it back immediately, with a synchronous `saveNow`
inside `load()` itself, and only when `recomputeWindow` reports it actually
changed something.

Waiting for the next edit means a session that only reads data — someone
opens the app, looks at a report, closes the tab — never persists the new
years at all. The next load would redo the same recompute from the same
stale starting point, which is harmless but pointless, and leaves the
extension one crash or force-quit away from vanishing rather than one edit
away. `load()` already reaches into `localStorage` directly (that's the
whole module's job), so a synchronous write inside it isn't a new kind of
side effect, just an unconditional one — gated on `changed` so a dataset
already covering the window takes no extra write on every boot.

**If you'd reverse this:** drop the `if (recomputeWindow(stored, now))
saveNow(stored);` line in `store.js`'s `load()` and instead let the
mutated-in-memory `app` ride along on whatever `save()` call happens next
from normal use — the risk being a read-only session never sees it
persisted.

---

## D9 — a year that rolls out of the window is kept, never deleted

**Question:** DESIGN §2 calls it a "rolling four-year window," which could
be read as "always exactly these four years" — implying old years get
pruned as new ones are added, the same way the window's start moves forward
each calendar year.

**Decision:** `recomputeWindow` only ever adds years; it never removes one
that has aged out.

An old year still backs whatever actual cost was recorded against it —
that's the entire reason `yearRecord()`'s clamp-to-nearest fallback exists
for anything older than the window's current start. Deleting a year the
moment it rolls out would force every backfilled month from that year onto
a different rate the instant the window moved, which is the same
silent-drift failure D9 exists to fix, just triggered by cleanup instead of
by neglect. The plan's own wording backs this: "extend... as the window
rolls forward," never "prune and extend."

**If you'd reverse this:** `recomputeWindow` in `engine.js` would need a
second pass deleting any `byYear` key outside `trackedYears(now)` — but
first check whether any stored actual cost still depends on the year being
removed, since that's exactly the case this call exists to protect.
