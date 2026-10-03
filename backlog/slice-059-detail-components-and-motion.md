---
slice_id: "059"
title: "Detail components: key figures with bullet bar, labelled checklist, motion"
type: "feature"
status: "valid"
criteria_failures: []
depends_on: ["056", "057"]
verification_status: null
superseded_by: null
supersedes: null
change_summary: "Split from 057 while settling the modernization decisions with the user (2 Oct 2026, from rendered mockups): the initiative header gets four key figures, the checklist a labelled segmented control with the status icon at the left, the phase period one Airbnb-style range picker that saves on Done, and four extra motions. §5.4 and §9.11 updated. Later the same day the user chose the bullet bar against the approval bands (research pattern 8) for the Grand estimate tile and the board cards; §5.2 and §5.4 updated. Backlog reshuffle (3 Oct 2026): the period range picker split out as 059b (self-contained; 061b reuses its month cells); 057's motion item (accordion, toasts) joined the motion list here, so all motion is built in one place."
recommended_model: "Claude Opus 5.5"
model_rationale: "The header and checklist touch hot files, the bullet bar reads the brand pack's approval bands, and the figure roll and gate-pass motion must stay off under reduced motion."
spec_sections: ["§5.2 Portfolio overview (landing page)", "§5.4 Initiative detail view", "§7.4 Approval tracks", "§8.1 Passing a gate", "§9.5 Accessibility", "§9.8 Visual design", "§9.11 Lists, filters, inputs and amounts"]
---

# Detail components: key figures with bullet bar, labelled checklist, motion

## Intent

**Problem statement:** On the detail page the money and progress figures
sit in a small box below the title, checklist statuses are icons whose
meaning lives in tooltips, and nothing on the page moves to confirm a
change.

**Outcome statement:** The header shows where the initiative stands at a
glance, checklist states read in words, and changes are confirmed by
small, purposeful motion.

## Scope

1. **Key figures (§5.4 Cost summary).** Under the header, a row of four
   tiles: Grand estimate (approved-at figure and difference beneath it,
   once a costed gate has passed), Deviation (signed; overspend in
   Warning), Current phase with its period, and the current gate's "X of Y
   complete". Copy stays with the figures. Replaces the cost summary box.
   The Grand estimate tile carries a **bullet bar** (§5.4): the estimate
   as a bar over the approval tracks' bands from the brand pack (§7.4),
   the approved-at figure as a tick, recorded actuals to date as a thinner
   inner bar; a gap between bands stays unshaded. The same `BulletBar`, in
   miniature, goes on each board card (§5.2). The figure stays as text
   beside it (§9.5).
2. **Checklist control (§5.4).** Each item: status icon at the left, the
   name, and a labelled segmented control "Incomplete · Tentative ·
   Complete" (shadcn ToggleGroup), the selected segment in its colour role
   (neutral, Warning, Met). Tentative still opens the note field.
3. **Motion** (all off under `prefers-reduced-motion: reduce`, §9.5):
   - board cards lift 1 px with a stronger shadow on hover (120 ms);
   - the four key figures roll to their new value (≤ 300 ms);
   - routes cross-fade when switching sections (150 ms);
   - gate pass: the stepper step fills and a check draws in (~400 ms);
   - the phase accordion and toasts transition in 120–180 ms, and a figure
     that recalculates gets a brief tint (moved here from 057).

## Execution path

1. Open Onboarding Flow v2 → four tiles: €59,008 · €0 · Validation 1 Sep –
   30 Nov 2026 · 1 of 4.
2. Gate panel → Cost estimate reviewed → Tentative → note field opens.
3. Change an allocation → Grand estimate rolls to the new value.

## Value

- **Desirable:** The user's ask for a more modern, intuitive app.
- **Usable:** Status in words; where the initiative stands, readable at a
  glance.
- **Valuable:** The core page gets clearer without new pages or modals.

## Acceptance criteria

- [ ] Given any initiative, then the header shows the four key figures; the
      approved-at line appears only after a costed gate has passed.
- [ ] Given Checkout Redesign (€394,800, Elevated, approved at G2), then
      the Grand estimate tile's bullet bar shows three shaded bands, the
      bar ending in Elevated and the approved-at tick; a brand pack with a
      gap between two bands leaves the gap unshaded.
- [ ] Given a board card, then it shows the miniature bullet bar and its
      estimate as text.
- [ ] Given a checklist item, then its status icon is at the left and the
      segmented control reads Incomplete, Tentative, Complete; the selected
      segment has the role colour and an accessible pressed state.
- [ ] Given reduced motion, then none of the motions runs (including the
      accordion, toast and tint transitions).
- [ ] Given the e2e axe scan in both themes, then the detail page passes.

## Flags and compromises

The period range picker is 059b; the two can run in either order.

## Decided in review (pre-implementation)

Settled with the user on 2 Oct 2026 from rendered mockups (header
hierarchy B, checklist B with icon, all four extra motions; the range
picker decisions moved with it to 059b). Copy uses the spec's "Incomplete",
not the mockup's "Open".
