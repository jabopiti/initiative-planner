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
change_summary: "Added on 6 Oct 2026 with 064, from the same request analysis. Optional: reads are within GitHub's limits today (a cold load at the volume ceiling is 209 of 5,000 requests an hour); this slice is about the §9.6 first-load target and leaving headroom. The GraphQL batch read is only built if 064's spike passed Q1, Q2 and Q4 (it did). Reviewed 7 Oct 2026: the pull after own commits is one request answered 200, not 304 (GitHub's ETag for the new head can't be known without asking); no read order (Active is only known after reading); GraphQL reads on every pull."
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
after only one's own commits costs one request and downloads nothing, and storing a pull is
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
   The queries run in parallel; no file is read before another (§9.9 waits
   for the whole dataset).
4. **One cache transaction per pull** (§10.4): a pull's files and meta are
   written in one IndexedDB transaction, with one storage estimate.

### Decided in review (pre-implementation)

- **Own-commit poll is one 200, not 304.** GitHub answers 304 only to the
  ETag of the current head, and the new head's ETag can't be known without
  asking. The poll after only own commits is one request answered 200 (counted,
  1 of 5,000), no listing, no download; the ETag it returns is kept, so the
  polls after it are 304 again.
- **What counts as an own commit:** single-file PUT and DELETE responses
  (their `commit.sha` and `commit.parents[0]`) and 064's joint commits
  (`commitOnHead`'s commit on the head it built on). Reset, Load example data
  and the bootstrap don't: the pull after them is what brings them on screen,
  so it still lists. The parent→commit links are kept in memory only (a
  reload pulls as usual) and resolved at pull time, so responses arriving out
  of order still chain. A conflict re-read, a save whose answer was lost, or
  anyone else's commit breaks the chain: the pull lists as before.
- **No read order.** "Master files and Active initiatives first" is dropped:
  whether an initiative is Active is in its file, and §9.9's first load waits
  for the whole dataset. All queries run in parallel.
- **GraphQL on every pull**, not only the first load: one code path, and a
  separate 5,000-point budget. About 100 files per query, by
  `"<commit oid>:<path>"` expressions passed as variables; a blob with
  `isTruncated` (over 512,000 bytes) is read through REST `getFile` at that
  commit. A save's conflict re-read stays REST.
- **GraphQL reads are not content-creating:** they reserve no write-budget
  place (`request()` treats every POST as content-creating today), and the
  request-count test counts GraphQL mutations only. A GraphQL
  `RATE_LIMITED` error pauses like a REST limit; any other GraphQL failure is
  a failed read (no REST fallback).
- **Tree listing:** 404 (no branch) and 409 (empty repository) mean no
  files; same filter as today (root master files, blobs directly under
  `initiatives/` ending `.json`); a tree GitHub reports `truncated` falls back
  to the two Contents listings. Reset's and Load example data's own
  `listDirectory` calls are unchanged.
- **One transaction:** a pull's files and meta in one IndexedDB `readwrite`
  transaction over `files` and `meta`, one storage estimate, eviction in the
  same transaction. Writers' single-file cache writes stay as they are; a
  pull that ends at the own-commit head moves the meta (head, ETag) after
  those writes, through the cache's serial queue.
- **Fakes:** both fake GitHubs serve `git/trees/{sha}?recursive=1` and GraphQL
  blob reads, and PUT/DELETE responses carry the commit and its parent.
- **064's request-count rows:** cold load 209 → 5 (head, tree, 3 queries);
  poll after another user's edit 4 → 3; poll after only own commits 3 → 1;
  reopening after 40 changes 43 → 3; Reset and Load example data rows lose a
  listing request. The others are unchanged.
- **Spec:** §10.2 (own commits, one listing, batched reads) and §10.4 (a pull
  stored in one step) updated.

## Execution path

1. Open the app with an empty cache at the volume ceiling: the Portfolio
   shows within 5 s; the request log shows 5 requests, not 209.
2. Edit, wait for the next poll: one request (200), nothing listed or
   downloaded; the poll after it is answered 304.

## Value

- **Desirable:** A faster first open for new team members.
- **Usable:** Nothing changes on screen.
- **Valuable:** Headroom in GitHub's budget as the dataset grows.

## Acceptance criteria

- [ ] Given a moved head, then the pull lists the dataset with one request.
- [ ] Given only this client's own commits since the last complete pull,
      then the next pull is one conditional request and downloads nothing,
      and the poll after it is answered 304.
- [ ] Given another user's commit interleaved with this client's own, then
      the pull lists and downloads that user's files as today.
- [ ] Given (GraphQL) a cold load at the volume ceiling, then at most 6
      requests reach the fake GitHub, and a truncated file is read through
      REST.
- [ ] Given a GraphQL file read, then it takes no place in the write
      budget.
- [ ] Given a cold load, then the cache is written in one transaction and
      the next open makes one request.
- [ ] Given 064's request-count test, then the rows this slice improves are
      updated and the others are unchanged.

## Flags and compromises

- Optional: skip it if 064's budget line and the §9.6 measurement show no
  need.

## Open decisions

None.
