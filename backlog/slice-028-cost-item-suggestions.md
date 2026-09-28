---
slice_id: "028"
title: "Cost item label suggestions"
type: "capability"
status: "valid"
criteria_failures: []
depends_on: ["007"]
verification_status: null
superseded_by: null
supersedes: null
change_summary: "Promoted from the backlog tail (Cost item suggestions, §5.11)."
recommended_model: "Claude Sonnet 5"
model_rationale: "A combobox on 007's draft row with keyboard rules, plus a small aggregation over all cached initiatives' cost items; the combobox accessibility is the main care."
spec_sections: ["§5.11 Suggestions and shortcuts (Cost item suggestions)", "§5.4 Initiative detail view (cost items table)", "§9.5 Accessibility", "§9.11 Lists, filters, inputs and amounts"]
---

# Cost item label suggestions

## Intent

**Problem statement:** Across the portfolio the same cost items recur — "Cloud
hosting", "Penetration test", "External UX research" — typed slightly
differently each time and with amounts looked up from the last initiative.

**Outcome statement:** Typing a cost item's label suggests labels already used
across all initiatives, most frequent first, and choosing one prefills its
most recent amount and timing, all still editable (§5.11) — consistent labels
and realistic amounts with less typing.

## Scope

- **Suggestions (§5.11).** On 007's Add cost item draft row, the label field
  becomes a combobox. From the first typed character, it lists up to 5
  earlier labels from all cached initiatives that contain the typed text
  (case-insensitive), **most frequent first**, then alphabetical. Labels are
  grouped by trimmed, case-insensitive text; the most recent spelling is
  shown.
- **Prefill.** Choosing one sets the label, and prefills amount and timing
  (One month / Spread) from its **most recent** use: the item in the phase
  with the **latest start date**; ties go to the initiative later in the
  list. A one-month item's month is not copied (it belongs to another phase);
  the month field starts empty. All fields remain editable; nothing is saved
  until Add (007).
- **Keyboard (§9.5).** Arrow keys move through suggestions, Enter chooses, Esc
  closes the list and keeps the typed text; Tab leaves with the typed text.
  ARIA combobox roles.
- Typing a label nobody used shows no list.

**Explicitly excluded:** suggestions when renaming an existing item.

## Execution path

1. On Development, **Add cost item**, type "pen".
2. The list shows "Penetration test" (used 3 times).
3. Choosing it fills €12,000 and One month from the latest phase using it.
4. The user picks the month and **Add**.

## Value

- **Desirable:** Nobody wants to re-type recurring costs.
- **Usable:** Standard autocomplete behaviour.
- **Valuable:** Consistent labels make cost items comparable across the
  portfolio.

## Acceptance criteria

- [ ] Given labels used 3×, 2× and 1× that contain "te", then typing "te" lists
      them in that order, at most 5.
- [ ] Given "Cloud hosting" and "cloud hosting ", then they are one suggestion
      shown with the most recent spelling.
- [ ] Given a suggestion is chosen, then label, amount and timing are prefilled
      from the item in the phase with the latest start date; a one-month
      item's month is left empty.
- [ ] Given prefilled values, then each is editable, and nothing is saved until
      Add.
- [ ] Given the keyboard, then arrows move, Enter chooses, Esc closes the list
      keeping the text.
- [ ] Given text no earlier label contains, then no list shows.
- [ ] Given a screen reader, then the field is announced as a combobox and the
      number of suggestions is announced.

## Delivery gate

- [ ] Deployed to production-equivalent environment

## Flags and compromises

"Most recent" means the latest phase start date, since cost items carry no
creation date; decided in review to avoid a data-shape change.

## Decided in review (pre-implementation)

- **Most recent:** the use in the phase with the latest start date; no
  `createdAt` added to cost items.
