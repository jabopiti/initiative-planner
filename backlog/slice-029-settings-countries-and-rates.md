---
slice_id: "029"
title: "Settings: Countries & rates, and Rates are correct"
type: "capability"
status: "valid"
criteria_failures: []
depends_on: ["028"]
verification_status: null
superseded_by: null
supersedes: null
change_summary: "Promoted from the backlog tail (Settings: edit roles, countries and rates, §5.9), second of the four Settings slices."
recommended_model: "Claude Opus 5"
model_rationale: "The tracked-year window, read-only past years, weekday prefill with tinted differences, a new country's rate copied to every tracked year, and the impact count over unfrozen phases all feed the cost engine; a mistake here corrupts every estimate for a country, so the data-layer rules need careful tests across year boundaries."
spec_sections: ["§5.9 Settings (Countries & rates)", "§6 Data model (Country, Dataset)", "§7.1 Time granularity and cost of an allocation", "§7.2 Capacity, rates, and the three percentages", "§5.2 Portfolio overview (Getting started strip)", "§9.3 Deletion rules", "§9.5 Accessibility", "§10.3 Writing"]
---

# Settings: Countries & rates, and Rates are correct

## Intent

**Problem statement:** Every allocation's cost is day rate × working days, per
country and year, and those numbers ship as placeholders. Nobody can enter
Germany's real 2027 day rate, correct a month's working days for public
holidays, or add Portugal when the first person there joins.

**Outcome statement:** Countries & rates lets the organisation set each
country's day rate and working days for every tracked year, add and
deactivate countries, and confirm the rates are right — so costs are real
and the Getting started strip's first step can clear.

## Scope

- **List (§5.9).** One row per country: name, the current year's day rate
  ("€720 / day (2026)"), Active. A click expands that country's year table
  in place, one country open at a time.
- **Year table (§5.9, §7.2).** A row per tracked year: day rate, then working
  days for Jan–Dec. Working days are prefilled with the month's weekdays; a
  cell that differs from the weekday count is tinted (with a text marker for
  §9.5: its accessible name says "differs from 21 weekdays"). Each row has
  **Reset to weekdays**. Years that left the tracked window sit in one
  collapsed, read-only "Earlier years" row.
- **Editing** only while unlocked (028's lock). Day rate: an amount ≥ 0;
  working days: whole numbers from 0 to the month's calendar days; anything
  else refused inline.
- **Add country.** Draft row: name and one day rate, copied to every tracked
  year, working days prefilled with weekdays. **Add** saves.
- **Deactivate / Reactivate (§9.3).** Inactive countries greyed out, not
  offered for people; people there keep it.
- **Impact note (028's pattern).** After a day-rate or working-days change:
  "Changes the estimate of 3 initiatives." beside the field.
- **Rates are correct (§5.9, §5.2).** While the dataset's `ratesReviewed` is
  false, a **Rates are correct** button in the section header, usable while
  locked (it confirms, it doesn't edit). Clicking it, or any rate edit, sets
  `ratesReviewed`; the header then shows muted text "Rates reviewed".
- **Commits.** "Germany: 2027 day rate set to €740", "Germany: working days in
  Apr 2027 set to 19", "Countries: Portugal added", "Rates confirmed as
  correct".

**Explicitly excluded:** holiday calendars or automatic public-holiday
lookup; the Getting started strip itself (032).

## Execution path

1. Settings → Countries & rates → Unlock → Germany.
2. 2027 day rate €740; April 2027 working days 19 (Easter).
3. April's cell is tinted; "Changes the estimate of 2 initiatives." shows;
   `ratesReviewed` is set and the header reads "Rates reviewed".

## Value

- **Desirable:** Real rates are the premise of every figure in the tool.
- **Usable:** One table per country, spreadsheet-like.
- **Valuable:** Correct costs everywhere, and the first-use path can finish.

## Acceptance criteria

- [ ] Given Countries & rates, then each country shows name, the current
      year's day rate and Active; clicking one expands its year table and
      collapses any other.
- [ ] Given the year table, then each tracked year has a day rate and 12
      working-day cells, prefilled with weekdays.
- [ ] Given a working-day cell set to 19 where the month has 21 weekdays, then
      it is tinted and its accessible name says it differs from 21 weekdays;
      Reset to weekdays restores all 12 cells of that row.
- [ ] Given years before the tracked window, then they appear in a collapsed,
      read-only "Earlier years" row.
- [ ] Given locked, then nothing is editable; unlocked, day rates and working
      days are.
- [ ] Given a working-day value of 32, -1 or 2.5, then it is refused inline.
- [ ] Given Add country with name and €600, then every tracked year gets €600
      and weekday working days.
- [ ] Given a country is deactivated, then it is not offered for people and
      people there keep it.
- [ ] Given `ratesReviewed` is false, then Rates are correct shows and works
      while locked; afterwards the header reads "Rates reviewed".
- [ ] Given any day-rate or working-days edit, then `ratesReviewed` is set.
- [ ] Given a rate change, then the impact note counts initiatives with an
      unfrozen allocation of someone in that country, and frozen figures are
      unchanged.

## Delivery gate

- [ ] Deployed to production-equivalent environment

## Flags and compromises

None.

## Decided in review (pre-implementation)

- **Opening a country:** expands its year table in place, one at a time.
- **Rates are correct:** in the section header until confirmed, usable while
  locked; then "Rates reviewed".
- **Impact note:** as in 028.
