---
slice_id: "005i"
title: "Open from the cache and pull others' changes"
type: "capability"
status: "valid"
criteria_failures: []
depends_on: ["005g"]
verification_status: null
superseded_by: null
supersedes: null
change_summary: "Found in the review of slices 003 to 005d. §3 says the cached data shows immediately while the pull runs, and that the tool pulls on load, when the tab regains focus and at least every 5 minutes, so others' changes arrive without a reload. Today nothing reads the cache (it is written and never read), every load downloads every initiative file one by one before anything shows, the file's version listed by the repository is thrown away, and there is no pull after the first load."
recommended_model: "Claude Sonnet 5"
model_rationale: "The design is fixed by §3 and §9.9: cache first, revalidate by version, pull on focus and on a timer. The risk is in three well-defined places (a stale cache, the edit in progress never overwritten, the quota rule), each pinned by a test with a fake clock and a fake repository."
spec_sections: ["§3 Storage & sync (Sync behaviour, Sync failures)", "§9.9 Interface states (Opening, Changed by others)", "§10.2 Data layout", "§10.4 Browser storage", "§9.6 Performance"]
---

# Open from the cache and pull others' changes

## Intent

**Problem statement:** Every time the tool opens, a blank page waits for the
dataset to download file by file: one request for each initiative, then
nothing changes on screen until every one has arrived. After that, the page
never looks at the repository again, so a colleague's change appears only
after a manual reload, and a user can spend a morning editing a stale copy.

**Outcome statement:** This slice contributes to the principle that the tool
is fast to open and never stale by showing the cached dataset at once and
keeping it current: unchanged files are not downloaded again, and other
people's changes arrive by themselves.

## Scope

- **Cache first (§3, §9.9 Opening).** Each file that has been read is kept
  in the browser cache with its version (sha). On opening, the cached
  dataset shows immediately and the sync indicator shows syncing while the
  pull runs. With no cache (a first visit), the tool waits for the pull as
  it does now.
- **Pull by version (§10.2).** One conditional request on the branch head:
  unchanged, it answers "not modified" (no download, no rate limit) and
  nothing else is asked. Moved, the data branch's files are listed with
  their versions (the root, for the master files, and `initiatives/`) and
  only a file whose version differs from the cached one is downloaded. The
  dataset identity check runs on the dataset flags file like any other file,
  not before the reads.
- **Keep pulling (§3).** The tool pulls again when the tab regains focus and
  at least every 5 minutes while the tab is visible. Changes arrive without
  a reload.
- **A change made before the first pull finishes waits for it** (§3), so an
  edit is never based on data the pull is about to replace.
- **Never overwritten under the user.** A field being edited keeps what the
  user typed (§3); the change from elsewhere is applied when the field is
  left, through the same three-way merge as a save. A value another user's
  change updated while it is on screen is tinted for a few seconds, and the
  sync indicator's tooltip says "Updated by others" (§9.9).
- **Storage rule (§3, §10.4).** The cache stays within half the storage
  quota, checked by an automated test; when it would exceed it, the oldest
  files are dropped first, never the token.
- A failed pull uses the read-only path of §3 and does not clear the cache.

**Explicitly excluded:** Showing Active initiatives first while the rest
arrive (§9.9), which needs an index of statuses that does not exist yet; the
Retry button and the read-only banner (backlog tail).

## Execution path

1. User triggers: opens the tool with a warm cache.
2. UI: the dataset shows from the cache; the indicator shows syncing.
3. Data: the listing and master files are checked by version; only changed
   files are downloaded and merged into what is on screen.
4. Later: the tab regains focus, or 5 minutes pass; the pull repeats.
5. User receives: a colleague's change appears, tinted briefly, without a
   reload; a field they are typing in is left alone.

## Value

- **Desirable:** People expect a tool they have used before to open at once.
- **Usable:** Changes from others arrive by themselves, and never move what
  is being typed.
- **Valuable:** Fewer requests per open (against a rate limit that is shared
  by everyone on one token) and no editing of stale data.

## Acceptance criteria

- [x] Given a warm cache, when the tool opens, then the dataset is shown
      before any network response and the indicator shows syncing until the
      pull finishes.
- [x] Given no change in the repository, when the tool opens twice, then the
      second open downloads no initiative file and no master file (each read
      answers "not modified" or is skipped by version).
- [x] Given a colleague's commit changes one initiative, when the tab
      regains focus, then only that file is downloaded and its change appears
      without a reload, tinted for a few seconds, with the sync indicator's
      tooltip reading "Updated by others".
- [x] Given the tab stays visible, when 5 minutes pass, then a pull is made;
      given it is hidden, then none is.
- [x] Given a field is being edited, when a pull changes that field's value,
      then the typed text stays and the change is applied through the merge
      when the field is left.
- [x] Given an edit is made before the first pull has finished, when the pull
      finishes, then the edit is saved against the pulled data, and nothing
      the pull returned is lost.
- [x] Given the cache would exceed half the storage quota, when a file is
      added, then the oldest files are dropped, the token is kept, and an
      automated test checks the rule (§10.4).
- [x] Given the pull fails, when the tool is open, then it shows the
      read-only state with its cause and keeps showing the cached data.

## Delivery gate

- [ ] Deployed to production-equivalent environment

## Flags and compromises

§3 said the tool "always pulls before pushing a change". The writers instead
push against the last version they hold and, when the repository answers
409, pull and merge (§10.5); the outcome is the same for the data, at one
fewer request in the common case. Kept as is: §3 is reworded to describe
that flow.

Decided with the slice: background pulls (focus, the 5-minute timer) leave
the indicator alone and only a change from others shows "Updated by others";
a change from others is tinted at the changed value (a row in lists); a
pull that arrives while a field holds uncommitted typing is held until the
field is left, with no hint on screen; the spec's read-only banner and the
disabling of fields stay in the backlog tail, so a failed pull shows in the
indicator only and edits still fail at their push.
