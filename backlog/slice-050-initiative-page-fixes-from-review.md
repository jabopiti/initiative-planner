---
slice_id: "050"
title: "Initiative page and Needs attention fixes from the review"
type: "capability"
status: "valid"
criteria_failures: []
depends_on: ["011", "019", "026"]
verification_status: null
superseded_by: null
supersedes: null
change_summary: "Added from the post-build review of the implementation against the spec (slices 001 to 041). Review findings: Due ignores Tentative items, the Ready link focuses the wrong control, Overrun hides the blocker, InitiativeDetail is not keyed, the phase dots rely on colour."
recommended_model: "Claude Sonnet 5"
model_rationale: "Five contained fixes in known files; each has a clear failing test."
spec_sections: ["§8.5 Needs attention", "§5.4 Initiative detail view (magic bar)", "§5.2 Portfolio overview", "§9.5 Accessibility", "§9.10 Icons", "§10.6 Identifiers and links"]
---

# Initiative page and Needs attention fixes from the review

## Intent

**Problem statement:** Five defects found reviewing slices 011 to 026 against
§5.4 and §8.5. (1) "Due" looks for Incomplete items only, so a gate whose only
open items are Tentative reads Ready after its end date, against §8.5 item 4
("Incomplete or still Tentative"); a test locks the wrong behaviour in.
(2) The Ready link in Needs attention focuses the first button in the magic
bar ("Start at a later phase" or "Skip G2") instead of Pass gate. (3) In the
Overrun state the bar says "N days overrun" but never names the open
requirement Pass gate would jump to (§5.4); "1 days" lacks a singular.
(4) `InitiativeDetail` has no `key`, so a half-open Delete confirmation or
team-change confirmation on one initiative reappears on the next one opened.
(5) The magic bar's phase overview is ten-pixel dots that differ only by
colour, with no icon, label or tooltip, hidden from assistive technology
(§5.4 item 1, §9.5, §9.10).

**Outcome statement:** The initiative page and the Needs attention strip match
the spec's wording and states, and no state is carried between initiatives.

## Scope

- Due fires when the end date is reached and any requirement is not met;
  Ready only when nothing is open. Update the slice 011 test.
- A Pass gate anchor is the `?focus=magic-bar` target.
- Overrun and not ready: the first open requirement is named beside the
  overrun line; `plural` used for days.
- `key={id}` on `InitiativeDetail`.
- Phase overview uses `PhaseIcon` with name and state in the accessible name
  and a tooltip, plus a non-colour done/current/ahead cue; board column
  headers show the icon beside the label (§9.10).

## Acceptance criteria

- [ ] Given an Active initiative past its end date with only a Tentative item
      open, then it reads Due ("N of M complete"), not Ready.
- [ ] Given a Ready item opened from Needs attention, then focus is on Pass
      gate, also when Skip or Start-at is shown.
- [ ] Given Overrun with an open requirement, then the bar names it; one day
      reads "1 day overrun".
- [ ] Given Delete open on initiative A and a jump to B, then B shows no
      confirmation.
- [ ] Given the phase overview, then each step has an accessible name such as
      "Validation, current" and differs from the others by more than colour.
- [ ] Given Needs attention deep links to Escalated, Overdue, Due and Ready,
      then each lands on its target (tests cover all, not only Overrun).

## Delivery gate

- [ ] Deployed to production-equivalent environment

## Flags and compromises

None.

## Open decisions

- Due versus Ready for a Tentative-only gate *before* its end date (Ready
  means "nothing blocking"). Recommended: Ready, record in §8.5.
- Look of the phase overview (icon-only stepper per §9.10, shown as a mockup
  in light and dark).
- Wording for the blocker line (against §9.2).
