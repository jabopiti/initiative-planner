---
slice_id: "045"
title: "Warn before closing with unsaved changes, and handle a full local cache"
type: "capability"
status: "valid"
criteria_failures: []
depends_on: ["005i"]
verification_status: null
superseded_by: null
supersedes: null
change_summary: "Added from the post-build review of the implementation against the spec (slices 001 to 041). Review findings M3, M4: the beforeunload handler never prompts; cache write failures are swallowed."
recommended_model: "Claude Sonnet 5"
model_rationale: "Two small behaviours in the provider and writer; the storage-full part needs a spec decision first."
spec_sections: ["§10.3 Writing", "§3 Storage & sync (Storage limits)", "§10.4 Browser storage"]
---

# Warn before closing with unsaved changes, and handle a full local cache

## Intent

**Problem statement:** §10.3 says closing the tab with a pending write warns
the user. The `beforeunload` handler only calls `flushPending()`, which is an
ordinary fetch behind the write queue and is not reliable during unload.
Separately, §3 Storage limits says a full browser store rejects the edit like
a failed push, with a message; the code swallows every cache-write failure.

**Outcome statement:** A user is never silently left with unsaved edits, and
a full local cache is reported, not ignored.

## Scope

- When `unsavedChangeCount() > 0` or a writer is busy, `beforeunload` calls
  `preventDefault()` and sets `returnValue` (browser-native text; no custom
  copy), and still starts a flush.
- Cache write failure (quota): the edit is kept in the field, the failed-edit
  message appears with "Browser storage is full", and the entry is not marked
  saved. Budget counted in bytes, not UTF-16 units.

## Acceptance criteria

- [ ] Given one pending edit, when `beforeunload` fires, then it is prevented.
- [ ] Given nothing pending, then it is not prevented.
- [ ] Given a cache `set` that throws a quota error, then the edit is shown as
      failed with the storage-full message and input kept.
- [ ] Given the cache budget, then it is computed from encoded byte length.

## Delivery gate

- [ ] Deployed to production-equivalent environment

## Flags and compromises

None.

## Open decisions

- Storage full: implement §3 as written (reject the edit), or amend the spec
  to the current behaviour (continue, the repository is the source of truth)?
  Recommended: amend the spec; the edit is already safe in GitHub once pushed,
  so rejecting it would be worse. Show a one-line notice instead.
- Copy for the notice, drafted in place against §9.2.
