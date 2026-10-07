# Slice 002 — GitHub round-trip spike findings

Run against the real repository (`jabopiti/initiative-planner`, public,
personal account, default branch `main`) using `gh api`, since a
browser-pasted fine-grained token wasn't available — the GitHub CLI was
already authenticated with `repo` scope, which is sufficient to exercise
the same Contents/Compare/Git-data endpoints the app will call. All test
branches and files were created and deleted as part of this spike; `main`
is back to its pre-spike content (see "Incident" below).

## What worked

- **Contents API round trip (§10.3).** Wrote a JSON file to a branch via
  `PUT .../contents/{path}`, read it back via `GET`, content matched
  exactly.
- **Stale write → 409 → re-read → retry (§10.3).** Writing against an
  outdated `sha` returned `409` with a clear message naming the mismatch.
  Re-reading the file's current `sha` and retrying the same write
  succeeded immediately. The re-read/retry path in §10.3 is confirmed
  viable as designed, no changes needed.
- **Compare API (§10.2).** `GET .../compare/{base}...{head}` between two
  commits on the same branch correctly listed the changed filename(s) and
  `ahead_by` count — this is the mechanism the client-side "only fetch
  files that changed since the last-known head" logic depends on.
- **Conditional GET / ETag (§10.2).** A `GET` on the branch ref returned
  an `ETag`; replaying the request with `If-None-Match` returned `304 Not
  Modified`. This supports the "checks the branch's head with a
  conditional request" behaviour cheaply (304s don't count against the
  content-generating rate limit).
- **Git Data API (§10.3).** Built an orphan branch from scratch — blob →
  tree (no `base_tree`) → commit (no `parents`) → ref — confirming the
  "operations that change many files are a single commit through the Git
  data API" mechanism (used here for Reset/Load-example-data/migration in
  the real app) works end-to-end.
- **CSP meta tag (§10.1).** Served a page with the policy as a `<meta>`
  tag; an inline `<script>` was refused with exactly the expected
  console error (`Executing inline script violates ... 'script-src
  'self''`). Confirms the policy is enforced as a meta tag despite
  GitHub Pages not supporting custom headers. Also independently observed
  the browser's own warning that `frame-ancestors` is silently ignored
  when delivered via `<meta>` — this is already accounted for in §10.1 via
  the `window.self !== window.top` fallback check, no change needed.

## What needs a spec or plan change

- **Fork-sync could not be tested — and can't be, under one personal
  account (§2, §10.7).** GitHub's fork API will not fork a repository
  into an account that already owns it, even under a different `name`. A
  `POST /repos/{owner}/{repo}/forks` call from the owning account's own
  token silently returns the *original* repository object — no fork is
  created, no error is raised either, which is itself worth knowing since
  it fails silently rather than loudly. The account running this spike
  (`jabopiti`, a personal account with no organizations) has no second
  namespace to fork into.
  **Spec impact:** §2/§10.7's fork-based distribution model implicitly
  assumes the deployer's fork lives in a *different* account or
  organization than the core repository — true in real multi-tenant use,
  but it means this mechanism can never be spiked solo. **Recommendation:**
  either (a) create a throwaway GitHub organization (free) to fork into
  next time this needs re-testing, or (b) accept this specific mechanism
  as verified only by documentation/first real deployer, and note that in
  the spec/backlog rather than block on it. Not re-attempted further in
  this spike given the silent-no-op behaviour above.
- **GitHub plan tier is still not knowable via API (§3, §10.7).**
  `GET /users/jabopiti` and `GET /user` return no usable `plan` field for
  a personal account from this token's scope, and there's no
  billing-summary endpoint reachable with `repo` scope. This repeats
  example-data.md's existing "not yet known" note — it isn't resolved by
  this spike. **Recommendation:** check
  https://github.com/settings/billing directly (a human, logged-in step)
  rather than relying on API introspection.
- **Branch protection couldn't be verified either, but not because of
  GitHub.** Attempting to enable branch protection via the API
  (`PUT .../branches/{branch}/protection`) was refused by this
  environment's own safety policy as a security-settings change, which is
  the correct call — it's not something to script past. **Recommendation:**
  confirm branch protection availability directly in the repo's Settings →
  Branches UI when the plan tier question above is resolved; both are
  small manual checks, not spike-automatable ones.

## Incident (disclosed, corrected)

The first Contents API update in this spike omitted the `branch`
parameter. GitHub's Contents API defaults `branch` to the repository's
**default branch** when it's omitted — not "whatever branch was just
being worked on" — so that write landed a real commit
(`data: spike-test.json first update`) directly on `main`. This was
caught immediately via the branch's commit history, and reverted with a
second, corrective commit (`Revert: remove spike-test.json accidentally
committed to main`) rather than a history rewrite. `main`'s current
content is unaffected; both commits are visible in its history as an
honest record of the mistake and fix.

