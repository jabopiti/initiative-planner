---
slice_id: "041"
title: "Copied cells that look like formulas stay text"
type: "bugfix"
status: "valid"
criteria_failures: []
depends_on: ["004c"]
verification_status: null
superseded_by: null
supersedes: null
change_summary: "Promoted from the backlog tail (Copy table cells that begin with =, +, - or @). Spreadsheets read such cells as formulas when pasted — a correctness problem and a formula-injection risk for text other users typed."
recommended_model: "Claude Haiku 4.5"
model_rationale: "One function in copyTable.ts with a clear rule and direct unit tests."
spec_sections: ["§9.2 Copy", "§9.11 Lists, filters, inputs and amounts", "§10.9 Security"]
---

# Copied cells that look like formulas stay text

## Intent

**Problem statement:** A cost item labelled "=Hosting" or a person named
"@Mara", copied from a table and pasted into a spreadsheet, becomes a formula:
an error at best, and at worst a formula another user typed runs in the
reader's spreadsheet.

**Outcome statement:** Every copied text cell pastes as the text it shows,
while numbers still paste as numbers.

## Scope

- **Rule.** In the plain-text copy (`tableToText`), a **text** cell whose
  first character is `=`, `+`, `-`, `@` (or a tab or carriage return after
  flattening) is prefixed with an apostrophe `'`. Numeric cells — amounts,
  percentages, signed deviations such as "−€1,300" or "+€9,200" — are never
  prefixed.
- **Cell kinds.** `CopyTableData` marks which columns are numeric, so the rule
  doesn't guess from content; every existing Copy caller declares its numeric
  columns. Ships before the new Copy buttons of 013 and 021 (013 depends on
  it), so they declare theirs from the start.
- **HTML copy unchanged** (spreadsheets keep HTML cells as text).

## Execution path

1. A cost item "=Hosting" is copied with the cost summary.
2. Pasted into a spreadsheet, the cell reads "=Hosting" as text.

## Value

- **Desirable:** Pasted data must be what was shown.
- **Usable:** Invisible.
- **Valuable:** Removes a formula-injection path (§10.9).

## Acceptance criteria

- [ ] Given text cells "=Hosting", "+1 contractor", "-legacy", "@Mara", then
      the plain-text copy has "'=Hosting", "'+1 contractor", "'-legacy",
      "'@Mara".
- [ ] Given numeric cells "−€1,300", "+€9,200", "-5%", then they are copied
      unchanged.
- [ ] Given the HTML copy, then no cell is prefixed.
- [ ] Given every existing Copy button, then its numeric columns are declared
      and its current tests pass.

## Delivery gate

- [ ] Deployed to production-equivalent environment

## Flags and compromises

None.

## Decided in review (pre-implementation)

- **Method:** a leading apostrophe on text cells in the plain-text copy only;
  numeric cells and HTML untouched.
