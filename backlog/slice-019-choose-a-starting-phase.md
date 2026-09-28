---
slice_id: "019"
title: "Choose a starting phase for an untouched initiative"
type: "capability"
status: "valid"
criteria_failures: []
depends_on: ["005c", "018"]
verification_status: null
superseded_by: null
supersedes: null
change_summary: "Promoted from the backlog tail (Choose a starting phase, §8.2). Lets work that predates the tool be entered at its real phase: one reason, recorded as a skip on every gate behind it regardless of skippable flags, with the default periods re-chained so the starting phase begins today."
recommended_model: "Claude Opus 5"
model_rationale: "'Untouched' is a derived state that several slices' edits must clear correctly, the starting phase can be changed again while untouched (so its skips must be distinguishable from real skips), and re-chaining the default plan interacts with 005c. Getting any of these wrong silently corrupts gate history, so the rules need exhaustive data-layer tests."
spec_sections: ["§8.2 Skipping a gate", "§8.3 Reopening", "§5.11 Suggestions and shortcuts (Default plan)", "§5.4 Initiative detail view (magic bar)", "§6 Data model (Gate record)", "§9.9 Interface states", "§10.3 Writing"]
---

# Choose a starting phase for an untouched initiative

## Intent

**Problem statement:** A team adopting the tool has Checkout Redesign already
in development. Entering it today means creating it in Discovery and then
faking its way through G1 and G2 — and G3 onward aren't even skippable — so
existing work can't be represented honestly, and adoption stalls on data
entry.

**Outcome statement:** A new, untouched initiative can start at a later phase
with one reason, recorded as a skip on every gate behind it (§8.2), and its
default plan starts that phase today — so work in flight is entered in
seconds, with the history saying truthfully why its earlier gates have no
assessment.

## Scope

- **Untouched (§8.2), one data-layer predicate.** An initiative is untouched
  while it has no user-entered **plan or gate data**: no edited period (the
  default plan, 005c, doesn't count), no allocation, no cost item, no
  actual, no checklist status or note, and no gate record other than
  starting-phase skips. Name, description, owner and team don't count.
- **Entry point (§5.4).** While untouched and Active, the bar shows a text
  action **Start at a later phase**. It opens, in place of the guidance line:
  a phase select (every phase except the current one, in process order;
  earlier ones too once a starting phase is set), a reason field, **Start at
  <phase>** (disabled until a phase and a non-blank reason) and **Cancel**
  (Esc). The stepper stays non-interactive.
- **Effect (§8.2).** Every gate behind the chosen phase gets a record
  `outcome: "skipped"` with the one reason and a `startingPhase: true`
  marker, regardless of its skippable flag. Costed phases from the starting
  phase on get default periods re-chained so the starting phase begins today
  (005c's rule); costed phases behind it lose their default periods (no
  planning for work that predates the tool). Commit: "Checkout Redesign:
  starts at Development". The display of each skipped phase is 018's
  ("Skipped G1" + reason).
- **Changing it again (§8.2).** While still untouched, the action stays
  (reads **Change starting phase**); choosing another phase, earlier or
  later, replaces the starting-phase skips and re-chains again. Choosing the
  first phase removes them all. After the initiative is touched, the action
  disappears and only Reopen (016), one gate at a time, moves it back.
- **Guardrail.** A starting-phase skip never closes the initiative: the final
  phase can be chosen as the start, but its own gate is not skipped.

**Explicitly excluded:** importing actuals for past months (entered as usual
on the phase); choosing a starting phase on Duplicate (024).

## Execution path

1. User triggers: creates Checkout Redesign, then on its page picks **Start
   at a later phase** → Development, reason "In development since May, before
   the tool."
2. Data: `gates.discovery` and `gates.validation` recorded as skipped with that
   reason and `startingPhase: true`; Development's (and later costed phases')
   default periods start today; Validation's default period removed.
3. UI: Development is current; Discovery and Validation read "Skipped G1" /
   "Skipped G2" with the reason; the bar reads **Change starting phase**
   until the first allocation is added.
4. User receives: work in flight entered at its real phase, honestly.

## Value

- **Desirable:** Every adopting team has work in flight; entering it must be
  quick.
- **Usable:** One select, one reason, one click, correctable until real
  planning starts.
- **Valuable:** Removes the main adoption barrier without faking gate
  history.

## Acceptance criteria

- [ ] Given a newly created initiative with its default plan only, then it is
      untouched and the bar shows "Start at a later phase".
- [ ] Given a description, owner or team change only, then it is still
      untouched.
- [ ] Given an edited period, an allocation, a cost item, an actual, a
      checklist status or note, or a passed or skipped gate (018), then it is
      touched and the action is absent.
- [ ] Given Start at a later phase, then a phase select, a reason field,
      Start at <phase> (disabled until both are set) and Cancel replace the
      guidance line; Esc cancels with nothing saved.
- [ ] Given Development and a reason are chosen, then G1 and G2 get skipped
      records with that reason and the starting-phase marker, in one commit
      "<name>: starts at Development".
- [ ] Given Rollout is chosen, then G3 is recorded skipped too, although the
      brand pack marks it not skippable.
- [ ] Given that, then Development's default period starts today and later
      costed phases are chained after it; Validation has no period.
- [ ] Given the initiative is still untouched, then the bar reads "Change
      starting phase"; choosing Validation leaves only G1 skipped and
      re-chains from Validation; choosing Discovery removes every
      starting-phase skip.
- [ ] Given an allocation is added after choosing a starting phase, then the
      action disappears, and Reopen G2 (016) is the only way back.
- [ ] Given the final phase is chosen as start, then its own gate is not
      skipped and the initiative stays Active.
- [ ] Given an On Hold initiative, then the action is not offered.

## Delivery gate

- [ ] Deployed to production-equivalent environment

## Flags and compromises

**Assumption to confirm at implementation:** costed phases behind the starting
phase lose their default periods (§8.2 only says the starting phase begins
today). Keeping them would put pre-tool phases in the future, after today,
which would be wrong; removing them leaves those phases "not costed yet"
until someone enters a period, which §8.2's "stays editable" allows.

## Decided in review (pre-implementation)

- **Entry point:** a text action in the bar opening an inline phase select,
  one reason and Start at <phase>; the stepper stays non-interactive.
- **Untouched:** plan and gate data only; name, description, owner and team
  edits don't count.
