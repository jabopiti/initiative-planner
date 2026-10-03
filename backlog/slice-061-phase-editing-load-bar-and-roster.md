---
slice_id: "061"
title: "Phase editing: allocation load bar and team roster"
type: "feature"
status: "valid"
criteria_failures: []
depends_on: ["056", "057"]
verification_status: null
superseded_by: null
supersedes: null
change_summary: "Chosen by the user on 2 Oct 2026 from the 'Fewer steps, same plan' proposals 1 to 4. The current phase's three tables are rebuilt once, together: allocations (load bar, roster chips), cost items (month strip) and actuals (Record / Different amount, future months folded). Takes over the review's F02 (from 055) and F15 (from 056) so those tables aren't changed twice. The bulk 'Record all as estimated' button was withdrawn (non-goal: bulk actual-cost entry). §5.4, §5.11 and §9.5 updated. Backlog reshuffle (3 Oct 2026): split as the flag below proposed; the cost item month strip and actuals (with F15) are 061b, so this slice no longer waits on 059 or 060."
recommended_model: "Claude Opus 5.5"
model_rationale: "A new accessible slider with segments in the hottest component, with load calculations shared with the capacity grid."
spec_sections: ["§5.4 Initiative detail view", "§5.11 Suggestions and shortcuts", "§7.2 Capacity, rates, and the three percentages", "§9.5 Accessibility"]
---

# Phase editing: allocation load bar and team roster

## Intent

**Problem statement:** In the current phase, an Allocation % is typed
blind and over-capacity shows only afterwards, an inline error pushes the
table out of shape, and people are added one per dropdown trip.

**Outcome statement:** The allocation table shows the data the decision
needs and takes one direct action: drag or pick an allocation against the
person's real load, and click a teammate to staff them.

## Scope

1. **Allocation load bar** (§5.4): replaces the % box. Segments for this
   allocation, the person's other counted allocations (§7.2) and overflow
   past a ceiling, with a line at each ceiling; the load is the highest
   month of the phase, the months the warnings check. Drag, arrow keys
   (±5%, Home, End), type once focused, or stops 25/50/75/100% and **Fill
   free <n>%**. Saves once on release or Enter. Uses the person-load
   calculation the capacity grid uses (`personLoad.ts`); no second copy.
2. **F02** (from 055): fixed column widths; a row's warnings and fix
   buttons in a full-width row under it.
3. **Team roster** (§5.4, §5.11): unallocated active members as chips with
   free capacity, most free first, "0% free" shown; a chip adds the person
   at their free capacity; **Copy from <previous costed phase>** in the
   same row; over 12 members → the searchable **Add person** picker.
   Removal keeps "Removed. Undo".

## Execution path

1. Checkout Redesign → Development → Jonas's load bar shows 50% here and
   60% elsewhere with overflow → **Fill free 40%** → one commit, warning
   gone.
2. Onboarding Flow v2 → Validation → chip "Sofia Molina · 50% free" →
   added at 50%.

## Value

- **Desirable:** The phase reads like a plan, not a form.
- **Usable:** Capacity is visible before a number is set; one click to
  staff a teammate.
- **Valuable:** Fewer capacity warnings created, faster staffing, and the
  allocation table changed once.

## Acceptance criteria

- [ ] Given Jonas at 50% here and 60% elsewhere (cap 100%), then the bar
      shows the three segments, the ceiling line and a hatched 10%, and its
      accessible value reads "50%, total load 110% of 100%".
- [ ] Given arrow-right on a focused bar, then the value steps by 5%; Home
      gives 0%, End 100%; typing "40" sets 40%.
- [ ] Given a drag from 50% to 70%, then exactly one write and one commit
      record 70% on release.
- [ ] Given **Fill free**, then the value equals §5.11's free capacity and
      no warning remains.
- [ ] Given a row with a warning, then it renders in its own full-width
      row and no column width changes.
- [ ] Given two unallocated members (50% and 0% free), then both chips
      show, 50% first; clicking it adds an allocation of 50%.
- [ ] Given 13 unallocated members, then the searchable picker shows
      instead of chips.
- [ ] Given the e2e axe scan, then the detail page passes in both themes.

## Flags and compromises

Cost items and actuals are 061b; the two can run in either order. The
load bar's
"highest month" choice follows the warning rule; showing the average was
considered and dropped.

## Decided in review (pre-implementation)

User picked proposals 1–4 on 2 Oct 2026 (3 and 4 now in 061b) from rendered mockups ("Fewer
steps, same plan"). Open for the next-slice session: bar colours for
"other allocations" against 057's tokens, and the chip copy when a person
is on another team's phase only.
