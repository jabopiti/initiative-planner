# SPEC: Initiative Cost Estimator (white-label core)

This document defines **what** the tool does and **why**, at a level a
developer or agent can build correctly from without ever seeing a
reference implementation. It intentionally does not prescribe markup,
CSS, or exact pixel-level interaction details — those are implementation
choices, guided by [DESIGN.md](DESIGN.md) and the invariants in
[AGENTS.md](AGENTS.md).

## 1. Purpose & scope

A single-user, local-first tool that estimates and tracks the cost of
running "initiatives" (projects) through two sequential approval gates —
one after a **Validation** phase, one after a **Development** phase — for
teams whose members are allocated to initiatives as a percentage of their
capacity.

There is no server, authentication, multi-user editing, FX conversion,
time tracking, or vacation modelling. Sharing happens through full JSON
export/import. Everything else lives only in the browser's `localStorage`
until exported.

### Non-goals (explicitly out of scope)

- Variable monthly allocations (a member's allocation is one percentage
  for the whole phase, not a per-month schedule).
- Multi-team initiatives (one initiative belongs to exactly one team).
- Scenario comparison / what-if modelling.
- Bulk actual-cost entry (actuals are entered one month at a time).
- Audit identity (the tool does not track *who* made a change).

## 2. Brand-pack surface

The following are **placeholder content**, not fixed product behavior —
see [DESIGN.md](DESIGN.md) for the exact contract:

- The two gates' display names (a real build might call them anything;
  this spec calls them **Gate 1** and **Gate 2** below, or "the Validation
  gate"/"the Development gate" when the distinction matters more than the
  name).
- Approval-track ("budget band") names and abbreviations.
- Role names, country names, day rates, team names, and team membership.
- All colors and the typeface.

Everything else in this document is durable product behavior.

## 3. Core definitions

- **Stage:** `Draft` → `In Validation` → `In Development` → `Closed`. One
  linear progression; a stage is never skipped except when backfilling an
  initiative that already existed when the tool was adopted.
- **State:** `Active`, `On Hold`, or `Cancelled` — independent of stage.
  On Hold and Cancelled initiatives are excluded from team capacity
  accounting but keep their cost calculations.
- **Approval track:** the budget band resolved from an initiative's
  blended grand estimate (see §5.5).
- **Estimate:** every relevant month is a forward projection (no actuals
  recorded yet).
- **Forecast:** some months have recorded actuals and the rest use
  estimates.
- **Actual:** every relevant month has a recorded actual.
- **Backfilled phase:** a phase whose gate was skipped because the
  initiative already existed when it was entered into the tool. It has no
  approval record and stays editable until the initiative closes.

## 4. Data model overview

(Full field-level shape is in [DESIGN.md](DESIGN.md) §2 — this section
describes the concepts, not the JSON shape.)

- **Role**: a job function with a cost-multiplying **factor** (1.00 = no
  overhead/uplift).
- **Country**: a location with a day rate and a monthly working-day
  reduction table (holidays), tracked for the current year plus the next
  two, rolling forward automatically.
- **Team**: a named group of **members**. Each member has a role, a
  country, and a **capacity %** ceiling (0–100%, defaults to 100%).
- **Budget band ("approval track")**: a `[lower, upper)` range over the
  grand estimate, with a name, an abbreviation, a severity, and an
  approval-requirement description.
- **Initiative**: belongs to one team, has a stage and a state, and has
  exactly two **phases** — Validation and Development.
- **Phase**: an estimated period (start/end date), a set of per-member
  allocations (capacity % committed to this phase), a set of non-labour
  cost items, an optional actual period, and a map of recorded actual
  costs by month.

## 5. Calculation contract

### 5.1 Working days

Working days in a month are weekdays minus that country's working-day
reduction for that month. A period's start and end months are prorated by
the share of weekdays actually covered; a whole month uses the full
working-day value.

### 5.2 Labour cost

For each member allocation, in each month it's active:

```text
person-days = working-days-in-period * allocation-percent * role-factor
labour-cost = person-days * country-day-rate
```

Both phases use per-member allocations (no team-level shortcut).

Each member also has a **capacity %** ceiling, independent of allocation
percentages. Allocation percentages remain percentages of full-time
capacity; the ceiling limits a member's total concurrent commitment across
all active/on-hold-excluded initiatives and does **not** scale labour
cost. Remaining capacity is `max(0, capacityPct - allocatedPct)` and
becomes **non-initiative work** cost (see §7.2), costed at the same rate.
Allocations above the ceiling warn but are never blocked.

