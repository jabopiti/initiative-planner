---
slice_id: "064"
title: "Write budget: fewer commits, many-file commits in one request, pauses when GitHub limits"
type: "capability"
status: "valid"
criteria_failures: []
depends_on: ["043", "045"]
verification_status: null
superseded_by: null
supersedes: null
change_summary: "Added on 6 Oct 2026 from an analysis of requests to the data branch, measured against the in-memory fake GitHub at the volume ceiling (table below). Reads are well within GitHub's limits; the risk is content-creating requests (80 a minute, 500 an hour per user). Settled with the user: one slice for the write side, a separate optional slice (065) for cheaper reads; the commit window becomes 4 s quiet / 20 s at most; the write budget is shown in Settings → Connection; GraphQL is used for commits that change several files, but only after a spike confirms it works from the browser (scope item 0). The 403 misclassification is 043's, not repeated here. Review on 6 Oct 2026: the spike passed Q1, Q2, Q3 and Q6, so the GraphQL route; budget line A1 ('Saves this hour: 38 of 400 from this browser; saving slows down above that'), banner B1 (resumes at a clock time, no Retry while waiting), lines 60 a minute and 400 an hour, the flush points and the three multi-file actions listed under Decided in review."
recommended_model: "Claude Opus 5.5"
model_rationale: "Touches the writer's timing, the global write queue and the many-file commit path, where a mistake loses or duplicates an edit; the GraphQL route adds a second API with its own error and concurrency model."
spec_sections: ["§3 Storage & sync (Sync behaviour, Sync failures)", "§5.9 Settings", "§9.6 Performance", "§10.2 Data layout", "§10.3 Writing", "§10.4 Browser storage"]
---

# Write budget: fewer commits, many-file commits in one request, pauses when GitHub limits

## Intent

**Problem statement:** Every save of a file is one content-creating request
to GitHub, and edits more than 1 s apart are separate commits. Planning one
initiative is about 90 edits, so a focused session at 1–3 s per edit makes
20–60 commits a minute: close to GitHub's 80 a minute, and past 500 an hour
in one to two hours of steady work (both per user, shared by their tabs).
A many-file commit uploads one blob per file, all at once, so it costs N + 3
content-creating requests: harmless for Reset today, but a migration at the
volume ceiling (§3 Versioning and migration) would send about 209 in parallel
and fail. When a limit is hit, the client keeps polling and retrying every
30 s instead of waiting for the time GitHub names.

**Outcome statement:** A normal working session stays well inside GitHub's
write limits without the user noticing; a many-file commit costs a fixed,
small number of requests whatever its size; and when GitHub does limit, the
tool waits as told and resumes by itself.

## Measured baseline (6 Oct 2026, fake GitHub, 200 initiatives / 200 people / 25 teams)

| Scenario | Requests | Content-creating |
|---|---|---|
| Cold first load | 209 (1 head, 2 listings, 206 files) | 0 |
| Poll, nothing changed | 1 (ETag 304, not counted) | 0 |
| Poll, 1 initiative changed by another user | 4 | 0 |
| 3 edits to one initiative within 1 s | 1 PUT | 1 |
| Poll after own commits only | 3 (head, 2 listings) | 0 |
| Same field on 5 initiatives in one burst | 5 PUTs | 5 |
| New person + membership | 2 PUTs, in order | 2 |
| Edit on a stale version (409) | PUT, re-read, PUT | 2 |
| Reset | 21, incl. 6 blob POSTs, then re-downloads the 6 files it wrote | 9 |
| Load example data | 26, incl. 6 blob POSTs, 5 reads to check the branch is empty, then re-downloads the 6 files it wrote | 9 |
| Reopen, warm cache, unchanged | 1 | 0 |
| Reopen, 40 initiatives changed | 43 | 0 |

Already good, keep: ETag head check, files cached by version, text fields
save on blur, drag bars on pointer-up, the 1-file-1-commit merge path.

## Scope

