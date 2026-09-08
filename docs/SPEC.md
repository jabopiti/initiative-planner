# SPEC: Initiative Planner (white-label core)

This document defines **what** the tool does and **why**, at a level a
developer or agent can build correctly from without ever seeing a
reference implementation. It intentionally does not prescribe markup,
CSS, or exact pixel-level interaction details — those are implementation
choices, guided by [DESIGN.md](DESIGN.md) and the invariants in
[AGENTS.md](../AGENTS.md).

## 1. Purpose & scope

A single-user, local-first tool for planning the **cost** and the
**people capacity** of "initiatives" (projects) as they run through a
configurable approval process. Cost and capacity are co-equal outputs:
the tool answers both "what will this initiative cost, and what was it
approved at?" and "who is committed to what, and by how much?".

Every initiative passes through two costed, gated phases — **Validation**
and **Development** — optionally followed by any number of user-defined
status stages. People are allocated to initiatives as a percentage of
their capacity, and a person may belong to more than one team.

There is no server, authentication, multi-user editing, FX conversion,
time tracking, or vacation modelling. Sharing happens through full JSON
export/import. Everything else lives only in the browser's `localStorage`
until exported.

### Non-goals (explicitly out of scope)

- Variable monthly allocations (an allocation is one percentage for the
  whole phase, not a per-month schedule). This applies equally to how a
  person's capacity is split across teams (§3): one static share per
  membership, never a schedule.
- Cost or capacity on status stages. Only Validation and Development are
  costed and consume capacity — see the note below.
- Multi-team initiatives (one initiative belongs to exactly one team).
- Scenario comparison / what-if modelling.
- Bulk actual-cost entry (actuals are entered one month at a time).
- Audit identity (the tool does not track *who* made a change).

**On status stages carrying no capacity.** An initiative sitting in a
post-Development stage — a rollout, a benefits review — draws zero
capacity and shows nothing in any team grid, even though people may still
be working on it. This is a deliberate trade, not an oversight: effort
after Development is ongoing work rather than initiative delivery, and it
already has a home in **non-initiative work** (§7.2). Attributing it per
initiative would require a third allocation surface with no gate, no
band, and no approval to hang it from.

## 2. Brand-pack surface

The following are **placeholder content**, not fixed product behavior —
see [DESIGN.md](DESIGN.md) for the exact contract:

- The **seeded process**: the labels of every stage in the progression,
  including the two costed phases and their gates. These are ordinary
  editable data (§7.7) that the brand pack merely supplies a default for
  — this spec calls them **Validation**, **Development**, **Gate 1** and
  **Gate 2** throughout, but a real build may call them anything.
- Approval-track ("budget band") names and abbreviations.
- Role names, country names, day rates, team names, and people.
- All colors and the typeface.

Everything else in this document is durable product behavior.

## 3. Core definitions

- **Stage:** one linear progression, configured once for the whole tool
  (§7.7) and shared by every initiative:

  ```text
  Draft → Validation → Development → [status stages…] → Closed
          └─ costed, gated ──┘        └── status only ──┘
  ```

  `Draft`, `Validation`, `Development` and `Closed` always exist, always
  in that order, and cannot be removed. Between Development and Closed
  the user may define any number of **status stages** (including none).
  Every stage's display label is editable; its internal identity is not.
  A stage is never skipped except when backfilling an initiative that
  already existed when the tool was adopted.
- **Costed phase:** `Validation` or `Development` — the only two stages
  that carry a period, allocations, cost items, actuals, a gate and an
  approval. Referred to as a **phase** throughout.
- **Status stage:** a user-defined stage after Development. It records
  only that the initiative reached it, and when. No period, no
  allocations, no cost, no capacity, no gate, no approval.
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
- **Person:** someone who can be allocated to initiatives. A person has a
  country, a **capacity %** ceiling, and either a standard role or a
  custom role (§4). People exist independently of teams — a person with
  no team is valid (not yet assigned, or on the bench).
- **Membership:** a person's association with one team, carrying a
  **share %** of that person's capacity. A person may hold several
  memberships; the shares say how their capacity is divided. Membership
  also governs allocation: only a team's members may be allocated to that
  team's initiatives.
- **Custom role:** a free-text role label with an absolute day rate,
  configured on one person rather than in shared master data. Used for
  contractors and anyone whose rate is individually negotiated.

## 4. Data model overview

(Full field-level shape is in [DESIGN.md](DESIGN.md) §2 — this section
describes the concepts, not the JSON shape.)

