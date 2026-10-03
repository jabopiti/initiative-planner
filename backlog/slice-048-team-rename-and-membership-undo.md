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
  membership of that team (same person and team), or the team/person is gone.

### Decided in review (pre-implementation)

- The team name is an inline `CommitInput` in the h1, borderless until hover or focus (as the person panel); Enter or
  leaving the field saves, Esc reverts. An inactive team can be renamed; its Inactive chip stays beside the name.
- Refusals use the standard inline alarm box (§9.9) and keep the typed text until fixed or Esc: "Enter a name." and
  "A team named Payments already exists." (case-insensitive, the team itself excluded so a case-only rename works).
  Creating a team gets the same duplicate check and message.
- Undo toast stays "Removed. Undo" (§9.9). A refused Undo shows "Can't undo: Mara Voss is on Platform again." (a
  record for the same person and team exists again, active or not); a missing person or team uses the same shape.
- `undoToast` is generalised: the phase-freeze watch is optional (a membership has no phase).
- Undo restores the exact record (id, Team FTE %, active flag) at its list index, with the "added to" commit note.
- Commit note for a rename: "Platform: team renamed to Platform Core" (old name first).

## Acceptance criteria

- [ ] Given a team, when its name is changed and committed, then every screen
      shows it and the commit message names old and new.
- [ ] Given an empty or duplicate name, then it is refused inline with the typed text kept, and Esc reverts; creating
      a team with a duplicate name is refused the same way.
- [ ] Given a membership removed from the person panel or the team detail,
      then "Removed. Undo" appears for 10 s and Undo restores the same Team
      FTE % and position.
- [ ] Given Undo after the person was re-added to the team (or the person or team is gone), then nothing is
      duplicated and "Can't undo: <person> is on <team> again." is shown.

## Flags and compromises

None.

## Open decisions

None.
