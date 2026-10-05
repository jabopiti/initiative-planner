---
slice_id: "062"
title: "Team capacity: split bar in the person panel, heatmap with fixes on the team page"
type: "feature"
status: "valid"
criteria_failures: []
depends_on: ["048", "057"]
verification_status: null
superseded_by: null
supersedes: null
change_summary: "Chosen by the user on 2 Oct 2026 from the 'Fewer steps, same plan' proposals 5 and 6. A person's Team FTE %s become one split bar in the person panel; the team capacity grid becomes a heatmap whose cell detail carries the §5.11 fixes. Both after 048 (membership restore/Undo) and 057 (tokens and team colours), so neither is restyled again. §5.6, §5.8 and §9.5 updated. Settled in review on 5 Oct 2026: legend chips with a popover for the exact value, segments stop at 5%, accent-wash heatmap fill, the members table keeps its Team FTE % column."
recommended_model: "Claude Opus 5.5"
model_rationale: "A two-handle slider with full keyboard and screen-reader support, edits that change two memberships in one commit, and a grid redraw that must keep copy and warnings intact."
spec_sections: ["§5.6 Person detail view", "§5.8 Team detail view", "§5.11 Suggestions and shortcuts", "§7.2 Capacity, rates, and the three percentages", "§9.2 Copy", "§9.5 Accessibility", "§10.3 Writing"]
---

# Team capacity: split bar in the person panel, heatmap with fixes on the team page

## Intent

**Problem statement:** Moving time from one team to another means two
number edits that briefly conflict, and the capacity grid is thirty
same-weight percentages where the one problem month has to be read out,
then fixed on another page.

**Outcome statement:** A person's split across teams is one bar with
draggable dividers, and the team grid shows hot months at a glance and
fixes them where they are seen.

## Scope

1. **Split bar** (§5.6): the person's Capacity % as one bar, a segment per
   team in its 057 team colour, unclaimed hatched. The divider between two
   teams moves Team FTE % between them in one edit (one commit naming both
   memberships, §10.3); the last divider claims or releases unclaimed
   capacity up to the cap. A segment's label opens its exact value (same
   cap rule) and **Remove from team** (048's Undo). Over-claimed people
   (Team FTE %s above Capacity %) get one field per team instead. Keyboard
   per §9.5.
2. **Heatmap** (§5.8): each cell a number over a fill (share of the Team
   FTE %), solid at it, Warning colour with its icon over either ceiling;
   Provisional stays a lighter figure. Selecting a cell or row opens its
   detail under the grid with the contributing initiatives and the §5.11
   fixes (raise once, reduce per allocation). Copy (§9.2) still copies the
   numbers.

## Execution path

1. People → Lucía Ramos (Platform 60%, Growth 40%) → drag the divider to
   70/30 → one commit "Lucía Ramos: Team FTE % on Platform set to 70%,
   Team FTE % on Growth set to 30%".
2. Teams → Platform → Felix's Dec cell is orange with ▲ 120% → click →
   Checkout Redesign 80%, Fraud Detection Upgrade 40% → **Set to 20%** on
   Fraud → the cell drops to 100%.

## Value

- **Desirable:** Capacity reads like a picture, not a spreadsheet.
- **Usable:** One drag instead of two conflicting edits; fixes where the
  problem is seen.
- **Valuable:** Capacity problems get found and fixed in one place.

## Acceptance criteria

- [ ] Given Lucía at 60/40, then the bar shows two segments in team
      colours and no hatched rest; at 60/20 a 20% hatched rest.
- [ ] Given a divider drag from 60 to 70, then one write changes both
      memberships and the commit names both.
- [ ] Given the last divider, then it cannot pass the Capacity %.
- [ ] Given arrow keys on a focused divider, then it steps 5% and announces
      both teams' values ("Platform 70%, Growth 30%"; the last divider
      "Growth 30%, 10% unclaimed").
