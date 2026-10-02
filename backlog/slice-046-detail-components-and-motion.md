---
slice_id: "046"
title: "Detail components: key figures, labelled checklist, period range picker, motion"
type: "feature"
status: "valid"
criteria_failures: []
depends_on: ["043", "044"]
verification_status: null
superseded_by: null
supersedes: null
change_summary: "Split from 044 while settling the modernization decisions with the user (2 Oct 2026, from rendered mockups): the initiative header gets four key figures, the checklist a labelled segmented control with the status icon at the left, the phase period one Airbnb-style range picker that saves on Done, and four extra motions. §5.4 and §9.11 updated."
recommended_model: "Claude Opus 5.5"
model_rationale: "The range picker is a new shared control with keyboard, typing, preview and a save-on-Done exception; the header and checklist touch hot files."
spec_sections: ["§5.4 Initiative detail view", "§7.1 Time granularity and cost of an allocation", "§8.1 Passing a gate", "§9.5 Accessibility", "§9.8 Visual design", "§9.11 Lists, filters, inputs and amounts"]
---

# Detail components: key figures, labelled checklist, period range picker, motion

## Intent

**Problem statement:** On the detail page the money and progress figures
sit in a small box below the title, checklist statuses are icons whose
meaning lives in tooltips, a phase period is two separate date fields with
an OS-dependent format, and nothing on the page moves to confirm a change.

**Outcome statement:** The header shows where the initiative stands at a
glance, checklist states read in words, setting a period feels like booking
a stay, and changes are confirmed by small, purposeful motion.

## Scope

1. **Key figures (§5.4 Cost summary).** Under the header, a row of four
   tiles: Grand estimate (approved-at figure and difference beneath it,
   once a costed gate has passed), Deviation (signed; overspend in
   Warning), Current phase with its period, and the current gate's "X of Y
   complete". Copy stays with the figures. Replaces the cost summary box.
2. **Checklist control (§5.4).** Each item: status icon at the left, the
   name, and a labelled segmented control "Incomplete · Tentative ·
   Complete" (shadcn ToggleGroup), the selected segment in its colour role
   (neutral, Warning, Met). Tentative still opens the note field.
3. **Period range picker (§9.11).** One control split into Start | End,
   built on shadcn's Calendar (react-day-picker v10, `mode="range"`,
   `numberOfMonths={2}`) in a Popover:
   - the half being set is outlined; each half accepts typed dates;
   - the range shades as the pointer (or keyboard focus) moves;
   - the previous and next phases' periods are marked faintly on their
     days; today is marked;
   - shortcuts: "Right after <previous phase>" (start), and 1, 2, 3 or 6
     months (whole months ending at a month end);
   - footer: "1 Sep – 31 Oct 2026 · 2 months · 44 working days (DE) / 43
     (ES)", one count per country in the team (§7.1 working days), plus
     the overlap warning in Warning when the start is on or before the
     previous phase's end; Clear and **Done**;
   - **saves only on Done** (one write and one commit for the period);
     Esc or clicking outside discards the change.
4. **Motion** (all off under `prefers-reduced-motion: reduce`, §9.5):
   - board cards lift 1 px with a stronger shadow on hover (120 ms);
   - the four key figures roll to their new value (≤ 300 ms);
   - routes cross-fade when switching sections (150 ms);
   - gate pass: the stepper step fills and a check draws in (~400 ms).

## Execution path

1. Open Onboarding Flow v2 → four tiles: €59,008 · €0 · Validation 1 Sep –
   30 Nov 2026 · 1 of 4.
2. Gate panel → Cost estimate reviewed → Tentative → note field opens.
3. Validation period → End → hover 31 Oct → footer reads 2 months, 44 / 43
   working days → Done → one commit "Onboarding Flow v2: Validation period
   set to Sep–Oct".
4. Change an allocation → Grand estimate rolls to the new value.

## Value

- **Desirable:** The user's ask for a more modern, intuitive app.
- **Usable:** Status in words; a period chosen in one place with its length
  and working days in view.
- **Valuable:** The core page gets clearer without new pages or modals.

## Acceptance criteria

- [ ] Given any initiative, then the header shows the four key figures; the
      approved-at line appears only after a costed gate has passed.
- [ ] Given a checklist item, then its status icon is at the left and the
      segmented control reads Incomplete, Tentative, Complete; the selected
      segment has the role colour and an accessible pressed state.
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
- [ ] Given reduced motion, then none of the four motions runs.
- [ ] Given the e2e axe scan in both themes, then the detail page passes
      with the picker open.

## Delivery gate

- [ ] Deployed to production-equivalent environment

## Flags and compromises

Saving on Done is the one exception to "fields save as you edit"; agreed
with the user for the period picker only. The month input (§9.11) is
unchanged.

## Decided in review (pre-implementation)

Settled with the user on 2 Oct 2026 from rendered mockups (header
hierarchy B, checklist B with icon, range picker A with all four helpers,
save on Done, all four extra motions). Copy uses the spec's "Incomplete",
not the mockup's "Open".
