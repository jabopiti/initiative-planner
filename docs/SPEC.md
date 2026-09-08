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
stage-gate process. Cost and capacity are co-equal outputs: the tool
answers both "what will this initiative cost, and what was it approved
at?" and "who is committed to what, and by how much?".

The process itself — which phases exist, which of them carry cost, what
each gate requires — is **fixed when the tool is built**, not configured
by the person using it. A stage-gate process is a governance decision an
organisation makes once; the end user is presented with it and works
within it. See §2.

People are allocated to initiatives as a percentage of their capacity,
and a person may belong to more than one team.

### Non-goals (explicitly out of scope)

- Editing the process at runtime. Phases, gates, checklist definitions
  and approval tracks are compiled in (§2). Changing them means a new
  build.
- Variable monthly allocations (an allocation is one percentage for the
  whole phase, not a per-month schedule). This applies equally to how a
  person's capacity is split across teams (§3): one static share per
  membership, never a schedule.
- Cost or capacity on non-costed phases. A phase either carries the full
  cost model or nothing at all — never something in between.
- Multi-team initiatives (one initiative belongs to exactly one team).
- Scenario comparison / what-if modelling.
- Bulk actual-cost entry (actuals are entered one month at a time).
- Audit identity (the tool does not track *who* made a change).

## 2. What the build fixes, and what the user changes

This is the central distinction in the product, and every other section
depends on it.

**Fixed by the build** (the brand pack — see [DESIGN.md](DESIGN.md) §4):

- **The process**: an ordered list of phases, each with a display label
  and a flag saying whether it is **costed**. Each phase has exactly one
  **exit gate**, with its own label, whether it requires cost estimates,
  whether it may be **skipped**, and its **checklist item** definitions.
- **Approval tracks** (budget bands): name, abbreviation, bounds,
  requirement text and severity.
- **The currency symbol.**
- **A process identity** — an id and a version — so a dataset can never
  be read by a build whose process disagrees with it (§8).
- All colours and the typeface.
- Placeholder seed data for roles, countries, teams and people.

**Editable by the user**, in Settings (§7.8):

- Roles: name, abbreviation, cost factor, active.
- Countries: name, and a day rate and holiday reductions **per year**.
- Teams and people, with their memberships and shares.
- The export-reminder threshold.
- Export, import and reset.

The process is visible but not editable, on its own page (§7.7).

Everything in this document other than the fixed items above is durable
product behaviour, identical in every build.

## 3. Core definitions

- **Phase:** where an initiative currently is. The process defines an
  ordered list of them — for example *Discovery → Validation →
  Development → Rollout* — shared by every initiative. A phase is
  **costed** or not; only a costed phase carries a period, allocations,
  cost items and actuals. A non-costed phase records only that the
  initiative reached it.
- **Gate:** the transition out of one phase. Every phase has exactly one,
  including the last, whose gate is what **closes** the initiative. A
  gate defines what an initiative must satisfy to move on: cost figures,
  checklist items, or both.
- **Status:** `Active`, `On Hold`, `Cancelled` or `Closed` — independent
  of phase, and not to be confused with it. An initiative in the
  Development phase may be on hold; a closed initiative stays in whatever
  phase it reached. On Hold and Cancelled initiatives are excluded from
  team capacity accounting but keep their cost calculations. Closed and
  Cancelled both freeze the initiative (§6).
- **Checklist item:** a named condition on a gate, defined by the build
  with a name and a description. Against each initiative it carries a
  **status** — red, amber or green, starting red — and a free-text
  **note**, both set by the user. Red blocks the gate; amber lets it pass
  with a warning; green passes cleanly.
- **Approval track:** the budget band resolved from an initiative's
  blended grand estimate (see §5.5).
- **Estimate:** every relevant month is a forward projection (no actuals
  recorded yet).
- **Forecast:** some months have recorded actuals and the rest use
  estimates.
- **Actual:** every relevant month has a recorded actual.
- **Skipped gate:** a gate passed over rather than satisfied, with a
  **reason** the user must supply. It records that it was skipped and
  why, approves nothing, and freezes nothing — so the phase it exits
  stays editable. Entering an initiative that already existed when the
  tool was adopted skips every gate behind it, for the same reason and by
  the same mechanism.
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