**This is a real risk worth carrying into slice implementation, not just
a spike artifact:** every Contents API call the app makes must pass
`branch` explicitly, with no code path that can omit it, since the
silent default-branch fallback means a bug here would write data
silently onto the app branch instead of the data branch. Worth an
explicit test case in slice 003+ (whichever slice first performs a
write) rather than trusting review alone to catch a missing parameter.

## Explicitly not tested (per scope)

Rate-limit burst behaviour and any UI — excluded by this slice's own
scope, unchanged.

## Bottom line

Every mechanism that could be tested under a single personal account
passed as designed: Contents API writes/reads, the 409/retry conflict
path, Compare API change detection, conditional GETs, the Git Data API,
and CSP enforcement via meta tag. The one true blocker (fork-sync) is a
structural fact about needing a second account/org, not a flaw in the
chosen approach — nothing here forces a rework of the sync or security
design. Slices 003 onward can proceed on the strength of these results,
with the branch-parameter discipline above carried forward explicitly.

---

# Slice 064 — GraphQL spike findings (6 Oct 2026)

Run with `scripts/spike-graphql.mjs` from a local machine, with the
fine-grained dev token (Contents read and write on this repository).
`data` was only read (head `88200eb` before and after). Every write went
to the throwaway branch `spike-graphql`, which was deleted at the end of
both runs (`DELETE` 204, absent from `git ls-remote` afterwards).

| Question | Result |
|---|---|
| Q1 CORS preflight for `/graphql`, Origin `https://jabopiti.github.io` | **Pass.** 204, `allow-origin: *`, allows `Authorization` and `Content-Type`; exposes `Retry-After` and all `X-RateLimit-*` headers. |
| Q2 fine-grained token on GraphQL | **Pass.** 200; separate `graphql` budget of 5000 points an hour; a query costs 1. |
| Q3 `createCommitOnBranch`: 2 adds + 1 delete in one commit | **Pass.** One commit (signed by GitHub, `VALID`); subject and `Entity:` trailers kept exactly; UTF-8 round trip exact; the file's Contents `sha` equals the locally computed git blob sha, so written files need no re-download; the deleted file is gone. |
| Q3b stale `expectedHeadOid` | **Pass.** HTTP 200 with `errors[0].type = "STALE_DATA"` and `data.createCommitOnBranch = null`, so a refusal is recognisable by `type`, not by HTTP status. |
| Q3c deleting a path that doesn't exist | HTTP 200, `errors[0].type = "NOT_FOUND"`: the whole commit is refused, not just that path. |
| Q4a listing root + `initiatives/` at one commit | One query, cost 1, ~0.6 s. |
| Q4b every data file in one aliased query | 9 files, cost 1, ~0.8 s; blob `oid` equals the REST Contents `sha`; text identical. |
| Q6 single large files | 1 MB and 5 MB commits succeed (1.8 s, 4.0 s). 20 MB: 504 after 11.3 s in the first run, 200 after 9.6 s in the second. 40 MB: 499. **Read side:** `Blob.text` is cut at 512,000 bytes (`isTruncated: true`) for any file larger than that. |
| Q6b 210 files, ~4 MB, one commit | **Pass** in the second run: 200 in 3.2 s, all 210 files in the tree. (First run: refused as `STALE_DATA` only because the 20 MB write before it had landed despite its 504. See below.) |
| Q5 budget used by the whole spike | 14 GraphQL points of 5000. |

## Route for slice 064 items 4 and 5: GraphQL

Q1, Q2, Q3 and Q6 all pass, so many-file commits (Reset, Load example data,
bootstrap, migrations) and multi-file user actions use one
`createCommitOnBranch` each. Single-file saves stay on the Contents API.

## What the implementation must take from this

- **A 5xx or timeout on a commit doesn't mean it failed.** The 504 on the
  20 MB write in run 1 had committed: the next commit, built on the old
  head, was refused as `STALE_DATA`. After a 5xx, a timeout or a network
  error on `createCommitOnBranch`, re-read the branch head before
  resending. If the head's commit carries the same subject and its tree
  holds the blob shas we computed, the commit landed; treat it as done.
- **Refusals arrive as HTTP 200.** Classify by `errors[].type`
  (`STALE_DATA` → re-list and resend or merge; `NOT_FOUND` on a deletion →
  re-list, since someone else already deleted it). Don't classify by
  status alone.
- **Keep commits well under ~10 MB.** The volume ceiling's whole dataset
  (~4 MB) fits in one commit with plenty of room.
- **For slice 065 (GraphQL reads):** a blob over 512,000 bytes comes back
  truncated. Any batch read must check `isTruncated` and fall back to
  REST Contents/blob reads for that file.
- **GitHub Enterprise:** GraphQL is at `https://<host>/api/graphql`, not
  under `apiBaseUrl` (`/api/v3`). Derive it (slice 064 spec change,
  §10.7).