0. **GraphQL spike, before any code** (`scripts/spike-graphql.mjs`). Run it
   from a machine or session that can reach `api.github.com/graphql` with a
   fine-grained dev token (Claude Code cloud sessions cannot: their proxy
   refuses GraphQL). It works only on a throwaway branch `spike-graphql`,
   deleted at the end. Record the report in `spike-findings.md` and decide
   the route for items 4 and 5:
   - **GraphQL route** when Q1 (browser CORS from the Pages origin), Q2
     (fine-grained token), Q3 (`createCommitOnBranch` adds and deletes in
     one commit, keeps the subject and `Entity:` trailers, refuses a stale
     `expectedHeadOid` with a recognisable error, and the resulting file
     version equals the locally computed git blob sha) and Q6 (a 210-file,
     ~4 MB commit succeeds) all pass.
   - **REST route** otherwise: a tree with inline `content` entries (no
     blob POSTs) on the base tree, then commit, then ref update. Item 5 is
     then dropped (with REST it costs more than the two PUTs it replaces).
1. **Commit window** (§10.3): a file's edits are committed after **4 s**
   without a further edit to it, and at most **20 s** after its first
   uncommitted edit, whichever comes first. Pending edits are committed at
   once when the user leaves the initiative or the page, when the tab is
   hidden, on `pagehide`, on Disconnect (after its existing offer to keep
   them), and before any action that reads or replaces the saved file
   (pass, skip or reopen a gate, status changes, duplicate, delete, change
   team, Reset, Load example data). "Saving" still shows within 100 ms.
2. **Write budget** (§10.3, §10.4): the client counts its own
   content-creating requests (PUT, DELETE, Git data POST/PATCH, GraphQL
   mutations), rejected ones included, in a rolling minute and hour,
   shared by the user's tabs on this browser (IndexedDB plus a
   BroadcastChannel; per tab when storage is unavailable). Above **60 a
   minute or 400 an hour**, a commit waits until the count drops below
   the line; the edits keep combining meanwhile, the indicator stays
   "Saving", and no edit is refused or dropped.
3. **Waiting out a limit** (§3 Sync failures, on top of 043's
   classification): after a `rate-limited` response, no request goes to
   GitHub (pull, retry or write) until the time `retry-after` names, else
   `x-ratelimit-reset`, else 60 s, doubling for each repeat within the
   hour; then the pull and the pending writes resume by themselves. The
   banner says when it will try again.
4. **Many-file commits in a fixed number of requests** (§10.3): Reset,
   Load example data and the bootstrap use the route from item 0: one
   `createCommitOnBranch` (GraphQL), or tree + commit + ref with inline
   contents (REST). Never a blob per file, and never more than one
   content-creating request in flight. After it lands, the written files
   are taken into the dataset and the cache with their versions (git blob
   sha, `sha1("blob <bytes>\0" + content)`), without downloading them
   again.
5. **One commit per user action that writes several files** (GraphQL route
   only, §10.3): new person + their first membership, and every other
   action that today schedules writes to two or more files in one go (list
   them while implementing). Both files are in one commit or neither is;
   §3's rule that a membership waits for its person's commit becomes moot
   for these. A refused `expectedHeadOid` re-lists the touched files: when
   none changed, the commit is resent on the new head; when one did, it is
   re-read and merged per §10.5, as a 409 is today (three tries, then the
   conflict flow).
6. **Budget in Settings → Connection** (§5.9): beside the remaining API
   requests, how many content-creating requests this browser made in the
   last hour of GitHub's 500. Copy and layout as rendered mockups first.

### Decided in review (pre-implementation, 6 Oct 2026)

- **Route: GraphQL** (spike-findings.md, Slice 064 section: Q1, Q2, Q3 and Q6
  pass). Items 4 and 5 use `createCommitOnBranch`. Bootstrapping onto a
  *missing* data branch stays REST, because GraphQL can't create a branch:
  a tree with inline contents, a commit with no parent, then the ref. That
  is 3 content-creating requests and no blobs. Bootstrapping onto an
  existing branch, Reset and Load example data use one GraphQL commit each.
  There is no migration code yet; item 4 provides the mechanism for it.
