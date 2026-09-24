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
change_summary: "Found in the review of slices 003 to 005d: the Portfolio's empty state and the New initiative button disagree about whether a team exists. With only inactive teams the Portfolio offers 'Create your first initiative', which opens a draft whose team list is empty. §9.4 names two states (no team, then a team); this slice adds the third, and the copy for it."
recommended_model: "Claude Sonnet 5"
model_rationale: "Three states of one empty screen and one disabled control, decided by two facts (any team, any active team). A component test per state pins it; the only judgement is the copy, agreed in chat first."
spec_sections: ["§9.4 Empty states", "§5.2 Portfolio overview (landing page)", "§5.1 Navigation (New initiative)", "§5.7 Teams overview (inactive teams)"]
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

- The Portfolio with no initiatives shows one line and one primary action
  (§9.4), chosen by the teams that exist:
  - **No team at all:** as today, with **Create a team**.
  - **Teams exist, none active:** a line saying so and naming what to do,
    with the primary action **Reactivate a team**, which opens the Teams
    overview.
  - **At least one active team:** as today, with **Create your first
    initiative**.
- The top bar's **New initiative** button, while there is no active team,
  says why and where to go: the same two cases, as a tooltip that is also
  reachable by keyboard (a plain disabled button is neither focusable nor
  announced), and the button's accessible name or description carries it.
- The draft page is never reachable through these controls without an
  active team.

**Proposed copy (to agree in chat before implementing, per AGENTS.md):**

| State | Line | Action |
|---|---|---|
| No team | "No teams yet." | Create a team |
| Teams exist, none active | "All your teams are inactive." | Reactivate a team |
| An active team, no initiative | "No initiatives yet." | Create your first initiative |

The top-bar tooltip repeats the first two lines' remedy: "Create a team
first" and "Reactivate a team first".

**Explicitly excluded:** The Getting started strip (§5.2), which has its own
wording for the same steps, and the initiatives table's empty state.

## Execution path

1. User triggers: opens the Portfolio while no initiative exists.
2. UI: reads whether any team exists and whether any is active.
3. User receives: the line and the single action for that state; the top
   bar's button explains itself if it is unavailable.

## Value

- **Desirable:** People do not expect to be sent to a dead end by the tool's
  own first suggestion.
- **Usable:** One line, one action, always one that works.
- **Valuable:** Removes a support question ("why can I not create an
  initiative?") that only appears after teams are deactivated.

## Acceptance criteria

- [ ] Given no team exists and no initiative, when the Portfolio renders,
      then it shows one line and **Create a team** as its only action.
- [ ] Given teams exist and every one is inactive, and no initiative, when
      the Portfolio renders, then it says all teams are inactive and offers
      **Reactivate a team**, which opens the Teams overview.
- [ ] Given an active team exists and no initiative, when the Portfolio
      renders, then it offers **Create your first initiative**, which opens
      the draft.
- [ ] Given no active team, when the top bar renders, then New initiative is
      unavailable and its reason ("Create a team first" or "Reactivate a
      team first") is reachable by keyboard and by a screen reader.
- [ ] Given a team is reactivated from the Teams overview, when the
      Portfolio is opened, then it offers **Create your first initiative**
      and New initiative is available.

## Delivery gate

- [ ] Deployed to production-equivalent environment

## Flags and compromises

§9.4 names only the no-team and team cases; it is extended with the
all-inactive case when this slice is built. The Portfolio's "No initiatives
yet" line is the one that stays constant across the states.
