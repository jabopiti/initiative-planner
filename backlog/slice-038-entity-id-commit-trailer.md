---
slice_id: "038"
title: "Entity ids in each commit's trailer lines"
type: "capability"
status: "valid"
criteria_failures: []
depends_on: ["005h", "039"]
verification_status: null
superseded_by: null
supersedes: null
change_summary: "Promoted from the backlog tail (Entity id in each commit's trailer line, §10.3). Commit messages read as plain words but carry no id, so the history can't be traced to an entity once it is renamed."
recommended_model: "Claude Sonnet 5"
model_rationale: "Built on 039's structured notes, which already carry the entity: the writer renders trailers, and every commit-message expectation in the tests gains them. Mechanical but wide across the tests."
spec_sections: ["§10.3 Writing", "§10.6 Identifiers and links"]
---

# Entity ids in each commit's trailer lines

## Intent

**Problem statement:** "Payments API: Development period set to Apr–Sep" reads
well, but after Payments API is renamed, nothing in the history ties that
commit to the initiative. Auditing an entity's changes means guessing from
old names.

**Outcome statement:** Every commit ends with one trailer line per entity it
touched, carrying the entity's kind and id (§10.3), so the history is a
traceable change log per entity.

## Scope

- **Format.** After the plain-words subject, a blank line, then one git
  trailer per touched entity: `Entity: initiative/3f2a…`, `Entity:
  person/…`, `Entity: team/…`, `Entity: membership/…`, `Entity: role/…`,
  `Entity: country/…`. A grouped commit (several edits in the debounce
  window) lists each distinct entity once, in first-edit order. Parseable by
  `git interpret-trailers --parse`.
- **Explicit entity.** Slice 039's structured notes already carry each
  write's `{ kind, id }`; the writer collects the distinct entities of a
  commit in first-edit order and renders them. No inference from note keys,
  and no second change to every repository method.
- **Multi-file commits** (setup, Reset, Load example data) carry no per-entity
  trailers (they touch the dataset as a whole).
- **Tests.** Every commit-message expectation gains its trailers.

## Execution path

1. User renames Checkout Redesign and sets Mara Voss as owner within 1 s.
2. Commit: "Checkout Redesign: renamed from Checkout v1; owner set to Mara
   Voss" + blank line + `Entity: initiative/<id>`.

## Value

- **Desirable:** Auditors need per-entity history.
- **Usable:** Invisible in the app; standard git trailers in the log.
- **Valuable:** Makes §10.3's change log traceable.

## Acceptance criteria

- [x] Given any single edit, then its commit message ends with a blank line and
      one `Entity: <kind>/<id>` trailer.
- [x] Given edits to two entities in one window of the same file (two people
      in `people.json`), then both trailers appear, each once, in first-edit
      order.
- [x] Given `git interpret-trailers --parse` on a message, then it lists the
      trailers.
- [x] Given a conflict resolution commit, then it carries the entity's
      trailer.
- [x] Given a multi-file commit, a dataset-level commit or an edit that
      cancelled out entirely, then it carries none.
- [x] Given an initiative file deleted, then its commit carries the
      initiative's trailer.
- [x] Given an edit retried after a 409 with a further edit joined in, then
      each entity appears once.

## Delivery gate

- [ ] Deployed to production-equivalent environment

## Flags and compromises

None.

## Decided in review (pre-implementation)

- **Format:** one `Entity: <kind>/<id>` git trailer per touched entity.
- **Dataset-level commits carry no trailer.** The `dataset` notes ("Rates
  copied into …", the Rates reviewed flag) touch the dataset as a whole, like
  multi-file commits; trailers stay `<kind>/<uuid>`.
- **Deleting an initiative file** (and the re-delete after GitHub recreates a
  file someone else deleted) carries `Entity: initiative/<id>`.
- **No trailer** on the `<path>: update` fallback (no notes) or the baseline
  "Initialize dataset" commit.
- **One trailer per entity,** however many of its fields changed; an entity
  is listed while any of its notes remains after cancelling out. An
  added-then-removed entity leaves none.
- **Messages keep their entities** through retries (union, first-edit order)
  and conflict handling: the message is a subject plus an entity list, not a
  string.
