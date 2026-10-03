---
slice_id: "056"
title: "Initiative detail: current phase first, complete gate panel, clearer magic bar"
type: "feature"
status: "valid"
criteria_failures: []
depends_on: ["015", "026", "050"]
verification_status: null
superseded_by: null
supersedes: null
change_summary: "From the October 2026 UX review (docs/ux-review-2026-10.md), roadmap group 'Detail page': F05, F06, F07, F08. F15 (actuals) moved to 061 (now 061b), which rebuilds the actuals table. F07's labelled stepper conflicts with §9.10 (phases icon-only in the stepper) and must be settled with the user and recorded in the spec. Backlog reshuffle (3 Oct 2026): took over from 050 the phase overview's accessible names and non-colour cue and the Overrun blocker line (same stepper and Pass gate), and from 055 F09 (long names wrap; same header fields as F08); now after 050 so the magic bar is rebuilt once."
recommended_model: "Claude Opus 5.5"
model_rationale: "Touches the magic bar, phase editor and gate panel (hot files), and one item changes specified behaviour (§9.10), so it needs a spec decision first."
spec_sections: ["§5.4 Initiative detail view", "§8.1 Passing a gate", "§9.2 Copy", "§9.5 Accessibility", "§9.8 Visual design", "§9.10 Icons"]
---

# Initiative detail: current phase first, complete gate panel, clearer magic bar

## Intent

**Problem statement:** The detail page opens on the wrong place: the
current phase is collapsed and its gate panel isn't beneath it. The gate
count says "1 of 4" while only three items are listed. The magic bar's
dots differ only by colour and don't say what they mean, an Overrun bar
never names what blocks the gate, and a blocked Pass gate looks like plain
text. Header fields don't look editable, and long names are clipped
mid-word.

**Outcome statement:** The page opens on the work to do now; the gate
panel lists every requirement it counts; the magic bar shows the phase
names and what blocks the gate, with a Pass gate that reads as a button
even when blocked.

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
   open"). From 050: each step uses `PhaseIcon` with name and state in its
   accessible name ("Validation, current") and a tooltip, plus a
   non-colour done / current / ahead cue (§9.5, §9.10).
4. **F08** Editable header fields show a hover and focus state (subtle fill
   and border); the title text lines up with the cards below it. **F09**
   (from 055): the title wraps to two lines (an auto-growing textarea, as
   the description already does).
5. **Overrun blocker** (from 050): in Overrun and not ready, the first open
   requirement is named beside the overrun line; `plural` for days.

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
      with an accessible name such as "Validation, current", differs from
      the others by more than colour, and the current one is in Accent.
- [ ] Given Overrun with an open requirement, then the bar names it; one day
      reads "1 day overrun".
- [ ] Given a 90-character initiative name, then the header shows it in full
      over at most two lines.
- [ ] Given a blocked gate, then Pass gate renders as an outline button with
      the open count and is announced as disabled with the reason.
- [ ] Given hover or focus on the title, owner or dates, then a fill and
      border show in both themes.

## Flags and compromises

§9.10 says phases are icon-only in the stepper; F07 recommends labels.
Open decision for the next-slice session: labels always, labels for the
current phase only, or icons kept with a visible tooltip. Record the
choice in §5.4 and §9.10. Also open (from 050): the wording of the
Overrun blocker line, drafted in place against §9.2.

## Decided in review (pre-implementation)

(none yet)
