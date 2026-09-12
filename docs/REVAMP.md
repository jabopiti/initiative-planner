# REVAMP: from white-label core to a tool that is good out of the box

**This is a temporary working document.** It sequences one body of work and
holds the decisions that work waits on. It is not a third authority beside
[SPEC.md](SPEC.md) and [DESIGN.md](DESIGN.md): every durable decision made
here moves into one of those two in the commit that implements it, and this
file is deleted when the last workstream lands.

The goal is not "the same tool, tidier". It is a tool that is genuinely good
the moment it is opened, where the brand pack adjusts a good default rather
than rescuing a raw one. Where a change contradicts SPEC.md, it is called out;
those are conversations before they are code (AGENTS.md).

---

## 0. Where this stands

Judgment calls made along the way, for you to review or reverse, are logged
separately in [REVAMP-decisions-log.md](REVAMP-decisions-log.md) rather than
here — this table is status only.

| Workstream | Status |
|---|---|
| Silent-write bug (§4.7, first half) | **Landed** — `ae327ab` |
| §4.1 Foundation — split `app.js` | **Landed** |
| §4.1 Foundation — hash routing | **Landed** |
| §4.1 Foundation — design system | **Landed** — direction approved by Bo |
| §4.1 Foundation — adopt Farn's accent/ok hues | **Landed** |
| §4.1 Foundation — formatting module | **Landed** |
| §4.1 Foundation — interaction patterns | **Landed** |
| §4.2 Entity flows | **Landed** |
| §4.3 Settings — page structure, copy/behaviour findings | **Landed** |
| §4.3 Settings — working days as absolute values | **Landed** — `schemaVersion` 2 |
| §4.3 Settings — bulk entry for rates/working days | **Landed** |
| §4.4 Initiative detail — description/notes, delete, period validation | **Landed** |
| §4.4 Initiative detail — panel structure and the process rail | **Landed** |
| §4.4 Initiative detail — the gate panel, in three parts | **Landed** |
| §4.4 Initiative detail — the sticky summary bar, and the jump menu | **Landed** |
| §4.4 Initiative detail — the allocation table, and D2 | **Landed** |
| §4.4 Initiative detail — the wizard's ending, and the month table's foot | **Landed** |
| §4.5 Overviews, capacity, charts | **Landed** |
| §4.6 Copy, states, first run, accessibility | **Landed** |
| §4.7 File System Access persistence | **Landed** |
| §4.8 Brand pack | **Landed** |
| D3 — drop CSV, keep Copy | **Landed** |
| D9 — rolling four-year window recompute | **Landed** |

**How this gets built.** Sonnet 5 at `xhigh` effort is the default — the plan
below is specified enough to carry it, and it is 2.5x cheaper than Opus 5.
Escalate to **Opus 5 at `xhigh`** for exactly two rows: the design system and
the initiative detail. Those are invention rather than execution, with no spec
to check the result against, which is the only thing that justifies the cost.
Switch models at a row boundary and never mid-row: caches are model-scoped, so
a switch mid-task throws away the cached context and pays to rebuild it.

Judge this by cost per finished row, not per request. A cheaper model that
needs three browser round-trips to get the caret invariant right was not
cheaper. If the `app.js` split comes out clean on Sonnet, keep it as the
default for every mechanical row; if it needs heavy correction, move up.

All nine decisions (§1) are settled; nothing is blocked on an answer. Update
this table in the commit that finishes a row — it is the only record of
progress there is. §4.1's rows are five separate commits by design (§4.1);
the other workstreams are one each unless they turn out to want splitting
too.

---

## 1. Decisions taken

| # | Decision | Settled |
|---|---|---|
| D1 | **Editing and saving: hybrid, split by cost of the mistake.** A Save button exists only where cancelling has to be possible; everything else autosaves and offers undo; anything irreversible confirms. | ✅ |
| D2 | **Allocation defaults: both.** Seed a costed phase from the previous costed phase's allocations where there is one; otherwise show the team roster at 0%. | ✅ |
| D3 | **Drop CSV download, keep Copy.** Edits SPEC §8, which currently mandates CSV. | ✅ |
| D4 | **File System Access API**, as an optional binding over localStorage — never a replacement, since it is Chromium-only. | ✅ |
| D5 | **Sharing is a shared file**, last-writer-wins, with the existing import/merge as the reconciliation path. No real-time sync; that would reopen SPEC §1. | ✅ |
| D6 | **English only.** No locale knob in the brand pack. | ✅ |
| D7 | **A cross-team capacity view**, answering over-allocation across the whole organisation for a month. A SPEC addition. | ✅ |
| D8 | **Widen the brand pack's design surface** — accent plus a neutral ramp, radius, density, type scale, font and wordmark. Still tokens, still no framework. | ✅ |
| D9 | **Implement the rolling-window recompute** DESIGN §2 describes, rather than correcting the document down to what the code does. | ✅ |

**D1 in detail.** Creating: a draft form with Save/Cancel where required fields
cannot be guessed (initiative, person, team); inline row-add with immediate
creation for lightweight master data (role, country, cost line, membership),
where a wrong row is one click from gone. Editing: autosave, with Undo on the
last change. Destroying: confirm delete, deactivate-with-allocations, reset,
import-replace, and passing a gate. The initiative wizard stays as it is — a
flow is not a form, and its create-at-step-1 resumability is a recorded
decision.

**D2 caveat.** A stranded allocation warns because it keeps costing (SPEC
§5.2). A 0% allocation costs nothing and must not warn.

**Two settled decisions had no row.** A pass to bring this document current
(prompted by the Farn-hues addition above) found D3 and D9 fully decided but
never scheduled anywhere in §4 or §0's table — an oversight in the original
plan, not a change of mind. Both are engine/data or shared-component work
with no dependency on the design system, formatting, or interaction-patterns
rows, so both are addable to §0's table as independent, land-whenever rows
rather than slotted into a specific §4.x section:

- **D3 — drop CSV, keep Copy.** Remove the "Download CSV" button `tableActions()`
  renders beside every table, and the `downloadCsv`/`toCsv` code path behind
  it in `store.js`/`transfer.js` once nothing calls it. Edit SPEC §8, which
  currently mandates CSV, in the same commit (AGENTS.md: a doc describing
  behaviour the code doesn't have gets fixed in the commit that changes the
  behaviour).
- **D9 — the rolling four-year window recompute.** `store.load()` returns
  stored data verbatim; DESIGN §2 says the window should extend forward on
  load, seeding a new year from the nearest existing one. Touches
  `store.js`'s `load()` and `masterData.js`'s `trackedYears()` (or wherever
  the equivalent lives once this is built) — no render files.

**Landed — D9.** Before coding, the question the plan flagged — whether
`WINDOW_BEFORE`/`WINDOW_AFTER`/`trackedYears()` should move out of
`masterData.js` (a brand-pack file) into `engine.js` — went to Bo rather
than being decided while implementing. Bo chose the move: window length is
process logic the build owns, not seed data a fork edits freely.
`masterData.js` bumped to brand-pack contract version 2 and now imports
`trackedYears` to seed against, rather than defining it.

`E.recomputeWindow(app, now)` extends every country's `byYear`, and every
custom-rate person's, to cover the window as of `now`, cloning the nearest
existing tracked year rather than seeding from zero. It only ever adds
years — a year that has rolled out of the window stays rather than being
deleted, since an old month's actual cost must still be able to reproduce
the rate it was recorded under; deleting it would trade one silent-drift
bug for another. `store.load()` calls it on a successful load and writes
the result back immediately via `saveNow` when anything changed, so the
extension survives a reload with no further edit needed. No
`schemaVersion` bump — the shape is unchanged. `render/charts.js`'s
same-named `trackedYears()` (a different, data-driven function) needed no
change, exactly as the plan predicted: it becomes correct for free once
the underlying data actually has the right years.

Verified in a real browser: seeded `examples/exports/demo.json`, then
deleted 2027 and 2028 from every country's `byYear` and from the one
custom-rate person's, to simulate a dataset seeded years ago. On reload,
both years came back on every country and the custom-rate person, each
equal to 2026's record (the nearest survivor) and never zero; Settings'
Countries & rates section showed all four years with real rates and
working days; the Portfolio chart's year nav reached 2028 (correctly
disabled past it) with no console errors.

**Landed — D3.** The "Download CSV" button is gone from `tableActions()`,
along with its `case 'csv-table'` handler in `app.js`, `downloadCsv` in
`store.js`, and `toCsv`/`csvCell` in `transfer.js` — `downloadBlob` stays,
since `downloadExport` still uses it. The CSV-quoting test in
`test/people.test.mjs` went with the code it tested; the TSV and rich-HTML
copy tests it sat beside are untouched. SPEC §8 now says a table "can be
copied" rather than "copied ... or downloaded as CSV." Verified by reading
the built page: every table's action row now shows one button.

---

## 2. What a full read of the code turned up

The review stopped early, on the correct instinct that the overall problems
came first. Reading the whole app against it found four things the notes never
reached — and one of them is a straight functional gap.

### 2.1 Reachability and shape

**Resolved, all five findings below — hash routing and the design system row
between them.** Left in place for the reasoning, which is still why each fix
looks the way it does; nothing here still describes current behaviour.

**No URL routing, and no history.** `view` is a module variable. Reloading
always lands on Portfolio, an initiative cannot be bookmarked or linked, and
the browser Back button leaves the app entirely. This is the single largest
gap between how the tool behaves and how a web app is expected to behave.
Fix with **hash routing** (`#/initiative/abc`) — not `pushState`, which does
not work when the single file is opened from `file://`, and being openable
from disk is the whole point of the artifact.

