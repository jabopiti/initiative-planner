# Engine audit: prototype reuse decision

Backlog: [slice-001](backlog/slice-001-audit-prototype-reuse.md). Every
function in `prototype/` touching cost, capacity, working days, rates, or
approval-track calculation, classified against docs/spec.md §6 and §7.
UI code is excluded (out of scope by design — see slice-001). Formatting
(`prototype/format.js`) and persistence (`prototype/store.js`) are excluded
because they don't touch these rules.

Legend: **Reuse as-is** · **Reuse with changes** (name the change) ·
**Rewrite** (name why).

## Revision note (2026-09-22)

This audit originally found the prototype's date-based phase period
(`estStartDate`/`estEndDate`, with partial-month proration in
`workingDaysForPeriod`) in conflict with the spec's then-current
Start/End **month** fields and its "a month is never prorated" rule. That
conflict has since been resolved the other way: docs/spec.md §6 and §7.1
were updated to adopt the prototype's date-based model — Start
date/End date, with the period's first and last calendar months prorated
by the share of that month's weekdays the period covers. The entries below
reflect the current spec. Everything that was previously "Rewrite" or
"Reuse with changes" purely because it used dates instead of months now
reads **Reuse as-is**; the reasoning that changed is called out inline
so the history stays legible.

## Time, years, and the tracked window (§7.2)

| Function | Classification | Reason |
|---|---|---|
| `WINDOW_BEFORE` / `WINDOW_AFTER` | Rewrite | §7.2: "the tracked window is always the current calendar year and the next two" — three years, no prior year. The prototype's `WINDOW_BEFORE = 1` makes it four years (last year through +2). Drop `WINDOW_BEFORE`. |
| `trackedYears` | Reuse with changes | Depends on the constants above; once they're fixed to current+2, the loop itself is correct. |
| `monthKey` | Reuse as-is | Matches the Month field encoding (§6) exactly. |
| `parseMonthKey` | Reuse as-is | |
| `parseDate` (private) | Reuse as-is | Phase periods are dates (§6, revised); this is exactly the parsing step needed. |
| `monthsInRange` | Reuse as-is | Correct month-enumeration logic over a date range, which now matches §6's Start date/End date fields directly. |
| `yearRecord` | Reuse as-is | Matches §7.2's clamp-to-nearest-tracked-year rule exactly, including "before the earliest entry takes the earliest entry" and "beyond the window takes the last tracked year." |
| `extendByYear` (private) | Reuse with changes | §7.2: when a year enters the window, "rates... are copied from the preceding year, and working days are prefilled with the weekdays of each month." The prototype's `clone` callback copies **both** the rate and the working-days array from the nearest year — it never prefills working days from the calendar. Change the clone step so working days come from `weekdaysInMonth`, not from the source year's record. |
| `recomputeWindow` | Reuse with changes | Correct shape (walk countries and custom-rate people, extend, report whether anything changed); inherits the two fixes above. |

## Working days (§7.1, §6 Country)

| Function | Classification | Reason |
|---|---|---|
| `weekdaysInMonth` | Reuse as-is | Needed by the fixed `extendByYear` prefill above. |
| `workingDaysInMonth` | Reuse as-is | Reads the country's stored per-month figure directly, exactly as §6 describes ("The user edits only the number; no holiday calendar is kept"). |
| `weekdaysBetween` (private) | Reuse as-is | Computes the proration fraction §7.1 now calls for directly. |
| `workingDaysForPeriod` | Reuse as-is | Prorates the first and last month of a phase by "share of weekdays covered" — this is now the spec's own rule (§7.1, revised), stated as "that month's working days × (weekdays covered ÷ total weekdays in that month)." Takes ISO dates, matching the Start date/End date fields directly. |

## Rate resolution (§7.2)

| Function | Classification | Reason |
|---|---|---|
| `resolveRate` | Reuse as-is | Exactly §7.2: a custom rate is absolute, replaces the country rate, bypasses the role factor; working days still come from the country either way. |
| `roleLabel` | Reuse as-is | Display helper, no calculation. |

## Phase cost (§7.1, §6 Phase data / Cost item)

