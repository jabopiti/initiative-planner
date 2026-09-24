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
change_summary: "Decisions agreed with the product owner (2026-09-24): the chain starts on the creation day, not the first of the month; each phase ends the day before the same day N months later; the page says the dates are suggested; a phase starting before the previous one ends warns. Originally promoted from the one-line backlog tail so it is not lost. The tail said it depends on 003; it needs slice 005 too, because a phase period only exists from 005 on. Slice 005's empty-period highlight is written for an initiative with no plan, and this slice makes that the exception."
recommended_model: "Claude Sonnet 5"
model_rationale: "Small, well-specified date arithmetic with clear edge cases (month ends, year rollover) that a handful of unit tests pin down. The one design choice, how to tell a default plan from user-entered dates, is called out in Scope."
spec_sections: ["§5.11 Suggestions and shortcuts (Default plan)", "§2 What the build fixes, and what the user changes (the process, default duration)", "§4 Core definitions (Provisional / Confirmed: today's date)", "§6 Data model (Phase data)", "§8.2 Skipping a gate (starting phase, untouched initiative)", "§5.4 Initiative detail view (Phases)"]
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

- When an initiative is created (§5.1), every costed phase gets a start date
  and an end date, chained from the day of creation: today's date in the
  user's local time, as for Confirmed and Provisional (§4). The first phase
  starts today. Each phase lasts its default duration in months (§2): it ends
  the day before the same day of the month that many months later (a day the
  later month lacks counts as its last day). The next
  costed phase starts the day after the previous one ends. Phases that are
  not costed get no period.
- The default durations live in the brand pack: Validation 3 months,
  Development 6 months. The type already allows `defaultDurationMonths`; the
  values did not exist yet.
- One pure function builds the chained periods from a start date and a list
  of durations. Duplicate and the starting-phase mechanism (§5.11, §8.2)
  re-chain "from today" by the same rule, so they can reuse it later.
- The plan is stored so it can be told apart from dates a user entered:
  a `defaultPlan` flag on the initiative. §8.2 defines an initiative as
  untouched when "no data [is] entered by a user and no gate record; the
  default plan does not count". The first user edit to a phase's dates or
  allocations clears the flag (cost items and actuals will too when they
  exist). Editing the description or owner does not clear it: the flag is
  about the plan.
- The dates are ordinary dates from then on: edited exactly as in slice 005,
  every edit committed as usual. Editing one phase's dates moves no other
  phase.
- **Suggested-dates note.** While `defaultPlan` is set, a line above the
  phases reads: "Suggested dates, starting today. Adjust them, then add
  people to see the cost." It disappears with the flag.
- **Total.** A costed phase with dates but no allocations shows "—" as its
  total, not "€0".
- **One next step.** The Add people highlight shows on the first costed
  phase that has no people, not on every such phase.
- **Overlap warning.** A costed phase whose start date is before the previous
  costed phase's end date shows, in its expanded body and as a warning icon on
  its row: "Starts before <previous phase> ends (<date>). The two phases
  overlap." Nothing moves. It applies to any overlap, not only default plans.

**Explicitly excluded:** Re-chaining for Duplicate and for a chosen starting
phase (§5.11, §8.2), and Extend on overrun. A default plan for initiatives
that already exist: they keep whatever they have, and slice 005's "Set
period" prompt still guides them.

## Execution path

1. User triggers: creates an initiative (slice 003 today; slice 005d's
   Create initiative button later).
2. Engine: today's date and each costed phase's default duration produce
   chained start and end dates.
3. Data: the new initiative's file is written once, with those dates and the
   `defaultPlan` flag, so the creation commit already holds them (§10.2).
4. UI: the initiative page opens with the periods filled in, the suggested
   dates note, no totals yet, and Add people highlighted on the first phase.
5. User receives: a schedule to adjust, not a blank one.

## Value

- **Desirable:** An owner would expect the tool to propose a schedule from
  what it already knows, as the spec's own suggestions principle says.
- **Usable:** Nothing to learn: the dates are there, editable in place, and
  the page says where they came from.
- **Valuable:** Removes the most tedious first step of planning and makes
  the first cost figure one action (adding a person) away.

## Acceptance criteria

- [x] Given an initiative created on 24 Sep 2026, when its page opens, then
      Validation runs 24 Sep – 23 Dec 2026 and Development 24 Dec 2026 –
      23 Jun 2027: each phase starts the day after the previous one ends and
      lasts its default duration in months.
- [x] Given a start on the 31st, when the chain is built, then a phase ends
      the day before the same day of the month N months later, clamped to
      that month's last day (start 31 Aug, 3 months: ends 29 Nov).
- [x] Given a chain that crosses a year end, when the dates are built, then
      the end date lands in the correct month of the next year.
- [x] Given a phase that is not costed, when the plan is built, then it has
      no period.
- [x] Given each costed phase in the default brand pack, when the pack is
      read, then it has a positive default duration in months.
- [x] Given a new initiative with a default plan, when its page opens, then
      the Set period prompt of slice 005 is not shown, the suggested-dates
      note is, and the Add people highlight is on the first costed phase only.
- [x] Given a costed phase with dates and no allocations, when its row is
      read, then its total shows "—".
- [x] Given a default period, when the user edits a date or an allocation,
      then it is saved like any other edit, the suggested-dates note goes,
      and the initiative is no longer treated as untouched; editing the
      description or owner leaves the flag as it was.
- [x] Given an initiative created before this slice, when its page opens,
      then it still shows the Set period prompt, and no suggested-dates note.
- [x] Given a phase whose start date is on or before the previous costed
      phase's end date (the end date is the last day of that phase), when the page opens, then that phase shows the overlap
      warning naming the previous phase and its end date, on its row and in
      its body, and no date changes on its own.
- [x] Given today's date near a month boundary or after midnight, when the
      plan is built, then it follows the user's local time (§7.1); the tests
      inject the date rather than reading the clock.

## Delivery gate

- [ ] Deployed to production-equivalent environment

## Flags and compromises

Slice 005d's execution path said the creation writes "no phases yet"; it now
says the default plan (005d amended with this slice). With 005d, the plan's
date is the moment Create initiative is chosen, not when the draft opened.

§5.11, §5.4 and §8.2 were edited: the chain starts today (not the first of the
month), so the first phase is not a whole month, and Duplicate and the
starting-phase mechanism will chain from today too.