- **Role**: a job function with a cost-multiplying **factor** (1.00 = no
  overhead/uplift). A role carries no rate of its own — the rate comes
  from the person's country.
- **Country**: a location with a **per-year record** holding that year's
  day rate and its monthly working-day reduction table (holidays). Years
  are tracked for the previous year, the current year, and the next two,
  rolling forward automatically. The previous year is tracked so that
  backfilled phases (§3) reaching into last year cost against that year's
  own rate and holidays.
- **Person**: a name, a country, an **active** flag, a **capacity %**
  ceiling (0–100%, defaults to 100%), and exactly one of a **role** or a
  **custom role** (a free-text label plus its own per-year day rate). A
  person holds zero or more memberships.
- **Team**: a named group. A team owns no people of its own — its roster
  is every person holding a membership in it.
- **Membership**: links one person to one team with a **share %** of that
  person's capacity, and an **active** flag. A person's active shares
  should sum to no more than their capacity %; exceeding it warns but is
  never blocked.

  Three percentages are in play and must never be conflated: **capacity
  %** is a person's ceiling across everything; **share %** is how much of
  that ceiling one team holds; **allocation %** (§5.2) is what a single
  phase commits, always expressed as a percentage of full-time capacity.
- **Budget band ("approval track")**: a `[lower, upper)` range over the
  grand estimate, with a name, an abbreviation, an approval-requirement
  description, and a **severity** — an integer rank where higher means
  stricter oversight. Severity is ordered independently of the monetary
  bounds, so a low-cost band can still carry heavy approval, and it is
  the only thing compared when deciding whether one band is worse than
  another.
- **Initiative**: belongs to one team, has a stage and a state, and has
  exactly two costed **phases** — Validation and Development — plus a
  record of when it entered each status stage it has reached.
- **Phase**: an estimated period (start/end date), a set of per-person
  allocations (the allocation % committed to this phase), a set of
  non-labour cost items, an optional actual period, and a map of recorded
  actual costs by month.
- **Process**: the ordered stage progression (§3) and every stage's
  editable label, including the two phases and their gate names. One
  process, shared by every initiative.

## 5. Calculation contract

### 5.1 Working days

Working days in a month are weekdays minus the reduction recorded for
that month in the person's country, **for that month's year**. A period's
start and end months are prorated by the share of weekdays actually
covered; a whole month uses the full working-day value.

### 5.2 Labour cost

For each person allocation, in each month it's active:

```text
person-days = working-days-in-period * allocation-percent * factor
labour-cost = person-days * day-rate
```

Both phases use per-person allocations (no team-level shortcut). Only
Validation and Development are costed; status stages contribute nothing
(§1).

**Rate resolution.** `factor` and `day-rate` depend on how the person is
configured, and both are read for the *month's own year* (`y`):

| Person has | `day-rate` | `factor` |
|---|---|---|
| a standard role | that person's country rate for `y` | the role's factor |
| a custom role | the person's own custom rate for `y` | `1.00` |

A custom rate is absolute: it replaces the country rate and bypasses the
role factor entirely, since a negotiated contractor rate already includes
whatever overhead a factor would model. Working days always come from the
person's country regardless — a contractor still observes their country's
holidays. A year outside the tracked window clamps to the nearest tracked
year for the rate exactly as it does for working days (§4).

**Ceilings.** Allocation percentages are always percentages of full-time
capacity, and no ceiling ever scales labour cost. Two ceilings apply, and
neither ever blocks — both only warn:

- **Team share.** Within one team, a person's allocations across that
  team's initiatives should not exceed their `share %` for that team.
- **Personal capacity.** Across all teams, a person's allocations should
  not exceed their `capacity %`.

Remaining capacity within a team — `max(0, sharePct - allocatedPct)` for
that team's initiatives — becomes **non-initiative work** cost (§7.2),
costed at the same rate. Because each team draws on its own share, the
non-initiative work of a person split across teams divides between them
without double-counting. A person holding no membership has no
non-initiative work anywhere; their unused capacity shows only on their
own detail page (§7.3).

Only a team's members may be allocated to that team's initiatives. If a
membership is later deactivated, existing allocations remain and keep
costing — the work was estimated and, once gated, approved — but the
membership stops contributing share or capacity from that point on. The
Person and Team detail pages both surface this as a warning naming the
affected initiatives.

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
lower-inclusive, upper-exclusive bounds. A value that no band covers —
whether it falls in a gap between two definitions or below the lowest
band's lower bound — resolves to **Not yet known**, and is never assigned
to the nearest band.

