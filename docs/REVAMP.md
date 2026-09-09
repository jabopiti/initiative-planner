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

| Workstream | Status |
|---|---|
| Silent-write bug (§4.7, first half) | **Landed** — `ae327ab` |
| §4.1 Foundation — split `app.js` | Not started — **next** |
| §4.1 Foundation — hash routing | Not started |
| §4.1 Foundation — design system | Not started |
| §4.1 Foundation — formatting module | Not started |
| §4.1 Foundation — interaction patterns | Not started |
| §4.2 Entity flows | Not started |
| §4.3 Settings | Not started |
| §4.4 Initiative detail | Not started |
| §4.5 Overviews, capacity, charts | Not started |
| §4.6 Copy, states, first run, accessibility | Not started |
| §4.7 File System Access persistence | Not started |
| §4.8 Brand pack | Not started |

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

---

## 2. What a full read of the code turned up

The review stopped early, on the correct instinct that the overall problems
came first. Reading the whole app against it found four things the notes never
reached — and one of them is a straight functional gap.

### 2.1 Reachability and shape

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

**Tables have no sticky headers.** The capacity grid is thirteen columns, and
the month-by-month table scrolls inside a 28rem box. Scroll either and the
column meanings are gone. This sits directly under the review's "input
patterns for tables need to be much better".

**`.tag` means at least seven different things** — custom rate, no longer in
this team, out of period, now, skipped, costed, band abbreviation. One visual
treatment carrying seven semantics is a large part of why the review found
hierarchy hard to read. The component set in §4.1 needs distinct badge kinds
with distinct meanings.

**The `⚠` character is used as the warning marker** in several places, which
renders differently on every platform and will not survive an icon system.

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

**Routing.** Hash-based, with `navigate()` writing the hash and a
`hashchange` listener driving `render()`. Reload restores the page, Back works,
an initiative has a link. Focus moves to `main` on navigation and the change
is announced.

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

**Formatting.** One module owning money, dates, months and numeric parsing —
English only, per D6. Every raw ISO string in the UI goes through it, and
`readNumber` rejects what it cannot parse instead of silently mis-parsing it.

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

**Invariants that must survive all of it** (AGENTS.md, restated only because
this is where they get broken): typing never rebuilds the active input or
moves the caret; popovers position off the trigger's rectangle; replaced
regions re-wire their listeners; table cells declare their own colour; tokens
only, never a literal.

### 4.2 Entity flows

Applying §4.1 to the create and edit paths for people, teams, roles,
countries and memberships — where D1 becomes real behaviour, and where the
review's "a person is just created with no chance to cancel" is answered.

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

### 4.8 Brand pack (D8)

Widen the design surface from four custom properties to a small deliberate
set — accent plus a neutral ramp, radius, density, type scale, font and
wordmark — and fix the wordmark hole (§2.5). No locale, per D6. Bump the brand-pack contract
version, since the shape changes. Document the whole surface in DESIGN §4, and
verify the default still looks intentional with every knob left alone: that is
the actual test of "good out of the box".

---

## 5. Sequencing

```
§4.7 silent-write bug — landed already, alone, ahead of everything else
   ↓
§4.1 Foundation
     split app.js → routing → design system → formatting → patterns
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
