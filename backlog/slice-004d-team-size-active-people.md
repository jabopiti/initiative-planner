---
slice_id: "004d"
title: "Team size counts only active people"
type: "capability"
status: "valid"
criteria_failures: []
depends_on: ["004"]
verification_status: null
superseded_by: null
supersedes: null
change_summary: "Found in the review of slices 003 to 005d: deactivating a person leaves their memberships active, so the Teams overview still counts them while the team detail greys them out. §5.7 says team size is the number of active members; this slice defines an active member as an active membership of an active person, once, and uses it everywhere a team's size is shown or copied."
recommended_model: "Claude Haiku 4.5"
model_rationale: "One derived number with an exact definition and a fixture that shows the difference. A single helper and three assertions; no design judgement."
spec_sections: ["§5.7 Teams overview", "§5.8 Team detail view", "§6 Data model (Membership, Person)", "§4 Core definitions"]
---

# Team size counts only active people

## Intent

**Problem statement:** A team lead deactivates someone who left the team.
The Teams overview still counts them, so the team looks bigger than the
team detail, which greys that person out as inactive. The two screens
disagree about the same team's size.

**Outcome statement:** This slice contributes to figures that can be trusted
across screens by defining a team's size once, as its active members, and
using that definition wherever the size is shown or copied.

## Scope

- An **active member** of a team is an active membership held by an active
  person. A person who is deactivated is not an active member of any team,
  whatever their membership records say; their memberships are kept, so
  reactivating the person restores them (§5.6).
- One function in the data layer returns a team's active members. The Teams
  overview's Members column, its sort and its copied table, and the team
  detail's members section, use it.
- The people who can be allocated to the team's initiatives (§7.2 picker)
  use the same definition, so the picker and the size never differ.
- The team detail keeps listing inactive people, greyed out and labelled, so
  they can be found and reactivated; only the count changes.

**Explicitly excluded:** Deleting memberships when a person is deactivated
(the data is kept on purpose), and the capacity warning marker.

## Execution path

1. User triggers: deactivates a person in the person panel.
2. Data: the person's active flag changes; memberships are untouched.
3. UI: the Teams overview's size for each team they belong to drops by one;
   the team detail shows them greyed out, unchanged.
4. User triggers: reactivates them; the size rises again.

## Value

- **Desirable:** A team's size is a number people quote; it must match what
  they see on the team page.
- **Usable:** One definition, so the overview, the copy and the detail agree.
- **Valuable:** Removes a discrepancy that makes the figures look unreliable.

## Acceptance criteria

- [ ] Given a team of three where one person is inactive, when the Teams
      overview renders, then its Members shows 2, and the team detail lists
      three people with the inactive one greyed out.
- [ ] Given a person is deactivated, when the Teams overview is sorted by
      Members, then the order uses the new counts.
- [ ] Given the Teams overview is copied, when pasted, then the Members
      column holds the active count.
- [ ] Given a person is reactivated, when the Teams overview renders, then
      the count includes them again with no other change.
- [ ] Given an inactive membership of an active person, when the size is
      counted, then it is not counted (as today).
- [ ] Given the add-person picker of an initiative's phase, when it opens,
      then it lists the same people the size counts.

## Delivery gate

- [ ] Deployed to production-equivalent environment

## Flags and compromises

§5.7 already says "the number of active members"; this slice fixes the
implementation to it and adds the definition of an active member to §4 or §5.7
so it is written once. §7.2's picker rule is unchanged, only shared.