"Not yet known" means exactly one thing: *the configured bands do not
cover this total*. It is a statement about band configuration, never
about how complete the estimate is. An initiative with a half-finished
estimate resolves normally against whatever band covers its current
total; an initiative with a total of zero resolves to "Not yet known"
only if no band covers zero.

A later total that resolves to a band of **higher severity** than the one
snapshotted at the initiative's last passed gate raises an escalation
warning; lower severity raises a de-escalation note. The comparison is on
severity alone (§4), read from the approval's snapshot, so it survives a
band being renamed, re-bounded, or deleted afterwards.

## 6. Lifecycle contract

- **Gate 1** (Validation's gate) requires a complete Validation period
  *and* a complete Development period, each with at least one person
  allocated above 0%.
- **Gate 2** (Development's gate) requires a complete Development period
  with at least one person allocated above 0%.
- Passing a gate asks for the gate date (defaulting to today) and, on
  confirmation:
  - Freezes that phase's estimate (labour, monthly costs, and the
    role/country data used to calculate them — later master-data changes
    never move an approved figure).
  - Records an approval: the grand total, a *snapshot* of the resolved
    band (§5.5), the per-phase costs, and the gate date. Gate 1's record
    uses both phases' *estimates*; Gate 2's uses Validation's *forecast*
    (actuals where known, estimates for the rest) plus Development's
    *estimate*.
  - Advances the stage.
- **Reopening** reverses exactly one stage transition — always the most
  recent one, never an earlier one still buried under it. It undoes
  whichever transition produced the current stage: clears that gate's
  approval record, discards that phase's frozen estimate, and returns
  the phase to editable. It never touches recorded actuals. Gate 1
  therefore cannot be reopened while Gate 2 is passed — reopen Gate 2
  first. Reopening from `Closed` returns the initiative to the stage it
  was closed from and unlocks every phase and actual that closing
  locked, without clearing any approval, since closing records none of
  its own.
- **Closing** is an explicit action available from the stage banner at any
  stage past `Draft`; it is not automatic and has no gate. It locks all
  phases and all actuals. Missing actuals are a warning, not a blocking
  condition; unfilled months stay at their estimate. Closing from `In
  Validation` (abandoning work before Development) is allowed.
- **A gate never advances an initiative into `Closed`.** Passing a gate
  moves it to the next stage unless that stage is `Closed`, in which case
  it stays where it is with its approval recorded. With no status stages
  configured, passing the final gate therefore leaves the initiative in
  Development, gated and awaiting an explicit close — because closing is
  always a decision someone makes, never a side effect of approving a
  budget.
- **Advancing through a status stage** needs no gate, no estimate and no
  approval. The initiative moves to the next stage in the configured
  progression and records the date it got there. Nothing is frozen or
  locked, because a status stage owns nothing to freeze.
- **Reopening a status stage** simply steps back one stage and discards
  that entry date. The rule is the same as everywhere else — only the
  most recent transition can be reversed — so reaching Closed and then
  reopening walks back one stage at a time.
- A backfilled phase (§3) has no approval record and stays editable until
  close, regardless of stage.
- Editing the process (§7.7) while initiatives are in flight is allowed:
  stages can be renamed and reordered freely. A status stage that any
  initiative currently sits in cannot be deleted, the same rule that
  protects a team still referenced by an initiative.

## 7. Screens & flows

Every page shares one live data model; a change made on one is visible
immediately on any other. The shell (always visible) has a wordmark, top
navigation (Portfolio / Initiatives / Teams / People / Settings), an
Export/Import pair, and a theme toggle (System / Light / Dark, remembered
across reloads).

Page kinds are named consistently throughout this document and in
[DESIGN.md](DESIGN.md) §5: an **overview** lists one entity type, a
**detail** page shows one instance of it, a **dashboard** is read-only and
cross-entity (Portfolio), **settings** is configuration organised in
sections, and a **flow** is a resumable multi-step task (the creation
wizard). A dismissable-by-action banner appears once too long has passed
since the last export, escalating in urgency the longer it's been ignored.

### 7.1 Portfolio (read-only, cross-team)

- A row of clickable tiles, one per approval track plus "Not yet known"
  (totals no configured band covers — see §5.5), each showing the track's
  total cost and initiative count. Clicking a tile filters everything
  below to that track; clicking it again clears the filter.
- A stacked bar chart of blended cost per month for a selectable year
  (previous/current/next, plus a "jump to today" control), one colored
  segment per active initiative, current month highlighted, hovering a
  segment shows its name and cost.
- A filtered table of initiatives (name, team, stage, state, period,
  approval track, approved total, effective total, variance), sortable by
  several columns.
- No creation, no editing, no capacity information here — purely a
  read-only cross-cutting view of cost. Capacity is a per-team and
  per-person question and lives on those pages (§7.2, §7.3).

### 7.2 Teams

- A card grid of teams (name, active member count, total share held,
  active initiative count), with create/deactivate/delete actions. A team
  can't be deleted while any initiative still references it.
- A team's detail page has an editable name, a **roster**, a **capacity
  grid**, a **cost run-rate chart**, and a table of the team's own
  initiatives.
- The roster is every person holding a membership in this team, with the
  share % that membership carries. People are added by assigning an
  existing person (created on the People page, §7.3) and removed by
  deactivating the membership — never by a hard delete, and never by
  deleting the person, who may well belong to another team. Editing a
  share here is the same edit as editing it on the person.
- The capacity grid has one row per active member (with a **non-initiative
  work** summary row) and one column per month, showing each member's
  allocation percentage for that month. Rows are bounded by the member's
  **share %** in this team, not by their full personal capacity — a
  person split 60/40 across two teams shows against 60 here. Over-
  allocation warns visually but is never blocked. Clicking a cell shows
  which initiatives contribute to that month's allocation and by how
  much, since a member can be allocated to more than one initiative at
  once.
- **Non-initiative work**: the share a member isn't committed to any of
  this team's initiatives (`max(0, share% - allocated%)`) is costed at
  the same day rate and shown as a cost figure — ongoing work outside the
  initiative portfolio (support, maintenance, etc.), not idle time.
  Because each team draws only on its own share, a person split across
  teams contributes non-initiative work to each without being counted
  twice.
- The run-rate chart stacks each month's cost by initiative (plus a
  non-initiative-work segment) for a selectable year, mirroring the
  Portfolio chart's interaction pattern but scoped to one team.

