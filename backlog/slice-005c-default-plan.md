---
slice_id: "005c"
title: "A new initiative starts with a default plan"
type: "capability"
status: "valid"
criteria_failures: []
depends_on: ["003", "005"]
verification_status: null
superseded_by: null
supersedes: null
change_summary: "Promoted from the one-line backlog tail so it is not lost. The tail said it depends on 003; it needs slice 005 too, because a phase period only exists from 005 on. Slice 005's empty-period highlight is written for an initiative with no plan, and this slice makes that the exception."
recommended_model: "Claude Sonnet 5"
model_rationale: "Small, well-specified date arithmetic with clear edge cases (month ends, year rollover) that a handful of unit tests pin down. The one design choice, how to tell a default plan from user-entered dates, is called out in Scope."
spec_sections: ["§5.11 Suggestions and shortcuts (Default plan)", "§2 What the build fixes, and what the user changes (the process, default duration)", "§4 Core definitions (current month)", "§6 Data model (Phase data)", "§8.2 Skipping a gate (starting phase, untouched initiative)"]
---

# A new initiative starts with a default plan

## Intent

**Problem statement:** An initiative owner who has just named an
initiative faces an empty schedule and has to invent a start and end date
for every costed phase before any cost can appear.

**Outcome statement:** This slice contributes to the core principle that
cost falls out of planning the work by giving every new initiative a
believable schedule to adjust, so the owner's first job is staffing the
phases instead of building a calendar.

## Scope

- When an initiative is created (§5.1, slice 003), every costed phase gets
  a start date and an end date, chained from the current month: the month
  containing today's date, determined the same way as Confirmed and
  Provisional (§4). Each phase lasts its default duration in months (§2);
  the next costed phase begins where the previous one ends. Phases that are
  not costed get no period.
- The default durations live in the brand pack. The default brand pack
  gains a `defaultDurationMonths` for each costed phase (the type already
  allows it, the values do not exist yet).
- One pure function builds the chained periods from a start month and a
  list of durations. Duplicate and the starting-phase mechanism (§5.11,
  §8.2) re-chain "from the current month" by the same rule, so they can
  reuse it later without a second implementation.
- The plan is stored so it can be told apart from dates a user entered. §8.2
  defines an initiative as untouched when "no data [is] entered by a user
  and no gate record; the default plan does not count". Slice 008's
  starting-phase choice depends on that. The first user edit to a phase's
  dates or allocations clears the mark for that initiative. The exact
  shape of the mark (a flag on the initiative, or on each phase) is decided
  in this slice.
- The dates are ordinary dates from then on: the user edits them exactly as
  in slice 005, and every edit commits as usual.

**Explicitly excluded:** Re-chaining for Duplicate and for a chosen starting
phase (§5.11, §8.2; slices in the backlog tail), and Extend on overrun. A
default plan for initiatives that already exist: they keep whatever they
have, and slice 005's "Set period" prompt still guides them.

## Execution path

1. User triggers: types a name on the New initiative draft page and picks a
   team (slice 003).
2. Engine: the current month and each costed phase's default duration
   produce chained start and end dates.
3. Data: the new initiative's file is written once, with those dates in
   its costed phases (§10.2), so the creation commit already holds them.
4. UI: the initiative page opens with the periods filled in and the total
   still empty; the next highlighted step is Add people (slice 005).
5. User receives: a schedule to adjust, not a blank one.

## Value

- **Desirable:** An owner would expect the tool to propose a schedule from
  what it already knows, as the spec's own suggestions principle says.
- **Usable:** Nothing to learn: the dates are there, editable in place.
- **Valuable:** Removes the most tedious first step of planning and makes
  the first cost figure one action (adding a person) away.

## Acceptance criteria

- [ ] Given a new initiative created in a given month, when its page opens,
      then every costed phase has a start and end date chained from the
      first day of that month, each as long as its default duration in
      whole months, and the next phase starts the day after the previous
      one ends.
- [ ] Given a chain that crosses a year end (created in November with a
      three-month first phase), when the dates are built, then the
      end date lands on the last day of the correct month in the next year.
- [ ] Given a phase that is not costed, when the plan is built, then it has
      no period.
- [ ] Given each costed phase in the default brand pack, when the pack is
      read, then it has a positive default duration in months.
- [ ] Given a new initiative with a default plan, when its page opens, then
      the Set period prompt of slice 005 is not shown and the Add people
      prompt is.
- [ ] Given a default period, when the user edits a date, then it is saved
      like any other edit and the initiative is no longer treated as
      untouched.
- [ ] Given an initiative created before this slice, when its page opens,
      then it still shows the Set period prompt and nothing is filled in.
- [ ] Given today's date near a month boundary, when the current month is
      determined, then it follows the user's local time (§7.1); the tests
      inject the date rather than reading the clock.

## Delivery gate

- [ ] Deployed to production-equivalent environment

## Flags and compromises

**Confirm before building.** §5.11 says "chained from the current month"
without saying which day the first phase starts on. This slice reads it as
the first day of the current month, so the first phase covers whole months
and its cost is not prorated. The alternative is today's date, which would
prorate the first month. Decide with the product owner; the criteria above
assume the first day of the month.

The default durations are not in the spec. They are a brand-pack choice, so
their values are set with the product owner, not by the slice.