- **GraphQL handling, from the spike:** a refusal arrives as HTTP 200 with
  `errors[].type` (`STALE_DATA`, `NOT_FOUND`), classified by type rather
  than status. After a 5xx, a timeout or a network error on a commit, the
  branch head is re-read before resending: the commit counts as landed
  when the head carries our subject and our blob shas. The GraphQL URL is
  derived from `apiBaseUrl`: `https://api.github.com` → `/graphql`;
  `https://<host>/api/v3` → `https://<host>/api/graphql`.
- **Budget lines: 60 a minute and 400 an hour** of content-creating
  requests from this browser.
- **Budget line (§5.9, mockup A1):** a row **Saves this hour** under API
  requests, reading "38 of 400 from this browser; saving slows down above
  that". Before anything is counted: "0 of 400 from this browser; saving
  slows down above that".
- **Rate-limit banner (§3, mockup B1):** "GitHub is limiting requests.
  Saving resumes by itself at 14:32." (clock time as in the Connection
  section), with no Retry while the wait lasts. If the first try after the
  wait is refused again, the banner names the next time. The sync
  indicator's "Rate limited" stays. A failed field reads "Not saved:
  <the banner's message>", as fields do for every cause (corrected
  during implementation: the review said "Not saved: Rate limited.",
  which was never what fields showed).
- **An edit made during a rate-limit wait** fails at once without sending
  a request (its field says "Not saved:" and the banner's message). It is resent by itself
  when the wait ends, so §3's "no change is ever queued" holds. A commit
  held back by the budget (item 2) is different: it stays "Saving" and
  waits.
- **Flush points (item 1):** pending edits are committed at once when:
  - the user leaves an initiative's page (that initiative's file);
  - the tab is hidden;
  - `pagehide` or `beforeunload` fires;
  - the user disconnects. Disconnect first sends pending edits and waits
    for them; only edits that then still fail count in its "Disconnect
    and discard N unsaved changes" offer;
  - before pass, skip or reopen a gate; put on hold, cancel, reopen;
    duplicate (the source file); change team; Load example data. Delete
    and Reset keep dropping the pending edits to what they erase (settled
    during implementation, 6 Oct 2026: flushing would commit edits that
    are erased a moment later).

  Each of these sends the pending edits as their own commit, and the
  action's own write is then committed at once, without a window.
- **Multi-file user actions (item 5), from the code:**
  - new person and their first membership (Team page → Add person):
    `people.json` + `memberships.json`;
  - a country's rate for a year edited while rates aren't reviewed yet:
    `countries.json` + `dataset.json`;
  - rolling rates into a new tracked year (system write, §7.2):
    `countries.json` + `people.json`.

  Each is one commit, with one `Entity:` trailer per touched entity, as
  for single-file edits.

## Execution path

1. Plan a whole initiative at a normal pace: periods, allocations, cost
   items, the checklist. The sync indicator shows Saving and Synced as
   today; the commit history shows a few commits per section, not one per
   field.
2. Settings → Connection shows e.g. "Saves this hour: 38 of 500".
3. Reset the dataset: one commit; the request log shows no blob uploads and
   no re-download of the files just written.
4. GitHub answers a save with a secondary-limit 403 and `retry-after: 60`:
   the banner says GitHub is limiting requests and when it tries again; no
   request goes out for 60 s; then the save lands by itself.

## Value

- **Desirable:** No "GitHub is limiting requests" during normal heavy use.
- **Usable:** Nothing to learn: saving stays automatic, the budget is
  visible for the administrator.
- **Valuable:** Migrations and bulk actions work at the volume ceiling;
  the tool keeps to GitHub's terms instead of hammering a limit.

## Acceptance criteria

- [ ] Given the spike report, then `spike-findings.md` records it and names
      the route chosen for items 4 and 5, with the failing question if REST.
- [ ] Given three edits to one file 2 s apart (fake clock), then one PUT is
      sent, 4 s after the last edit.
- [ ] Given an edit every 2 s for 30 s, then a commit is sent at 20 s and
      another 4 s after the last edit.
- [ ] Given a pending edit, then leaving the initiative, hiding the tab,
      `pagehide`, Disconnect and passing a gate each send it at once, before
      the gate's own write; the gate's write is then sent at once too.
