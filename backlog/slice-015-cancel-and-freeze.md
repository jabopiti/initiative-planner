---
slice_id: "015"
title: "Cancel an initiative, and a Cancelled or Closed initiative is frozen"
type: "capability"
status: "valid"
criteria_failures: []
depends_on: ["014"]
verification_status: null
superseded_by: null
supersedes: null
change_summary: "Promoted from the backlog tail (Cancel and Reopen a Cancelled initiative, §8.4). Also builds the whole-initiative freeze §8.4 applies to both Cancelled and Closed: Closed is already reachable (passing the final gate), but today only its phases lock, while its name, description, checklist statuses and the like stay editable. Review (2026-10-01): the frozen line's Reopen G4 for Closed is built here (reopenGate exists since 008), and a frozen page gets Add note / Edit note with a note-only write."
recommended_model: "Claude Opus 5.5"
model_rationale: "The freeze is a rule every write path must honour, with two carve-outs (checklist notes, actuals) and a merge side: a pulled change from another user must not be able to edit a frozen initiative either. Missing one write path is silent data corruption, so it needs a data-layer guard tested across every repository method, not just disabled inputs."
spec_sections: ["§8.4 Closing and cancelling", "§8.3 Reopening", "§5.4 Initiative detail view", "§9.9 Interface states (Frozen, Confirmations)", "§9.10 Icons", "§9.3 Deletion rules", "§10.3 Writing", "§10.5 Merging"]
---

# Cancel an initiative, and a Cancelled or Closed initiative is frozen

## Intent

**Problem statement:** When Fraud Detection Upgrade is abandoned, its owner
can only leave it Active, where it keeps raising attention items and
counting against capacity, or put it on hold, which says it will come back.
And when an initiative closes by passing its final gate, most of its page
stays editable, so the record of what was delivered can drift after the fact.

**Outcome statement:** Cancel records that work was abandoned in one click,
and both Cancelled and Closed initiatives freeze as a record — except the
checklist notes and actuals that a finished initiative still needs to accept
— with Reopen one click away on the page.

## Scope

- **Cancel (§8.4, §9.9).** Actions menu item (Lucide Ban icon), shown for
  Active and On Hold. One click, no confirmation, no reason (notes are where
  the why is recorded). Status becomes Cancelled. Commit: "Fraud Detection
  Upgrade: cancelled".
- **One freeze rule (§8.4), in the data layer.** `isInitiativeFrozen`
  (Cancelled or Closed) guards every repository write for that initiative
  except two field edits, **checklist-item notes** and **recorded
  actuals**, and the lifecycle actions that end or copy the frozen state:
  **Reopen** (this slice and 016), **Delete** (017, which has its own
  "no gate passed" rule) and **Duplicate** (025, which only reads it). Every
  other edit is refused: name, description (012), owner (012), team
  (already), phase periods, allocations, cost items, checklist **statuses**,
  passing or skipping a gate. Pulled changes (005i) are merged as usual — the
  freeze stops this user's edits, it does not reject another user's
  history.
- **Frozen page (§9.9).** Every refused field shows read-only and muted, as
  frozen phases already do. A persistent line under the meta row, with a
  lock icon:
  - Cancelled: "Cancelled. Notes and actuals can still be recorded." and a
    **Reopen** button.
  - Closed: "Closed after G4. Notes and actuals can still be recorded." and
    a **Reopen G4** button, wired to the existing `reopenGate` (since 008).
    While the line shows, the header's "Reopen <gate>" link is hidden, so
    there is one Reopen per page.
  The magic bar stays hidden (§5.4).
- **Reopen a Cancelled initiative (§8.4).** The line's Reopen, and a
  **Reopen** item in the Actions menu, return the status to Active (never to
  On Hold, even if it was on hold before). Commit: "Fraud Detection Upgrade:
  reopened".
- **Status badge (§9.10).** Ban icon for "Cancelled", Lock icon for
  "Closed", in the same neutral chip.
- **Actions menu on a Cancelled initiative:** Reopen (and later Duplicate,
  and Delete when no gate passed). Put on hold and Cancel are hidden.

**Explicitly excluded:** Reopen for a Closed initiative and Reopen of the last
gate from the **Actions menu** (016); Delete (017).

## Execution path

1. User triggers: on Fraud Detection Upgrade, ⋯ Actions → **Cancel**.
2. Data: `status: "Cancelled"`, one commit.
3. UI: badge "⊘ Cancelled"; the line "🔒 Cancelled. Notes and actuals can
   still be recorded. [Reopen]"; fields muted and read-only; magic bar gone;
   a checklist note can still be typed.
4. User receives: a cancelled record that can't drift, reversible in one
   click.

## Value

- **Desirable:** Owners need to record abandoned work distinctly from paused
  work.
- **Usable:** One click, and the undo sits on the page where it's needed.
- **Valuable:** Makes Closed and Cancelled initiatives a trustworthy record
  (§8.4) while still accepting late actuals.

