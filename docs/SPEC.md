# SPEC: Initiative Planner (white-label core)

The implementation is the source of truth for **what** this tool does. This
document keeps only what the code cannot tell you: the decisions behind it,
what is deliberately excluded, and the vocabulary everything else is named
after.

If the two ever disagree, the code wins and this document is wrong. See
[DESIGN.md](DESIGN.md) for the rules the code holds itself to, and
[AGENTS.md](../AGENTS.md) for the invariants.

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

## 5. Calculation rules that are decisions

The arithmetic itself lives in `src/engine.js`, where each rule is a named
function with tests. What follows is only the part a reader could not infer
from the code: the choices behind it.

### 5.2 Capacity, rates, and the three percentages

Three percentages exist and are never interchangeable. **Capacity %** is a
person's ceiling across everything. **Share %** is how much of that ceiling
one team holds. **Allocation %** is what a single phase commits — always
expressed as a percentage of full-time capacity, never of the share.

That last point is what keeps the arithmetic honest: a team's
non-initiative work is `max(0, sharePct - allocatedPct)` on the same scale,
and because each team subtracts from its own share, a person split across
teams is never counted twice.

Both ceilings **warn and never block**. So does every other limit in this
tool; there is no hard constraint anywhere in it except the ones that would
otherwise corrupt data.

A **custom rate is absolute**: it replaces the country rate and bypasses the
role factor, because a negotiated contractor rate already includes whatever
overhead a factor would model. Working days still come from the person's
country either way — a contractor observes their own country's holidays.

Rates and holidays are read for **the month's own year**, so a rate rise
next year never moves this year's figures. A year outside the tracked window
clamps to the nearest tracked year rather than falling back to zero.

Only a team's members may be allocated to that team's initiatives. An
allocation that outlives its membership **stays and keeps costing** — the
work was estimated and, once gated, approved — and is surfaced as a warning
rather than dropped.

### 5.5 Approval tracks

Bounds are lower-inclusive and upper-exclusive. A total that no band covers
— a gap between two, or below the lowest — resolves to **Not yet known**,
and is never rounded to the nearest band.

"Not yet known" means exactly one thing: *the configured bands do not cover
this total*. It is a statement about band configuration, never about how
complete an estimate is.

Escalation compares **severity alone**, read from the gate record's
snapshot, so it survives the bands changing in a later build. Only a
**passed** gate sets that baseline; a skipped one approved nothing.

## 6. Lifecycle contract

An initiative moves through the phases in order. Each phase is left by its
gate, and the last phase's gate is what closes the initiative.

### 6.1 Passing a gate

A gate requiring estimates needs **every costed phase** estimated, not just
the one behind it: passing a gate approves the whole initiative's budget,
which is why the requirement looks forward as well as back. Phases already
underway contribute their forecast; phases still ahead contribute their
estimate.

A checklist item that is **red blocks**; **amber** passes with a warning;
items start red, so a gate with a checklist is blocked until someone has
looked at each one. Missing actuals never block — they only warn.

Passing **freezes** the exited phase's estimate along with the role, country
and person data behind it, so later master-data changes can never move an
approved figure. Every gate records one gate record, whether or not it
required cost.

### 6.2 Skipping a gate

A gate the build marks skippable can be passed over instead, and **skipping
requires a reason**. A skip bypasses both checks, **approves nothing** and
**freezes nothing** — so the phase it exits stays editable — and never
becomes the baseline for an escalation comparison.

Entering work that predates the tool uses this same mechanism: creating an
initiative at a later phase records every gate behind it as skipped. There
is no separate concept for it.

### 6.3 Reopening

Reopening reverses exactly one transition — always the most recent, never an
earlier one still buried under it. It clears that gate's record and discards
the frozen estimate, and **never touches recorded actuals**. Checklist
statuses and notes are **kept**: what someone assessed is a record, not a
side effect of the gate.

### 6.4 Closing and cancelling

**Closed** is reached only by passing or skipping the final gate — finishing
is a governed act, never a bare status change. **Cancelled** is for work
abandoned before the process finishes, and is a plain status change.

Both freeze the whole initiative: phases, actuals, and every field on it.
The single exception is **notes**, which stays writable, because recording
why something ended is exactly what a finished initiative still needs to
accept. Reopening unlocks everything.

## 8. Cross-cutting rules

- **Theming**: System (follows the OS), Light or Dark, cycled by one control
  and remembered across reloads. Every page repaints under all three without
  a reload — which works because every CSS rule reads a token, never a
  colour.
- **Import/export**: an export carries the whole dataset, a schema version,
  and the **process identity**. An import is refused outright if either
  disagrees with this build. There is no migration path, and a dataset whose
  phases and gates mean something different is worse than no dataset at all.
  The rejection says which of the two failed, because "wrong process" and
  "too old" need different fixes.
- **Copy/CSV**: every table of consequence can be copied (as plain text and
  rich HTML) or downloaded as CSV.

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
