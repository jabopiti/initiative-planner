---
slice_id: "016"
title: "Reopen from the Actions menu: the last gate, or a Closed initiative"
type: "capability"
status: "valid"
criteria_failures: []
depends_on: ["008", "014", "015"]
verification_status: null
superseded_by: null
supersedes: null
change_summary: "Promoted from the backlog tail (Reopen a Closed initiative, §8.3, §8.4), widened in review to §5.4's Actions menu Reopen in every case: today the last gate can only be reopened during the magic bar's five-second 'Passed — Reopen' message, and a Closed initiative, whose bar is hidden, cannot be reopened at all."
recommended_model: "Claude Sonnet 5"
model_rationale: "The reversal itself (`reopenGate`) exists and is tested since 008; this slice exposes it in the menu and the frozen line, names the gate, and pins the Closed → Active path."
spec_sections: ["§8.3 Reopening", "§8.4 Closing and cancelling", "§5.4 Initiative detail view (Actions menu)", "§7.4 Approval tracks", "§9.9 Interface states", "§10.3 Writing"]
---

# Reopen from the Actions menu: the last gate, or a Closed initiative

## Intent

**Problem statement:** Passing a gate by mistake, or learning after G2 that
the estimate was wrong, can only be undone in the five seconds the magic bar
shows "Passed G2 — Reopen". After that there is no way back. A Closed
initiative is worse: its bar is hidden, so an initiative closed too early
stays closed.

**Outcome statement:** The most recent gate can always be reopened from the
Actions menu, including the final one that closed the initiative — exactly
one transition back, keeping actuals, notes and checklist statuses (§8.3).

## Scope

- **Menu item (§5.4, §8.3).** In the Actions menu whenever a gate record
  exists (passed or skipped):
  - Active or On Hold with a gate behind the current phase: **Reopen G2**,
    naming the most recent gate.
  - Closed: **Reopen G4** (the final gate), which reverses it and returns the
    status to Active (`reopenGate` already does).
  - Cancelled: **Reopen** (015's status change; unchanged here).
  Hidden when no gate has a record and the initiative isn't Cancelled.
- **Frozen line (015).** For Closed, the line's Reopen button does the same as
  **Reopen G4**.
- **Effect (§8.3).** Clears that gate's record and discards its frozen
  snapshot; never touches actuals; checklist statuses and notes are kept; the
  previous passed costed gate becomes the escalation baseline again (§7.4).
  Commit: "Checkout Redesign: G2 reopened". One transition per click; a
  second click reopens the one before.

**Explicitly excluded:** reopening a skipped gate's reason and the starting
phase (018, 019 decide how their records display; this slice treats a
skipped gate's record like any other).

## Execution path

1. User triggers: on Checkout Redesign (in Development, G2 passed last
   week), ⋯ Actions → **Reopen G2**.
2. Data: `gates.validation` removed, frozen snapshot gone; actuals kept.
3. UI: Validation is the current phase again, editable, with its checklist
   statuses as they were; the cost summary's "approved at" falls back to the
   previous costed gate, or none.
4. User receives: the mistake undone without losing anything recorded.

## Value

- **Desirable:** Gates are passed in one click with no confirmation precisely
  because they can be reopened (§5.4); that promise must hold after five
  seconds.
- **Usable:** Always in the same menu, naming exactly which gate it reverses.
- **Valuable:** Makes the one-click gate safe, and Closed reversible.

## Acceptance criteria

- [ ] Given an Active initiative whose last passed gate is G2, then the
      Actions menu lists "Reopen G2"; choosing it clears G2's record and
      frozen snapshot, makes Validation current, and commits "<name>: G2
      reopened".
- [ ] Given Reopen G2 was chosen, then recorded actuals in Validation are
      unchanged, and G2's checklist statuses and notes are as they were.
- [ ] Given G1 and G2 passed and G2 is reopened, then the menu next lists
      "Reopen G1" (one transition per click).
- [ ] Given a Closed initiative, then the menu lists "Reopen G4"; choosing it
      (or the frozen line's Reopen) clears G4's record, sets the status to
      Active, removes the frozen line and shows the magic bar again.
- [ ] Given an initiative with no gate record and not Cancelled, then the
      menu lists no Reopen item.
- [ ] Given an On Hold initiative with a passed gate, then Reopen <gate> is
      listed and works, and the status stays On Hold.
- [ ] Given a costed gate reopened, then the cost summary's "approved at" and
      the escalation baseline use the previous passed costed gate, or none.

## Delivery gate

- [ ] Deployed to production-equivalent environment

## Flags and compromises

None.

## Decided in review (pre-implementation)

- **Scope:** Reopen from the menu in every case, not only Closed.
- **Label:** the menu item names the gate ("Reopen G2"); "Reopen" alone only
  for a Cancelled initiative, where no gate is reversed.
- **Placement:** the loose "Reopen <gate>" link beside ⋯ in the header
  (built before the menu) is removed; Reopen lives only in the Actions menu
  (§5.4), plus the Closed strip and the magic bar's "Passed — Reopen".
- **Menu list:** an action's `label` and `applies` also receive the process,
  so the item can name the gate; order stays Put on hold / Resume, Cancel,
  Reopen. No new copy.