## Acceptance criteria

- [ ] Given an Active or On Hold initiative, then the Actions menu lists
      Cancel; choosing it sets Cancelled with the commit "<name>:
      cancelled" and no confirmation.
- [ ] Given a Cancelled initiative, then the status badge shows the ban icon
      and "Cancelled", the magic bar is hidden, and the line "Cancelled.
      Notes and actuals can still be recorded." with Reopen shows under the
      header.
- [ ] Given a Closed initiative, then the badge shows the lock icon and
      "Closed", and the line reads "Closed after <final gate>. Notes and
      actuals can still be recorded." with a "Reopen <final gate>" button
      that reopens it (§8.3); the header's "Reopen <gate>" link is absent.
- [ ] Given a Cancelled initiative with a passed gate, then no "Reopen
      <gate>" is offered, and `reopenGate` on it is refused.
- [ ] Given a Cancelled or Closed initiative, then each checklist item's
      status shows read-only with "Add note" (no note yet) or "Edit note";
      saving keeps the status and commits "<name>: note on "<item>"
      changed"; clearing a Tentative item's note is refused with "Enter a
      note."
- [ ] Given a Cancelled or Closed initiative, then name, description, owner,
      team, periods, allocations, cost items and checklist statuses are shown
      read-only and muted, and Add person / Add cost item are absent.
- [ ] Given a Cancelled or Closed initiative, then a checklist note and a
      month's actual can still be edited and are saved.
- [ ] Given any repository write other than a note, an actual or a
      lifecycle action (Reopen, and Delete/Duplicate once built) is attempted
      on a Cancelled or Closed initiative (unit test per method), then it is
      refused and nothing is committed.
- [ ] Given Reopen is chosen on a Cancelled initiative (line or menu), then
      its status is Active — also when it was On Hold before it was
      cancelled — with the commit "<name>: reopened", and every field is
      editable again.
- [ ] Given a Cancelled initiative, then the Actions menu does not list Put
      on hold, Resume or Cancel.
- [ ] Given another user's change to a Cancelled initiative is pulled, then
      it is merged as usual (the freeze does not reject pulled history).
- [ ] Given a screen reader, then the frozen line is read with the page, and
      Reopen's accessible name is "Reopen <name>".

## Delivery gate

- [ ] Deployed to production-equivalent environment

## Flags and compromises

Checklist **statuses** freeze while their **notes** do not (§8.4 names only
notes); a note on a Tentative item on a frozen initiative is edited without
changing the status.

## Decided in review (pre-implementation)

- **Frozen page:** a persistent line under the header with a lock icon, the
  status, "Notes and actuals can still be recorded." and a Reopen button —
  not Reopen in the menu alone.
- **Freeze scope:** one rule for Cancelled and Closed alike, built in this
  slice; 016 only adds Reopen for Closed and the last gate.
- **Status badge:** neutral chip, Ban icon for Cancelled, Lock for Closed.
- **No confirmation and no reason** for Cancel (§9.9).

Settled in the 2026-10-01 review, from mockups:
- **Frozen line look:** a bordered strip (surface-subtle, border-default,
  rounded) under the meta row: lock icon, the text, an outline **Reopen**
  button at the right. Plain text, not a live region.
- **Reopen for Closed now:** the strip's button reads "Reopen G4" (the final
  gate's label) and calls `reopenGate`; accessible names "Reopen <name>"
  (Cancelled) and "Reopen G4 of <name>" (Closed). The header's existing
  "Reopen <gate>" link (008) is hidden on a frozen page. 016 keeps the
  Actions menu items.
- **Checklist notes on a frozen page:** each item's status shows read-only
  (icon and label, muted) with a text button "Add note" or "Edit note";
  it opens the existing note field with Save / Cancel (Enter / Esc) and
  saves the note alone through a new `setChecklistNote`, keeping the status.
  Commit: `<name>: note on "<item>" changed`. A Tentative item's note can't
  be cleared ("Enter a note."). Active pages keep today's flow.
- **Reopen menu icon:** Lucide RotateCcw (Unlock stays Settings' unlock).
  Menu order: Put on hold, Cancel. Closed has no menu items until 016.
- **Assumptions agreed:** one guard (`isInitiativeFrozen` in `frozen.ts`)
  checked by every initiative write in `Repository.ts`; only `setActual`,
  `setChecklistNote`, `reopen` and `reopenGate` (Closed only) pass it; a
  refused write is a silent no-op. A pending Undo (removed allocation, cost
  item, team change) is refused once frozen. Pulled changes merge as usual,
  including a local edit made before the pull brought someone's Cancel.
  Phases not frozen by a gate render read-only from the live plan in the
  frozen-phase layout, without capacity warnings, Add person, Add cost item
  or Extend; the lock icon on a phase header stays for gate-frozen phases.
  Name and owner show as text; an empty description is hidden; an open
  team-change confirmation closes when the page freezes.