### 5.3 Phase and grand totals

```text
phase estimate = labour cost + non-labour cost items
grand estimate = Validation estimate + Development estimate
```

A cost item counts toward the total even if its date falls outside the
phase's period — it's marked "out of period" rather than silently
dropped.

### 5.4 Actual tracking

For each costed month, the tool uses the recorded actual if present, the
estimate otherwise. A phase's total is the sum of those month values. The
grand total is labelled **Estimate**, **Forecast**, or **Actual**
according to actual coverage (see §3).

A phase's costed months are not bounded by its estimate period alone — an
actual start/end date, or a recorded actual month, can extend coverage
earlier or later than originally estimated (e.g. a phase that overran its
estimated end date). Every monthly-cost view must reflect that full month
set, or overrun actuals silently disappear from the picture. There is no
"estimate-only" chart mode; monthly views always show the blended figure.

### 5.5 Approval tracks

The blended grand estimate is matched against the configured bands using
lower-inclusive, upper-exclusive bounds. A value falling in a gap between
band definitions resolves to **Not yet known** — it is never assigned to
the nearest band. A later total that resolves to a worse band than the one
recorded at the initiative's last passed gate raises an escalation
warning (and a better band raises a de-escalation note).

## 6. Lifecycle contract

- **Gate 1** (Validation's gate) requires a complete Validation period
  *and* a complete Development period, each with at least one member
  allocated above 0%.
- **Gate 2** (Development's gate) requires a complete Development period
  with at least one member allocated above 0%.
- Passing a gate asks for the gate date (defaulting to today) and, on
  confirmation:
  - Freezes that phase's estimate (labour, monthly costs, and the
    role/country data used to calculate them — later master-data changes
    never move an approved figure).
  - Records an approval (grand total, resolved band, per-phase costs, gate
    date). Gate 1's record uses both phases' *estimates*. Gate 2's record
    uses Validation's *forecast* (actuals where known, estimates for the
    rest) plus Development's *estimate*.
  - Advances the stage.
- Reopening reverses exactly one stage transition: clears that gate's
  approval record, discards the frozen estimate, and returns the phase to
  editable — but never touches recorded actuals.
- Closing locks all phases and actuals. Missing actuals are a warning, not
  a blocking condition; unfilled months stay at their estimate.
- A backfilled phase (§3) has no approval record and stays editable until
  close, regardless of stage.

## 7. Screens & flows

Six screens share one live data model; changes on one screen are visible
immediately on any other. The shell (always visible) has a wordmark, top
navigation (Portfolio / Initiatives / Teams / Settings), an Export/Import
pair, and a theme toggle (System / Light / Dark, remembered across
reloads). A dismissable-by-action banner appears once too long has passed
since the last export, escalating in urgency the longer it's been ignored.

### 7.1 Portfolio (read-only, cross-team)

- A row of clickable tiles, one per approval track plus "Not yet known"
  (incomplete estimates), each showing the track's total cost and
  initiative count. Clicking a tile filters everything below to that
  track; clicking it again clears the filter.
- A stacked bar chart of blended cost per month for a selectable year
  (previous/current/next, plus a "jump to today" control), one colored
  segment per active initiative, current month highlighted, hovering a
  segment shows its name and cost.
- A filtered table of initiatives (name, team, stage, state, period,
  approval track, approved total, effective total, variance), sortable by
  several columns.
- No creation, no editing, no capacity information here — purely a
  read-only cross-cutting view.

### 7.2 Teams

- A card grid of teams (name, active member count, active initiative
  count), with create/deactivate/delete actions. A team can't be deleted
  while any initiative still references it.
- A team's detail page has an editable name, a member roster (add, edit,
  deactivate — never a hard delete once referenced), a **capacity grid**,
  a **cost run-rate chart**, and a table of the team's own initiatives.
- The capacity grid has one row per active member (with a **non-initiative
  work** summary row) and one column per month, showing each member's
  allocation percentage for that month. Over-allocation (sum of a
  member's active-initiative allocations exceeding their capacity %)
  warns visually but is never blocked. Clicking a cell shows which
  initiatives contribute to that month's allocation and by how much,
  since a member can be allocated to more than one initiative at once.
- **Non-initiative work**: the capacity a member isn't committed to any
  initiative (`max(0, capacity% - allocated%)`) is costed at the same day
  rate and shown as a cost figure — this is ongoing work outside the
  initiative portfolio (support, maintenance, etc.), not idle time.
- The run-rate chart stacks each month's cost by initiative (plus a
  non-initiative-work segment) for a selectable year, mirroring the
  Portfolio chart's interaction pattern but scoped to one team.

