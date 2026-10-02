---
slice_id: "030"
title: "Settings: Countries & rates, and Rates are correct"
type: "capability"
status: "valid"
criteria_failures: []
depends_on: ["029"]
verification_status: null
superseded_by: null
supersedes: null
change_summary: "Promoted from the backlog tail (Settings: edit roles, countries and rates, §5.9), second of the four Settings slices. Review before implementation added the §7.2 yearly rollover (system write, deferred here by 005b), country rename, a year/month-aware impact count shown at the top of the open country, and the copy and markers agreed from mockups."
recommended_model: "Claude Opus 5.5"
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

- **Section.** Adds its "Countries & rates" entry to 029's section list.
- **List (§5.9).** One row per country: name, the current year's day rate
  ("€720 / day (2026)"), Active. A click expands that country's year table
  in place, one country open at a time.
- **Year table (§5.9, §7.2).** A row per tracked year: day rate, then working
  days for Jan–Dec. Working days are prefilled with the month's weekdays; a
  cell that differs from the weekday count is tinted (with a text marker for
  §9.5: its accessible name says "differs from 21 weekdays"). Each row has
  **Reset to weekdays**. Years that left the tracked window sit in one
  collapsed, read-only "Earlier years" row.
- **Editing** only while unlocked (029's lock). Day rate: an amount ≥ 0;
  working days: whole numbers from 0 to the month's calendar days; anything
  else refused inline.
- **Add country.** Draft row: name and one day rate, copied to every tracked
  year, working days prefilled with weekdays. **Add** saves.
- **Deactivate / Reactivate (§9.3).** Inactive countries greyed out, not
  offered for people; people there keep it.
- **Impact note (029's pattern, placed per country).** After a day-rate,
  working-days or Reset change, one line at the top of the open country,
  replaced by the latest edit: "2027 day rate: changes the estimate of 2
  initiatives." (see Decided in review for the count).
- **Rename.** While unlocked, the name in the country row is an input.
- **Yearly rollover (§7.2 system write).** When a year enters the tracked
  window and a country (or an active or inactive custom role) has no entry
  for it, the tool adds it: day rates copied from the preceding year,
  working days prefilled with weekdays. One idempotent commit, "Rates copied
  into 2029".
- **Rates are correct (§5.9, §5.2).** While the dataset's `ratesReviewed` is
  false, a **Rates are correct** button in the section header, usable while
  locked (it confirms, it doesn't edit). Clicking it, or any rate edit, sets
  `ratesReviewed`; the header then shows muted text "Rates reviewed".
- **Commits.** "Germany: 2027 day rate set to €740", "Germany: working days in
  Apr 2027 set to 19", "Countries: Portugal added", "Rates confirmed as
  correct".

**Explicitly excluded:** holiday calendars or automatic public-holiday
lookup; the Getting started strip itself (033).

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
- [ ] Given a day-rate change for a year, then the impact note counts
      initiatives with an unfrozen allocation, in a phase with a month
      resolving to that year's entry, of someone in that country without an
      active custom role; given a working-days change for a month, those
      with such an allocation in that month, custom-role people included;
      frozen figures are unchanged.
- [ ] Given unlocked, then a country's name can be edited; an empty name is
      refused with "Enter a name.".
- [ ] Given a tracked year with no entry for a country or a custom role,
      then one system write adds it (day rate from the preceding year,
      working days = weekdays), and a second client doing the same makes no
      duplicate and no conflict.

## Flags and compromises

None.

## Decided in review (pre-implementation)

- **Opening a country:** expands its year table in place, one at a time.
- **Rates are correct:** in the section header until confirmed, usable while
  locked; then "Rates reviewed".
- **Impact note:** 029's wording, placed per country (below).

### Settled in the pre-implementation review (2026-09-30)

- **Rollover in this slice (D1).** The §7.2 system write lives here: country
  day rates and custom-role day rates for a year entering the window, copied
  from the preceding year; working days = weekdays. Idempotent; the first
  write-capable client makes it; concurrent attempts converge.
- **File shape unchanged (D2).** `ratesByYear` keeps no ids; concurrent edits
  to one country's rates are a same-field conflict, labelled "Rates" with the
  country's name, like custom-role rates.
- **Impact count is year/month-aware (D3)** as in the criterion above;
  clamped years (before the earliest entry, after the last) count too.
- **Rename (D4):** name editable in the country row while unlocked, commits
  on blur/Enter; locked, it's plain text. The chevron button toggles the
  year table ("Show Germany's rates" / "Hide Germany's rates"); locked, the
  whole row does.
- **Differing cell (U1 A):** neutral `surface-subtle` fill, `border-strong`
  border and a small dot; tooltip "Differs from 22 weekdays"; accessible
  name "Working days in Mar 2027, Germany: 21, differs from 23 weekdays".
  Not the Warning colour (§9.8).
- **Impact note (U2 B):** one line at the top of the open country, replaced
  by the latest edit, cleared when the country collapses. Wordings: "2027
  day rate: changes the estimate of 2 initiatives.", "Apr 2027 working days:
  changes the estimate of 1 initiative.", "2027 working days reset to
  weekdays: changes the estimate of 2 initiatives.", "… changes no
  estimates." for zero.
- **Reset to weekdays (U3 A):** ghost text button at the row's end, disabled
  (muted) when the row already matches the weekdays.
- **Copy:** header "Rates are correct" (outline button, check icon) →
  muted "Rates reviewed" with a check icon; list row "€1,000 / day (2026)";
  refusals "Enter a name.", "Enter a day rate of 0 or more.", "Enter whole
  days from 0 to 30." (the month's calendar days); Add country hint "Used
  for 2026, 2027 and 2028. Working days start as the weekdays of each
  month."; "Earlier years (2026)", shown only when earlier years exist.
- **Assumptions:** section listed after Roles with its own lock;
  deactivate/reactivate as in Roles, no confirmation; new writers for
  `countries.json` and `dataset.json`; a rate edit while `ratesReviewed` is
  false writes the flag in its own commit; no duplicate-name check; no Copy
  button (§9.2 doesn't list this screen).