### 7.3 People

A person exists independently of any team, which is what lets one person
belong to two.

**Overview.** A searchable, filterable (team / role / country / active),
sortable table of every person: name, role — or their custom role's label
— country, the day rate in force for the selected month, capacity %, the
teams they belong to with each share, their total allocation for the
selected month, and utilisation.

A **month picker** sits at the top of the page and defaults to the current
month. Every allocation and utilisation figure in the table describes that
one month, the same way the team capacity grid reads one column at a time.
Utilisation is `allocated% / capacity%`; anyone over 100% is flagged, and
the flag is a warning, never a block.

Row actions: open, and deactivate (never a hard delete once referenced).
"New person" creates one directly — people are not created from inside a
team.

**Detail.** The page is deliberately plain: the fields are directly
editable rather than hidden behind a modal.

- **Identity and rate**: name, country, capacity %, and a choice between a
  **standard role** (picked from Settings; the rate comes from the
  country) and a **custom role** (a free-text label plus its own day rate
  per year, over the same rolling four-year window as countries). Exactly
  one of the two applies — choosing custom reveals the label and rate
  table, and the role factor stops applying (§5.2).
- **Teams**: every membership with its share %, addable, editable and
  deactivatable here. A running total shows the shares against the
  person's capacity, warning if they exceed it.
- **Initiatives**: every initiative this person is allocated to — team,
  initiative, phase, allocation %, and period — so the question "where
  does this person's time actually go?" is answered on one page. Any
  allocation surviving a deactivated membership (§5.2) is called out here
  by name.
- **Capacity over time**: a month-by-month view across the rolling window
  showing allocation against capacity, with each team's non-initiative
  work broken out, and over-allocated months marked.

Both the person's initiative table and the capacity-over-time view can be
copied or downloaded as CSV, like every other major table (§8).

### 7.4 Initiatives (registry)

- A searchable, filterable (team / stage / state / approval track), sortable
  table of every initiative, with row actions: open, duplicate (copies
  descriptions/estimates, never actuals/approvals; always restarts at
  Draft), and a quick state change (Active/On Hold/Cancelled).
- "New initiative" launches the creation wizard (§7.6).

### 7.5 Initiative detail

- A stepper showing every stage in the configured progression (§3), with
  the current one highlighted and passed ones marked done. Passed phases
  show their gate date, taken from the approval; passed status stages
  show the date the initiative reached them.
- A stage banner: plain-language state of what's approved/locked, what's
  still needed, and the primary action for this stage — a gate, if the
  current stage is a phase, otherwise simply advancing to the next status
  stage. A gate action is disabled with an explanation until its
  precondition is met; advancing a status stage has no precondition.
  Includes a "reopen previous stage" action once past Draft, and a
  "close" action at every stage past Draft (§6).
