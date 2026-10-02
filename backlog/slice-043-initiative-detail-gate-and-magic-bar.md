---
slice_id: "043"
title: "Initiative detail: current phase first, complete gate panel, clearer magic bar"
type: "feature"
status: "valid"
criteria_failures: []
depends_on: ["015", "026"]
verification_status: null
superseded_by: null
supersedes: null
change_summary: "From the October 2026 UX review (docs/ux-review-2026-10.md), roadmap group 'Detail page': F05, F06, F07, F08, F15. F07's labelled stepper conflicts with §9.10 (phases icon-only in the stepper) and must be settled with the user and recorded in the spec."
recommended_model: "Claude Opus 5.5"
model_rationale: "Touches the magic bar, phase editor and gate panel (hot files), and one item changes specified behaviour (§9.10), so it needs a spec decision first."
spec_sections: ["§5.4 Initiative detail view", "§8.1 Passing a gate", "§9.5 Accessibility", "§9.8 Visual design", "§9.10 Icons"]
---

# Initiative detail: current phase first, complete gate panel, clearer magic bar

## Intent

**Problem statement:** The detail page opens on the wrong place: the
current phase is collapsed and its gate panel isn't beneath it. The gate
count says "1 of 4" while only three items are listed. The magic bar's
dots don't say what they mean, and a blocked Pass gate looks like plain
text. Header fields don't look editable, and the actuals row is crowded.

**Outcome statement:** The page opens on the work to do now; the gate
panel lists every requirement it counts; the magic bar shows the phase
names and a Pass gate that reads as a button even when blocked.

## Scope

1. **F05** The current phase is always expanded on open, with its gate
   panel directly after it. An older phase that needs attention (overdue
   actuals) stays collapsed with a Warning chip on its header row.
2. **F06** Non-checklist gate requirements ("Development has a period and
   at least one allocation") are listed in the panel above the checklist,
   with a Go to link, in the same Met / Open style; the count matches the
   rows.
3. **F07** The stepper shows its phases with labels (or a labelled
   tooltip, per the decision below), current phase in Accent. A blocked
   Pass gate is an outline button with the open count ("Pass gate · 3
   open").
4. **F08** Editable header fields show a hover and focus state (subtle fill
   and border); the title text lines up with the cards below it.
5. **F15** Actuals: € sits inside the field, placeholder "Actual"; the
   one-click action is a text button "Use estimate"; the estimate shows
   once, in its own column.

## Execution path

1. Open Fraud Detection Upgrade → Validation is expanded, its gate panel
   right below it.
2. The panel lists 4 rows for "1 of 4".
3. The magic bar reads Discovery ✓ · Validation · Development · Rollout,
   and "Pass gate · 3 open".

## Value

- **Desirable:** People land on what they need to do.
- **Usable:** Counts that match what's shown; buttons that look like buttons.
- **Valuable:** Fixes four of the review's ten P1 findings on the main
  working page.

## Acceptance criteria

- [ ] Given any initiative, then the current phase is expanded on open and
      its gate panel is the next section.
- [ ] Given an older phase with overdue actuals, then it is collapsed with
      a Warning chip naming the cause.
- [ ] Given a gate with N requirements, then the panel lists N rows and the
      count reads "x of N".
- [ ] Given the magic bar, then each phase has a visible or focusable label
      with an accessible name, and the current one is in Accent.
- [ ] Given a blocked gate, then Pass gate renders as an outline button with
      the open count and is announced as disabled with the reason.
- [ ] Given hover or focus on the title, owner or dates, then a fill and
      border show in both themes.
- [ ] Given an actual cost row, then € is inside the field and "Use
      estimate" is a labelled text button.

## Delivery gate

- [ ] Deployed to production-equivalent environment

## Flags and compromises

§9.10 says phases are icon-only in the stepper; F07 recommends labels.
Open decision for the next-slice session: labels always, labels for the
current phase only, or icons kept with a visible tooltip. Record the
choice in §5.4 and §9.10.

## Decided in review (pre-implementation)

(none yet)