| Function | Classification | Reason |
|---|---|---|
| `sum`, `add` (private) | Reuse as-is | |
| `ratesFor` | Reuse as-is | Matches §6 Gate record's "Frozen estimate snapshot" — reads live master data unless the phase is frozen, then reads the snapshot copies. |
| `allocationFigures` | Reuse as-is | The formula — working days × Allocation % × day rate × role factor, read for the month's own year, sourced from `workingDaysForPeriod`'s (now-correct) proration — is exactly §7.1. |
| `phaseLabourByMonth` | Reuse as-is | Sums `allocationFigures` per month across a phase's allocations; correct given the formula above. |
| `phaseOtherByMonth` | **Rewrite** | §6: a cost item's timing is "either one month within the phase, or spread evenly over the phase." The prototype's cost item shape (`{ id, name, month, amount }`) has no spread option at all — `phaseOtherByMonth` only ever adds the full amount to one month. Needs a `timing` field (`{ type: 'month', month }` or `{ type: 'spread' }`) and logic to divide a spread item's amount evenly across the phase's months. |
| `isFrozen` | Reuse as-is | |
| `phaseEstimateByMonth` | Reuse as-is | Composes correctly once `phaseOtherByMonth` supports spread items. |
| `phaseLabourTotal`, `phaseOtherTotal` | Reuse as-is | |
| `phaseMonths` | Reuse with changes | Independent of the date/month revision above: §6's Phase data has no "actual period" field — actuals are individual per-month entries that may simply fall outside the phase's own Start date/End date (called out as a warning case, not a separate date range). The prototype's inclusion of `actualStartDate`/`actualEndDate` in the month set is tracking a concept the spec doesn't have. Drop that source; keep the phase period, the recorded `actualMonths` keys, and cost-item months. |
| `phaseBlendedByMonth`, `phaseEstimateTotal`, `phaseBlendedTotal` | Reuse as-is | §7.3: recorded actual where present, estimate otherwise — matches exactly. |
| `actualOrEstimate` | Reuse with changes | §7.3 says a closed month with no recorded actual is "shown and computed as if it were the estimate," unconditionally. The prototype returns `undefined` (not "using the estimate") when that estimate is exactly 0. Worth a deliberate call in slice 010, not a silent behavior — either keep this as an intentional UI simplification (don't badge a $0 month) or drop the `estimate > 0` guard to match the spec literally. |
| `phaseCoverage` | Reuse as-is | Matches §4's Estimate/Forecast/Actual definitions precisely, including that a defaulted (not recorded) month never counts as "recorded." |
| `isPhaseConfirmed` | Reuse with changes | The current-phase-or-starts-within-a-month logic matches §4's Provisional/Confirmed definition, and reading a date field is now correct (§6, revised). But it compares full dates via `threshold.setUTCMonth(...)`, which is subject to JS date-overflow edge cases (e.g. adding a month to Jan 31 silently lands in March). Compute the threshold as a month-key comparison — "is the start date's month the current or next calendar month" — rather than shifting the date object itself. |
| `initiativeMonths` | Reuse as-is | |
| `bandScale` | Reuse as-is | UI-support helper (threshold bar position), not a spec rule itself. |
| `costedPhases`, `grandTotal`, `phaseCosts` | Reuse as-is | `grandTotal` matches §4's Grand estimate definition exactly. |
| `initiativeTotals`, `initiativeCoverage` | Reuse as-is | The three-way Estimate/Forecast/Actual split matches §4, and "Actual" deliberately sums only recorded months rather than filling gaps — matches the spec's distinction from the blended total. |

## Approval tracks (§7.4)

| Function | Classification | Reason |
|---|---|---|
| `resolveBand` | Reuse as-is | Lower-inclusive, upper-exclusive; an uncovered total resolves to `null` ("Not yet known"), never rounded to nearest band — matches §7.4 exactly. |
| `compareBands` | Reuse as-is | Severity-only comparison, matches "Escalation compares severity alone." |
| `bandCoverageIssues` | Reuse as-is | Supports "A brand pack whose bands overlap does not build" (§7.4) as a Settings-time diagnostic. |

## Capacity (§7.2)

| Function | Classification | Reason |
|---|---|---|
| `membership`, `totalSharePct` | Reuse as-is | Logic matches; note under Data-shape mismatches below — the stored field is `sharePct`, the spec's is "Team FTE %." |
| `capacityInitiatives` (private) | Reuse as-is | Filters to `status === 'active'` — matches "only Active initiatives count." |
| `allocationBreakdown`, `allocatedPct`, `provisionalPct` | Reuse as-is | Matches §7.2's "neither ceiling counts a Provisional phase's allocation" and §4's Confirmed/Provisional split precisely. |
| `maxAvailablePct` | Reuse as-is | Suggestion helper (headroom across a phase's months); consistent with §7.2, not itself a spec rule. |
| `nonInitiativeWorkPct`, `nonInitiativeWorkCost` | Reuse as-is | Matches §7.2's `max(0, teamFtePct - allocatedPct)` formula, costed the same way as initiative work. |
| `initiativeCostByMonth`, `initiativeCostInMonth`, `runRate`, `teamRunRate` | Reuse as-is | |
| `initiativePeriod` | Reuse as-is | Reads `estStartDate`/`estEndDate`, which matches the Start date/End date fields directly (§6, revised). |
| `capacityWarnings`, `overAllocations` | Reuse as-is | Both ceilings warn-only, never block, matching §7.2; correctly kept separate rather than merged into one list. |
| `personInitiatives` | Reuse as-is | Reads `estStartDate`/`estEndDate` for the returned `start`/`end`, matching §6 directly. |
| `strandedAllocations` | Reuse as-is | Matches "an allocation that outlives its membership stays and keeps costing" (§7.2). |
| `windowMonths`, `utilisationPct` | Reuse as-is | |

## Estimation-input suggestions (not in §7, but touch cost/allocation figures)

| Function | Classification | Reason |
|---|---|---|
| `median` (private) | Reuse as-is | |
| `carryForwardPct` | Reuse as-is | Process/phase-order helper, no calc rule of its own. |
| `usualAllocationPct`, `usualStaffing` | Reuse as-is | Correctly excludes custom-role people from the template (§7.2's "individually negotiated" reasoning). |
| `usualPhaseDuration` | Reuse as-is | Uses `new Date(phase.estStartDate)`/`estEndDate`, matching the Start date/End date fields directly (§6, revised). |
| `otherCostSuggestions` | Reuse with changes | Depends on `phaseOtherByMonth`'s cost-item rewrite above — once items carry a `timing` type instead of a bare `month`, the per-item amount this reads may need adjusting for spread items. |

## Out of scope

`escapeHtml` is the only other exported function in `engine.js`. It's pure
text escaping for markup interpolation — it doesn't touch cost, capacity,
working days, rates, or approval tracks, so it's excluded per slice-001's
scope rather than overlooked.

## The process (structural, no §7 formulas)

`phaseOrder`, `phaseById`, `costedPhaseIds`, `isCostedPhase`, `gateForPhase`,
`phaseForGate`, `isFinalPhase`, `phaseLabel`, `gateLabel`, `nextPhase`,
`previousPhase`, `STATUSES`, `isFinished` — all **Reuse as-is**. These
navigate the compiled-in process/phase list and initiative status; none of
them compute a figure, so none of them can disagree with §7.

## Two functions outside engine.js worth flagging (lifecycle.js)

Out of this slice's primary scope (lifecycle/gates is §8, not §6/§7), but
both directly feed the approval-track baseline §7.4 depends on, so they're
recorded here rather than silently missed:

| Function | Classification | Reason |
|---|---|---|
| `lastPassedGate` | Reuse with changes | §7.4: escalation compares against "the recorded approval track of **the last passed gate that carried cost**." The prototype returns the most recent passed gate regardless of whether the phase it exited was costed. Filter to gates whose phase has `costed: true`. |
| `buildGateRecord` | Reuse with changes | Computes and stores `grandTotal`/`band` for every passed or skipped gate, including ones exiting a non-costed phase. Per §6's Gate record table, those two fields are specifically "Passed gates that carried cost" — only set them when the exited phase is costed. |
| `freeze` | Reuse as-is | Matches §6 Gate record's Frozen estimate snapshot: period, allocations (via `perMonth`/totals), and copies of roles/countries/people so a passed gate's figures can never move. Depends on the `phaseEstimateByMonth` chain above being correct first. |

## Data-shape mismatches against §6 (naming only, not logic)

None of these change behavior; they're field-name differences to resolve
when porting, listed once rather than in every row above. (Phase
`estStartDate`/`estEndDate` is no longer listed here — the spec's own Start
date/End date fields now match it; see the Revision note above.)

- Cost item: `name` → **label**; `month` (bare) → **timing** (one month, or
  spread over the phase).
- Membership: `sharePct` → **Team FTE %**.
- Person: `capacityPct` → **Capacity %**.
- Initiative status values are lowercase-hyphenated (`'on-hold'`) where §6
  writes `On Hold`; this is a serialization convention, not a conflict —
  confirm the display layer titlecases it rather than storing the spec's
  exact casing.

## What slice 005 can import unchanged

Every function marked **Reuse as-is** above may be ported directly (adapted
only from vanilla JS to TypeScript, per slice-001's stack-mismatch note).
After the revision, this is by far the largest group: it now includes the
entire date-based phase period and its proration (`parseDate`,
`monthsInRange`, `weekdaysBetween`, `workingDaysForPeriod`,
`allocationFigures`), on top of rate resolution, coverage
(Estimate/Forecast/Actual), approval-track band resolution and comparison,
and every capacity ceiling (`initiativePeriod`, `personInitiatives`,
`usualPhaseDuration` included).

Everything marked **Reuse with changes** carries its fix inline above;
slice 005 should apply those changes as it ports rather than importing
first and fixing later. Two are unrelated to this revision and still stand:
`isPhaseConfirmed`'s month-overflow date arithmetic, and `phaseMonths`'
inclusion of the not-in-spec `actualStartDate`/`actualEndDate` range.

Only two things are still a genuine **Rewrite**, against §7.2 and §6
respectively, unaffected by this revision: `WINDOW_BEFORE` (the tracked
window is one year too wide), and cost items' missing spread-timing
support (`phaseOtherByMonth` only handles a single month, never "spread
evenly over the phase").
