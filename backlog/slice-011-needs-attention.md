---
slice_id: "011"
title: "See Needs attention on the Portfolio"
type: "capability"
status: "valid"
criteria_failures: []
depends_on: ["008", "010"]
verification_status: null
superseded_by: null
supersedes: null
change_summary: "Decided in review: one item per Active initiative (the priority cascade stops at the first match); Overdue scans every costed phase, not just the current one; deep links use a `?focus=` suffix on the initiative hash route, consumed once on mount via a shared scroll/focus helper extracted from MagicBar's jump-to-blocker; strip renders as compact one-line rows, not chip cards; new icons are TrendingUp/CalendarClock/ClipboardList/Rocket for Escalated/Overdue/Due/Ready; the five reason strings reuse existing app phrasing where one exists; the nav count is a neutral pill matching the approval-track badge style."
recommended_model: "Claude Sonnet 5"
model_rationale: "Cross-cutting aggregation across five prioritized categories (§8.5) reusing logic already built in slices 008 and 010; moderate complexity from the priority ordering, not from any new calculation. Escalate to Opus 5 only if the five-way prioritization proves fiddly."
spec_sections: ["§5.2 Portfolio overview (Needs attention strip)", "§5.1 Navigation (Initiatives nav count)", "§7.4 Approval tracks (Escalation)", "§8.5 Needs attention"]
---

# See Needs attention on the Portfolio

## Intent

**Problem statement:** An initiative owner cannot tell, across several
active initiatives, which ones need action right now, because gates
(slice 008) and actuals (slice 010) each carry their own state with no
single place surfacing what's outstanding.

**Outcome statement:** This slice contributes to gate progression feeling
like a non-event by enabling an initiative owner to see a prioritized
Needs attention strip on the Portfolio, covering escalation, overrun,
overdue actuals, due requirements, and readiness.

## Scope

- The Needs attention strip (§5.2): top three items by priority, "Show n
  more" to expand, each with a clickable name that opens the initiative at
  the relevant place.
- The five kinds in priority order (§8.5): Escalated, Overrun, Overdue,
  Due, Ready — computed only for Active initiatives.
- The matching count on the Initiatives nav item (§5.1): the number of
  initiatives with at least one item.
- Escalated relies on slice 008's gate records correctly recording an
  approval track only for gates that carried cost (§7.4, §6, engine-audit.md)
  — if that fix landed with slice 008, this slice just consumes it; if not,
  it's a blocker here, not something to re-derive.

**Explicitly excluded:** On Hold initiative handling beyond simple
exclusion — On Hold initiatives are correctly left out of the strip per
§8.5, but the fuller On Hold lifecycle (Resume, the magic bar's "On hold"
state) is scoped to a later lifecycle slice, not required for this
slice's core aggregation behaviour.

**Decided in review (pre-implementation):**
- One item per Active initiative: §8.5's "checks escalation, phase
  overrun, overdue actuals, due requirements, and readiness, in that
  priority order" is read as a cascade — the first kind that applies is
  the initiative's item, not a set of independent checks. This makes
  "initiatives with at least one item" (§5.1 nav count) well-defined
  without inventing a tie-break rule.
- Overdue scans every costed phase, not just the current one, since a
  past phase's own actual can go overdue after that phase's gate has
  already passed; Escalated/Overrun/Due/Ready stay about the current
  gate only.
- Deep link: clicking a strip item's name navigates to
  `#/initiatives/<id>?focus=<anchorId>`. `App.tsx` splits `focus` off the
  hash path; `InitiativeDetail` reads it once on mount, expanding the
  phase holding the target if it starts collapsed (only matters for
  Overdue's actual row), then scrolls and focuses it via a helper
  extracted from MagicBar.tsx's existing jump-to-blocker (today local to
  that file) — reusing the one scroll/focus pattern already in the app
  (§9.5: magic bar actions "that point to a section move focus to it")
  rather than adding a second one. Anchor targets: the cost summary
  section (Escalated), the existing `phase-row-{phaseId}` id (Overrun), a
  new per-month id on the actuals row (Overdue), the gate checklist panel
  (Due, already unconditionally mounted for the current phase), and the
  magic bar's Pass gate button (Ready).
- Strip layout: compact one-line rows in a bordered "Needs attention"
  panel — icon, kind pill, initiative name (link), short reason — with
  "Show n more" as a footer row. Chip cards (one small card per item)
  were considered and rejected: each needed 3-4 lines and wrapped the
  reason text more than a row does.
- Icons (§9.10): Escalated = TrendingUp, Overdue = CalendarClock, Due =
  ClipboardList, Ready = Rocket — chosen to stay visually distinct from
  Overrun's existing Flame and Complete's existing CircleCheck (a
  CircleCheckBig alternative for Ready was rejected as reading as a
  near-duplicate of Complete's icon).
- Copy, one short reason per kind, reusing existing app phrasing where it
  already exists rather than inventing new wording:
  - Overrun: "{phase label} is {N} days overrun" — verbatim from
    MagicBar.tsx's existing overdue guidance.
  - Escalated: "Needs {live track} approval (was {recorded track})" — new
    text; no existing precedent to reuse.
  - Overdue: "{phase label}: no actual recorded for {month}" — mirrors
    §8.5's own wording ("no actual recorded against it").
  - Due: "{complete} of {total} complete" — verbatim; §8.1 says to use
    this phrase "everywhere it appears".
  - Ready: "All requirements met" — verbatim from MagicBar.tsx's existing
    ready guidance.
- Nav count (§5.1): a small neutral pill (bg-surface-subtle), matching
  the style already used for the Portfolio card's approval-track badge,
  next to the "Initiatives" label — not warning-tinted, since the count
  mixes all severities including the calm Ready state (§9.8: Met, not
  Warning).

## Execution path

1. User triggers: opens the Portfolio.
2. Engine: for each Active initiative, checks escalation (§7.4), phase
   overrun (§8.1), overdue actuals (§7.3), due requirements (§8.1), and
   readiness, in that priority order.
3. UI: renders the top three items, with "Show n more" for the rest; the
   Initiatives nav item shows the count of initiatives with an item.
4. User triggers: clicks an item's initiative name.
5. User receives: the initiative's page, scrolled and focused to the
   relevant place (cost summary, current phase, the missing month, the
   gate panel, or the magic bar).

## Value

- **Desirable:** An initiative owner managing several initiatives would
  seek this to know where to focus without opening each one.
- **Usable:** A user can read the strip's short reasons and click straight
  to the point of action, without guidance.
- **Valuable:** After this slice, nothing needing action goes unnoticed
  purely because nobody happened to open that initiative — closing the
  loop the tool exists to close.

## Acceptance criteria

- [ ] Given an Active initiative whose current phase is past its end date
      with its gate not passed, when the Portfolio loads, then it appears
      as Overrun, ranked above any Due or Ready items.
- [ ] Given an Active initiative whose live approval track is stricter
      than the one recorded at its last passed gate, when the Portfolio
      loads, then it appears as Escalated, ranked above Overrun.
- [ ] Given more than three initiatives have an item, when the strip
      loads, then only the top three show, with "Show n more" revealing
      the rest.
- [ ] Given a strip item is clicked, when the initiative page opens, then
      it is scrolled and focused to the place matching that item's kind.
- [ ] Given an On Hold initiative would otherwise qualify for an item,
      when the Portfolio loads, then it does not appear in the strip.

## Delivery gate

- [ ] Deployed to production-equivalent environment

## Flags and compromises

None.