- [ ] Given a drag or keys towards a neighbour, then no segment goes below
      5%.
- [ ] Given a segment's legend chip, then its popover shows the exact Team
      FTE % field (cap rule) and **Remove from team**.
- [ ] Given Team FTE %s summing above Capacity %, then per-team fields show
      instead of the bar.
- [ ] Given **Remove from team** on a segment, then "Removed. Undo"
      appears and Undo restores the membership (048).
- [ ] Given an over cell, then it has the full Warning wash, its icon and
      its number; a cell at its Team FTE % is filled to the top, and one at
      half of it halfway; colour is never the only cue.
- [ ] Given the accent and Warning washes, then text on them meets 4.5:1 in
      both themes.
- [ ] Given a selected over cell, then its detail lists the contributing
      initiatives with the §5.11 fix buttons, and a fix updates the cell.
- [ ] Given Copy on the grid, then the copied table holds the numbers as
      today.
- [ ] Given the e2e axe scan, then the person panel and team page pass in
      both themes.

## Flags and compromises

The split bar serves people on two or more teams; one-team people see one
segment and the unclaimed rest. A heatmap cell needs contrast-checked fill
tokens in both themes (057/047's contrast check).

## Decided in review (pre-implementation)

User picked proposals 5 and 6 on 2 Oct 2026 from rendered mockups.
Settled in the next-slice review on 5 Oct 2026, from rendered mockups:

- **Segment labels:** a legend of chips under the bar, one per team
  ("Platform 60%", swatch first). A chip opens a popover with the team
  name, a Team FTE % field (same cap rule as today) and **Remove from
  team** (048's "Removed. Undo"). There are no labels inside the segments,
  and the per-team rows go, except as the over-claimed fallback.
- **Smallest segment:** dragging and arrow keys stop a team's segment at
  5%, so two dividers never overlap. Removing is always the explicit
  **Remove from team**. The popover field can still be set to 0%.
- **Divider copy (§9.5):** accessible name "Divider between Platform and
  Growth" or "Divider after Growth". Value text "Platform 70%, Growth
  30%" or "Growth 30%, 10% unclaimed". Digits typed on a divider set the
  team to its left. Home and End go to that divider's limits: 5% for the
  team to its left, and the most it can take (the team to its right at
  5%, or the cap).
- **Saving:** as the allocation load bar does. A drag saves on release;
  keys and digits save on Enter or blur; Esc reverts; other users'
  changes wait while a value is unsaved. A move between two teams is one
  edit through one Repository write, with today's note for each
  membership under one name: "Lucía Ramos: Team FTE % on Platform set to
  70%, Team FTE % on Growth set to 30%". So a move and a typed value on
  the same team before the save net into one note (§10.3), and each value
  is capped at the person's unclaimed capacity as a typed one is. The
  last divider is one membership, with today's note.
- **Heatmap fill:** an accent wash (accent mixed into the card colour)
  rises from the cell's bottom to the Allocation % as a share of the Team
  FTE %, full at or above it. An over cell gets a full-height Warning wash
  plus its icon (ChartPie for over Team FTE %, Gauge for over Capacity
  %). The number stays in primary text. A test checks that both washes
  keep text at 4.5:1 in both themes. A "No longer a member" row has no
  fill. The Provisional figure, the legend and Copy are unchanged.
- **Members table (team detail):** it keeps its Team FTE % column, with no
  split bar.
- Assumptions taken: the split bar is the shadcn/Radix Slider with one
  thumb per divider (no new dependency). The full bar width is the
  person's Capacity %. With no teams, the bar is fully hatched and has no
  divider. An inactive person's bar is disabled. Team FTE %s above
  Capacity % (also after Capacity % is lowered) show today's per-team
  rows. The "n% of m% claimed" caption, "No capacity left…" and "Add to
  team (n% free)" stay as they are. The grid's existing detail and §5.11
  fixes are kept as they are.