### 7.3 Initiatives (registry)

- A searchable, filterable (team / stage / state / approval track), sortable
  table of every initiative, with row actions: open, duplicate (copies
  descriptions/estimates, never actuals/approvals; always restarts at
  Draft), and a quick state change (Active/On Hold/Cancelled).
- "New initiative" launches the creation wizard (§7.5).

### 7.4 Initiative detail

- A stepper showing the four stages, with the current one highlighted and
  passed ones marked done.
- A stage banner: plain-language state of what's approved/locked, what's
  still needed, and the primary gate action (disabled with an explanation
  until its precondition is met). Includes a "reopen previous stage"
  action once past Draft.
- A band panel: the grand total (labelled Estimate/Forecast/Actual per
  §3), the resolved approval track with its requirement text, a
  proportionally-scaled threshold bar showing where the total sits among
  all configured bands, and — once a gate has been passed — the variance
  since that approval plus an escalation/de-escalation callout if the
  live band has moved.
- Two phase panels (Validation, Development), each with: the estimated
  period, per-member allocation table (role, country, day rate, factor,
  capacity %, computed person-days and cost), a non-labour cost-item
  table, and a results summary. A locked phase shows read-only frozen
  figures; an open phase is fully editable.
- A month-by-month table blending estimate and actual across both phases,
  with a legend distinguishing editable / gap (in-period but nothing
  recorded) / current-month cells.
- Once at least one gate has been passed, a gate-comparison table:
  Validation, Development, approval track, and grand total at each passed
  gate plus the current live figures, side by side.
- Both the month table and the gate-comparison table (plus each phase's
  allocation table) can be copied to the clipboard (as both plain text and
  rich HTML, for pasting into a spreadsheet or document) or downloaded as
  CSV, per named table.

### 7.5 Creation wizard

Two steps, resumable — leaving and returning never loses progress:

1. **General**: name, description, team, and a starting stage (Draft, or
   "already at Gate 1"/"already at Gate 2" for backfilling existing work).
   Saving here creates the initiative as a Draft immediately.
2. **Estimates**: the same Validation/Development phase panels used on the
   detail page. A running grand total and resolved approval track update
   live as the estimate is filled in. Finishing is allowed even if the
   estimate isn't complete yet — an unmet gate precondition is only
   surfaced as guidance, never as a block; the gate itself is what
   actually blocks progress later, not the wizard.

### 7.6 Settings

- **Overview**: summary tiles (team count, member count with active
  subset, active role count, active country count with rate range,
  approval-track count, days since last export).
- **Roles**: name, abbreviation, and factor, each independently
  add/edit/deactivate-able (never hard-deleted once referenced).
- **Countries & rates**: name and day rate, with an expandable per-month
  working-day-reduction table for the rolling three-year window.
- **Budget bands ("approval tracks")**: name, abbreviation (shown on the
  threshold bar), lower/upper bound, requirement text, and severity —
  fully add/edit/delete-able. A warning surfaces any gap or overlap
  across the full range.
- **General**: currency symbol, and the number of days of inactivity
  before the export-reminder banner appears.
- **Data**: export (full JSON: master data, every initiative, every
  actual, every approval) and import, with a **Replace all** vs **Merge**
  choice and a preview of what would change (and which approval records a
  Merge would overwrite) before committing.
- **Danger zone**: reset to a fresh installation (clears all local
  storage), irreversible.

## 8. Cross-cutting behavior

- **Theming**: System (follows OS preference), Light, or Dark, cycled by
  one control and remembered across reloads. Every screen must repaint
  correctly under all three without needing a page reload.
- **Import/export**: the export file is the entire data model plus a
  schema version number. An import with an unrecognized schema version is
  rejected outright — there is no migration path for an incompatible file.
- **Copy/CSV export**: available on every major table (month-by-month,
  each phase's allocations, the gate comparison) — see §7.4.

## 9. Glossary

| Term | Meaning |
|---|---|
| Stage | Draft → In Validation → In Development → Closed |
| State | Active, On Hold, or Cancelled |
| Approval track | The budget band resolved from the grand estimate |
| Capacity % | A member's ceiling on total concurrent commitment |
| Non-initiative work | A member's unallocated capacity, costed the same as initiative work |
| Estimate / Forecast / Actual | See §3 |
| Backfilled phase | A phase whose gate was skipped when entering pre-existing work |
