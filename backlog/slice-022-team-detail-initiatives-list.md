---
slice_id: "022"
title: "Team detail lists its initiatives and starts a new one for the team"
type: "capability"
status: "valid"
criteria_failures: []
depends_on: ["005d", "013"]
verification_status: null
superseded_by: null
supersedes: null
change_summary: "Found while slicing the backlog tail: §5.8's team detail has an Initiatives list (phase and status) and starts a new initiative with the team preset (§5.3), and neither was built. The page shows Members and Capacity only."
recommended_model: "Claude Haiku 4.5"
model_rationale: "A small table on existing figures and sort helpers, plus one preset parameter on the draft page; fully specified and directly testable."
spec_sections: ["§5.8 Team detail view", "§5.3 Initiatives overview", "§5.1 Navigation (draft page)", "§9.11 Lists, filters, inputs and amounts (Sorting)", "§9.4 Empty states"]
---

# Team detail lists its initiatives and starts a new one for the team

## Intent

**Problem statement:** Platform's team lead opens their team page to see what
the team is working on and finds its members and capacity grid, but not the
initiatives themselves — those are only on the Portfolio, mixed with every
other team's. Starting a new initiative for Platform means going to the top
bar and choosing the team again.

**Outcome statement:** The team page lists the team's initiatives with their
phase and status, and starts a new one with the team already chosen.

## Scope

- **Section (§5.8).** "Initiatives", between Members and Capacity. A compact
  table: **Name** (link to the initiative), **Phase**, **Status**; every
  status listed. Default sort: phase in process order, then name (§9.11);
  sortable headers (004c).
- **New initiative (§5.8, §5.3).** A button in the section header opens the
  draft page (005d) with this team **preselected** — the one case the draft
  starts with a team, because the user chose it by starting from the team.
  The next-step highlight then goes to the name. Hidden on an inactive team.
- **Empty (§9.4).** "No initiatives yet — New initiative" (on an inactive
  team: "No initiatives." with no action).

**Explicitly excluded:** cost or attention columns (the Initiatives table has
them, 013).

## Execution path

1. User triggers: Teams → Platform.
2. UI: Initiatives lists Fraud Detection Upgrade (Discovery, Active) and
   Checkout Redesign (Development, Active).
3. User clicks **New initiative**; the draft opens with Platform chosen and the
   name field focused.
4. User receives: the team's work in one place, and a one-step start.

## Value

- **Desirable:** Team leads think in their team's initiatives.
- **Usable:** Same table conventions as elsewhere.
- **Valuable:** Completes the team page §5.8 describes.

## Acceptance criteria

- [ ] Given Platform, then its Initiatives section lists its initiatives in
      every status, with Name, Phase and Status, sorted by phase then name.
- [ ] Given a row's name is clicked, then the initiative opens.
- [ ] Given New initiative, then the draft page opens with Platform selected,
      the name focused and "Next: name the initiative." as the next step.
- [ ] Given the draft opened from the top bar, then it still starts on "Select
      team" (§5.1 unchanged).
- [ ] Given a team with no initiatives, then the section reads "No initiatives
      yet" with New initiative.
- [ ] Given an inactive team, then New initiative is absent.

## Delivery gate

- [ ] Deployed to production-equivalent environment

## Flags and compromises

§5.1 says the draft "always starts on 'Select team'" while §5.3 and §5.8 preset
the team from the team page; read together, the rule is about the top-bar
entry. Record that reading in §5.1 when this ships.

## Decided in review (pre-implementation)

- **Placement:** between Members and Capacity, with New initiative in its
  header.
