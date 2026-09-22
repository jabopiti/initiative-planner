---
slice_id: "001"
title: "Audit prototype engine code for reuse"
type: "spike"
status: "valid"
criteria_failures: []
depends_on: []
verification_status: null
superseded_by: null
supersedes: null
change_summary: null
recommended_model: "Claude Sonnet 5"
model_rationale: "Reading and judging existing code against a detailed written spec is a bounded reasoning task with a clear rubric (§7); escalate to Claude Opus 5 only if the prototype is large or its logic diverges substantially from the spec's formulas."
spec_sections: ["§7.1 Time granularity and cost of an allocation", "§7.2 Capacity, rates, and the three percentages", "§7.3 Actuals", "§7.4 Approval tracks", "§6 Data model (Phase data, Cost item, Country, Role)"]
---

# Audit prototype engine code for reuse

## Intent

**Problem statement:** The delivery team cannot safely start building the
calculation engine (§7) when a prototype of some engine functions already
exists, because it is unknown which parts are correct against the
finalized spec, which are reusable as-is, and which conflict with it.

**Outcome statement:** This slice contributes to a fast, low-risk build by
producing a written reuse decision for every existing engine function, so
slices 005 onward know exactly what to keep, adapt, or discard before any
new engine code is written.

## Scope

- Locate and read every function in the prototype touching cost, capacity,
  working days, rates, or approval-track calculation.
- For each function: compare its behaviour against the exact rule in §7.1
  (cost formula), §7.2 (capacity ceilings), §7.3 (actual-defaults-to-
  estimate) or §7.4 (approval-track resolution).
- Classify each as **Reuse as-is**, **Reuse with changes** (name the
  change), or **Rewrite** (name why), with a one-line reason each.
- Note any data-shape mismatch against §6 (e.g. a different field name or
  type than the spec's Field encodings).

**Explicitly excluded:** UI code in the prototype, if any — this slice
audits only the calculation engine, because that is the only part later
slices depend on for correctness; UI is rebuilt fresh regardless (§10.1).

**Note on stack mismatch:** the prototype is written in vanilla JavaScript;
the target build is React with TypeScript (§10.1). "Reuse" here therefore
means porting verified formulas and logic into the new codebase, not
importing files as-is.

## Execution path

1. Delivery team triggers: opens the prototype repository alongside the
   spec.
2. Engine functions are read and mapped one by one against §7's exact
   rules.
3. Each function receives a classification and reason, written to a
   decision file.
4. Delivery team receives: a checked-in `engine-audit.md` listing every
   function, its classification, and what (if anything) must change
   before slice 005 depends on it.

## Value

- **Desirable:** The delivery team would seek this before writing any
  engine code, to avoid silently duplicating or contradicting working
  logic.
- **Usable:** The delivery team can read `engine-audit.md` and know, for
  every engine function, exactly what to do with it — without re-reading
  the prototype themselves.
- **Valuable:** After this slice, slice 005 (phase cost calculation) can
  start from a known reuse baseline instead of an unaudited prototype,
  removing the risk of building on top of silently incorrect logic.

## Acceptance criteria

- [ ] Given the prototype repository, when the audit is run, then every
      function touching cost, capacity, working days, rates or approval
      tracks appears in `engine-audit.md` with a classification.
- [ ] Given a function classified "Reuse with changes" or "Rewrite", when
      its entry is read, then it names the specific spec section it
      disagrees with and what the fix is.
- [ ] Given `engine-audit.md`, when a non-author reads it, then they can
      state which functions slice 005 may import unchanged, without
      asking the auditor.

## Delivery gate

- [ ] Deployed to production-equivalent environment
- [ ] Demonstrated to at least one external stakeholder (user, customer,
      or business owner)

## Flags and compromises

None. This slice is an enabling investigation rather than a strict
capability slice — see the overview's Limitations section for why it is
included in this form.
