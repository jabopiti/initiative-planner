---
slice_id: "065"
title: "Cheaper pulls: one listing request, no re-listing after own commits, batched first load"
type: "capability"
status: "valid"
criteria_failures: []
depends_on: ["064"]
verification_status: null
superseded_by: null
supersedes: null
change_summary: "Added on 6 Oct 2026 with 064, from the same request analysis. Optional: reads are within GitHub's limits today (a cold load at the volume ceiling is 209 of 5,000 requests an hour); this slice is about the §9.6 first-load target and leaving headroom. The GraphQL batch read is only built if 064's spike passed Q1, Q2 and Q4."
recommended_model: "Claude Sonnet 5"
model_rationale: "Self-contained changes to the pull path and the cache write, each pinned by 064's request-count test."
spec_sections: ["§3 Storage & sync (Sync behaviour)", "§9.6 Performance", "§10.2 Data layout", "§10.4 Browser storage"]
---

# Cheaper pulls: one listing request, no re-listing after own commits, batched first load

## Intent

**Problem statement:** A first load at the volume ceiling is 209 requests,
one per file. Every pull after a moved head lists the dataset with two
Contents calls, even when the head moved only by this client's own commits.
The cache writes files one by one, each with its own read, write and
storage estimate.

**Outcome statement:** A first load takes a handful of requests, a pull
after only one's own commits costs one free request, and storing a pull is
one IndexedDB transaction.

## Scope

1. **One listing request** (§10.2): `GET git/trees/{head}?recursive=1`
   replaces the two Contents listings (one request, not capped at 1,000
   entries per folder); it reads the commit just checked, so it stays one
   commit's snapshot.
2. **Own commits are known** (§10.2): each write's response gives the new
   commit and its parent; while the head moves only through this client's
   own commits from the last complete pull, the next pull ends at the head
   check, and the cache's head and ETag move with them.
3. **Batched first load** (§10.2, only if 064's spike passed Q1, Q2, Q4):
   changed files are read through GraphQL, about 100 per query, by commit
   oid and path; a file the query reports truncated is read through REST.
   Master files and Active initiatives first (§9.6), the rest after.
4. **One cache transaction per pull** (§10.4): a pull's files and meta are
   written in one IndexedDB transaction, with one storage estimate.

## Execution path

1. Open the app with an empty cache at the volume ceiling: the Portfolio
   shows within 5 s; the request log shows about 5 requests (GraphQL) or
   208 (REST only), not 209.
2. Edit, wait for the next poll: one request, answered 304.

## Value

- **Desirable:** A faster first open for new team members.
- **Usable:** Nothing changes on screen.
- **Valuable:** Headroom in GitHub's budget as the dataset grows.

## Acceptance criteria

- [ ] Given a moved head, then the pull lists the dataset with one request.
- [ ] Given only this client's own commits since the last complete pull,
      then the next pull is one conditional request and downloads nothing.
- [ ] Given another user's commit interleaved with this client's own, then
      the pull lists and downloads that user's files as today.
- [ ] Given (GraphQL) a cold load at the volume ceiling, then at most 6
      requests reach the fake GitHub, and a truncated file is read through
      REST.
- [ ] Given a cold load, then the cache is written in one transaction and
      the next open makes one request.
- [ ] Given 064's request-count test, then the rows this slice improves are
      updated and the others are unchanged.

## Flags and compromises

- Optional: skip it if 064's budget line and the §9.6 measurement show no
  need.

## Open decisions

None.
