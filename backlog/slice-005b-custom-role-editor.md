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
their own role label and their own day rate per year, so that person is
costed at what they are actually paid once allocated.

## Scope

- In the person detail panel (§5.6), a role choice of **Standard role** or
  **Custom role**. A custom role has a free-text label and a day rate for
  each year of the tracked window (§7.2: the current calendar year and the
  next two).
- Choosing Custom role replaces the standard role for that person;
  switching back restores the standard role choice. Slice 005 stores
  `roleId` on every person and treats `customRole` as taking precedence, so
  this slice decides whether `roleId` becomes optional for a custom-role
  person (§6: "a standard role, or a custom role instead") and migrates the
  types and existing tests to match.
- A year with no entered rate is not zero: it takes the nearest entered
  year's rate, exactly as §7.2 already clamps (built in slice 005's
  `yearRecord`). The panel says which years are entered and which take
  another year's rate.
- The People overview's Role column and the allocation table show the
  custom label in place of a standard role's name (the allocation table
  already does, from slice 005).
- Each change commits to `people.json` with a plain-words message (§10.3),
  like every other person edit.

**Explicitly excluded:** Creating the next year's rate entries
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
   rate, with no role factor, in every phase they are allocated to.

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
      working days × Allocation % × the new rate, with no role factor.
- [ ] Given a custom role with a rate for the current year only, when a
      phase in a later year is costed, then it uses the nearest entered
      year's rate, not zero, and the panel says so.
- [ ] Given a person with a custom role, when Standard role is chosen
      again, then their cost uses the country rate and role factor, and
      the custom rates are kept until the user clears them.
- [ ] Given a person with a custom role, when the People overview and an
      allocation table render, then both show the custom label as the role.

## Delivery gate

- [ ] Deployed to production-equivalent environment

## Flags and compromises

None.
