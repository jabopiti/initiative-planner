---
slice_id: "060"
title: "Amount input: shorthand, simple sums and the currency inside the field"
type: "feature"
status: "valid"
criteria_failures: []
depends_on: ["052"]
verification_status: null
superseded_by: null
supersedes: null
change_summary: "Chosen by the user on 2 Oct 2026 from the research page 'Patterns worth borrowing' (pattern 2, finance-app currency inputs). One shared AmountInput used by cost items, actuals and day rates, built before 061b (061 until the 3 Oct 2026 reshuffle) so that slice's tables use it from the start. Also takes the '€ inside the field' half of the review's F15. §9.11 updated."
recommended_model: "Claude Sonnet 5"
model_rationale: "One component and one pure parser with exact decimals; a table of parser cases is cheap to write first."
spec_sections: ["§9.11 Lists, filters, inputs and amounts", "§9.7 Language and formats", "§5.4 Initiative detail view", "§5.9 Settings"]
---

# Amount input: shorthand, simple sums and the currency inside the field

## Intent

**Problem statement:** Amounts are typed out in full ("12000"), with the
currency symbol outside the field, and a figure someone has as "3 licences
at 4k" has to be worked out elsewhere first.

**Outcome statement:** Every amount field takes "12k" or "3 × 4k", shows
the amount it will save before it saves, and shows the currency inside the
field.

## Scope

1. **Parser** (`parseAmount`, pure, no `eval` or `new Function`, §10.9):
   digits with the user's decimal separator (§9.7, as decided in 052), `k`
   and `m` suffixes, `+ − × /` (also `- *`) and brackets. Exact
   decimals (integer cents or a decimal library already in the tree; no
   new dependency without asking). Result: an amount ≥ 0, or a reason.
2. **`AmountInput`** replaces today's amount fields in cost items, actuals,
   country day rates and custom-role day rates: currency symbol inside the
   field (brand pack, §2); while the entry isn't a plain number, a line
   under it reads "Saves as €12,000"; an invalid entry says why there and
   saves nothing; Enter commits, Esc cancels (§9.5). A plain number behaves
   exactly as today.
3. **Placeholder** "Amount" (cost items) and "Actual" (actuals), from F15.

## Execution path

1. Onboarding Flow v2 → Add cost item → amount "3 × 4k" → the line reads
   "Saves as €12,000" → Add → the item shows €12,000.
2. Settings → Countries & rates → unlock → Spain 2027 → "820" → saved as
   today.
3. Browser locale de-DE (if 052 kept locale formats) → "2,5k" → €2,500.

## Value

- **Desirable:** Typing amounts the way people say them.
- **Usable:** The saved amount is visible before it's saved.
- **Valuable:** One shared field that 061b's cost items and actuals use from day one.

## Acceptance criteria

- [ ] Given the parser table (12k, 2.5m, 3 × 4k, 18k + 2.4k, 1.2m / 12,
      (2+3)k, 0, "", abc, 5-, 1/0, -3), then each yields the listed amount
      or reason; 0.1 + 0.2 yields exactly 0.30.
- [ ] Given the decimal-comma format, then "2,5k" is 2,500 and "12,000" in
      a dot-decimal format is 12,000.
- [ ] Given "3 × 4k" in a cost item, then "Saves as €12,000" shows and Add
      saves 12000.
- [ ] Given "abc", then the reason shows and no write is made.
- [ ] Given a plain "820", then no "Saves as" line shows and the value
      saves on Enter as today.
- [ ] Given each amount field (cost item, actual, country rate, custom-role
      rate), then the currency symbol sits inside it.
- [ ] Given `grep` for `eval(` and `new Function` in `src`, then none.

## Flags and compromises

Waits on 052's formats decision only for which decimal separator applies;
if 052 is not yet settled, build for the browser locale as §9.7 reads
today and adjust in one place.

## Decided in review (pre-implementation)

User picked research pattern 2 on 2 Oct 2026. Open for the next-slice
session: whether `×` is also typed as `x` (the mockup accepted it), and
the exact copy of the invalid-entry reasons.