- A band panel: the grand total (labelled Estimate/Forecast/Actual per
  §3), the resolved approval track with its requirement text, a
  proportionally-scaled threshold bar showing where the total sits among
  all configured bands, and — once a gate has been passed — the variance
  since that approval plus an escalation/de-escalation callout if the
  live band has moved.
- Two phase panels (Validation, Development), each with: the estimated
  period, a per-person allocation table (person, role or custom-role
  label, country, day rate, factor, allocation %, computed person-days
  and cost), a non-labour cost-item table, and a results summary. Only
  people holding an active membership in the initiative's team can be
  added; a person already allocated through a since-deactivated
  membership stays listed, with a warning (§5.2). A locked phase shows
  read-only frozen figures; an open phase is fully editable.
- No panel for status stages. They carry nothing to show beyond the date
  in the stepper.
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

### 7.6 Creation wizard

Two steps, resumable — leaving and returning never loses progress:

1. **General**: name, description, team, and a starting stage — `Draft`,
   or any later stage in the configured progression for backfilling work
   that already existed when the tool was adopted. Saving here creates
   the initiative immediately.
2. **Estimates**: the same Validation/Development phase panels used on the
   detail page. A running grand total and resolved approval track update
   live as the estimate is filled in. Finishing is allowed even if the
   estimate isn't complete yet — an unmet gate precondition is only
   surfaced as guidance, never as a block; the gate itself is what
   actually blocks progress later, not the wizard.

### 7.7 Settings

- **Overview**: summary tiles (team count, people count with active
  subset, active role count, active country count with rate range,
  approval-track count, stage count, days since last export).
- **Roles**: name, abbreviation, and factor, each independently
  add/edit/deactivate-able (never hard-deleted once referenced).
- **Countries & rates**: name, plus one record **per year** over the
  rolling four-year window (§4) holding that year's day rate and its
  expandable per-month working-day-reduction table. A rate is always read
  for the year of the month being costed, so a rate rise next year
  affects next year's months only.
- **Budget bands ("approval tracks")**: name, abbreviation (shown on the
  threshold bar), lower/upper bound, requirement text, and severity
  (§4) — fully add/edit/delete-able. A warning surfaces any gap or
  overlap across the full range. A band may declare no upper limit, which
  closes the range upward; the gap warning treats such a band as covering
  everything above its lower bound, and flags a second unbounded band as
  an overlap.
- **Process**: the stage progression (§3). `Draft`, `Validation`,
  `Development` and `Closed` are listed but cannot be removed or
  reordered; the user adds, renames, reorders and deletes **status
  stages** between Development and Closed, and may rename any stage in
  the list including the four fixed ones. The two phases additionally
  carry their **gate names**. A status stage that any initiative
  currently sits in cannot be deleted, and the attempt says which
  initiatives are blocking it. Zero status stages is a valid process.
- **General**: currency symbol, and the number of days of inactivity
  before the export-reminder banner appears.
- **Data**: export (full JSON: master data, the process, every person,
  every initiative, every actual, every approval) and import, with a
  **Replace all** vs **Merge** choice and a preview of what would change
  (and which approval records a Merge would overwrite) before committing.
  A Merge replaces a person's record **wholesale**, memberships included,
  rather than reconciling memberships one by one — the preview says which
  people that affects.
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
  each phase's allocations, the gate comparison, the People overview, a
  person's initiative and capacity tables) — see §7.5 and §7.3.

## 9. Glossary

| Term | Meaning |
|---|---|
| Stage | Draft → Validation → Development → [status stages…] → Closed (§3) |
| State | Active, On Hold, or Cancelled |
| Approval track | The budget band resolved from the grand estimate |
| Severity | A band's integer oversight rank; higher is stricter (§4) |
| Not yet known | A total no configured band covers (§5.5) |
| Capacity % | A person's ceiling on total concurrent commitment |
| Allocation % | The share of full-time capacity a person is committed at on one phase — not a ceiling |
| Share % | How much of a person's capacity one team holds (§4) |
| Person | Someone allocatable to initiatives; exists independently of teams |
| Membership | A person's link to one team, carrying a share % |
| Custom role | A per-person role label with its own absolute day rate (§5.2) |
| Costed phase | Validation or Development — the only stages carrying cost and capacity |
| Status stage | A user-defined stage after Development; records only that it was reached |
| Non-initiative work | The share of a person a team holds but hasn't allocated, costed the same as initiative work |
| Estimate / Forecast / Actual | See §3 |
| Backfilled phase | A phase whose gate was skipped when entering pre-existing work |
