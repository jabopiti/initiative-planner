---
slice_id: "003c"
title: "Portfolio empty state names active and inactive teams"
type: "capability"
status: "valid"
criteria_failures: []
depends_on: ["003"]
verification_status: null
superseded_by: null
supersedes: null
change_summary: "Scope agreed in chat when picking it up: the top-bar button names the prerequisite instead of a tooltip, and team Deactivate / Reactivate (§5.8), which no slice covered, is built here so that Reactivate a team leads somewhere. Found in the review of slices 003 to 005d: the Portfolio's empty state and the New initiative button disagree about whether a team exists. With only inactive teams the Portfolio offers 'Create your first initiative', which opens a draft whose team list is empty. §9.4 names two states (no team, then a team); this slice adds the third, and the copy for it."
recommended_model: "Claude Sonnet 5"
model_rationale: "Three states of one empty screen and one button label, decided by two facts (any team, any active team), plus one reversible flag on a team. A component test per state pins it; the only judgement is the copy, agreed in chat first."
spec_sections: ["§9.4 Empty states", "§5.2 Portfolio overview (landing page)", "§5.1 Navigation (New initiative)", "§5.7 Teams overview (inactive teams)", "§5.8 Team detail view (Actions)", "§9.3 Deletion rules (deactivate only)"]
---

# Portfolio empty state names active and inactive teams

## Intent

**Problem statement:** A team lead who has deactivated every team, or an
owner opening the tool after that, sees "Create your first initiative". The
button opens a draft whose team dropdown is empty and whose Create button
can never be enabled, and the top bar's New initiative button is disabled
with no reason. The tool says a team exists and then refuses to use it.

**Outcome statement:** This slice contributes to the principle that an
action blocked by a missing prerequisite links to it instead of dead-ending
(§9.4) by making the Portfolio and the New initiative button say which
prerequisite is missing: no team, or no active team.

## Scope

- The Portfolio with no initiatives shows the heading "No initiatives yet",
  a reason line where a prerequisite is missing, and one primary action
  (§9.4), chosen by the teams that exist:

  | State | Reason line | Action |
  |---|---|---|
  | No team at all | No teams yet. | Create a team (opens Teams) |
  | Teams exist, none active | All your teams are inactive. | Reactivate a team (opens Teams) |
  | An active team | none | Create your first initiative (opens the draft) |

- The top bar's button is never disabled and names the next step instead of
  carrying a tooltip: **Create a team** (plus icon) with no team,
  **Reactivate a team** (restore icon) with teams but none active, both
  opening Teams; **New initiative** (plus icon) with an active team, opening
  the draft.
- **Deactivate team / Reactivate team** on the team detail (§5.8, §9.3),
  which is what makes "Reactivate a team" possible: a ghost button at the
  top right of the header, one click, no confirmation. An inactive team
  shows an **Inactive** chip beside its name. The change commits as
  "Payments: team deactivated" / "team reactivated" (§10.3). This was in no
  slice before; §5.8 listed it and slice 004 built only the Members list.
- The draft page is never reachable through these controls without an
  active team.

**Explicitly excluded:** The Getting started strip (§5.2), which has its own
wording for the same steps; the initiatives table's empty state; a team's
rename and Initiatives list (§5.8); what happens to an inactive team's
Active initiatives; and typing `#/initiatives/new` by hand, which still opens
the draft.

## Execution path

1. User triggers: opens the Portfolio while no initiative exists.
2. UI: reads whether any team exists and whether any is active.
3. User receives: the reason and the single action for that state; the top
   bar's button reads as the same next step.

## Value

- **Desirable:** People do not expect to be sent to a dead end by the tool's
  own first suggestion.
- **Usable:** One heading, one reason, one action, always one that works.
- **Valuable:** Removes a support question ("why can I not create an
  initiative?") that only appears after teams are deactivated.

## Acceptance criteria

- [ ] Given no team exists and no initiative, when the Portfolio renders,
      then it shows "No initiatives yet", "No teams yet." and **Create a
      team** as its only action, which opens Teams.
- [ ] Given teams exist and every one is inactive, and no initiative, when
      the Portfolio renders, then it shows "All your teams are inactive."
      and **Reactivate a team**, which opens the Teams overview.
- [ ] Given an active team exists and no initiative, when the Portfolio
      renders, then it shows no reason line and offers **Create your first
      initiative**, which opens the draft.
- [ ] Given no team, or only inactive teams, when the top bar renders, then
      its button reads **Create a team** or **Reactivate a team**
      respectively, is enabled, and opens Teams; with an active team it
      reads **New initiative** and opens the draft.
- [ ] Given a team, when **Deactivate team** is chosen on its detail page,
      then it becomes inactive at once, shows an **Inactive** chip, and
      offers **Reactivate team**; choosing that reverses it. Each change
      commits with the team's name.
- [ ] Given the only team is reactivated from its detail page, when the top
      bar and the Portfolio render, then they offer **New initiative** and
      **Create your first initiative**.

## Delivery gate

- [ ] Deployed to production-equivalent environment

## Flags and compromises

§9.4 named only the no-team and team cases; it is extended with the
all-inactive case, and §5.1 and §5.8 with the button's labels and the team
Deactivate / Reactivate action, as this slice is built. "No initiatives yet"
stays the heading in every state, with the reason under it.

An inactive team's Active initiatives are left as they are; whether they
should show a marker or block edits is not decided here.
