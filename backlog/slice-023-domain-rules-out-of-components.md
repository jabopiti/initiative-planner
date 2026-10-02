---
slice_id: "023"
title: "Domain rules out of components"
type: "refactor"
status: "valid"
criteria_failures: []
depends_on: ["009", "010"]
verification_status: null
superseded_by: null
supersedes: null
change_summary: "Promoted from the backlog tail (Domain rules out of components). Numbered before the suggestion slices in review, because 024 (Copy allocations) and 027 (Fix suggestions) build on exactly these rules and should find them in the data layer, tested, rather than copy them out of a component."
recommended_model: "Claude Sonnet 5"
model_rationale: "A behaviour-preserving move with the existing component tests as the safety net; the work is identifying each rule precisely and giving it unit tests in src/data."
spec_sections: ["§7.1 Time granularity and cost of an allocation", "§7.2 Capacity, rates, and the three percentages", "§5.11 Suggestions and shortcuts (Availability in the person picker)", "§10.8 Testing"]
---

# Domain rules out of components

## Intent

**Problem statement:** Some business rules are still worked out inside React
components: who can be added to a phase (PhasesSection's `addable`), a
phase's summary figures (whether it has cost, its coverage label, its months
and effective total), and parts of the capacity warnings. They can only be
tested through rendering, and the next slices (Copy allocations, Fix
suggestions) need the same rules — which would otherwise be copied.

**Outcome statement:** Every domain rule lives in `src/data` beside the cost
engine as a pure, unit-tested function, and components only render its
result — with no visible change.

## Scope

- **Re-audit first.** List each rule still computed in `src/ui` (004d, 006
  and 009 already moved some): at least the allocatable people for a phase,
  most free first; a phase's figures (has cost, coverage, months, effective
  total, frozen or live estimate by month); and any over-Team-FTE /
  over-Capacity decision made in a component rather than in
  `src/data/capacity.ts`.
- **Move** each to `src/data` (e.g. `allocatablePeople`, `phaseSummary`) with
  unit tests covering its branches; components call them.
- **No behaviour change.** Existing component tests pass unchanged; no copy,
  layout or commit message changes.

**Explicitly excluded:** new rules for 024 and 027 (they add their own on top).

## Execution path

1. Audit lists the rules found in `src/ui`.
2. Each moves to `src/data` with unit tests.
3. The app behaves identically.

## Value

- **Desirable:** The delivery team wants rules testable without rendering.
- **Usable:** One place per rule.
- **Valuable:** Suggestion slices reuse instead of duplicate.

## Acceptance criteria

- [ ] Given the audit, then the slice's commit lists every rule moved, by
      name and former location.
- [ ] Given `src/ui`, then no component decides who is allocatable, a phase's
      coverage or totals, or whether a load is over Team FTE % or Capacity %;
      it calls a `src/data` function.
- [ ] Given each moved function, then it has unit tests in `src/data` covering
      every branch it had in the component.
- [ ] Given the full test suite, then every existing component test passes
      unchanged.

## Flags and compromises

None.

## Decided in review (pre-implementation)

- **One refactor slice**, ahead of 024 and 027, not folded into feature
  slices.
- **Audit outcome (settled with the user):** rules moved are allocatable
  people (was `addable` in PhasesSection), a phase's summary (has cost,
  coverage status, frozen-or-live estimate by month, effective total,
  months), phase overlap, the next-step phase (`isPlanned`) and PersonPanel's
  joinable teams. Over Team FTE % / Capacity % decisions already live in
  `src/data/capacity.ts`; components only group flagged months for display
  and that stays.
- **Coverage is a status, not words:** `src/data` returns `frozen`, `actual`,
  `forecast` or `estimate`; the component keeps the label text (§9.2).
- **`allocatablePeople` takes the free-capacity gating as input**, so 024
  can reuse it outside the picker.
- **The `Slice 023:` commit body lists each rule, its former location and its
  new function** (criterion 1). No component test is edited.
