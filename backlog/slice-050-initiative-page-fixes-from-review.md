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
change_summary: "Added from the post-build review of the implementation against the spec (slices 001 to 041). Review findings: Due ignores Tentative items, the Ready link focuses the wrong control, Overrun hides the blocker, InitiativeDetail is not keyed, the phase dots rely on colour. Backlog reshuffle (3 Oct 2026): the Overrun blocker line and the phase overview moved to 056 (which rebuilds the magic bar's stepper and Pass gate), the board column header icons to 058 (which restyles those headers); this slice now runs before 056. Settled before implementation (3 Oct 2026): Due exists only on the end date itself (past it is Overrun), the magic bar is unchanged, a Tentative-only gate before its end date reads Ready, and the Due link reaches a Tentative item."
recommended_model: "Claude Sonnet 5"
model_rationale: "Three contained fixes in known files plus deep-link tests; each has a clear failing test."
spec_sections: ["§8.5 Needs attention", "§5.4 Initiative detail view (magic bar)", "§10.6 Identifiers and links"]
---

# Initiative page and Needs attention fixes from the review

## Intent

**Problem statement:** Defects found reviewing slices 011 to 026 against
§5.4 and §8.5. (1) "Due" looks for Incomplete items only, so a gate whose only
open items are Tentative reads Ready after its end date, against §8.5 item 4
("Incomplete or still Tentative"); a test locks the wrong behaviour in.
(2) The Ready link in Needs attention focuses the first button in the magic
bar ("Start at a later phase" or "Skip G2") instead of Pass gate.
(3) `InitiativeDetail` has no `key`, so a half-open Delete confirmation or
team-change confirmation on one initiative reappears on the next one opened.
The review's Overrun blocker line and colour-only phase dots moved to 056,
and the board column header icons to 058, which rebuild those parts.

**Outcome statement:** The initiative page and the Needs attention strip match
the spec's wording and states, and no state is carried between initiatives.

## Scope

- Due fires when the end date is reached and any requirement is not met;
  Ready only when nothing is open. Update the slice 011 test.
- A Pass gate anchor is the `?focus=magic-bar` target.
- `key={id}` on `InitiativeDetail`.

### Decided in review (pre-implementation)

- Due exists only on the current phase's end date itself: past it, Overrun
  takes priority whatever the checklist says (§8.5 order). The first
  criterion reads "on its end date" accordingly.
- A gate whose only open items are Tentative reads Ready before its end
  date and Due on it (recorded in §8.5).
- The magic bar is unchanged: on the end date it still reads "All
  requirements met" with Pass gate primary, since Tentative passes with a
  warning (§8.1). The strip is the nudge. No new copy.
- Pass gate carries the id `pass-gate`; the Ready link (and the Due
  link's fallback) focus it. The `#magic-bar` region keeps its id.
- The Due link goes to the first Incomplete item, else the first
  Tentative one.
- `key={id}` goes on the `/initiatives/<id>` route in `App.tsx`.
- Phases without cost are unchanged (no end date: never Due or Overrun).

## Acceptance criteria

- [ ] Given an Active initiative on its current phase's end date with only a
      Tentative item open, then it reads Due ("N of M complete"), not Ready;
      before that date it reads Ready.
- [ ] Given a Ready item opened from Needs attention, then focus is on Pass
      gate, also when Skip or Start-at is shown.
- [ ] Given Delete open on initiative A and a jump to B, then B shows no
      confirmation.
- [ ] Given Needs attention deep links to Escalated, Overdue, Due and Ready,
      then each lands on its target (tests cover all, not only Overrun).

## Flags and compromises

None.

## Open decisions

None — settled in review (see Scope).
