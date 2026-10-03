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
change_summary: "From the October 2026 UX review (docs/ux-review-2026-10.md), roadmap group 'Detail page': F05, F06, F07, F08. F15 (actuals) moved to 061 (now 061b), which rebuilds the actuals table. F07's labelled stepper conflicts with §9.10 (phases icon-only in the stepper) and must be settled with the user and recorded in the spec. Backlog reshuffle (3 Oct 2026): took over from 050 the phase overview's accessible names and non-colour cue and the Overrun blocker line (same stepper and Pass gate), and from 055 F09 (long names wrap; same header fields as F08); now after 050 so the magic bar is rebuilt once. Settled before implementation (3 Oct 2026): the stepper labels the current and next phase, the others icon-only with a tooltip (done ones a tick and their icon, both in Met); a non-costed current phase also opens the next costed phase; the estimates requirement reads as a statement with Go to <phase>; the overdue chip names the month; the Overrun line names the first blocker on the same line. Recorded in §5.4, §9.8 and §9.10."
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
3. **F07** The stepper shows its phases with icons, the current and next
   phase also labelled (decided below), current phase in Accent. A blocked
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

1. Open Onboarding Flow v2 → Validation is expanded, its gate panel
   right below it.
2. The panel lists 4 rows for "1 of 4" (after marking one item Complete).
3. The magic bar reads ✓ Discovery icon · Validation · Development ·
   Rollout icon, and "Pass gate · 3 open".
4. Open Fraud Detection Upgrade (Discovery) → the G1 panel sits under the
   Discovery row and Validation is open below it.

## Value

- **Desirable:** People land on what they need to do.
- **Usable:** Counts that match what's shown; buttons that look like buttons.
- **Valuable:** Fixes four of the review's ten P1 findings on the main
  working page.

## Acceptance criteria

- [ ] Given any initiative, then the current phase is expanded on open and
      its gate panel is the next section.
- [ ] Given an older phase with overdue actuals, then it is collapsed with
      a Warning chip: "No actual for Aug 2026", or "3 actuals overdue".
- [ ] Given a gate with N requirements, then the panel lists N rows and the
      count reads "x of N".
- [ ] Given the magic bar, then the current and next phase show icon and
      name, the others their icon with a tooltip; each step has an
      accessible name such as "Validation, current" or "Discovery, done",
      a done phase shows a tick beside its icon (both Met), a skipped one
      the skip icon, and the current one is an Accent pill.
- [ ] Given a current phase without cost (Discovery), then its gate panel
      follows its row and the next costed phase opens.
- [ ] Given a gate requiring estimates, then its first panel row reads
      "<phases> have a period and at least one allocation or cost item"
      with Open or Met, and Go to <phase> opens and focuses the first
      phase missing one.
- [ ] Given Overrun with an open requirement, then the bar reads
      "Validation is 12 days overrun · "Business case approved" is not
      resolved (+2 more)" on one line; one day reads "1 day overrun", also
      in the Needs attention strip.
- [ ] Given a 90-character initiative name, then the header shows it in full
      over at most two lines.
- [ ] Given a blocked gate, then Pass gate renders as an outline button with
      the open count and is announced as disabled with the reason.
- [ ] Given hover or focus on the title, description, team or owner, then
      a fill and border show in both themes.

## Flags and compromises

§9.10 said phases are icon-only in the stepper; settled below (current
and next labelled) and recorded in §5.4 and §9.10.

## Decided in review (pre-implementation)

Settled with the user on 3 Oct 2026, from mockups:

- **Stepper (§5.4, §9.10):** every phase shows its brand-pack icon; the
  current phase and the next one also show their name, the current one as
  an Accent pill, the next muted. A done phase shows a tick beside its own
  icon, both in Met (§9.8 adds this use); a phase behind a skipped gate
  shows the skip icon beside its icon, neutral. Phases further ahead are
  muted, icon only. Every step has a tooltip and an accessible name with
  its state ("Discovery, done", "Discovery, skipped", "Validation,
  current", "Development, next", "Rollout, ahead").
- **Opening state:** the current phase opens expanded with the gate panel
  directly after its row, inside the phase list. When the current phase is
  not costed (Discovery, Rollout), the next costed phase ahead opens too,
  so a new initiative still lands on its period and people. Every other
  phase opens collapsed; a Needs attention deep link still opens its phase.
- **Estimates row (F06):** one row, first in the panel, as a statement
  naming the phases it checks: "Validation and Development have a period
  and at least one allocation or cost item" (one phase: "Development has
  …"). Circle icon and "Open" while open with **Go to <first missing
  phase>**; CircleCheck in Met and "Met" once met. Go to opens that phase
  and moves focus to its header; the magic bar's jump to it does the same.
  The magic bar's blocker text keeps the "needs" form, with the grammar
  fixed ("Validation and Development need …").
- **Overdue chip (F05):** on any costed phase row with an overdue actual
  (§8.5), expanded or not, Warning colour, CalendarClock icon: "No actual
  for Aug 2026" for one month, "3 actuals overdue" for more.
- **Overrun line:** one line in Alarm: "Validation is 12 days overrun ·
  "Business case approved" is not resolved (+2 more)", the blocker part the
  jump link; Extend stays beneath. "1 day overrun" via `plural`, in
  `overrunMessage`, so the Needs attention strip reads the same.

Assumptions stated in review, not objected to:

- Blocked Pass gate: outline button, `aria-disabled` with the reason as
  its description; it stays clickable and jumps to the first open
  requirement (§5.4). "N open" counts blockers only (missing estimates,
  Incomplete items), never Tentative.
- A gate with no requirements at all shows no panel (none in the default
  brand pack).
- Title: an auto-growing textarea, one line up to two, measured in script
  (Firefox has no `field-sizing`); Enter commits and a pasted line break
  becomes a space, as the description does. Header fields (name,
  description, team, owner) show the subtle fill and the input border on
  hover and focus, the same in both themes; no pencil icon. The title text
  lines up with the cards below it.
- Aligning the magic bar to the page grid (the rest of F07) is 058's page
  shell, not this slice.
