---
slice_id: "004"
title: "Add a person and assign them to a team"
type: "capability"
status: "valid"
criteria_failures: []
depends_on: ["003"]
verification_status: null
superseded_by: null
supersedes: null
change_summary: null
recommended_model: "Claude Sonnet 5"
model_rationale: "Simple CRUD with one real correctness rule (the unclaimed-capacity cap, §5.6); worth Sonnet's care over Haiku for that one calculation, but nothing harder than that."
spec_sections: ["§4 Core definitions (Person, Membership, Capacity %, Team FTE %)", "§5.5 People overview", "§5.6 Person detail view", "§5.8 Team detail view (Members list only)", "§6 Data model (Person, Membership, Role, Country)", "§7.2 Capacity (Team FTE % cap)", "§9.3 Deletion rules (deactivate only)"]
---

# Add a person and assign them to a team

## Intent

**Problem statement:** A team lead cannot staff any initiative when their
team has just been created, because there is no way yet to add a person
to the tool or assign them to the team with a defined share of their
capacity.

**Outcome statement:** This slice contributes to the tool's core loop by
enabling a team lead to build a real roster: a person with a country and
role, and a membership capping their claim on that person's capacity.

## Scope

- People overview (§5.5): quick-add row (name, country, role), table with
  active people shown by default.
- Person detail side panel (§5.6): edit name, country, role, capacity %;
  add a team membership with Team FTE % capped at and defaulting to the
  person's unclaimed capacity; Deactivate / Reactivate.
- Team detail (§5.8): Members list — add an existing person or create one
  inline with the same defaults; deactivate or remove a member.
- Role and Country master data are read from the brand pack's seeded
  defaults (§2 fresh-install baseline) — no Settings editing UI is built
  in this slice, since the seeded values are enough to create people.

**Explicitly excluded:** Editing roles, countries or rates in Settings —
the brand pack's seeded defaults are sufficient for a person to exist and
have a cost basis; editing that master data is a later, separate slice
because nothing in this slice's core behaviour requires changing it.

## Execution path

1. User triggers: on the People overview, types a name into the quick-add
   row.
2. UI/data: a person record is created with default country and role,
   committed to the master people file (§10.2).
3. User triggers: opens the team detail, clicks Add member, and either
   picks the new person or creates one inline; sets or accepts the
   default Team FTE %.
4. UI/data: a membership record is created and committed, capped at the
   person's unclaimed capacity.
5. User receives: the person appears on the People overview and on the
   team's Members list with their Team FTE %.

## Value

- **Desirable:** A team lead building out their team would seek this
  immediately after creating the team itself.
- **Usable:** A user can add a person and a membership using only the
  quick-add row and the Add member control, with defaults doing the rest,
  without guidance.
- **Valuable:** After this slice, a team lead has a real roster with
  defined capacity shares — the prerequisite for any allocation work in
  slice 005.

## Acceptance criteria

- [ ] Given the People overview, when a name is typed into the quick-add
      row and submitted, then the person appears in the table with a
      default country, role and 100% capacity.
- [ ] Given a person and a team both exist, when the person is added as a
      member from the team detail, then their Team FTE % defaults to
      their full unclaimed capacity.
- [ ] Given a person already holds Team FTE % on one team, when they are
      added to a second team, then the second membership's Team FTE % is
      capped at the remaining unclaimed capacity and cannot be set higher
      in the person panel.
- [ ] Given a person is deactivated, when the People overview loads with
      its default filter, then the person no longer appears.

## Delivery gate

- [ ] Deployed to production-equivalent environment
- [ ] Demonstrated to at least one external stakeholder (user, customer,
      or business owner)

## Flags and compromises

None.
