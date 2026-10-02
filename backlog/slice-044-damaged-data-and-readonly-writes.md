---
slice_id: "044"
title: "Detect damaged data, never bootstrap over it, and refuse writes in read-only"
type: "capability"
status: "valid"
criteria_failures: []
depends_on: ["005j", "040"]
verification_status: null
superseded_by: null
supersedes: null
change_summary: "Added from the post-build review of the implementation against the spec (slices 001 to 041). Review findings H1, H2, M1, M2 of the storage review: bootstrap decided by dataset.json alone, no validation, read-only only displays a banner, structureVersion unchecked."
recommended_model: "Claude Opus 5.5"
model_rationale: "Safety-critical: data validation, a hostile-input surface (prototype keys) and the rule that nothing overwrites existing data. Hard to verify by tests alone."
spec_sections: ["§3 Storage & sync (Setup, Data integrity, Versioning and migration, Damaged data)", "§10.5 Merging", "§10.8 Testing", "§2 Hosting & technology"]
---

# Detect damaged data, never bootstrap over it, and refuse writes in read-only

## Intent

**Problem statement:** "No dataset" is decided by `dataset.json` missing
alone. If that file is deleted while teams, people and initiatives remain,
the next cache-less client commits the baseline over every master file (§3
forbids any fallback over existing data). Pulled files are only
`JSON.parse`d: a wrong shape, a dangling reference or a `__proto__` key is
applied and crashes later; no "Dataset damaged" message exists. Read-only
causes (newer schema, other process) only show a banner, so a warm client can
still write into that dataset. `structureVersion` is never compared.

**Outcome statement:** A dataset is bootstrapped only when the branch holds
none of it; anything unreadable or inconsistent stops the app read-only with a
message naming the file and the problem; and read-only really refuses writes.

## Scope

- Bootstrap only when the listing has no master file and no initiative file.
  Otherwise raise "Dataset damaged: dataset.json is missing", read-only.
- `validateDataset(files)` on every pull and cache read: file shapes, ids
  present and unique, references (member → person/team, initiative → team,
  allocation → person), and rejection of `__proto__`, `constructor` and
  `prototype` keys in the parser and in `merge.ts`.
- New read-only cause `damaged`, with "Dataset damaged: <file>: <what>" and a
  pointer to the repository history for the owner (§3).
- `structureVersion`: a newer value is refused as `dataset-newer`.
- Every write path (`schedule`, `deleteInitiative`, `resetDataset`,
  `loadExampleData`) refuses while the state is `dataset-newer`,
  `process-mismatch` or `damaged`; the Reset and Load buttons already respect
  `readOnly`.
- Tests for hostile datasets, damaged files, the refusal paths and the
  bootstrap guard.

## Execution path

1. A bad commit removes `dataset.json`.
2. A fresh client opens the app: it shows "Dataset damaged: dataset.json is
   missing", read-only; nothing is written.
3. The owner restores the file from history; the next pull recovers.

## Value

- **Desirable:** Owners trust that the tool never overwrites their data.
- **Usable:** The message names the file.
- **Valuable:** Removes the one silent-data-loss path in §3.

## Acceptance criteria

- [ ] Given a branch with people.json but no dataset.json, then no commit is
      made and the banner reads "Dataset damaged: dataset.json is missing".
- [ ] Given an empty branch, then the baseline is committed once (as today).
- [ ] Given `{}` where an array is expected, a person referencing a missing
      team, duplicate ids, and a `__proto__` key, then each yields a `damaged`
      read-only state naming file and problem; none reaches the UI.
- [ ] Given a newer `schemaVersion` or `structureVersion`, or another process
      id, when a field is edited, then no write is attempted.
- [ ] Given a hostile dataset (§10.8), then `Object.prototype` is unchanged
      after a pull and a merge.

## Delivery gate

- [ ] Deployed to production-equivalent environment

## Flags and compromises

Schema migration was removed from the backlog at the user's request (see the
overview), so this slice refuses older/newer data rather than migrating it.

## Open decisions

- Is an older `schemaVersion` or `structureVersion` refused, or accepted as
  today? §3 Versioning and migration promises migration; the backlog dropped
  it. Recommended: record in the spec that migration is out of scope for v1,
  accept equal versions only, refuse others read-only.
- How strict is validation of references (refuse, or repair-and-warn for a
  membership of a deleted person)? Recommended: refuse, owner repairs.
