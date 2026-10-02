---
slice_id: "020"
title: "Portfolio cards show owner, estimate, approval track and attention; columns show their sum"
type: "capability"
status: "valid"
criteria_failures: []
depends_on: ["011", "012"]
verification_status: null
superseded_by: null
supersedes: null
change_summary: "Found while slicing the backlog tail: the Portfolio board's cards show only name and team, plus an approval track badge hard-coded to 'No approval track' — wrong for any initiative a band covers. §5.2's owner, grand estimate, real badge and attention marker, and the column headers' sum, were never built. Split from the Portfolio filters, metrics and Copy (021) in review."
recommended_model: "Claude Sonnet 5"
model_rationale: "Presentational work on existing figures (grandEstimate, resolveApprovalTrack, Needs attention items) plus one new compact-amount formatter; every figure is directly assertable in component tests."
spec_sections: ["§5.2 Portfolio overview", "§9.11 Lists, filters, inputs and amounts (Amounts, Long text)", "§9.10 Icons", "§8.5 Needs attention", "§7.4 Approval tracks", "§9.5 Accessibility"]
---

# Portfolio cards show owner, estimate, approval track and attention; columns show their sum

## Intent

**Problem statement:** A portfolio lead scanning the board sees each card's
name and team, and a badge claiming every initiative has "No approval track"
— a hard-coded placeholder, wrong for Checkout Redesign's €412 k. Who owns
each card, what it costs, which one is in trouble and how much sits in each
phase all need a click into every initiative.

**Outcome statement:** The board answers the at-a-glance questions itself:
each card names its owner, its grand estimate, its real approval track and
its most urgent attention state, and each column says how many initiatives
and how much money sit in that phase.

## Scope

- **Card (§5.2), three lines.**
  1. Name (ellipsis + tooltip when long, §9.11) and, at the right, the
     Needs attention marker: icon-only in the item's state colour with a
     tooltip naming the kind and reason (§9.10); none without an item.
  2. Team · owner ("No owner" in secondary text when none; "(inactive)"
     suffix for a deactivated owner).
  3. Grand estimate as a **compact amount** (€412 k, €4.2 M) with the full
     amount in its tooltip (§9.11), and slice 012's `ApprovalTrackBadge`
     at the right. A status chip (014's icon + text) joins line 3 when the
     status is not Active (visible once 021's status filter widens the
     board).
- **Column header (§5.2).** Phase label, then "2 · €530 k": the count and the
  compact sum of the column's grand estimates, full sum in the tooltip.
- **Compact amounts (§9.11).** One shared `formatCompactAmount` beside
  `formatAmount`: under 1,000 in full (€850), thousands as "k" with no
  decimals (€412 k), millions as "M" with one decimal (€4.2 M).
- **The whole card** stays one link; the attention icon's tooltip is reachable
  by keyboard focus.

**Explicitly excluded:** filters, the year filter and year-scoped figures, key
metrics, Copy (021); the Getting started strip (033).

## Execution path

1. User triggers: opens the Portfolio.
2. Data: per card, the grand estimate, approval track and Needs attention
   item already computed by the data layer.
3. UI: Checkout Redesign's card reads "Checkout Redesign 🔥 / Platform · Mara
   Voss / €412 k (Elevated)"; Development's header reads "Development 2 ·
   €530 k".
4. User receives: the portfolio's shape and its trouble spots without
   opening anything.

## Value

- **Desirable:** A board is useful only if it answers "who, how much, and
  what's wrong" at a glance.
- **Usable:** Same board, same click-through; just the facts added.
- **Valuable:** Fixes a wrong badge on every card and makes the board the
  landing view it is meant to be.

## Acceptance criteria

- [ ] Given an initiative with grand estimate €412,000 and the example tracks,
      then its card shows "€412 k" (tooltip "€412,000") and the badge
      "Elevated"; given one at €0, the badge reads "Light".
- [ ] Given a total no band covers (fixture), then the badge reads "No
      approval track".
- [ ] Given an owner, then line 2 reads "<team> · <owner>"; given none, "<team>
      · No owner".
- [ ] Given an Overrun item, then the card shows the overrun icon in the Alarm
      colour with the tooltip naming "Overrun" and its reason; given no item,
      no marker.
- [ ] Given Development holds €412,000 and €118,000, then its header reads
      "Development 2 · €530 k" with the full sum in the tooltip; an empty
      column reads "0 · €0".
- [ ] Given €850, €41,200 and €4,210,000, then the compact formatter gives
      "€850", "€41 k" and "€4.2 M".
- [ ] Given a long name, then it is cut with an ellipsis and the full name is
      in a tooltip.
- [ ] Given a screen reader, then each card's attention marker has an
      accessible name naming the kind.

## Flags and compromises

The compact-amount thresholds (k from 1,000, M with one decimal from
1,000,000) are an assumption from §9.11's two examples; change them in the
formatter alone if the brand needs otherwise.

## Decided in review (pre-implementation)

- **Card layout:** three lines — name + attention icon; team · owner; compact
  estimate + approval track badge (+ status chip when not Active).
- **Split:** cards and column sums here; filters, year filter, metrics and
  Copy in 021.
- **Status chip:** not built here. 014's icon does not exist and the board shows
  only Active initiatives until 021's status filter; 021 adds the chip with it.
  The "status chip" line in Scope's card line 3 moves to 021.
- **Compact amounts:** rounded from the exact value; 999,500 and above reads
  "€1.0 M" (never "€1000 k"); millions always show one decimal.
- **Attention marker:** the `AttentionMarker` from `InitiativesTable`, moved to
  a shared file and reused, with the truncated name shrinking beside it.
