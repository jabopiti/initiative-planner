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
change_summary: "Split from 059 in the backlog reshuffle of 3 Oct 2026: the range picker is a self-contained shared control (its own spec sections, no overlap with the key figures or checklist), and 061b's cost item month strip reuses its month cells. Scope, criteria and decisions are unchanged from 059, where the user settled them from rendered mockups on 2 Oct 2026. Review of 4 Oct 2026: the footer names countries by a new required country Code (Settings → Countries), lengths read in months and days, Tab out discards; the data branch got its codes by a one-off direct edit (no in-app migration, no schema bump). §6, §5.9 and §9.11 updated."
recommended_model: "Claude Opus 5.5"
model_rationale: "A new shared control with keyboard, typing, preview and a save-on-Done exception to how every other field saves."
spec_sections: ["§5.4 Initiative detail view", "§5.9 Settings", "§6 Data model", "§7.1 Time granularity and cost of an allocation", "§9.5 Accessibility", "§9.11 Lists, filters, inputs and amounts"]
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
- [ ] Given Settings → Countries unlocked, then each country's Code is
      editable beside its name, and adding a country without a code is
      refused with "Enter a code."
- [ ] Given a team with members in Germany and Spain, then the footer
      reads "44 working days (DE) / 43 (ES)" for 1 Sep – 31 Oct 2026.
- [ ] Given 3 Sep – 30 Oct 2026, then the footer's length reads "1 month
      28 days".

## Flags and compromises

Saving on Done is the one exception to "fields save as you edit"; agreed
with the user for the period picker only. The month input (§9.11) is
unchanged.

## Decided in review (pre-implementation)

Settled with the user on 2 Oct 2026 from rendered mockups, while this was
part of 059 (range picker A with all four helpers, save on Done).

### Decided in review (pre-implementation), 4 Oct 2026

Settled with the user from rendered mockups.

- **Footer names countries by code (D1 B).** "1 Sep – 31 Oct 2026 · 2
  months · 44 working days (DE) / 43 (ES)": one count per country of the
  initiative team's current members, prorated as in §7.1, rounded to
  whole days; no members, no counts.
- **Country code: required (E1 B).** Countries gain `code` (text,
  required, trimmed, no uniqueness check, like a role's abbreviation).
  Settings → Countries shows a **Code** column beside Name (inline field
  while unlocked) and the Add country row a Code field; empty is refused
  with "Enter a code."; the draft row's hint reads "Code: e.g. DE. Shown
  where space is short, such as the period picker." The brand pack's
  baseline and example data carry DE and ES.
- **Existing data: direct edit, no in-app migration (M1 B).** The user
  allowed a one-off direct edit of this repo's `data` branch: DE and ES
  are added to `countries.json` (an exception to AGENTS.md's "never edit
  the dataset directly", for this edit only). The schema version stays 1:
  the current build ignores the extra field, so the live app keeps working
  before this slice deploys, and no other dataset needs it. A country
  read without a code shows its name in the footer, defensively.
- **Length in months and days (D2 A).** "2 months" for whole months,
  "1 month 28 days" (3 Sep – 30 Oct), "19 days" under a month: whole
  calendar months counted from the start, then the remaining days.
- **Tab out discards (D3 A),** like Esc and a click outside; Enter in
  either half acts as Done.
- **Assumptions stated in review:** caption "Period"; halves named
  "<phase> start date" / "<phase> end date". The first pick sets Start and
  moves the outline to End; picking before Start while setting End starts
  again. "Right after <previous phase>" sets Start to the day after the
  previous costed phase's end, hidden without one; the month shortcuts
  end on the last day of start month + n − 1, disabled until a start is
  set. Legend "<previous> · <next> · Today" under the calendar. Hints:
  "Pick a start date, or type one." and "From 1 Sep 2026 · pick an end
  date". Overlap and inverted warnings keep today's wording, in the
  footer and under the control; Done still saves either. One commit per
  Done: "<initiative>: <phase> period set to Sep–Oct" (years named when
  they differ, "Nov 2026–Feb 2027"; "period cleared" after Clear); Done
  with nothing changed writes nothing. Changed, failure and conflict
  states of both dates show on the control; a remote change is held while
  it is open. One month below `sm`. The range cell styling is one shared
  helper for 061b's month strip. Frozen phases and the month input are
  unchanged.
