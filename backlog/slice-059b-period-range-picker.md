---
slice_id: "059b"
title: "Period range picker: Start and End in one control, saved on Done"
type: "feature"
status: "valid"
criteria_failures: []
depends_on: ["056", "057"]
verification_status: null
superseded_by: null
supersedes: null
change_summary: "Split from 059 in the backlog reshuffle of 3 Oct 2026: the range picker is a self-contained shared control (its own spec sections, no overlap with the key figures or checklist), and 061b's cost item month strip reuses its month cells. Scope, criteria and decisions are unchanged from 059, where the user settled them from rendered mockups on 2 Oct 2026."
recommended_model: "Claude Opus 5.5"
model_rationale: "A new shared control with keyboard, typing, preview and a save-on-Done exception to how every other field saves."
spec_sections: ["§5.4 Initiative detail view", "§7.1 Time granularity and cost of an allocation", "§9.5 Accessibility", "§9.11 Lists, filters, inputs and amounts"]
---

# Period range picker: Start and End in one control, saved on Done

## Intent

**Problem statement:** A phase period is two separate date fields with an
OS-dependent format; its length, its working days and an overlap with the
previous phase only show after both are saved.

**Outcome statement:** Setting a period feels like booking a stay: one
control, the range previewed as it is chosen, its length and working days
in view, and one save.

## Scope

**Period range picker (§9.11).** One control split into Start | End, built
on shadcn's Calendar (react-day-picker v10, `mode="range"`,
`numberOfMonths={2}`) in a Popover:

- the half being set is outlined; each half accepts typed dates;
- the range shades as the pointer (or keyboard focus) moves;
- the previous and next phases' periods are marked faintly on their days;
  today is marked;
- shortcuts: "Right after <previous phase>" (start), and 1, 2, 3 or 6
  months (whole months ending at a month end);
- footer: "1 Sep – 31 Oct 2026 · 2 months · 44 working days (DE) / 43
  (ES)", one count per country in the team (§7.1 working days), plus the
  overlap warning in Warning when the start is on or before the previous
  phase's end; Clear and **Done**;
- **saves only on Done** (one write and one commit for the period); Esc or
  clicking outside discards the change.

Build the month cells so 061b's cost item month strip can reuse them.

## Execution path

1. Onboarding Flow v2 → Validation period → End → hover 31 Oct → footer
   reads 2 months, 44 / 43 working days → Done → one commit "Onboarding
   Flow v2: Validation period set to Sep–Oct".

## Value

- **Desirable:** Choosing a period feels familiar and quick.
- **Usable:** Length, working days and overlap are visible before saving.
- **Valuable:** One shared control instead of two fields, and fewer
  half-set periods committed.

## Acceptance criteria

- [ ] Given the period picker, then typing "3 Sep 2026" into Start or End
      works, and the calendar follows it.
- [ ] Given a start chosen, then hovering or arrowing to a day previews the
      range and the footer shows its length and working days per country.
- [ ] Given a start on or before the previous phase's end, then the footer
      shows the overlap warning and Done still saves.
- [ ] Given a picked range, then nothing is written until Done; Esc or a
      click outside leaves the period unchanged and makes no request.
- [ ] Given Done, then exactly one write and one commit record the period.
- [ ] Given a shortcut "3 months" with start 1 Sep, then the range is 1 Sep
      – 30 Nov.
- [ ] Given the e2e axe scan in both themes, then the detail page passes
      with the picker open.

## Flags and compromises

Saving on Done is the one exception to "fields save as you edit"; agreed
with the user for the period picker only. The month input (§9.11) is
unchanged.

## Decided in review (pre-implementation)

Settled with the user on 2 Oct 2026 from rendered mockups, while this was
part of 059 (range picker A with all four helpers, save on Done).
