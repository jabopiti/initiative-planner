---
slice_id: "017"
title: "Delete an initiative no gate has passed"
type: "capability"
status: "valid"
criteria_failures: []
depends_on: ["013", "014"]
verification_status: null
superseded_by: null
supersedes: null
change_summary: "Found while slicing the backlog tail: §5.4's Actions menu lists Delete and §9.3 allows it while no gate was passed, but it was in neither the sliced backlog nor the tail. Needs the one GitHub write the client doesn't have yet — deleting a file."
recommended_model: "Claude Opus 5"
model_rationale: "The first file deletion in a dataset that has only ever added and changed files: a new GitHub call, the writer's pending edits for that file, the cache, and a race with another user passing a gate between confirm and delete. The UI is small; the sync correctness is the work, and it needs fake-repository tests of each race."
spec_sections: ["§9.3 Deletion rules", "§9.9 Interface states (Confirmations, Messages)", "§5.4 Initiative detail view (Design principles, Actions menu)", "§5.11 Suggestions and shortcuts (Undo)", "§3 Storage & sync (Sync behaviour, Conflict edge cases)", "§10.2 Data layout", "§10.3 Writing", "§10.4 Browser storage"]
---

# Delete an initiative no gate has passed

## Intent

**Problem statement:** An initiative created by mistake, a duplicate, or a
test ("Checkout Redesign copy") stays in the portfolio forever: the only
options are to cancel it, which keeps it listed as if it had been real work,
or to leave it Active, where it raises attention items and counts against
capacity.

**Outcome statement:** An initiative that never passed a gate can be deleted,
after an inline confirmation — removing its file from the dataset — while
anything that passed a gate, and so became a record of an approval, can only
be put on hold or cancelled (§9.3).

## Scope

- **Menu item (§5.4, §9.3).** **Delete** (Lucide Trash2 icon) in the Actions
  menu, in any status, only while no gate record has `outcome: "passed"`. A
  skipped gate does not prevent deletion (it approved nothing). Hidden
  otherwise, per 014's "only applicable items" rule.
- **Inline confirmation (§9.9, §5.4).** Choosing Delete closes the menu and
  opens a confirmation under the header's meta row, the same placement as the
  team-change confirmation: "Delete Checkout Redesign? This can't be
  undone." with **Confirm delete** (destructive style) and **Cancel**. Focus
  moves to Cancel. Esc or Cancel closes it and returns focus to the ⋯ button.
- **The delete (§10.2, §10.3).** A new GitHub client call deletes
  `initiatives/<id>.json` with its current sha, commit message "Checkout
  Redesign: deleted". Any pending (debounced) edit for that file is dropped
  first. On success: the initiative leaves state and the cache, and the page
  is **replaced** in history by the Initiatives table (013), so Back does not
  return to it. Success is silent (§9.9).
- **Race with another user (§3).** If GitHub answers 409 (the file changed
  since this client's sha), re-read it:
  - a gate was passed meanwhile → refuse, and the confirmation line reads "A
    gate was passed meanwhile, so Checkout Redesign can't be deleted. Cancel
    it instead." with a Close button;
  - otherwise → delete again at the new sha. The user confirmed deleting the
    initiative, not a version of it.
  - the file is already gone → treat as deleted.
- **Failure.** Other failures (unreachable, access denied) keep the page and
  the confirmation, with the cause beside it and the read-only banner (005j)
  as usual; nothing is removed locally until GitHub confirms.
- **Other users.** Their next pull already removes an initiative whose file
  is gone (005i); a user with the page open sees the existing "This
  initiative couldn't be found." A user with an unsaved edit to it keeps it
  until their writer is idle (existing rule).

**Explicitly excluded:** Undo (§5.11: deleting is not undoable); deleting
people, teams, roles, countries (never deleted, §9.3); bulk delete.

## Execution path

1. User triggers: on "Checkout Redesign copy" (no gate passed), ⋯ Actions →
   **Delete**, then **Confirm delete**.
2. Data: `DELETE contents/initiatives/<id>.json` with its sha; one commit.
3. UI: the Initiatives table replaces the page; the initiative is gone from
   every list.
4. User receives: a clean portfolio, with approved work protected from the
   same action.

## Value

- **Desirable:** Mistakes and test entries need a way out that isn't
  "cancelled".
- **Usable:** One menu item and one confirmation, in place.
- **Valuable:** Keeps portfolio totals and lists honest while guaranteeing
  gate-approved work can never be erased.

## Acceptance criteria

- [ ] Given an initiative with no passed gate (in any status), then the
      Actions menu lists Delete; given one with a passed gate, it does not.
- [ ] Given an initiative whose only gate record is skipped, then Delete is
      listed.
- [ ] Given Delete is chosen, then the confirmation "Delete <name>? This
      can't be undone." with Confirm delete and Cancel appears under the
      header, and focus is on Cancel.
- [ ] Given Cancel or Esc, then the confirmation closes, nothing is deleted,
      and focus returns to the ⋯ button.
- [ ] Given Confirm delete succeeds, then the file is deleted in one commit
      "<name>: deleted", the Initiatives table replaces the page in history,
      and the initiative is absent from every list and from the cache.
- [ ] Given an edit to the initiative was still pending in the debounce
      window, when Confirm delete is chosen, then that edit is not pushed.
- [ ] Given another user passed a gate between confirm and delete (409, fake
      repository), then nothing is deleted and the line reads "A gate was
      passed meanwhile, so <name> can't be deleted. Cancel it instead."
- [ ] Given another user changed any other field meanwhile (409), then the
      file is re-read and deleted at its new sha.
- [ ] Given the file was already deleted by someone else, then the delete
      counts as done.
- [ ] Given GitHub is unreachable, then nothing is removed locally, the
      confirmation stays with the cause, and the read-only banner shows.
- [ ] Given another user has the initiative open, when their pull sees the
      file gone, then their page shows "This initiative couldn't be found."

## Delivery gate

- [ ] Deployed to production-equivalent environment

## Flags and compromises

The first delete in the dataset: the GitHub client, the file writer and the
cache each gain a delete path. It is kept to initiative files only, the one
entity §9.3 allows to be removed besides memberships (which are items inside
a file, not files).

## Decided in review (pre-implementation)

- **Confirmation placement:** under the header, like the team-change
  confirmation; focus on Cancel first.
- **After delete:** the Initiatives table, replacing the page in history.
- **409 race:** re-read; refuse only if a gate was passed meanwhile,
  otherwise delete at the new sha.
- **A skipped gate does not block deletion**, following §9.3's "no gate was
  passed" literally.
