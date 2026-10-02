---
slice_id: "048"
title: "Rename a team, and Undo removing a membership"
type: "capability"
status: "valid"
criteria_failures: []
depends_on: []
verification_status: null
superseded_by: null
supersedes: null
change_summary: "Added from the post-build review of the implementation against the spec (slices 001 to 041). Review findings: §5.8 says the team name is editable but no slice built it (003c excluded it); membership removal has no Undo, though §5.11 names memberships."
recommended_model: "Claude Sonnet 5"
model_rationale: "Two small additions that reuse existing patterns (CommitInput, undoToast); the care is in the commit notes and the restore position."
spec_sections: ["§5.8 Team detail view", "§5.11 Suggestions and shortcuts (Undo)", "§6 Team, Membership", "§9.3 Deletion rules"]
---

# Rename a team, and Undo removing a membership

## Intent

**Problem statement:** §5.8 lists "Team name (editable)", but the name is a
plain heading and `updateTeam` only takes `active`; a typo in a team name can
never be corrected. §5.11 names memberships among the removals that offer
Undo, but the remove buttons in the person panel and the team detail call
`removeMembership` directly: one mis-click drops a Team FTE % for good.

**Outcome statement:** A team can be renamed in place, and a removed
membership can be undone for the usual 10 seconds.

## Scope

- Team detail header: name edited in place with `CommitInput`; empty or
  duplicate (case-insensitive) names refused inline as when creating a team;
  commit note "Platform: team renamed to X".
- `removeMembership` returns the removed record and index; new
  `restoreMembership`; both remove buttons call `undoToast` ("Removed. Undo").
- Restoring refuses (with the message) if the person has since been given an
  overlapping membership of that team, or the team/person is gone.

## Acceptance criteria

- [ ] Given a team, when its name is changed and committed, then every screen
      shows it and the commit message names old and new.
- [ ] Given an empty or duplicate name, then it is refused inline and reverts.
- [ ] Given a membership removed from the person panel or the team detail,
      then "Removed. Undo" appears for 10 s and Undo restores the same Team
      FTE % and position.
- [ ] Given Undo after the person was re-added to the team, then nothing is
      duplicated.

## Delivery gate

- [ ] Deployed to production-equivalent environment

## Flags and compromises

None.

## Open decisions

- Whether an inactive team can be renamed (recommended: yes).
- Copy of the refusal messages, drafted in place against §9.2.
