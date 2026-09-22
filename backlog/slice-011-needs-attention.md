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
change_summary: null
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

**Explicitly excluded:** On Hold initiative handling beyond simple
exclusion — On Hold initiatives are correctly left out of the strip per
§8.5, but the fuller On Hold lifecycle (Resume, the magic bar's "On hold"
state) is scoped to a later lifecycle slice, not required for this
slice's core aggregation behaviour.

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
- [ ] Demonstrated to at least one external stakeholder (user, customer,
      or business owner)

## Flags and compromises

None.
