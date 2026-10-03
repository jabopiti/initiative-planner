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
change_summary: "Storage full no longer rejects the edit: a dismissible banner instead (spec amended). Added from the post-build review of the implementation against the spec (slices 001 to 041). Review findings M3, M4: the beforeunload handler never prompts; cache write failures are swallowed."
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
- Cache write failure (quota): see "Decided in review". Budget counted in
  bytes, not UTF-16 units.

### Decided in review (pre-implementation)

- Storage full does not reject the edit (the cache is written after GitHub
  accepted it). §3 Storage limits is amended: a dismissible warning banner
  under the top bar, once per session, reads "Browser storage is full. Your
  changes are saved in GitHub, but this browser can't keep a local copy, so
  the next open loads everything again." Sync state is unchanged.
- Only a `QuotaExceededError` raises it, from the push path and the pull path;
  other cache failures stay silent. Dropping old files for the budget (§10.4)
  stays silent.
- `beforeunload` prevents the unload (native text) when there are unsaved
  changes or a writer is busy, and still starts a flush.

## Acceptance criteria

- [ ] Given one pending edit, when `beforeunload` fires, then it is prevented.
- [ ] Given nothing pending, then it is not prevented.
- [ ] Given a cache `set` that throws a quota error after a push, then the edit
      stays saved, sync is not read-only, and the storage-full banner shows
      with Dismiss; a non-quota error shows nothing.
- [ ] Given the cache budget, then it is computed from encoded byte length.

## Flags and compromises

None.

## Open decisions

None; settled above.
