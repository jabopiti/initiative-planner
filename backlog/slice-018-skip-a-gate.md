---
slice_id: "018"
title: "Skip a skippable gate with a reason"
type: "capability"
status: "valid"
criteria_failures: []
depends_on: ["008", "014"]
verification_status: null
superseded_by: null
supersedes: null
change_summary: "Promoted from the backlog tail (Skip a gate with a reason, §8.2). The data shape (`outcome: 'skipped'`, `skipReason`) and the rules that a skipped gate freezes nothing and sets no escalation baseline already exist since 008; nothing lets a user skip."
recommended_model: "Claude Sonnet 5"
model_rationale: "The data-layer rules exist and are tested; this adds one magic bar state and the skipped-phase display. The care is in the bar's state interplay (skipping while overrun, on hold, just passed), all testable with Testing Library."
spec_sections: ["§8.2 Skipping a gate", "§8.1 Passing a gate", "§8.3 Reopening", "§5.4 Initiative detail view (magic bar, Page sections: Phases)", "§7.4 Approval tracks", "§9.5 Accessibility", "§9.9 Interface states", "§9.10 Icons", "§10.3 Writing"]
---

# Skip a skippable gate with a reason

## Intent

**Problem statement:** Onboarding Flow v2's team already validated the problem
in a pilot, so G1's checklist is irrelevant — but the only way past G1 is to
tick every item Complete, which records assessments nobody made. The brand
pack marks G1 and G2 skippable precisely for this, and nothing uses it.

**Outcome statement:** A skippable gate can be passed over with a recorded
reason, bypassing its checks, recording no figure and freezing nothing (§8.2)
— so the record says honestly that the gate was skipped and why, instead of
pretending it was assessed.

## Scope

- **Skip action (§5.4).** A text action **Skip G1** beside Pass gate, shown
  only when the current gate is skippable (brand pack) and the initiative is
  Active. Muted and inert while On Hold (014), like Pass gate. Absent on a
  non-skippable gate.
- **Skipping state (§5.4, §9.9).** Choosing Skip G1 replaces the guidance line
  with a reason field, label "Reason for skipping G1", focused; beside it
  **Skip G1** (disabled until a non-blank reason is typed) and **Cancel**.
  Enter confirms once a reason exists; Esc or Cancel returns to the previous
  state with nothing saved.
- **Effect (§8.2, §7.4).** A gate record with `outcome: "skipped"` and the
  trimmed reason; both checks bypassed; no figure, no frozen snapshot, no
  approval track recorded; the exited phase stays editable; the escalation
  baseline is untouched. Commit: "Onboarding Flow v2: G1 skipped". The bar
  then shows "Skipped G1" with **Reopen** for the same few seconds a pass
  shows (008's timer), and Reopen reverses it (§8.3).
- **Final gate.** Skipping a skippable final gate closes the initiative,
  exactly as passing does (§8.4). (Not reachable with the example process,
  whose G4 is not skippable; tested with a fixture.)
- **Skipped phase display.** The exited phase's collapsed line reads "Skipped
  G1" with a skip icon (Lucide SkipForward) instead of "Frozen"; the reason is
  its tooltip, and shown in full above the phase's checklist when expanded.
  It stays editable (§8.2).

**Explicitly excluded:** starting phase (019), whose skipped gates use the
same record and display but a different entry point.

## Execution path

1. User triggers: on Onboarding Flow v2 (Discovery, G1 skippable, two items
   incomplete), clicks **Skip G1**.
2. UI: the reason field replaces the guidance; the user types "Problem
   validated in the Q2 pilot." and presses Enter.
3. Data: `gates.discovery = { outcome: "skipped", skipReason: "Problem
   validated in the Q2 pilot.", checklist: [...] }`, one commit.
4. User receives: Validation is current; Discovery's line reads "Skipped G1"
   with the reason on hover; "Skipped G1 — Reopen" shows for a few seconds.

## Value

- **Desirable:** Owners need a governed shortcut past gates that don't apply,
  without faking checklist answers.
- **Usable:** In the bar, next to Pass gate, one field and one button.
- **Valuable:** Keeps the audit trail truthful: a skipped gate says so and
  why, and never pretends to be an approval.

## Acceptance criteria

- [ ] Given the current gate is skippable and the initiative Active, then the
      bar shows "Skip <gate>" beside Pass gate; given it is not skippable, it
      does not.
- [ ] Given the initiative is On Hold, then Skip <gate> is muted and does
      nothing.
- [ ] Given Skip G1 is chosen, then the guidance line becomes a focused field
      labelled "Reason for skipping G1", with Skip G1 disabled and Cancel.
- [ ] Given only spaces are typed, then Skip G1 stays disabled.
- [ ] Given Esc or Cancel, then the bar returns to its previous state and
      nothing is saved.
- [ ] Given a reason and Skip G1 (or Enter), then a gate record with outcome
      "skipped" and the trimmed reason is saved in one commit "<name>: G1
      skipped", with incomplete checklist items and a missing estimate not
      blocking it.
- [ ] Given a skipped gate, then its exited phase is not frozen, records no
      figure or approval track, and the cost summary's "approved at" and the
      escalation baseline are unchanged.
- [ ] Given the skip succeeds, then the bar shows "Skipped G1" and Reopen for
      the same duration as after a pass; Reopen removes the record.
- [ ] Given a skipped phase, then its collapsed line reads "Skipped G1" with
      the skip icon and the reason as tooltip; expanded, the reason shows above
      its checklist, and its fields are editable.
- [ ] Given a skippable final gate is skipped (fixture), then the initiative
      is Closed.
- [ ] Given a screen reader, then the reason field has the label "Reason for
      skipping G1" and the skip icon on the phase line has the accessible name
      "Skipped".

## Delivery gate

- [ ] Deployed to production-equivalent environment

## Flags and compromises

None.

## Decided in review (pre-implementation)

- **Skipping state:** the reason field replaces the guidance line in the bar;
  Skip <gate> (disabled until a reason) and Cancel beside it; afterwards
  "Skipped <gate> — Reopen" for a few seconds, like a pass.
- **Reason afterwards:** on the exited phase's collapsed line as a tooltip
  on "Skipped <gate>", and in full when the phase is expanded.