- [ ] Given an edit, then "Saving" shows within 100 ms, as before.
- [ ] Given 61 content-creating requests due within one minute from two
      tabs, then at most 60 are sent in any rolling minute, the rest go
      later, and no edit fails or is dropped.
- [ ] Given a 403 with `retry-after: 60` (and, separately, a 429 with
      `x-ratelimit-reset`), then no request reaches the fake GitHub until
      that time, after which the pull and pending writes resume without
      user action; meanwhile the banner reads "GitHub is limiting
      requests. Saving resumes by itself at <time>." with no Retry, and an
      edit made then fails at once without a request.
- [ ] Given Reset and Load example data at the volume ceiling, then each
      makes 1 content-creating request (one GraphQL commit), no blob POSTs,
      and downloads none of the files it wrote; given the bootstrap onto a
      missing data branch, then 3 (tree, commit, ref) and no blob POSTs.
- [ ] Given a GraphQL commit answered with a 504 that landed anyway, then
      it is not sent a second time.
- [ ] Given a rate edit that also marks rates reviewed, and a roll-forward
      into a new year, then each is one commit.
- [ ] Given (GraphQL route) a new person and their membership, then one
      commit holds both files; given another commit landed first on a file
      neither touches, then it is resent without a conflict; given one on
      `memberships.json`, then the two versions merge per §10.5.
- [ ] Given any write, then it names the data branch: every Contents call's
      `branch`, and every GraphQL commit's `branchName` (client test).
- [ ] Given a request-count regression test that replays the baseline
      table's scenarios, then its counts are pinned, and the rows this
      slice improves show the new numbers.
- [ ] Given Settings → Connection, then the row "Saves this hour" reads
      "<n> of 400 from this browser; saving slows down above that", and
      passes the e2e axe scan in both themes.
- [ ] Given `npm run test:e2e`, then the e2e fake GitHub serves the chosen
      route and the existing connect and planning flows pass.

## Spec changes (make as `Slice 064 spec:` commits once item 0 decides the route)

- §3 Sync behaviour: "immediately pushes" becomes "pushes within seconds
  (§10.3)"; Sync failures, rate-limited row: waits for the time GitHub
  names, then recovers automatically.
- §5.9 Connection: the budget line.
- §9.6: an edit is confirmed within 2 s after its commit window closes.
- §10.3: the 4 s / 20 s window and its flush points; the write budget;
  many-file commits by the chosen route; (GraphQL) one commit per
  multi-file action; the branch rule's GraphQL form (`branchName` plus
  `expectedHeadOid`, reads by commit oid).
- §10.4: the budget counter in IndexedDB, outside the cache budget.
- §10.7 / brand pack (GraphQL route): GitHub Enterprise serves GraphQL at
  `https://<host>/api/graphql`, not under `apiBaseUrl` (`/api/v3`), so the
  URL is derived, not appended. The CSP's `connect-src` already allows it
  (same origin).

## Flags and compromises

- **043 is not built, though the backlog tooling counts it as done.** Its
  only commit, 1e777e2 "Slice 043: scope and criteria follow the
  recommended retry path", changed the slice file alone, and its
  `Slice 043:` prefix (rather than `Slice 043 spec:`) marks it done for
  `find-eligible.sh`. On 6 Oct 2026 a secondary-limit 403 on a save still
  read "GitHub refused access with this token" (`access-denied`, never
  retried). Build 043 before item 3 of this slice, in its own `Slice 043:`
  commit.
- A longer window means other users see a change up to ~20 s later, and
  more saves meet a newer version and merge (§10.5). Accepted for the
  budget.
- `createCommitOnBranch` checks the branch head, not the file, so it is
  never used for single-file edits: with five writers it would be refused
  far more often than a per-file Contents PUT.
- The budget is counted per browser: two browsers of the same user don't
  see each other's count. GitHub's own limit still holds them, and item 3
  handles it.
- F3 (commit a grid's edits when the section is left) was considered and
  left out: the 4 s window already combines fast grid edits. Revisit with
  the budget line's numbers if grids still dominate.

## Open decisions

None: all settled on 6 Oct 2026 (Decided in review, under Scope).
