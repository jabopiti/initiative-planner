---
slice_id: "040"
title: "GitHub client edge cases: slashed branch names, large files, token check failures"
type: "bugfix"
status: "valid"
criteria_failures: []
depends_on: ["003"]
verification_status: null
superseded_by: null
supersedes: null
change_summary: "Promoted from the backlog tail (GitHub client edge cases), re-confirmed in the code while slicing: the ref lookup encodes '/' in a branch name as %2F, file reads rely on the Contents API's inline content (absent above 1 MB), and checkToken turns any failure into 'GitHub doesn't accept this token.'"
recommended_model: "Claude Sonnet 5"
model_rationale: "Three independent fixes in the client and token check, each reproducible with a fake fetch first; the large-file path needs the blob API and a size test."
spec_sections: ["§3 Storage & sync (Setup, Storage limits)", "§5.10 Connect screen", "§10.2 Data layout", "§10.3 Writing"]
---

# GitHub client edge cases: slashed branch names, large files, token check failures

## Intent

**Problem statement:** A deployment whose data branch is `planning/data` can't
start: the branch lookup sends `planning%2Fdata`, which GitHub doesn't find. A
dataset whose people file grows past 1 MB reads as empty. And on a flaky
connection, the Connect screen tells a user with a perfectly good token that
"GitHub doesn't accept this token."

**Outcome statement:** The client works with any valid branch name and any
file size the dataset can reach (§3 Storage limits), and the Connect screen
only rejects a token GitHub actually rejected.

## Scope

1. **Branch names with `/` (§10.2).** Ref URLs (`git/ref/heads/…`,
   `git/refs/heads/…`) encode each path segment, keeping `/` (like
   `encodePath`). `?ref=` query parameters stay fully encoded.
2. **Files over 1 MB (§3).** When the Contents API returns no inline content
   (size over 1 MB, `encoding: "none"`), read the file through the blob API by
   its sha (up to 100 MB) or the raw media type; the caller sees the same
   result either way.
3. **Token check (§5.10).** Only a 401 means "GitHub doesn't accept this
   token." A network failure or a 5xx reads: "Couldn't reach GitHub to check
   the token. Check your connection and try again." The token stays in the
   field and Check stays usable. The same distinction applies to the repo
   access step (a 5xx is not "can't see the repository").

## Execution path

1. Brand pack's data branch `planning/data`: the app opens normally.
2. `people.json` at 1.2 MB: people load.
3. Wi-Fi drops during Check: the new message shows; Check again works once
   back online.

## Value

- **Desirable:** Deployments choose their branch names; datasets grow.
- **Usable:** Correct messages lead to the right fix.
- **Valuable:** Removes three silent failure modes.

## Acceptance criteria

- [x] Given branch `planning/data` (fake fetch), then the ref URL is
      `…/git/ref/heads/planning/data`, and the update URL
      `…/git/refs/heads/planning/data`.
- [x] Given a Contents response for a 1.2 MB file without inline content, then
      the client fetches it by blob sha and returns its parsed content.
- [x] Given a 401 on the token check, then "GitHub doesn't accept this token."
- [x] Given a network error or a 502 on the token check, then "Couldn't reach
      GitHub to check the token. Check your connection and try again.", the
      token is kept in the field and Check is enabled.
- [x] Given a 5xx on the repo access step, then the same unreachable message,
      not "can't see the repository".

## Flags and compromises

None.

## Decided in review (pre-implementation)

- **Token check failure copy:** "Couldn't reach GitHub to check the token.
  Check your connection and try again."; only a 401 says the token isn't
  accepted.
- **Classification scope:** the 401-only rule and the new `unreachable`
  outcome are added in `validateToken.ts` only — the shared
  `classifyStatus`/`GithubApiError` cause bucketing other read/write paths
  rely on is untouched.
- **`unreachable` outcome colour:** `bg-warning-tint text-warning-text`,
  matching `ReadOnlyBanner.tsx`'s existing treatment of the same "GitHub
  unreachable" cause elsewhere in the app.
- **Large-file reads:** via the blob API (`GET git/blobs/{sha}`), not the
  raw media type — the client already talks to `git/blobs` for writes in
  `createFilesCommit`.
