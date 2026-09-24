---
slice_id: "005b"
title: "Give a person a custom role and day rate"
type: "capability"
status: "valid"
criteria_failures: []
depends_on: ["004", "005"]
verification_status: null
superseded_by: null
supersedes: null
change_summary: "Inserted while planning slice 005: its acceptance criteria need a custom-role person to cost correctly, so slice 005 ships the data shape, the engine and tests for it, but no screen sets a custom role. This slice adds that screen."
recommended_model: "Claude Sonnet 5"
model_rationale: "One well-specified form section on an existing panel. The cost rule it feeds (§7.1, custom rate absolute, no role factor) is already built and tested in slice 005, so nothing here is hard to verify by testing alone."
spec_sections: ["§5.6 Person detail view", "§5.5 People overview", "§6 Data model (Person, Custom role)", "§7.2 Capacity, rates, and the three percentages (Rates and working days)"]
---

# Give a person a custom role and day rate

## Intent

**Problem statement:** A team lead cannot staff someone whose pay is
individually negotiated (a contractor or a fractional executive), because
a person can only carry one of the standard roles, whose day rate comes
from their country and a role factor.

**Outcome statement:** This slice contributes to the core principle that
cost falls out of planning the work by letting a team lead give a person
their own role label, day rate per year and cost factor, so that person is
costed at what they are actually paid once allocated.

## Scope

- In the person detail panel (§5.6), a role choice of **Standard role** or
  **Custom role**. A custom role has a free-text label, a cost factor
  (default 1) and a day rate for each year of the tracked window (§7.2: the
  current calendar year and the next two). Earlier years that have an entry
  are shown read-only.
- Choosing Custom role replaces the standard role for that person;
  switching back restores the standard role choice. `roleId` stays required
  and is never lost; `customRole` gains an `active` flag (decided with the
  user, §6) that says which of the two costs and shows the person. The types
  and existing tests migrate to the new shape, and the cost rule becomes day
  rate × cost factor with the custom role's own factor (§7.1).
- A person switched to Custom role with no rate entered yet is costed at
  zero, and the panel says so ("No rate yet. Costed at 0.") rather than
  filling in a value the user did not choose. A cleared field is "not
  entered"; a typed `0` is an explicit zero rate.
- An empty label is allowed; tables then show "Custom role".
- The panel's text and number fields commit on blur or Enter, never per
  keystroke (§10.3). The shared percent input and the name field change to
  match.
- A year with no entered rate is not zero: it takes the nearest entered
  year's rate, exactly as §7.2 already clamps (built in slice 005's
  `yearRecord`). The panel says which years are entered and which take
  another year's rate.
- The People overview's Role column and the allocation table show the
  custom label in place of a standard role's name (the allocation table
  already does, from slice 005).
- Each change commits to `people.json` with a plain-words message (§10.3),
  like every other person edit.

**Explicitly excluded:** A tracked-window rollover (the window helper this
slice adds is read-only). Creating the next year's rate entries
automatically when a year enters the window ("a system write", §7.2). That
belongs with the tracked-window work for country rates, which does not
exist yet. Editing roles, countries and rates in Settings (§5.9). The
quick-add row (§5.5) keeps creating standard-role people only.

## Execution path

1. User triggers: opens a person's panel and chooses Custom role.
2. UI: a label field and one day-rate field per tracked year appear.
3. User triggers: types "Fractional CTO" and a rate for the current year.
4. Data: the person's record now carries the custom role and is committed
   to `people.json`.
5. User receives: the person's allocations (slice 005) cost at the custom
   rate × the custom cost factor in every phase they are allocated to.

## Value

- **Desirable:** A team lead staffing a contractor would look for this as
  soon as the first non-standard person appears.
- **Usable:** It sits beside the standard role choice in the panel and
  needs no explanation of the rate rules beyond one line of text.
- **Valuable:** Removes the only way a real negotiated rate could not be
  planned, so estimates for staffed initiatives stop needing a
  spreadsheet correction.

## Acceptance criteria

- [ ] Given a person with a standard role, when Custom role is chosen and
      a label and a current-year day rate are entered, then the person's
      record holds them and the change is committed with a message naming
      the person.
- [ ] Given a person with a custom role who is allocated in a phase, when
      the day rate is changed, then that phase's cost for them updates to
      working days × Allocation % × the new rate × the custom cost factor,
      and the standard role's factor does not apply.
- [ ] Given a custom role with a rate for the current year only, when a
      phase in a later year is costed, then it uses the nearest entered
      year's rate, not zero, and the panel says so.
- [ ] Given a person with a custom role, when the cost factor is changed,
      then their cost updates by that factor.
- [ ] Given a person just switched to Custom role with no rate entered,
      when the panel renders, then it says "No rate yet. Costed at 0."
- [ ] Given any text or number field in the person panel, when characters
      are typed, then nothing is committed until the field loses focus or
      Enter is pressed.
- [ ] Given a person with a custom role, when Standard role is chosen
      again, then their cost uses the country rate and role factor, and
      the custom rates are kept until the user clears them.
- [ ] Given a person with a custom role, when the People overview and an
      allocation table render, then both show the custom label as the role.

## Delivery gate

- [ ] Deployed to production-equivalent environment

## Flags and compromises

None.
