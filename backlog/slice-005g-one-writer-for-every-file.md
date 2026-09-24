---
slice_id: "005g"
title: "One writer for every file"
type: "capability"
status: "valid"
criteria_failures: []
depends_on: ["005"]
verification_status: null
superseded_by: null
supersedes: null
change_summary: "Refactor found in the review of slices 003 to 005d. The master files (teams, people, memberships) and the initiative files each have their own writer, copied from one another, and they had already drifted: one cleared its timer on flush and the other did not, one wrote a local cache the other skipped, and the same three bugs (a finished save rewinding newer edits, a stale sha on a queued save, one file's success hiding another's failure) had to be fixed twice. Creating an initiative is a third, separate write path with no writer behind it. This slice makes them one mechanism."
recommended_model: "Claude Opus 5"
model_rationale: "Concurrency under a network boundary: edits during an in-flight save, a 409 in the middle, two files failing at once. The behaviour is already specified and mostly fixed; what is hard is proving that one class keeps every case true, which needs interleaving tests written before the refactor so they can catch a regression."
spec_sections: ["§3 Storage & sync (Sync behaviour, Sync failures, Conflict edge cases)", "§10.2 Data layout", "§10.3 Commits", "§10.5 Merging"]
---

# One writer for every file

## Intent

**Problem statement:** Every save in the tool goes through code that exists
twice, once for the master files and once for initiative files, plus a third
path that creates an initiative. A fix to one is easily missed in the other,
and several already were: edits made while a save was in flight could be
rewound, and one file's successful save could clear another file's failure.
Each such bug loses a colleague's or the user's change without a word.

**Outcome statement:** This slice contributes to the principle that a change
counts as saved only once the push has succeeded, and is never lost, by
having exactly one implementation of "debounce, save, merge on conflict,
report status", used by every file.

## Scope

- **One generic file writer**, parameterised by how its document is merged
  (the list merge for master files, the initiative merge for initiative
  files, slice 005h's path merge afterwards). It owns: the 1 s debounce; the
  commit message built from the plain-words notes (§10.3); one save at a
  time per file, in order; the sha read when a save reaches the front of the
  queue; the retry after a 409 with a merge; the per-file status; the local
  cache write; and the rule that edits made while a save is in flight stay
  in state, are reported synced only when their own save lands, and are
  rebased onto a merge with the repository's version.
- **Creating an initiative is the writer's first save.** The initiative has
  a writer from the moment it exists, so edits never go to a missing writer,
  and a failed creation goes through the same status and retry path. The
  draft's "Create initiative" still waits for the save and stays on the draft
  if it fails (§5.1).
- **Resolving a conflict** writes through the same writer, and the conflict
  leaves the banner only after the write has succeeded (today it leaves even
  when the write failed).
- The two current writer classes and the create path are deleted; no
  behaviour that the current tests pin changes.
- **Interleaving tests first.** Before the refactor, tests are added for each
  case below against the current code, then must pass unchanged after it.

**Explicitly excluded:** A read-only banner with Retry and automatic
recovery (§3, §9.9), which is listed in the backlog tail; loading and pulling
(slice 005i); how conflicts are found and shown (slice 005h).

## Execution path

1. User triggers: edits a field in an initiative, then another before the
   first save finishes.
2. Data: the first save is sent; the second waits behind it, carrying the
   sha the first returns.
3. Data: if the repository rejects the first (409), it is re-read, merged
   with both edits, and written once.
4. User receives: the indicator shows syncing until the last save lands,
   then synced; the values on screen never step back.

## Value

- **Desirable:** People expect that typing quickly, or editing in two places,
  never loses a change.
- **Usable:** One status for the whole app that is true: syncing while
  anything is unsaved, read-only while anything failed.
- **Valuable:** Sync fixes are made once, so the next one cannot diverge.

## Acceptance criteria

- [ ] Given a save in flight, when another edit is made and its save is
      queued, then the value on screen never returns to the first save's
      value and the second save carries the first save's sha.
- [ ] Given a save in flight, when the repository answers 409 and the user
      has edited meanwhile, then the merge with the repository's version is
      applied to the newer edit too, and a change made by the other writer is
      not reverted.
- [ ] Given two files saving, when one fails and the other succeeds, then the
      status stays read-only until the failed file is saved; and while any
      file has unsaved changes the status is syncing.
- [ ] Given a new initiative, when Create initiative is chosen, then one
      commit "<name>: created" is written by the initiative's own writer, an
      edit made straight afterwards is saved by that same writer, and a failed
      creation leaves no initiative in the list.
- [ ] Given a conflict, when Keep theirs or Use mine is chosen, then the
      choice is written once per conflict, the conflict leaves the banner
      only after the write succeeds, and a failed write leaves it there.
- [ ] Given the master files and the initiative files, when the code is
      read, then there is one writer implementation and no path that puts a
      file without it.
- [ ] Given the existing tests for both writers, when they run against the
      new one, then they pass without changes to their expectations.

## Delivery gate

- [ ] Deployed to production-equivalent environment

## Flags and compromises

Nothing in the spec changes. The current behaviour after a failed push,
dropping the write and leaving the edited value on screen, differs from §3
("the dataset stays unchanged", the field stays in edit with a Retry). It is
not fixed here; it is a separate slice in the backlog tail, because it needs
the read-only banner first.