**Nothing is responsive.** `styles.css` contains exactly one `@media` query
and it is `prefers-color-scheme`. There is no breakpoint, no nav collapse, no
plan for what a twelve-month capacity grid does on a narrow viewport.

**`main` never takes focus on navigation.** `navigate()` swaps the root's
contents and nothing tells a screen reader the page changed. There is no skip
link.

**Focus is styled on `.field` and nothing else.** Buttons, links, tiles, cards
and rows have no visible focus ring at all, which makes the app unusable by
keyboard in practice. Making rows clickable (§4.2) makes this worse before it
makes it better.

**No motion anywhere**, so nothing yet honours `prefers-reduced-motion`.

### 2.2 A functional gap: description and notes have no UI

`initiative.description` and `initiative.notes` are both in the data model.
`lifecycle.js` exports `setDescription` and `setNotes`. Both are covered by
tests. **Neither is reachable from the interface.**

- The description is collected in the wizard and then never shown or edited
  again.
- Notes has no input at all — and notes is the field SPEC §6.4 singles out as
  the one thing a closed initiative must still accept, "because recording why
  something ended is exactly what a finished initiative still needs to
  accept". The spec'd behaviour exists in the engine and is unreachable.

This is a bug, not a decision. It gets fixed in §4.

### 2.3 Localisation is missing from the brand pack

`formatMoney` hardcodes `toLocaleString('en-GB')`. Dates and months render as
raw ISO strings — `2026-01`, `2026-01-01` — everywhere they appear. And
`readNumber` strips everything except `[0-9.-]`, so a comma decimal separator
silently produces the wrong number.

A white-label build shipped to a German organisation therefore gets English
digit grouping, ISO dates, and a number field that mis-parses what its own
users type. **Settled by D6: English only** — no locale knob. What remains is
one formatting module owning money, dates, months and numeric parsing, so the
ISO strings and the silent mis-parse both go away without a locale surface.

### 2.4 Capacity has no cross-team view