- **Process**: the ordered phases and their gates, fixed by the build
  (§2). Phase and gate **identifiers** are permanent and never shown; the
  labels beside them are what a user reads.
- **Role**: a job function with a cost-multiplying **factor** (1.00 = no
  overhead/uplift). A role carries no rate of its own — the rate comes
  from the person's country.
- **Country**: a location with a **per-year record** holding that year's
  day rate and its monthly working-day reduction table (holidays). Years
  are tracked for the previous year, the current year, and the next two,
  rolling forward automatically. The previous year is tracked so that
  work entered retrospectively costs against that year's own rate and
  holidays.
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
- **Initiative**: belongs to one team, sits in one phase, has a status,
  and carries one record per phase it has reached and one per gate it has
  passed or skipped.
- **Phase record** (costed phases only): an estimated period (start/end
  date), a set of per-person allocations, a set of non-labour cost items,
  an optional actual period, and a map of recorded actual costs by month.
- **Gate record**: how a gate was left — **passed** or **skipped** — the
  date, the grand total and resolved band at that moment, the per-phase
  costs, and, for a skip, the reason.

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

Every costed phase uses per-person allocations (no team-level shortcut).
Non-costed phases contribute nothing (§1).

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
grand estimate = the sum of every costed phase's estimate
```

A cost item counts toward the total even if its date falls outside the
phase's period — it's marked "out of period" rather than silently
dropped. Every monthly view must therefore include that month, or the
month-by-month figures would not sum to the phase total.

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
snapshotted at the initiative's last **passed** gate raises an escalation
warning; lower severity raises a de-escalation note. A skipped gate
approved nothing, so it never sets that baseline. The comparison is on
severity alone (§4), read from the gate record's snapshot, so it survives
a band being changed in a later build.

## 6. Lifecycle contract

An initiative moves through the phases in order. Each phase is left by
its gate, and the last phase's gate is what closes the initiative.

### 6.1 Passing a gate

A gate can be passed when both hold:

- **Cost.** If the gate requires estimates, every costed phase in the
  process must have a complete period and at least one person allocated
  above 0%. Passing a gate approves the whole initiative's budget, not
  just the phase behind it, which is why the requirement looks forward as
  well as back. Phases already underway contribute their **forecast** —
  actuals where recorded, estimates for the rest — and phases still ahead
  contribute their estimate. A gate that does not require estimates skips
  this check entirely.
- **Checklist.** No item may be **red**. Amber items let the gate pass
  and are listed as a warning at the point of passing. Items start red,
  so a gate with a checklist is blocked until someone has actually looked
  at each item.

Missing actuals never block a gate; they only warn.

Passing asks for the gate date (defaulting to today) and, on
confirmation:

- **Freezes** the exited phase's estimate, if it is costed — labour,
  monthly costs, and the role, country and person data used to calculate
  them, so later master-data changes never move an approved figure.
- **Records a gate record**: passed, the date, the grand total, a
  *snapshot* of the resolved band (§5.5), and the per-phase costs. Every
  gate records one, whether or not it required cost; a gate passed before
  the estimate is complete simply snapshots a band of "Not yet known".
- **Advances** to the next phase — or, at the last gate, sets the status
  to **Closed**.

### 6.2 Skipping a gate

A gate the build marks as skippable can be passed over instead. Skipping
**requires a reason**, which is recorded and shown wherever the gate
record appears.

A skip bypasses both the cost and checklist checks, **approves nothing**
and **freezes nothing** — so the phase it exits stays editable for as long
as the initiative is open. It records that it was skipped, when, and why,
and it advances the phase exactly as passing does. It never becomes the
baseline for an escalation comparison (§5.5).

Entering an initiative that already existed when the tool was adopted
uses this same mechanism: creating it at a later phase records every gate
behind it as skipped, with a reason saying so. There is no separate
concept for it.

### 6.3 Reopening

Reopening reverses exactly one transition — always the most recent, never
an earlier one still buried under it. It clears that gate's record,
discards the frozen estimate if there was one, and returns to the
previous phase. Checklist statuses and notes are **kept**: what someone
assessed is a record, not a side effect of the gate, and re-passing is
quick if nothing has changed.

Reopening never touches recorded actuals. Reopening a closed initiative
reverses its final gate, which returns the status to Active and leaves it
in the last phase.

### 6.4 Closing and cancelling

**Closed** is reached only by passing or skipping the final gate. It is
never automatic and never a bare status change: finishing an initiative
is a governed act, and the last gate is what governs it.

**Cancelled** is for work abandoned before the process is finished. It is
a plain status change, available at any point.

Both freeze the whole initiative — every phase, every actual, and every
field on the initiative: name, description, team, status. The single
exception is **notes**, which stays writable, because recording why
something ended, or what happened afterwards, is exactly what a finished
initiative still needs to accept. Missing actuals are a warning, not a
blocking condition; unfilled months stay at their estimate.

## 7. Pages & flows

Every page shares one live data model; a change made on one is visible
immediately on any other. The shell (always visible) has a wordmark, top
navigation (Portfolio / Initiatives / Teams / People / Process /
Settings), an Export/Import pair, and a theme toggle (System / Light /
Dark, remembered across reloads). A dismissable-by-action banner appears
once too long has passed since the last export, escalating in urgency the
longer it's been ignored.

Page kinds are named consistently throughout this document and in
[DESIGN.md](DESIGN.md) §5: an **overview** lists one entity type, a
**detail** page shows one instance of it, a **dashboard** is read-only and
cross-entity (Portfolio), **settings** is configuration organised in
sections, and a **flow** is a resumable multi-step task (the creation
wizard).

### 7.1 Portfolio (read-only, cross-team)

- A row of clickable tiles, one per approval track plus "Not yet known"
  (totals no configured band covers — see §5.5), each showing the track's
  total cost and initiative count. Clicking a tile filters everything
  below to that track; clicking it again clears the filter.
- A stacked bar chart of blended cost per month for a selectable year
  (previous/current/next, plus a "jump to today" control), one colored
  segment per active initiative, current month highlighted, hovering a
  segment shows its name and cost.
- A filtered table of initiatives (name, team, phase, status, period,
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

- A searchable, filterable (team / phase / status / approval track),
  sortable table of every initiative, with row actions: open, duplicate
  (copies descriptions and estimates, never actuals, gate records or
  checklist statuses; always restarts at the first phase), and a quick
  status change.
- "New initiative" launches the creation wizard (§7.6).

### 7.5 Initiative detail

- A stepper showing every phase in the process, with the current one
  highlighted and completed ones marked. A phase left by a **passed**
  gate and one left by a **skipped** gate must be visually distinct — the
  difference is the whole point of recording a skip — and each shows its
  date. Hovering or opening a skipped gate shows its reason.
- A gate banner: plain-language state of what's approved or frozen, what
  the current phase's gate still needs, and the primary action. The gate
  action is disabled with an explanation until its preconditions are met
  (§6.1). Where the gate is skippable, a secondary "skip this gate"
  action sits beside it and requires a reason before it will complete.
  Includes a "reopen previous phase" action once past the first phase.
- A **checklist panel** for the current phase's gate, one row per item:
  its name and description, a red/amber/green control, and a note field.
  Red items are called out as blocking; amber ones as passable with a
  warning. Items with no checklist show no panel.
- A band panel: the grand total (labelled Estimate/Forecast/Actual per
  §3), the resolved approval track with its requirement text, a
  proportionally-scaled threshold bar showing where the total sits among
  all configured bands, and — once a gate has been passed — the variance
  since that approval plus an escalation/de-escalation callout if the
  live band has moved.
- One phase panel per **costed** phase, each with: the estimated period,
  a per-person allocation table (person, role or custom-role label,
  country, day rate, factor, allocation %, computed person-days and
  cost), a non-labour cost-item table, and a results summary. Only people
  holding an active membership in the initiative's team can be added; a
  person already allocated through a since-deactivated membership stays
  listed, with a warning (§5.2). A locked phase shows read-only frozen
  figures; an open phase is fully editable. Non-costed phases have no
  panel — they carry nothing to show beyond the stepper.
- A month-by-month table blending estimate and actual across every costed
  phase, with a legend distinguishing editable / gap (in-period but
  nothing recorded) / current-month cells.
- Once at least one gate has been left, a gate-comparison table: each
  costed phase, the approval track, and the grand total at every gate
  passed or skipped, plus the current live figures, side by side. Skipped
  gates are marked as such, with their reason.
- The month table, the gate-comparison table and each phase's allocation
  table can be copied to the clipboard (as both plain text and rich HTML,
  for pasting into a spreadsheet or document) or downloaded as CSV, per
  named table.

### 7.6 Creation wizard

Two steps, resumable — leaving and returning never loses progress:

1. **General**: name, description, team, and a starting phase. Starting
   anywhere but the first phase records every gate behind it as skipped,
   with a reason defaulting to something like "already in progress", which
   the user can edit (§6.2). Saving here creates the initiative
   immediately.
2. **Estimates**: the same phase panels used on the detail page, one per
   costed phase. A running grand total and resolved approval track update
   live as the estimate is filled in. Finishing is allowed even if the
   estimate isn't complete yet — an unmet gate precondition is only
   surfaced as guidance, never as a block; the gate itself is what
   actually blocks progress later, not the wizard.

### 7.7 Process (read-only)

The process is fixed by the build (§2), and this page is where a user
sees the rules they are working within — and where a wrong build becomes
obvious immediately.

- The phases in order, each marked costed or not, with its gate: the
  gate's name, whether it requires cost estimates, whether it may be
  skipped, and its checklist items with their descriptions.
- The approval tracks: name, abbreviation, bounds, requirement text and
  severity, shown against the same proportionally-scaled threshold bar
  used on an initiative, so the thresholds are legible rather than a list
  of numbers.
- The process identity and version, and the currency symbol.
- Nothing on this page is editable, and it offers no controls that
  suggest otherwise.

### 7.8 Settings

- **Overview**: summary tiles (team count, people count with active
  subset, active role count, active country count with rate range, days
  since last export).
- **Roles**: name, abbreviation, and factor, each independently
  add/edit/deactivate-able (never hard-deleted once referenced).
- **Countries & rates**: name, plus one record **per year** over the
  rolling four-year window (§4) holding that year's day rate and its
  expandable per-month working-day-reduction table. A rate is always read
  for the year of the month being costed, so a rate rise next year
  affects next year's months only.
- **General**: the number of days of inactivity before the export-reminder
  banner appears. The currency symbol is fixed by the build (§2) and
  shown on the Process page, not here.
- **Data**: export (full JSON: master data, every person, initiative,
  actual and gate record) and import, with a **Replace all** vs **Merge**
  choice and a preview of what would change (and which gate records a
  Merge would overwrite) before committing. A Merge replaces a person's
  record **wholesale**, memberships included, rather than reconciling
  memberships one by one — the preview says which people that affects.
- **Danger zone**: reset to a fresh installation (clears all local
  storage), irreversible.

## 8. Cross-cutting behavior

- **Theming**: System (follows OS preference), Light, or Dark, cycled by
  one control and remembered across reloads. Every page must repaint
  correctly under all three without needing a page reload.
- **Import/export**: the export file is the entire data model plus a
  schema version and the **process identity and version** (§2). An import
  is rejected outright if either disagrees with this build — there is no
  migration path for an incompatible file, and a dataset whose phases and
  gates mean something different is worse than no dataset at all. The
  rejection says which of the two failed.
- **Copy/CSV export**: available on every major table (month-by-month,
  each phase's allocations, the gate comparison, the People overview, a
  person's initiative and capacity tables) — see §7.5 and §7.3.

## 9. Glossary

| Term | Meaning |
|---|---|
| Phase | Where an initiative is in the process; costed or not (§3) |
| Gate | The transition out of a phase; the last one closes the initiative |
| Status | Active, On Hold, Cancelled or Closed — independent of phase |
| Checklist item | A named red/amber/green condition on a gate (§3) |
| Skipped gate | A gate passed over with a recorded reason; approves and freezes nothing |
| Approval track | The budget band resolved from the grand estimate |
| Severity | A band's integer oversight rank; higher is stricter (§4) |
| Not yet known | A total no configured band covers (§5.5) |
| Capacity % | A person's ceiling on total concurrent commitment |
| Allocation % | The share of full-time capacity a person is committed at on one phase — not a ceiling |
| Share % | How much of a person's capacity one team holds (§4) |
| Person | Someone allocatable to initiatives; exists independently of teams |
| Membership | A person's link to one team, carrying a share % |
| Custom role | A per-person role label with its own absolute day rate (§5.2) |
| Non-initiative work | The share of a person a team holds but hasn't allocated, costed the same as initiative work |
| Estimate / Forecast / Actual | See §3 |
