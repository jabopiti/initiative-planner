---
slice_id: "008"
title: "Pass a gate with its checklist"
type: "capability"
status: "valid"
criteria_failures: []
depends_on: ["005", "007"]
verification_status: null
superseded_by: null
supersedes: null
change_summary: null
recommended_model: "Claude Opus 5"
model_rationale: "The most rule-dense piece of business logic in the product (§8.1): the estimate check, checklist blocking/carry-forward, freezing, and the recorded approval figure all interact. Correctness here is central to the product's purpose and hard to fully verify by casual testing."
spec_sections: ["§4 Core definitions (Gate, Checklist item, Grand estimate, Approval track)", "§5.4 Initiative detail view (Gate / Checklist panel, magic bar)", "§6 Data model (Checklist state, Gate record)", "§7.4 Approval tracks", "§8.1 Passing a gate"]
---

# Pass a gate with its checklist

## Intent

**Problem statement:** An initiative owner cannot progress a planned
initiative through its governance process when its current phase is fully
planned, because there is no way yet to work a gate's checklist, see what
blocks it, and pass it.

**Outcome statement:** This slice contributes to the tool's central
promise — governance that feels like a side detail, not a wall — by
enabling an initiative owner to complete a gate's checklist and pass it,
recording the grand estimate and approval track at that moment.

## Scope

- The Gate / Checklist panel beneath the current phase (§5.4): checklist
  items with Incomplete/Tentative/Complete status, a required note on
  Tentative.
- The magic bar's gate action: muted Pass gate while blocked, jumping to
  the first open item; prominent and one-click when ready.
- The estimate check from §8.1: the current phase and every costed phase
  still ahead must have a period and at least one allocation or cost item.
- On pass: the exited phase's period, allocations, cost items and monthly
  estimate are frozen; the grand estimate and resolved approval track
  (§7.4) are recorded on the gate record; the cost summary's "approved at"
  figure updates.
- The bar shows "Passed <gate> — Reopen" briefly afterward.
- Per §6's Gate record ("Passed gates that carried cost") and
  engine-audit.md: the grand estimate and approval track are recorded only
  when the exited phase is costed, and the escalation baseline (§7.4, used
  by slice 011) must look back to the last passed gate whose phase was
  costed — the prototype's `lastPassedGate`/`buildGateRecord` don't filter
  for this and need that fix while porting.

**Explicitly excluded:** Skipping a gate and the starting-phase mechanism
(§8.2) — passing a gate the normal way is the core governance behaviour;
skipping is a distinct, separately valuable capability for entering
historical work, built next once passing works.

## Execution path

1. User triggers: opens an initiative whose current phase is planned
   (slices 005–007) and works through its gate's checklist.
2. UI: each item's status is set; Tentative requires a note before it
   saves.
3. Engine: checks every costed phase from the current one onward has a
   period and at least one allocation or cost item (§8.1); checks no item
   is Incomplete.
4. User triggers: clicks Pass gate once nothing blocks it.
5. Engine: freezes the exited phase, computes the grand estimate and
   resolves the approval track, writes the gate record.
6. User receives: the phase moves to frozen/locked display, the cost
   summary shows the recorded "approved at" figure, and the bar confirms
   the pass with a Reopen option.

## Value

- **Desirable:** An initiative owner with a planned phase would seek this
  to move the initiative forward through its real governance process.
- **Usable:** A user can see exactly what blocks the gate, resolve it, and
  pass with one click when ready, without external explanation.
- **Valuable:** After this slice, an initiative has a recorded, frozen
  approved figure that answers "what was it approved at" — the second half
  of the tool's core purpose (the first half, cost, landed in slice 005).

## Acceptance criteria

- [ ] Given a checklist item is Incomplete, when Pass gate is attempted,
      then it is refused and the item is named as the blocker.
- [ ] Given a costed phase still ahead has no period or allocation/cost
      item, when Pass gate is attempted, then it is refused for that
      reason.
- [ ] Given every requirement is met, when Pass gate is clicked, then the
      gate passes in one click with no confirmation step.
- [ ] Given a gate has just passed, when the initiative page is viewed,
      then the exited phase shows as frozen, and the cost summary shows
      the recorded grand estimate and approval track as "approved at".
- [ ] Given a passed gate, when Reopen is used, then the gate record is
      cleared, the frozen snapshot is discarded, and checklist statuses
      and notes are kept.

## Delivery gate

- [ ] Deployed to production-equivalent environment

## Flags and compromises

None.