Capacity exists per team and per person. There is no way to ask "who is
over-allocated anywhere next March" without opening every person in turn, and
Portfolio explicitly disclaims the question ("Capacity is a per-team and
per-person question and lives on those pages"). For a tool whose stated pitch
is that cost and capacity are **co-equal** outputs (SPEC §1), the dashboard
answers only one of them.

### 2.5 Smaller findings

- **First run says nothing.** `store.load()` computes a reason — `empty`,
  `schema`, `process`, `unreadable` — and `boot()` returns it to nobody. A
  fresh install lands on an empty Portfolio with no guidance; worse, a stored
  dataset dropped for a schema or process mismatch is silently replaced by
  seed data with no message at all. That one is data-loss-shaped and should
  not be silent.
- **The wordmark is hardcoded.** `boot()` sets it from a literal
  `'Initiative Planner'` in `app.js`, while `index.html`'s comment claims the
  wordmark "like every other label, comes from the data model". The comment is
  wrong and it is a hole in the brand-pack contract.
- **Closed and cancelled initiatives never leave the list.** No archive, no
  default filter, so the overview grows monotonically.
- **No validation at the point of input.** End before start, share over 100%,
  negative rates: some of these surface later as derived warnings, none of
  them at the field.
- **No global search or command palette.** Every lookup is page-by-page.
- **Team cards carry no cost or capacity figure** — members, share and
  initiative count only.
- **The month-by-month table has no totals row.**
- **The Process page is unlinked from where it is needed** — the gate panel
  should link to the definition of the gate it is describing.
- **Dead code**: `render()`'s "this page arrives in a later phase" fallback is
  unreachable and would throw if it were reached; `stackedBarsMarkup` carries
  two stacked JSDoc blocks.

### 2.6 A second pass over the areas the review did reach

Re-reading Settings, Initiatives, Design and Storage against the notes turned
up more in each — including two more outright bugs.

**Storage — writes can stop silently.** `saveNow` catches a failed write and
returns `false`, exactly so a full or blocked store cannot take the app down
mid-keystroke. **Nobody reads the return value.** `save()` discards it and
`commit()` discards `save()`. If localStorage fills or is blocked, the app
keeps accepting edits, keeps re-rendering, keeps looking correct, and persists
nothing. Silent data loss in a tool whose only backup is a manual export. Fix
before anything else in §4.7.

**The rolling four-year window is never recomputed.** DESIGN §2 states that
per-year records cover "last year, this year, and the next two — recomputed on
load". `store.load()` returns stored data verbatim and there is no recompute
anywhere; `trackedYears()` in `masterData.js` runs at seed time only, and the
same-named function in `app.js` is a different thing that reads whatever years
the data happens to hold. So a dataset seeded in 2026 still carries 2025–2028
in 2028, and months past the window clamp to the nearest tracked year's rate
rather than getting one of their own. It degrades quietly instead of breaking,
which is why it has gone unnoticed. Either implement the recompute or correct
DESIGN §2 — a document describing behaviour the code does not have is the one
thing CLAUDE.md rules out.

**Cost items are barely editable.** The review called adding costs "strange",
which is half of it: on an existing cost line only the *name* is editable.
Month and amount render as text, with no `cost-month` or `cost-amount` handler
anywhere. Changing an amount means deleting the row and retyping it. And
`cost-add` returns silently when month or amount is missing, so a half-filled
add just does nothing with no feedback. The inline add-row in §4.1 has to make
the whole row editable, not only its creation.

**Navigation dead-ends.** The review asked for rows and cards to be clickable.
The same problem exists one level deeper: on a team, the Initiatives table
renders names as plain text; on a person, so does the Initiatives panel. Both
show you work you then cannot click through to. The initiative detail names
its team in a muted line that is not a link either. Clickability is not just a
table-row question — it is every cross-reference in the app.

**Tables have no sticky headers — resolved by the design system row**, for
whichever tables scroll vertically inside their own box; the design-direction
doc's "what a wide table does" section also gave every wide table a frozen
first column, which the original finding didn't ask for but solves the same
problem sideways. What is *not* resolved: a discoverable hint for the
arrow-key grid navigation two findings down — still open, still §4.1
interaction patterns.

**`.tag` means at least seven different things — resolved by the design
system row.** Badges now come in kinds (neutral, accent, info, ok, warn,
danger, quiet) and each call site says which it means.

**The `⚠` character is used as the warning marker — resolved by the design
system row.** Gone from every page; the `warning` glyph in
`src/render/icons.js`'s sprite replaced it everywhere.

**Arrow-key traversal of table cells exists and is undiscoverable.**
`onTableKeydown` implements grid navigation, including correct caret-boundary
handling inside inputs. Nothing anywhere tells the user it is there.

**The capacity popover cannot be reached by keyboard.** It is
`role="dialog"`, opened by a button, and focus is never moved into it, never
trapped, and never restored. Escape closes it, which is the only part that
works.

**Settings, beyond the notes.**

- Deactivating a role or a country tells you nothing about what uses it, so
  the decision is blind. A new country is created with a rate of **0 for every
  year**, which silently makes everyone in it free.
- Rates and working days are typed one cell at a time: twelve months across
  four years is 48 numbers per country, with no "apply to every month" or
  "copy this year to the others". That is the pain underneath the
  reduction-to-absolute change, and the change alone does not fix it.
- `exportReminderDays` accepts any number, and `0` silently disables the
  reminder entirely — undocumented behaviour hiding in a plain number field.
- The import preview defaults to **Merge**, the mode that is harder to reason
  about. Replace is destructive but comprehensible; Merge overlays quietly.
  Defaulting to the mode with the less predictable outcome is backwards.
- The Danger zone's copy says an export beforehand is the only way back, then
  offers no way to take one from there.
- The Process page is a settings-shaped read-only reference living as a
  top-level page. With Settings becoming one scrolling page, it is a natural
  section within it — reachable from the gate panel that needs it.

**Initiatives, beyond the notes.**

- **There is no way to delete an initiative.** Duplicate exists; delete does
  not. Cancelling is the only exit and cancelled work stays in the list
  forever.
- Phase periods take no validation — an end before its start is accepted — and
  nothing signals that changing a period rescales every allocation cost
  underneath it.
- Allocating adds someone at a hardcoded **50%**, a magic number with no
  explanation. D2 replaces it.
- The wizard's step 2 ends in a "Done" button that only navigates. Abandoning
  there leaves a real, half-formed initiative in the list with nothing marking
  it as unfinished.
- The gate-date input carries no `data-act`, so it is outside the input
  handler and read by query at click time. It works, and it resets to today
  on any re-render of that region.

---

## 3. Notes on the decisions

**D6 — English only.** The brand pack gains no locale, and `formatMoney` keeps
its fixed grouping. Two things in §2.3 are not locale questions and stay in
scope regardless: dates and months are rendered as raw ISO strings
(`2026-01-01`, `2026-01`) all through the interface, which is a readability
problem in English too; and `readNumber` strips everything outside `[0-9.-]`,
so a typed comma silently produces the wrong number rather than being
rejected. Both are handled in §4.1 as formatting, not as localisation.

**D7 — the capacity overview** is new functionality and therefore a SPEC
addition, written into SPEC §7 in the commit that builds it.

**D9 — the recompute** must extend a country's `byYear` (and a custom-rate
person's) as the window rolls forward, seeding a new year from the nearest
existing one rather than from zero. A new year that silently costs nothing
would be worse than the clamp it replaces.

---

## 4. Workstreams

### 4.1 Foundation

Everything else rides on this; doing per-page work first means doing it twice.

The five parts below land as **five separate commits, in this order** — split,
routing, design system, formatting, patterns. Each is independently
verifiable, and as one commit this would be far too large to review or to
bisect. The gate (lint, typecheck, test, build) and a real browser check run
on each, not once at the end.

**Structural prerequisite.** `src/app.js` is 2,960 lines and every workstream
adds to it. Split it into per-page render modules first — no framework, no
router library, just files, with the existing `render()` dispatch unchanged.
This is what keeps the rest reviewable.

**Landed.** `app.js` now holds only state (`app`, `view`), the `render()`
dispatch, and the event wiring installed once at `boot()`. Each page's markup
moved to its own file under `src/pages/` (`portfolio.js`, `initiatives.js`,
`initiative.js`, `wizard.js`, `teams.js`, `team.js`, `people.js`, `person.js`,
`process.js`, `settings.js`); what several pages share moved to `src/render/`
(`dom.js` for the `html`/`raw`/`fill`/`numberField` primitives, `tables.js`
for the named-table registry, `charts.js` for year navigation and the
stacked-bar primitive, `phase-panel.js` for the estimate panel the wizard and
initiative detail both render). `app.js` and the page/render modules import
each other's exports (state and dispatch one way, markup the other) — a
deliberate hub-and-spoke circularity that only resolves values inside
function bodies at call time, never at module-evaluation time, so the load
order is safe. `test/shell.test.mjs` and `test/smoke.test.mjs` scanned only
`src/app.js` or a flat `src/` for their consistency checks; both now recurse,
since the render layer no longer lives in one file.

**Routing.** Hash-based, with `navigate()` writing the hash and a
`hashchange` listener driving `render()`. Reload restores the page, Back works,
an initiative has a link. Focus moves to `main` on navigation and the change
is announced.

**Landed.** The hash encodes identity only — `#/<page>`, `#/<page>/<id>` for a
detail or the wizard's estimates step, `#/settings/<section>` — never the
transient view state layered on top (a sort order, an open filter, a chart's
year), so `navigate()` only touches `location.hash` when the *place* actually
changes; a sort or filter keystroke produces the same hash string and is a
no-op against the address bar. `boot()` parses the hash once and canonicalises
an empty or unrecognised one to `#/portfolio`; a `hashchange` listener (Back,
Forward, a hand-edited hash) re-parses and re-renders the same way. Moving
focus to `<main>` (already `tabindex="-1"` in `index.html`) and updating a new
`#route-announcer` live region both happen from one place —
`announceNavigation()`, called only when the hash actually changed — reading
the just-rendered `<h1>` back rather than looking up a title separately, so
the announcement can't say something the screen doesn't. Verified in a real
browser: deep link + reload, Back/Forward across three pages, an invalid hash
falling back to Portfolio, a settings section surviving a reload, and the
filter-input caret/focus invariant (AGENTS.md) holding through a `navigate()`
call that leaves the hash unchanged.

**The design system.** `styles.css` has tokens but not a system: four spacing
steps, four text sizes, no state layer, no elevation, no motion, no documented
components. A CSS framework is the wrong answer and forbidden anyway
(AGENTS.md) — worse, it would ship literal values and break the tokens-only
contract. Instead:

- A research pass on current practice for dense, data-heavy internal tools,
  then one page of explicit visual direction — density, type scale, colour
  roles, elevation, motion — decided before any CSS moves. Use the
  `frontend-design` skill (CLAUDE.md).
- Tokens: a real type scale with weights, a spacing scale past four steps,
  state tokens (hover / focus / active / disabled / selected), elevation,
  motion durations and easings, and field widths sized to their content — the
  date field is `5rem` today, which is why a date does not fit in it.
- Components, documented and used everywhere: button variants, field, select,
  table, panel, card, badge, banner, popover, toast, empty state.
- Icons: one inline SVG sprite (`<symbol>` + `<use>`), coloured through
  `currentColor` so themes need no second definition. Earned places: theme,
  import/export, add, remove, duplicate, search, filter, sort,
  expand/collapse, row chevron, gate outcome, warning, copy, undo. Icon-only
  buttons carry an `aria-label` and a tooltip, and never stand alone on a
  destructive action.
- Responsive: real breakpoints, a nav that collapses, and a decided answer for
  what each wide table does when the viewport is narrow.
- Focus: a visible ring on every interactive element, plus a skip link.

**Landed.** The direction was decided first and written down as
[REVAMP-design-direction.md](REVAMP-design-direction.md), so the tokens have
somewhere to be answerable to: a ledger, where rules carry the structure, a
2px left edge is the one channel for governance state, and numerals are the
display face. `styles.css` is now a system rather than a token list — a
canvas/surface split that gives elevation without shadows, a seven-step type
scale on a 14px base, a 4px spacing scale of nine steps, state tokens applied
as a background *layer* (so one hover token composes over a plain row, a
warning row and the frozen first column alike), two elevation levels, three
motion durations with three easings, and field widths sized to their content —
the date field is `--field-date`, and a date now fits in it.

Components are documented at the block that defines each one and used
everywhere: button (default, primary, danger, ghost, small, icon-only), field,
select, table, panel, card, tile, badge, banner, popover, toast, empty state,
plus the process rail. `.tag`'s seven meanings became `badge` kinds — neutral,
accent, info, ok, warn, danger, quiet — with each call site saying which it
means, and the `⚠` character is gone. Icons are one inline `<symbol>` sprite in
`src/render/icons.js`, coloured through `currentColor`; `undo` is deliberately
absent until the patterns row gives it a user. `src/render/components.js` holds
the shapes every page builds from (`pageHead`, `scroller`, `empty`, `badge`,
`sortHeader`).

Responsive: two breakpoints, a nav that collapses behind a menu button below
48rem, and one decided answer for every wide table — it stays a table and
scrolls inside a labelled, focusable region with the first column frozen.
Stacking into cards was rejected on the evidence that `display` on table
elements drops table semantics in some browsers, and the header/cell
relationship is the entire value of these tables. Cells hold one line unless
they carry a sentence, which is what keeps a nine-column table at a 36px row
instead of a 114px one when it is squeezed.

Two brand-pack holes closed on the way past: `--color-now-tint` was pinned to
the default brand's hue and now derives from the accent, and the stylesheet
carries no literal colour or px outside the token blocks — checked by walking
the shipped stylesheet's rules in the browser, not by reading.

Verified in a real browser against `examples/exports/demo.json` at 1440×900 and
375×812, in all three theme modes: the caret invariant on both kinds of input
(the filter that re-renders, and the allocation field that must not), the
popover anchored to its trigger's rectangle and following it on scroll, table
cells repainting on a theme change with no reload, the focus ring and skip link
under real keyboard input, and the frozen column holding its position while the
rest of the table scrolls past it. Screenshots are in `design-review/`
(gitignored).

**Adopt Farn's accent and semantic hues.** Not one of the row's original five
— inserted after Bo reviewed the design system directly against
[farn.jbpt.de](https://farn.jbpt.de), his own design system, and asked to pull
its colour theme in without adopting the whole thing (typography and icon
style stay as `REVAMP-design-direction.md` already has them — see the
comparison below for why). A CSS-only change: every token keeps its name and
role, only the hue moves. No page, no markup, nothing outside `:root` and its
theme blocks.

Farn's palette was pulled via the `farn-painter` skill and converted to HSL to
compare hue-for-hue against ours (`hsl()` throughout, so the two are directly
comparable):

| Role | Ours today | Farn | Landing hue |
|---|---|---|---|
| Accent (`--brand-hue`) | 232 (blue) | fern `#327A59` / glade `#94C5AF` → hue ~153 | **153** |
| Ok (`--color-ok`) | 152 (near-identical to Farn's *accent*, not its ok) | moss `#567A37` → hue ~92 | **92** |
| Danger (`--color-danger`) | 354 | ember `#C5414C` → hue ~355 | **355** (rounds off an already-close match) |
| Warn (`--color-amber`) | 38 | grain `#8D6B20` → hue ~41 | **41** (same) |
| Neutral ramp (canvas/surface/fg/line) | 220 (cool blue-grey) | Birch Mist (light, warm, ~45°) / Iron Night (dark, ~216-220°, already close to ours) | **unchanged** — Bo's call; see below |
| Chart palette | six-hue cycle + spare | — | **unchanged** — a data-encoding concern per `dataviz`, not a brand-colour one (also stated in the direction doc) |

Two decisions Bo made directly rather than me picking:

- **The neutral ramp stays at 220 (our current cool blue-grey).** Farn's own
  dark neutrals already sit at hue ~216-220 — essentially the same family —
  so the only place adopting Farn's neutrals would have changed anything is
  the *light* theme, where Farn runs warm sand/paper (~45°) against our cool
  blue-grey. Bo chose to keep the cool tone rather than take on that warmth.
- **Ok moves to Farn's moss hue (92°), not fern's hue.** Farn itself uses two
  different greens for two different ideas — forest (~153°) for its
  accent/interactive colour, moss (~92°, more olive) for success — and our ok
  token happened to already sit at 152°, a near-collision with the *new*
  accent hue. Moving ok to 92° keeps "this is selected/current" (accent) and
  "this is approved/passed" (ok) visually distinct, the same separation Farn
  itself maintains.

Two colours in Farn's semantic set have no home here and are left out rather
than force-fit: `ochre` (Farn calls it "annotation") and `heather`
("uncommon/highlight") — our token model has no annotation or highlight role
for either to become. If a later row invents one, these are the values to
reach for first.

**Implementation note for whoever picks this up:** keep our own
saturation/lightness formulas (the ones already contrast-checked against our
buttons, tints and focus states in the design-system row) and swap only the
hue variables above — do not lift Farn's exact HSL/hex values wholesale, since
those were tuned against Farn's own typography and components, not ours. Swapping
hue while holding saturation/lightness constant can still read more saturated
than the source (green tends to look more vivid than blue at the same
mathematical saturation) — check the accent specifically in a real browser
once it's in, and dial back saturation or lightness slightly if it reads as
neon rather than forest-green. Update the "Colour roles" section of
`docs/REVAMP-design-direction.md` with the new hues and the reasoning above,
the same way the design-system row documented its original choices — this is
exactly the kind of thing that document exists to carry forward.

**Landed.** The hue swaps are in for the accent (153°), ok (92°), danger (355°) and amber (41°). Lightness and saturation for the accent color were dialed back slightly (`50% 40%` for light mode and `60% 65%` for dark mode) to ensure it reads as forest-green and not neon. The neutral ramp and chart tokens remained untouched. The design direction document has been updated with these decisions.

**Formatting.** One module owning money, dates, months and numeric parsing —
English only, per D6. Every raw ISO string in the UI goes through it, and
`readNumber` rejects what it cannot parse instead of silently mis-parsing it.

**Landed.** Created `src/format.js` to own `money`, `month`, `date`, and `readNumber`. The `readNumber` function now rejects invalid numbers without silently misparsing (such as commas intended as decimals). Replaced inline ISO strings throughout the codebase with the `format.js` functions.

**Interaction patterns**, built once and applied everywhere:

- *Clickable rows and cards* — the whole row opens the detail, action controls
  inside stop propagation, the hit area is keyboard-reachable and shows hover
  and focus states.
- *Editable tables with inline add* — click the empty last row, type, and the
  row commits and grows a new empty one. Same component for allocations,
  memberships, roles, countries, cost lines.
- *Confirm and undo* (D1) — one mechanism, not per-call-site ad-hockery.
- *Validation at the field* — inline, warning not blocking, matching the
  tool's existing "warn, never block" stance (SPEC §5.2).
- *Cross-reference links everywhere* — a team's initiatives, a person's
  initiatives and an initiative's team are all dead text today (§2.6).
- *Sticky table headers*, and a discoverable hint for the arrow-key grid
  navigation that already exists but is invisible (§2.6).
- *Distinct badge kinds* — `.tag` carries seven unrelated meanings today, and
  the `⚠` character stands in for a warning icon (§2.6).
- *Popovers take and restore focus*, and trap it while open (§2.6).

**Landed.** Replaced implicit clicks with `.row--clickable` and
`.card--clickable` stretched links. Refactored all entity lists (team
memberships, allocations, roles, countries, cost lines) into editable grids
with a trailing empty row for seamless inline addition. Wrapped deletions in
a global `UndoStack` backed by an omnipotent snapshot, surfaced via a
temporary toast. Added a keyboard traversal hint to the capacity grid.

**Corrected on review.** Editing an existing cost item's amount recalculated
the displayed totals but skipped `commitQuietly()`, so the new figure was
never persisted — a reload silently reverted it to the old amount. Two
places still displayed a full date as a raw ISO string instead of routing it
through `format.js`'s `date()` (Portfolio's Period column and a person's
Initiatives panel), a gap the formatting-module row above should have swept
but didn't. `person.js` also carried an inline `style="position: relative;
z-index: 2;"` on a cross-reference link, duplicating (and violating the
tokens-only rule ahead of) the `.row--clickable a:not(.row-link)` rule
`styles.css` already declares for exactly this case. The row's own last
bullet — "Popovers take and restore focus, and trap it while open" — was
never implemented at all: `openPopover`/`closePopover` were untouched by
this row's commit. Fixed now: opening moves focus into the popover's first
focusable element, or the container itself (`tabindex="-1"`, added in
`index.html`) when it has none; Tab cycles within it while open; closing —
by Escape or an outside click — restores focus to the trigger. All four
fixed; verified in a real browser against `examples/exports/demo.json` —
the persistence fix by editing an amount, reloading, and confirming it
held; the date fixes by reading the rendered Portfolio and Person pages;
the popover fix by dispatching open/Escape/outside-click and checking
`document.activeElement` at each step; the CSS fix by inspection, since
it's non-visual.

**Invariants that must survive all of it** (AGENTS.md, restated only because
this is where they get broken): typing never rebuilds the active input or
moves the caret; popovers position off the trigger's rectangle; replaced
regions re-wire their listeners; table cells declare their own colour; tokens
only, never a literal.

### 4.2 Entity flows

Applying §4.1 to the create and edit paths for people, teams, roles,
countries and memberships — where D1 becomes real behaviour, and where the
review's "a person is just created with no chance to cancel" is answered.

**Landed.** Roles, countries and memberships already got D1's other half —
inline row-add with immediate creation — from the interaction-patterns row,
so what was left here was specifically person and team creation, which
still called `createPerson`/`createTeam` immediately on clicking "New
person" / "New team" and navigated straight to the new record's detail
page. Both now open a draft screen at `#/person/new` / `#/team/new` —
`view.params.id === 'new'` is checked before the real-record lookup in
`renderPerson`/`renderTeam`, the same sentinel the inline-add rows already
use for "not a record yet." Nothing is created until "Create person" /
"Create team"; "Cancel" discards the in-memory draft and returns to the
overview with nothing persisted. The person draft also offers Country and
Role up front — the same level of investment as the wizard's Team and
Starting phase — so the rate is right from the first save; both default to
the first active entry if left alone, matching `createPerson`'s own
defaults. Team's only field is Name, matching `createTeam`'s signature.

Unlike the wizard's draft, these live only in `view.params.draft` — no
`localStorage` persistence. Losing an unsaved name on a reload is a small
loss for a single-field form, and reusing the wizard's single global draft
key would have meant generalizing it to three entities for a resumability
guarantee this row doesn't need.

Verified in a real browser against `examples/exports/demo.json`: opened
each draft, confirmed "Create" starts disabled and enables on a name,
confirmed Cancel leaves the stored dataset's `PEOPLE`/`TEAMS` counts
unchanged, and confirmed a completed create lands on the new record with
the chosen country/role (person) or name (team) actually persisted.

### 4.3 Settings

- One scrolling page with sections and a sticky section nav — a side rail on
  wide viewports, a sticky bar on narrow.
- **General**: delete the "the currency symbol is fixed…" sentence.
- **Overview**: delete the tile row. Days-since-export moves into the Data
  section beside Export, where it means something.
- **Countries & rates**: the collapse button must mirror its open label —
  "Rates & working days" / "Hide rates & working days".
- **Working days entered as working days.** The stored value today is a
  *reduction* off the weekday count, which is why the input is unintuitive.
  Store absolute working days per month per year, and prefill each month with
  that month's weekday count so the user sees what they are overriding.
  Touches `masterData.js`, `engine.js` (`workingDaysInMonth`,
  `workingDaysForPeriod`), the settings render, and `schemaVersion`.
- **Bulk entry for rates and working days**: apply a value to every month,
  and copy one year to the others. 48 cells per country typed one at a time is
  the real pain (§2.6).
- **Deactivating a role or country says what uses it**, and a new country
  warns that a rate of 0 makes everyone in it free (§2.6).
- **Import defaults to Replace**, not Merge — the comprehensible mode, not the
  quiet one. The Danger zone offers an export before it arms (§2.6).
- **`exportReminderDays` gets bounds** and says that 0 turns the reminder off,
  rather than hiding it (§2.6).
- **Process becomes a section here**, read-only, and the gate panel links to
  it (§2.6).
- **Build-time defaults for countries, rates and working days already work** —
  `src/masterData.js` *is* the build-time seed the user edits freely
  afterwards (SPEC §2, DESIGN §4). Nothing to build. What is worth doing is
  giving the placeholder seed realistic working-day figures instead of the
  current test-friendly pattern, and saying so in the file header.

**Landed — page structure and every finding except the schema change.**
Settings is one continuous scroll now: `SETTINGS_SECTIONS` renders every
section's body at once inside `.settings-sections`, with `.settings-nav`
(a side rail ≥48rem, a sticky horizontal bar below it) jumping between them
by scrolling — never by swapping content, which is what the old tab strip
did. The address bar still carries the identity (`#/settings/<section>`);
`scrollToSettingsSection()` is called from `announceNavigation()` and once
from `boot()`, so a real navigation (a nav click, Back/Forward, a deep link
on first paint) scrolls to the section, and a quiet re-render from editing
whatever section is already open never does — the same distinction hash
routing already draws between a place changing and a param changing.
`pages/process.js` moved to `render/process.js` and lost its own
`pageHead`/`fill` call, becoming `processSectionMarkup()`: a markup
producer like `phase-panel.js`, not a `render()` dispatch target — Process
is no longer a top-level page or nav tab.

Overview is gone rather than kept empty: its only content was the tile row
the finding asks to delete, and days-since-export — its one figure worth
keeping — now sits in Data beside Export, where an export reminder means
something. `SETTINGS_SECTIONS[0]` (Roles) is the new default wherever
`'overview'` used to be one — the four `navigate('settings', { section:
'overview' })` call sites (`country-expand`'s default, import-apply,
reset-confirm, the onClick default) now point at `'roles'` or, for
import-apply and reset-confirm specifically, `'data'` — landing back on
the section the action was taken from reads better than an arbitrary
default.

The General sentence is deleted (Process's "This build" panel already
carries the currency). The Countries collapse button reads "Rates & working
days" / "Hide rates & working days" both ways now. The gate panel
(`initiative.js`) links to the Process section via the existing `section`
action — a small addition ahead of §4.4's fuller gate-panel rewrite, since
both this row and that one asked for it. Import defaults to Replace.
`exportReminderDays` clamps to 0–365 and says 0 turns the reminder off. The
Danger zone's armed state offers "Export first" beside the confirm/cancel
pair. Deactivating a role or country whose usage count
(`E.roleUsageCount`/`E.countryUsageCount`, both new) is above zero arms a
confirm step naming how many people use it, reusing the same arm-then-
confirm idiom the Danger zone already established, rather than a popover or
`window.confirm`; deactivating something nobody uses, or reactivating
anything, still takes one click. A country whose current calendar year's
rate is 0 shows an inline warning beside its name.

**Landed — working days as absolute values, `schemaVersion` 2.**
`workingDayReduction` (a reduction off the calendar) is gone; a country's
`byYear[year].workingDays` is now the absolute count per month, edited
directly. `engine.js`'s `workingDaysInMonth` reads it straight off the
record; `workingDaysForPeriod` still uses `weekdaysInMonth` as the
proration denominator (the fraction of a partial month's weekdays covered),
but the numerator is now the stored absolute figure, not
`weekdaysInMonth - reduction`. A new country's inline-add (`app.js`) and
`masterData.js`'s seed both prefill every month with
`E.weekdaysInMonth(year, month)` — a holiday-free calendar, matching the
finding's "prefill with the weekday count" ask — and `masterData.js`
layers a fixed holiday pattern on top of the real per-year weekday count
(`NORTH_HOLIDAYS`/`SOUTH_HOLIDAYS`) rather than reusing one hardcoded
reduction array across all four years, so the placeholder data is
realistic and correctly varies where weekday alignment does. The one field
edit (`country-reduction` → `country-workday`) clamps to a floor of 0 and
has no ceiling — exceeding a month's real weekday count isn't validated
against, since nothing in SPEC says it should be.

`examples/exports/demo.json` — a fixture checked into the repo, not
user data — was migrated in place with a one-off script reusing the real
`weekdaysInMonth` to convert every `workingDayReduction` array (both the
top-level `COUNTRIES` and every frozen phase's embedded `countriesCopy`
snapshot, 48 records total) into the equivalent absolute `workingDays`,
and its `schemaVersion` bumped to match. `test/demo.test.mjs`'s "the demo
export imports into this build" is what would have caught a missed spot.

Verified in a real browser: loading the old (`schemaVersion` 1) demo data
now correctly falls back to fresh seed rather than loading (the existing,
intentional no-migration behaviour); the migrated demo data loads and
shows realistic per-month figures; editing a working-days cell persists
and survives a reload; a freshly created country's working days prefill
with real weekday counts, not zero.

**Landed — bulk entry for rates and working days.** Each year's row in the
expanded Countries view now carries a small toolbar above its 12-month
scroller: a scratch value field plus "Apply to every month" sets every
month of that year's `workingDays` to one number in a click, and "Copy to
other years" (hidden when a country tracks only one year) duplicates that
year's `{ rate, workingDays }` onto every other tracked year. The scratch
field carries no `data-act` of its own — it's read from the DOM by the
button's click handler (`country-apply-all`), the same pattern `gate-date`
and `skip-reason` already use for a value that isn't itself a data field.
48 cells per country typed one at a time was the finding; this is the
fix for both halves of it (§2.6).

Verified in a real browser: typing a value and clicking "Apply to every
month" set all 12 cells for that year; clicking "Copy to other years"
afterward propagated both the rate and all 12 working-day values to every
other tracked year, confirmed by reading each year's rendered fields back.

Verified in a real browser against `examples/exports/demo.json`, at
1440×900 and 400×800, in light and dark: the section nav scrolling and
highlighting correctly on click and on deep link, the narrow sticky bar
sitting below the shell header rather than under it (a real bug caught this
way — the rail's sticky `top` needed to clear the header's height, which
CSS does not do on its own for two stacked sticky elements), the
deactivate-arm/confirm/cancel cycle for a role with a real user, and the
zero-rate warning appearing for a freshly-created country and not for
Northland or Southland.

> **Schema note.** A `schemaVersion` bump invalidates stored data and refuses
> older exports, by design and with no migration path. Every schema change in
> this revamp — working days here, anything in §4.4 — lands in **one** bump.

### 4.4 Initiative detail

- **Description and notes get a UI** (§2.2). Description on the detail page,
  editable. Notes as a panel that stays writable when the initiative is closed
  or cancelled, which is the behaviour the engine already enforces.
- **Phase stepper, made informative.** Past steps show outcome, date and the
  frozen total; the current step shows its gate, blocker count and period;
  steps ahead show costed / no-cost and any estimate already entered. Clicking
  a step scrolls to its panel; the current step is visually dominant.
- **Gate panel, restructured.** It is one panel today holding a heading,
  prose, two lists, a date input, two buttons, a permanently-visible skip
  input, micro-copy and the checklist. Impose three parts: *state* → *what is
  needed*, each item resolvable in place → *actions*, a primary button plus a
  secondary menu. Skip-with-reason moves into a dialog. The gate links to its
  definition on the Process page.
- **A sticky summary bar** at the foot: estimate, forecast and actual totals
  with coverage, the approval track and any escalation, the phase and its
  blocker count, and the next action. The page is long and the numbers move as
  you edit below it, which is what makes a bottom bar worth its space here and
  nowhere else.
- **Allocation table**: drop Day rate and Factor — derived, and not
  decision-relevant while allocating. Person-days and Cost stay, so rows still
  add up to the total (DESIGN §2); the rate arithmetic goes behind a per-row
  disclosure for when someone questions a figure. Seed the table per D2.
- **Cost lines**: inline add-row per §4.1, with the **whole row editable** —
  today only the name is, and changing an amount means deleting and retyping
  (§2.6). A half-filled add says why nothing happened instead of failing
  silently.
- **Initiatives can be deleted** (§2.6), guarded like every other destructive
  action per D1.
- **Phase periods validate** end against start, and say that changing a period
  rescales the costs beneath it (§2.6).
- **The wizard's second step ends deliberately** — abandoning it should not
  leave an unmarked half-formed initiative in the list (§2.6).
- **Month by month**: a totals row, and `placeholder="not recorded"` fixed per
  §4.6.
- **Sections**: real separation and a way to navigate between them. This page
  is the worst case of a problem every page has.

**Landed — description, notes, delete, and phase-period validation.**
Description gets a plain single-line field (matching how it's already
collected in the wizard, and every other free-text field in the app — no
`<textarea>` exists anywhere yet, and this wasn't the row to introduce one);
it disables when the initiative is finished, since `L.setDescription`
carries the same `assertOpen` guard as a rename. Notes gets one too, always
editable regardless of status — `L.setNotes` already had no `assertOpen`
guard for exactly this reason, so the gap was purely that nothing rendered
it. Both autosave on input like every other text field.

Initiatives can now be deleted: a new `L.deleteInitiative` (nothing else
references one by id, unlike a team or a role, so there's no usage count to
check first) behind an arm → confirm/cancel step in the page head, the same
idiom §4.3 used for role/country deactivation and the Danger zone — chosen
over reusing `withUndo` (as team deletion does) because an initiative can
carry months of estimate, allocation and gate history, a bigger loss than
an empty team.

A phase period whose end falls before its start now says so inline — the
engine already defended against it (`monthsInRange` returns `[]`, so
everything costs 0 rather than throwing or going negative), so this is
purely making an already-safe state legible. Editing a period with any
allocations or costs already on it shows a standing note that doing so
rescales everything beneath.

Verified in a real browser against `examples/exports/demo.json`: description
and notes both hold their stored values and persist an edit; the delete arm
→ cancel cycle leaves the initiative in place; delete → confirm removes it
and returns to the Initiatives overview; setting an end date before the
start date shows the warning immediately.

**Landed — panel structure, and the process rail made informative.**

The page's panels now come from one list, `panelsFor()` in
`src/pages/initiative.js`: element id, the name the panel is known by, and
how it renders. The page, the rail's jump targets and (next) the jump menu
all read that list, so none of them can offer a destination the page does
not have — the gate comparison, which does not exist before a gate has been
left, is simply absent from the list rather than rendering an empty panel.
A new `panel()` component in `render/components.js` gives every one of them
the same three things it was previously getting wrong separately: a
heading, an accessible name matching it, and a stable id. Separation is
`.panel-stack` — a wider gap, plus `scroll-margin-top` on every panel so a
jump lands with the heading clear of the sticky header. That margin reads a
new `--header-height` token, which replaces the third copy of a literal
`3.5rem` and fixes Settings' section jumps at the same time: they had
landed under the header since §4.3 and nobody had noticed.

The rail carries what is worth knowing about each phase from a distance,
and is the page's navigation. A passed step shows its gate, the date, and
the **frozen** total with "approved" under it — the figure that was
approved, not the one that has moved since. A skipped step shows the date
and the reason and no figure at all, because a skip approves nothing. The
current step shows its gate, its period, its blocker count in the warning
colour, and its live total with the coverage word under it; it takes a
larger share of the row and the accent tint, so "where is this now" is
answerable from across the room. A step ahead shows costed or no-cost and
any estimate already entered. Figures sit at the foot of each segment so
they line up across the rail whatever prose sits above them. Clicking a
step scrolls to that phase's panel; a phase with nothing on the page — one
still ahead, carrying no cost, no gate left — renders as a span rather than
a button that goes nowhere.

Verified in a real browser against `examples/exports/demo.json` at 1280px
and 420px, light and dark: all four step states render correctly on
Warehouse automation (skipped / passed / current-with-a-blocker / ahead),
clicking Validation lands its panel 13px below the header rather than
under it, the rail stacks to one segment per row on a narrow viewport, and
the wizard's shared phase panels still render unchanged.

**Landed — the gate panel, in three parts.**

State, then what is needed, then what you can do — separated by rules, in
that reading order. The first part is the gate's own prose plus a badge
saying either how many blockers it has or that it is ready to pass. The
second is the requirements list. The third is one primary button, the gate
date, and a menu.

The requirements list is the piece that needed a change underneath it.
`gatePrecondition` returned two arrays of sentences, so the panel could
only print them — which is why the same checklist item appeared twice on
the old panel, once as the sentence "“Ready to release” is not resolved"
and again as a table row with the control that would resolve it.
`L.gateRequirements` now returns every requirement the gate has, **met ones
included**, each with a `kind` and its state; `gatePrecondition` is derived
from it in four lines, so there is still exactly one implementation of what
a gate needs and the existing tests did not move. The panel renders one row
per requirement with the control that settles it: a checklist item carries
its status select and its note, and the two that cannot be settled in a
sentence-sized control — an unestimated phase, a month without an actual —
carry the trip to where they can. Met requirements recede rather than
disappear, because a list showing only what is wrong cannot say what the
gate is *for*.

Skipping moved out of the panel and into a modal dialog, reached through
the menu. The permanently-visible skip box was noise on a gate you are
trying to pass, and a popover is the wrong container for the opposite
reason: it dismisses on a click anywhere else, which is exactly what must
not happen to a half-typed required reason. A native `<dialog>` with
`showModal()` brings the focus trap, Escape, the inert page and focus
restored to the opener without any of it being written here — the app's
first and, for now, only modal. The missing reason now says so in a message
under the field instead of overwriting the placeholder with an error, which
was §4.6's "a placeholder that reads as three things" in miniature.

**Two bugs found while building it.** `.field-message` and `.field--warn`
referenced `--color-warn`, `--text-micro` and `--space-2xs`, none of which
exist — leftovers from before the design-system row, so the error message
had no colour, size or spacing of its own. And the message rendered
*visible on open* despite its `hidden` attribute, because `.field-message`
sets `display: block` and beats the UA rule silently; there is now a base
`[hidden] { display: none !important }` so no component has to remember.
`.scroller__hint` had the same stale-token problem and is fixed with them.

**Still open from §2.6:** the gate-date field carries no `data-act`, so it
is read by query at click time and resets to today whenever that region
re-renders — which now includes resolving a checklist item. It works, and
it is a smaller thing than it was before the restructure, but it is not
fixed.

Verified in a real browser against `examples/exports/demo.json`: typing a
checklist note does not rebuild the input or move the caret; resolving an
item rebuilds its row and leaves focus on the replacement select with the
note intact; the menu positions off its trigger; the dialog traps focus,
refuses an empty reason with the field marked and the message shown, closes
on Cancel and on Escape with focus back on the button that opened it, and a
completed skip advances the rail. Checked at 1280px and 420px in light and
dark.

**Landed — the summary bar, and with it the jump menu.**

A sticky bar at the foot carrying the three totals SPEC §4 names —
Estimate, Forecast, Actual — with the one the initiative currently reads as
in the accent and the count behind the word under Actual ("3 of 10
months"), so "forecast" is a fact rather than a label. Beside them the
approval track with an escalation mark if it has moved, and the phase with
its blocker count. A new `E.initiativeTotals` computes all of it in one
place; Actual is the money recorded and nothing else, which is the
difference between it and the blended total it sits next to.

The bar is sticky rather than fixed, so at the end of the page it comes to
rest in the flow instead of permanently covering the last panel, and it
holds no inputs, which is what lets a recalculation rebuild it whole while
someone is typing four panels above. Below 48rem the track and the phase
drop out: both are already on the rail and in the gate panel, and three
rows of sticky chrome on a phone costs more than the repetition is worth.

**The action is a jump, never the act.** The bar says "Pass Gate 2" or
"Clear the blocker" and both scroll to the gate panel. Passing a gate
freezes a phase and sets the approval baseline every later escalation is
measured against; doing that from a strip at the bottom of the screen,
without the blockers, the date and the consequences in view, is not
something this tool should make easy.

Next to it, **"Jump to"** opens a popover listing every panel on the page,
built from the same `panelsFor()` list the rail's targets come from. That
is the other half of §4.4's "a way to navigate between them": the rail
covers the phases, this covers everything else, and neither can name a
panel the page does not have. It is the one navigation control reachable
from the bottom of a five-screen page, which is where the problem actually
bites.

Verified in a real browser against `examples/exports/demo.json`: typing an
allocation percentage moves Estimate and Forecast in the bar without
rebuilding the input or moving the caret; the jump menu positions itself
above its trigger when there is no room below and every entry scrolls to
its panel; the bar comes to rest at the page foot. Checked at 1280px and
420px, light and dark.

**Landed — the allocation table, and D2.**

Day rate and Factor are gone from the table. Neither is a number you act on
while deciding how much of someone's time a phase needs; they are inputs to
the two that matter. Person-days and Cost stay, so the rows still add up to
the phase total (DESIGN §2), and the arithmetic behind a Cost sits one
click away on the figure itself — a small ledger showing working days,
allocation, role factor, person-days, day rate and the total ruled off,
read against the phase's own rates so an approved figure is reproduced
rather than recalculated. A period spanning two years says so and shows the
effective day rate, since rates are read for each month's own year (SPEC
§5.2).

D2 landed as two different things, which is logged in
[REVAMP-decisions-log.md](REVAMP-decisions-log.md): the roster at 0% is
what the table *is* while the phase is editable, and the seed is a button
("Copy Validation's allocations") above an empty table. That removes the
"Allocate…" select and with it the hardcoded 50% — a magic number with no
explanation — and allocating becomes typing a number next to a name.
Nothing seeds on render; a panel that wrote allocations into the dataset
merely by being looked at would be a worse bug than the one D2 fixes.

**One thing this broke and fixed.** `refreshCalcRegions` walked
`phase.allocations` to find the cells to update. With a roster row for
someone who has no allocation record — and with typing a percentage back
down to 0 *removing* the record while leaving the row — that loop would
have left stale figures on screen. It now walks the rows in the DOM, which
is what the function's own comment already said it should do.

Verified in a real browser against `examples/exports/demo.json`: typing 25
into a 0% roster row creates the allocation and moves person-days, cost,
the phase total and the summary bar without rebuilding the input or moving
the caret; typing it back to 0 removes the record and drops the row's
figures to zero; the seed button copies the previous phase's percentages
with an undo and then disappears; the disclosure popover positions off the
figure and its arithmetic reconciles (125.0 × 60% × 1.25 = 93.8 person-days
× €625 = €58,594). The toast now clears the summary bar rather than landing
on the figures it just changed.

**Landed — the month table's foot, and the wizard's ending.**

**Month by month** gets a totals row: a sticky `<tfoot>` per column, ruled
off and weighted the way a total is in a ledger, which stays legible while
the rows above it scroll inside their own box. It reconciles with the
summary bar by construction — both read the same months. It travels with a
copy of the table too; a month-by-month table pasted into a spreadsheet
without its totals is one somebody then has to total by hand. And
`placeholder="not recorded"` is gone (§4.6): it was an example, a state and
a hint at once, and the cell's own tint already says which months were
expected and not recorded.

**The wizard's second step ends deliberately.** The initiative is real from
step 1 — that is what makes the flow resumable — so leaving is not
cancelling a form, it is deciding what to do with a record that already
exists, and a single "Done" button that only navigated said none of that.
Three named exits now: **Finish** opens it in full, **Come back to it
later** leaves it in the registry, and **Discard this initiative** deletes
it behind the same arm → confirm as everywhere else. Above them, the step
says whether every costed phase has a period and someone allocated, so
whichever exit is taken is taken knowingly.

The other half of that finding — "nothing marking it as unfinished" — is a
badge on the registry: a new `L.unestimatedPhases` (the same test a gate
requiring estimates already applied, lifted out so two places can use it
without needing a gate) marks any initiative whose costed phases are not
all estimated. It is true more generally than the abandoned-wizard case it
came from: such an initiative cannot pass a gate that requires estimates,
whatever left it that way. §4.5 reworks that row's status column and will
sit beside this rather than replace it.

Verified in a real browser against `examples/exports/demo.json`: typing an
actual moves the foot and the summary bar together without rebuilding the
input or moving the caret, and the foot stays stuck to the bottom of the
scroller with its first cell frozen at 420px; the wizard names what is
missing, its discard arms, cancels and deletes, and the badge appears on
exactly the initiative with an unestimated phase.

**§4.4 is complete.**

### 4.5 Overviews, dashboard, capacity and charts

- **Initiatives**: status moves to the last column, and becomes a **badge that
  opens a menu** — it reads as a state and edits as a menu, rather than
  looking like a form field in a table. Cancelling confirms; it should not be
  one stray click. Closed and cancelled work is filtered out by default, with
  a visible toggle.
- **A Capacity overview** (D7): over-allocation across every team and person
  for a month, so the question has one answer in one place.
- **Portfolio** gains a capacity dimension, so the dashboard answers both of
  the things SPEC §1 says are co-equal.
- **Team cards** gain a cost and capacity figure.
- **Charts**: the bars carry no axis, no gridlines, no scale, and no value
  except on hover. Build one small internal SVG chart primitive that the
  portfolio bars, the run-rate chart and anything later all share — it fixes
  the class rather than the instance and still ships zero dependencies. Each
  chart gets a table fallback for screen readers. Load the `dataviz` skill
  first (CLAUDE.md).
- **Global search** across initiatives, people and teams, from the shell.

**Landed — the Initiatives overview.** Status is the table's last column: a
badge (`.badge--button`, a new variant — `.badge` itself is documented as
non-interactive) that opens a popover menu instead of a `<select>`. The
badge's kind makes Closed (`quiet`) and Cancelled (`danger`) read as
different outcomes rather than one undifferentiated "finished," and Active
(`ok`)/On hold (`warn`) read the same way status does everywhere else in the
app now. Switching to Active or On hold is immediate and closes the menu;
choosing Cancelled swaps the same popover's content for a confirm step
first — "Cancel initiative" / "Never mind" — rather than a whole-page arm,
since nothing else on the row needs to survive the round trip. Closed offers
no menu at all: reopening is a gate action on the initiative itself, not a
registry action.

Closed and cancelled initiatives are hidden by default behind a "Show
closed & cancelled" checkbox — the registry has no archive, so without this
it only ever grows — and an explicit Status filter selection still wins
over the checkbox either way, so picking "Cancelled" from that dropdown
shows cancelled work regardless. The "needs an estimate" badge (§4.4) stays
exactly where it was, next to the name: it was never coupled to the status
column's position, so status moving away from it changed nothing about
where it sits.

**Found and fixed in passing.** Both this checkbox and People's existing
"Show inactive" one threw an uncaught `InvalidStateError` on every toggle —
the shared per-keystroke caret-restore handler in `onInput` called
`setSelectionRange` unconditionally, which a checkbox's input type does not
support at all. Guarded on `target.type !== 'checkbox'`.

Verified in a real browser against `examples/exports/demo.json`, light and
dark: the menu opens on the badge and positions off it; Active/On hold
apply and close immediately; Cancelled arms its confirm in place without
losing the popover's anchor, "Never mind" aborts and restores focus to the
badge, and confirming turns the badge red and reversible back to Active; the
checkbox default-hides Fraud scoring v2 (closed) and reveals it when
checked; a fresh browser tab's console stayed clean through the whole
sequence, confirming the `InvalidStateError` fix (the error had briefly
looked unfixed because the console reader carries history across a
same-tab reload, which cost time to notice — a fresh tab settled it).

**Landed — a Capacity overview (D7).** New engine function
`E.overAllocations(app, monthKeyStr)` finds every over-allocation for one
month, across every active person and team, returning two lists rather than
one merged one — capacity % and share % are never interchangeable
(SPEC §5.2), and a person can be over one without being over the other. A
new top-level page at `#/capacity` (in `PAGES`, between People and
Settings) shows a month picker over two panels built from those lists —
"Over capacity" and "Over their team's share" — each a table with a
person/team link, the two percentages, and how far over, using the
existing `over`/`row--warn` classes already established on the Person and
Portfolio pages rather than inventing new ones. Written into SPEC as a new
§7, in the gap between §6 and §8 that the plan had reserved for it.

Verified in a real browser against `examples/exports/demo.json`, light and
dark, at 1024px and 420px: September 2026 shows two people over capacity
and two memberships over share with real, non-zero figures (the demo data
already models this month realistically); switching to January 2025 shows
both panels' empty states; the month picker and "Today" button work
unmodified, since both already dispatch through `view.page` generically;
clicking a person or team link navigates to its detail page; a fresh
browser tab's console stayed clean.

**Landed — Portfolio gains a capacity dimension.** The dashboard's lede used
to disclaim the question outright ("Capacity is a per-team and per-person
question and lives on those pages"), which read oddly once the Capacity
overview above existed to answer it across every team at once. A new
"Capacity this month" panel sits between the cost chart and the initiatives
table: two tiles, reusing `E.overAllocations` for `currentMonth()` — capacity
is a "right now" question, independent of whichever year the cost chart is
showing — each linking to `#/capacity` rather than duplicating its table.
The lede is now "Cost and capacity across every team, read-only," matching
SPEC §1's "co-equal outputs" framing directly instead of disclaiming half
of it.

A non-zero count needed a new `.tile--warn` class rather than reusing `.over`
directly on `.tile__value`: that class sets its own `color`, defined later
in `styles.css` than `.over`, so the two would have tied on specificity and
`.tile__value` would have silently won regardless of which was listed
second in the markup. Scoping the color through a wrapper class fixes that
regardless of source order.

Verified in a real browser against `examples/exports/demo.json`, light and
dark: September 2026 (today's month) shows "2 over capacity" and "2 over
their team's share" in the danger colour; "Full breakdown" links to
`#/capacity`; a fresh tab's console stayed clean.

**Landed — Team cards gain a cost and capacity figure.** Cards showed
members, share and initiative count only — no money, and "Share held" said
what a team holds of its people without saying how much of that is actually
committed. `P.teamSummary` now takes the month it means (cost and
allocation are "right now" questions, not lifetime totals) and returns two
new fields: `costThisMonth` (`E.teamRunRate` for that one month) and
`allocatedSharePct` (allocated % summed across the active roster). Cards
show "Cost this month" in money and "Capacity used" as
`allocatedSharePct / totalSharePct` — a team can hold 100% of someone and
use none of it, and this is the figure that says so. Over 100% colours the
same as every other over-allocation in the app.

The three existing `teamSummary` tests needed a month argument added; a new
one covers the two additions directly, including that an idle month still
costs something (unused share is non-initiative work, SPEC §5.2, never
zero for a roster that exists). `.card__stats dd.over` was needed for the
same reason Portfolio's `.tile--warn` was: `.card__stats dd` sets its own
`color`, so a bare `.over` class would have tied on specificity and lost.

Verified in a real browser against `examples/exports/demo.json`, light and
dark, at 1440px and 420px: Platform shows a real cost figure and "115%" in
the danger colour (it has the two over-allocated people from the Capacity
overview above); Growth shows "0%" where nothing is currently allocated
within the month despite carrying cost from unused share; cards wrap
correctly at 420px; a fresh tab's console stayed clean.

**Landed — a shared SVG chart primitive.** Loaded the `dataviz` skill first
(CLAUDE.md), per its procedure: form was already decided (stacked bars),
color follows the entity via the existing `--chart-1..6`/`--chart-spare`
tokens (a data-encoding concern this row correctly left alone, per the Farn
hue-adoption note earlier in this document), so the work was marks, axis,
and interaction. `stackedBarsMarkup(data, key, label)` in `render/charts.js`
replaces the old absolutely-positioned div bars with real SVG: a y-axis
with "nice" round-number gridlines (`niceMax()` rounds to 1/2/5/10 × a power
of ten), rounded data-ends square at the baseline (a `roundedTopRect()` path
on the topmost segment only — correct for a single-segment bar too, since
that segment is simultaneously its own top and bottom), a 2px surface gap
between stacked segments, and the current month picked out on the x-axis.
Native SVG `<title>` elements carry the per-segment hover value. One
function, still shared by the Portfolio chart and every team's run rate.

Each chart also gets a "View as table" toggle: a pure DOM `hidden`-attribute
swap (not page state — a year change or filter re-renders the block back to
its chart default, which is a deliberate call, not an oversight) between the
SVG and a real `<table>` registered in the existing `TABLES`/`copy-table`
machinery, so Copy comes for free and every value the picture shows is also
reachable without it (dataviz: "a table view exists" is what lets a chart
skip building its own keyboard/hover story for every mark). Two units of
dead code went with it: the duplicate JSDoc block §2.5 had flagged above the
old function, and `--bars-height`, now unused.

**One bug caught in browser verification, not review.** The toggle button
carried its own `data-chart` attribute for a
`trigger.closest('[data-chart="..."]')` lookup — which matched the *button
itself* first, since it carries that same attribute, and never reached the
wrapping `.chart-block` that actually holds the two views. The click handler
ran, found nothing inside the button, and silently did nothing. Fixed by
matching `.chart-block`'s class instead of the attribute value.

**Flagged, not fixed:** color cycles at 6 series (`% 6` against the six
`--chart-N` tokens) and reuses a hue past that — a real anti-pattern per
`dataviz` (fold into "Other," never cycle) but a bigger job than this
primitive, and pre-existing rather than something this row introduced.
Logged as a follow-up task rather than bundled in here.

Verified in a real browser against `examples/exports/demo.json`, light and
dark, at 1440px and 420px: Portfolio's cost chart and a team's run rate both
show correct gridlines, values and the current month in the accent colour;
the table toggle round-trips both directions with the right figures and a
working Copy button; a segment's native tooltip reads correctly; a fresh
tab's console stayed clean throughout.

**Landed — global search.** A "Search" button in the shell — next to Export/
Import/Theme, so it is on every page — opens a popover with a text field.
Typing filters initiatives, people and teams by name live; each result
names its kind and, when it is not in its normal active/open state, a short
note (a status word, or "inactive"), so a search for a name doesn't drop
you on a closed initiative with no warning. Selecting a result is a real
`href` link — the same plain-anchor navigation every other cross-reference
in the app already uses — so `search-select`'s handler only has to close
the popover, exactly the way `panel` (the jump menu) already does for the
same reason.

Filtering is simpler than the existing search-box pattern
(`initiatives-filter`/`people-filter`, which re-renders a whole page and
then restores focus and the caret by hand): this only ever rebuilds the
results list, a sibling of the input, so the input itself is never touched
and there is no caret to lose in the first place.

**Found in passing, fixed alongside it:** a concurrent session's git
worktree under `.claude/worktrees/` was being swept into this repo's own
`eslint .` — that path was never in the ignore list, so its files fell
through to bare `eslint:recommended` (no browser globals) and threw over a
hundred `no-undef` errors that had nothing to do with this row. Added
`.claude/` to `eslint.config.js`'s ignores.

Verified in a real browser against `examples/exports/demo.json`, light and
dark: the popover opens focused on the field and positions off the Search
button; typing narrows the list live across all three kinds, including a
closed initiative and an on-hold one showing their status; selecting a
result navigates there and closes the popover; Escape closes it and
restores focus to the Search button; the button and behaviour are
identical from Portfolio and from Settings; a fresh tab's console stayed
clean; the search popover survives a 420px viewport.

**§4.5 is complete.**

### 4.6 Copy, states, first run and accessibility

- **Placeholders vs. states vs. hints.** A placeholder shows an example of
  valid input, or is empty. A state ("not recorded", "—") is rendered as text.
  A hint sits under the field. "not recorded" as a placeholder is all three at
  once, which is why it reads as noise. Sweep every one.
- **First run and load failures speak** (§2.5). A fresh install gets a real
  empty state that says what to do first. A dataset dropped for a schema or
  process mismatch says so, loudly, instead of silently reseeding.
- Every empty state says what to do next, not just that there is nothing here.
- Focus order, focus-visible rings, `aria-live` on the regions that
  recalculate, contrast checked in all three themes.
- Motion on state changes and disclosures, honouring `prefers-reduced-motion`.

**Landed.** The placeholder sweep turned up nothing left to fix: the one
offender the finding named (`placeholder="not recorded"`) was already
removed in §4.4's month-table-foot row, and every remaining `placeholder=`
in the app is a genuine example of valid input. Motion needed nothing
either — `prefers-reduced-motion: reduce` already collapses every
`--motion-*` token to near-zero at the root in `styles.css`, from the
design-system row, and since every transition and animation in the
stylesheet reads those tokens rather than a literal duration, one media
query already cancels motion app-wide. Focus order and focus-visible rings
were §4.1's landed work already.

What was left: `store.load()` computed a reason (`empty`/`schema`/
`process`/`unreadable`) and `boot()` returned it to nobody. A schema or
process mismatch is worse than an empty store — the incompatible bytes are
still sitting in the browser, and the first save from this session
overwrites them for good — so `renderBanner()` now shows a dismissible,
reason-specific warning for those three outcomes, outranking the export
reminder the same way the write-failure banner does. A plain `empty` reason
(a genuine fresh install, nothing lost) gets no banner; the per-page empty
states already say what to do first, which is where the second bullet's
work landed instead — four fixed to say what to do next (Portfolio's
initiatives table, a team's initiatives panel, a person's allocations
panel) plus one that was an outright bug: a team's roster panel hid its own
inline add-row behind the empty-state message whenever the roster was
literally empty, even with people available to add, since the add-row
lived inside the very table the empty state replaced. `aria-live="polite"
aria-atomic="true"` went on four page/panel-level totals (the initiative
summary bar, the approval-track panel, the month table's foot, the
wizard's grand total) — deliberately not on granular per-row, per-keystroke
figures, where announcing every table cell on every character typed would
be live-region chatter, not help. And a leftover named in §2.5 but never
folded into a §4.x bullet — negative day rates and custom rates accepted
silently — now warn inline the same way the zero-rate and over-share
warnings already do, never blocking (SPEC §5.2).

Verified in a real browser against `examples/exports/demo.json`, light and
dark, 1440px and 420px: a fresh install shows no banner; a schema mismatch
and a process mismatch each show their own wording, dismiss correctly, and
fall back to the export reminder underneath; a brand-new team's roster
table shows its add-row and a person can actually be added through it;
typing an allocation percentage updates the summary bar and month totals
live while the caret and focus stay put; a negative day rate shows its
warning after the next render, matching the existing zero-rate warning's
own timing; contrast checked programmatically (WCAG ratios computed from
actual computed colors, not eyeballed) on the new banner and existing
tile/legend/chart-axis text in both themes — all pass AA with margin.

**§4.6 is complete.**

### 4.7 Storage (D4/D5)

**The silent-write bug is fixed** (`ae327ab`). `saveNow`'s return value was
discarded all the way up the stack, so a full or blocked localStorage meant
the app accepted edits and persisted none of them with no signal (§2.6).
Failure is now reported through a handler registered once at boot, on
transitions only, and the banner outranks the export reminder.

What remains here: an optional binding to a real file on disk via the File
System Access API, feature-detected, with localStorage unchanged underneath as
the fallback and the non-Chromium path. Multi-tab writes are worth a thought at the same
time — two tabs on the same dataset today is last-writer-wins with no `storage`
listener and no warning.

**Landed.** A linked file mirrors every `localStorage` write to a real file
via `showSaveFilePicker`/`FileSystemFileHandle`, feature-detected so the
whole thing renders nothing where the API doesn't exist. Linking never
changes what `load()` reads from — `localStorage` stays the single source
of truth, and reconciling a file edited elsewhere is still Import's job,
exactly as it already was for a manually-taken export (D5). The handle
persists in IndexedDB so the link survives a reload; a revoked permission
shows as a "Reconnect" prompt in Settings' Data section, never a failed
save, since `requestPermission()` needs a live click to re-grant. TypeScript
has no bundled types for this API yet, so `src/file-system-access.d.ts`
declares exactly the surface used rather than pulling in a devDependency.

Separately, a `storage` event naming this app's key from another tab now
stops `saveNow()` from writing this tab's stale in-memory copy over the
newer one, with a banner explaining why and a Reload button — the
last-writer-wins loss the finding named, addressed as a courtesy warning
rather than real-time sync, which would reopen SPEC §1 (D5).

**One real bug, caught by testing rather than review.** `linkFile()` set
its module state before persisting to IndexedDB, so a persistence failure
left the module believing it was linked while reporting failure to the
caller and never telling the UI — found via a genuine `DataCloneError`
while browser-testing with a mocked handle (a real handle is natively
structured-cloneable; a plain mock object with methods is not). Fixed by
only committing the linked state once both the persist and the first
write succeed.

Verified in a real browser: the unsupported case hides the whole block;
cancelling the native picker changes nothing; two real tabs sharing an
origin produce one banner, a genuinely blocked save, and a working
Reload, in both themes and at 420px. The deeper link/unlink/reconnect/
restore flow — including the rollback fix — is covered by new
`test/store.test.mjs` tests against a fake IndexedDB, since a real
handle's cloneability is a browser guarantee no test suite can fabricate
and wasn't what needed proving.

**§4.7 is complete — every workstream in this plan has now landed.**

### 4.8 Brand pack (D8)

Widen the design surface from four custom properties to a small deliberate
set — accent plus a neutral ramp, radius, density, type scale, font and
wordmark — and fix the wordmark hole (§2.5). No locale, per D6. Bump the brand-pack contract
version, since the shape changes. Document the whole surface in DESIGN §4, and
verify the default still looks intentional with every knob left alone: that is
the actual test of "good out of the box".

**Landed.** Four new knobs joined the accent triad and `--brand-font`, each
with a white-label default that reproduces this tool's current look exactly:
`--brand-neutral-hue` (220) drives the whole neutral ramp — canvas, surface,
text, lines, and the band/scrim/spare tints — independent of the accent hue,
which is the separation Farn itself draws between its accent and its
neutrals. `--chart-spare` was deliberately left out of that ramp and kept at
its own fixed hue, matching the rest of the chart palette (data-encoding,
not brand colour, per the Farn-hue-adoption note earlier in this document).
`--brand-radius` (0, square) replaces `--radius-none` as what all eleven
`border-radius` call sites actually read. `--brand-density` (1) is a
unitless multiplier over row padding and control heights. `--brand-text-base`
(0.875rem) is the number the rest of the `--text-*` scale is now a fixed
ratio of. `styles.css`'s own brand-pack contract comment bumped to version
2 to match `masterData.js` and `process.js`.

`PROCESS.wordmark` (§2.5's hole) fixes what was a straightforward bug:
`boot()` read a literal `'Initiative Planner'` string while `index.html`'s
own comment claimed the wordmark came from the data model, which was
false. It now reads `PROCESS.wordmark` into both the shell element and the
document title — `currency` was already build-fixed identity living in
`process.js`, and wordmark is the same kind of thing. `process.js` bumped
to contract version 2 alongside it. DESIGN §4 now documents the full
seven-knob surface in one table; AGENTS.md needed no change to its
brand-pack section, since its existing `--brand*` wildcard wording already
covered every new name.

Verified in a real browser against `examples/exports/demo.json`, light and
dark, 1440px and 420px: the default render is pixel-identical to before
this row on Portfolio and Settings — confirming every new knob's default
reproduces the current look, which is the actual test this row names. A
single combined override (`--brand-hue: 260`, `--brand-neutral-hue: 30`,
`--brand-radius: 8px`, `--brand-density: 1.3`, `--brand-text-base: 1rem`)
correctly repainted the accent, the neutral ramp, corner rounding, row
density and type size all at once, in both themes, with no reload and no
console errors — the mechanism itself, not just the tokens existing.

**§4.8 is complete.**

---

## 5. Sequencing

```
§4.7 silent-write bug — landed already, alone, ahead of everything else
   ↓
§4.1 Foundation
     split app.js → routing → design system → Farn hues → formatting → patterns
   ↓
§4.2 Entity flows     §4.3 Settings      §4.7 Storage (independent)
   ↓
§4.4 Initiative detail
   ↓
§4.5 Overviews, capacity, charts
   ↓
§4.6 Copy, states, first run, accessibility
   ↓
§4.8 Brand pack — last, because it can only be drawn once the system it
     parameterises exists
```

Each phase ends with `npm run lint && npm run typecheck && npm test && npm run
build` clean, and with real browser verification against the demo export in
all three theme modes and at least two viewport widths (AGENTS.md, "Testing
expectations"). This document is the only tracker: a phase is done when its
section here says what landed, and anything discovered along the way is
written into the findings above rather than filed somewhere else.

## 6. Not in scope

- Anything on SPEC §1's non-goals list unless SPEC §1 changes first — in
  particular multi-user editing, which is what real sync would be.
- A UI framework, a CSS framework, or a charting library. AGENTS.md.
- A runtime process editor.
