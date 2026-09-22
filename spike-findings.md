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
