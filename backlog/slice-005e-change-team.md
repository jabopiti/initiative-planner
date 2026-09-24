---
slice_id: "005e"
title: "Change an initiative's team"
type: "capability"
status: "valid"
criteria_failures: []
depends_on: ["005"]
verification_status: null
superseded_by: null
supersedes: null
change_summary: "Added after using the creation flow: an initiative's team could not be changed at all. §5.4, §6 and §7.2 were changed from 'keep allocations and flag non-members' to 'remove non-members from the phases that are still open, after a confirmation'."
recommended_model: "Claude Sonnet 5"
model_rationale: "A destructive edit, but with an exact rule (§7.2) that a fixture-driven test pins down: who is removed, from which phases, and what must stay. No open-ended reasoning."
spec_sections: ["§5.4 Initiative detail view (Header)", "§6 Data model (Initiative, Team)", "§7.2 Capacity, rates, and the three percentages (allocation and team membership)", "§5.11 Suggestions and shortcuts (Undo)", "§8.1 Gates and frozen snapshots"]
---

# Change an initiative's team

## Intent

**Problem statement:** An initiative owner who chose the wrong team, or
whose initiative moves to another team, cannot change it, and if they could,
the people already allocated would no longer belong to it.

**Outcome statement:** This slice contributes to keeping cost and capacity
honest by letting the owner move an initiative to another team while the
tool removes exactly the allocations that no longer make sense, and asks
first.

## Scope

- The team in the initiative's header is a dropdown of active teams. A
  team that has since been deactivated stays shown for the initiatives that
  already have it.
- Choosing a different team when no unlocked phase holds an allocation
  changes it at once, in one commit.
- Choosing a different team when unlocked phases hold allocations does not
  apply it yet. An inline confirmation under the header (no modal, §5.4)
  names the people who are not active members of the new team and will be
  removed from the phases still open, the number of allocations and the
  planned cost they carry, and names the people who are on both teams and
  stay. The team pill keeps showing the current team until confirmed.
- **Change team** applies it: the team changes and those allocations are
  removed, in one commit ("<initiative>: team changed from <old> to <new>, N
  allocations removed"). **Cancel** leaves everything as it was.
- A "Removed. Undo" message for 10 seconds (§5.11) puts the team and the
  allocations back as a normal edit.
- **Locked phases are never touched.** A phase frozen by a passed gate keeps
  its people, its snapshot and its figures, and recorded actuals are never
  touched. A single predicate decides whether a phase is locked. Until
  gates exist (slice 008) it reports no phase as locked; slice 008 makes it
  real (see its flags).
- A Closed or Cancelled initiative shows its team but cannot change it; On
  hold and Active can. Reopening restores the ability.

**Explicitly excluded:** Removing allocations for any other reason. An
allocation that outlives a membership because the membership was removed
later still stays and keeps costing (§7.2). Moving several initiatives to a
team at once.

## Execution path

1. User triggers: opens the team dropdown in an initiative's header and
   chooses another team.
2. Engine: for every unlocked phase, finds allocations of people who are not
   active members of the new team, and totals their planned cost.
3. UI: shows the inline confirmation naming who is removed and who stays.
4. User triggers: chooses Change team.
5. Data: one commit to the initiative's file changes the team and removes
   those allocations.
6. User receives: the new team in the header, the affected phases restaffed
   from the new team's side, and an Undo for 10 seconds.

## Value

- **Desirable:** Choosing a wrong team is a common slip, and a wrong team is
  otherwise a dead end.
- **Usable:** The confirmation names people and figures, so it is read, not
  clicked through.
- **Valuable:** Keeps the "only a team's members are allocated" rule true
  without leaving a trail of manual clean-up.

## Acceptance criteria

- [ ] Given an initiative with no allocations in any unlocked phase, when
      another team is chosen, then the team changes at once with one commit
      and no confirmation.
- [ ] Given allocations of people who are not on the new team, when another
      team is chosen, then a confirmation names those people, the number of
      allocations and their planned cost, and names those who are on both
      teams and stay, and nothing has changed yet.
- [ ] Given the confirmation, when Cancel is chosen, then the team and every
      allocation are unchanged and the pill shows the current team.
- [ ] Given the confirmation, when Change team is chosen, then the team
      changes, only the allocations of people not on the new team are removed
      from the unlocked phases, and everything is written in one commit whose
      message names the initiative, both teams and the count.
- [ ] Given a person on both teams, when the team changes, then their
      allocations stay.
- [ ] Given a person whose membership on the new team is inactive, when the
      team changes, then they count as not on the team.
- [ ] Given a phase the locked predicate reports as locked, when the team
      changes, then its allocations, dates and figures are unchanged.
- [ ] Given a change was confirmed, when Undo is chosen within 10 seconds,
      then the previous team and the removed allocations come back.
- [ ] Given a Closed or Cancelled initiative, when its header renders, then
      the team is shown and cannot be changed; On hold can.
- [ ] Given the confirmation, when read by a screen reader, then it is
      announced and the focus moves to its first action.

## Delivery gate

- [ ] Deployed to production-equivalent environment

## Flags and compromises

This changes a spec rule: §5.4, §6 and §7.2 used to say a team change keeps
allocations and flags non-members. They were updated with this slice.

The locked-phase rule cannot be exercised against real frozen phases until
slice 008. Until then it is covered by a test that supplies a locked phase to
the predicate, and slice 008 carries the obligation to make the predicate
real.
