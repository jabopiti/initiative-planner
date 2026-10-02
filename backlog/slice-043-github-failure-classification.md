---
slice_id: "043"
title: "Classify GitHub failures correctly: rate-limit 403, 5xx, timeouts"
type: "capability"
status: "valid"
criteria_failures: []
depends_on: ["005j", "037"]
verification_status: null
superseded_by: null
supersedes: null
change_summary: "Added from the post-build review of the implementation against the spec (slices 001 to 041). Review finding: classifyStatus maps every 403 to access-denied, 5xx to unknown, and the client has no timeout."
recommended_model: "Claude Sonnet 5"
model_rationale: "Small, well-bounded changes in the client and error classifier; the care is in header and body handling and the retry matrix."
spec_sections: ["§3 Storage & sync (Sync failures)", "§10.3 Writing"]
---

# Classify GitHub failures correctly: rate-limit 403, 5xx, timeouts

## Intent

**Problem statement:** `classifyStatus` treats every 403 as "access denied",
so a secondary rate limit after a write burst tells the user to fix a token
that is fine and is never retried. A 5xx reads "GET x failed (503)" and the
writers never retry it, although the token check already treats 5xx as
unreachable. A hung request wedges the global write queue because the client
has no timeout.

**Outcome statement:** Each failure in the §3 Sync failures table reaches the
cause and message the spec names, and a hung request ends.

## Scope

- Classify from status, `x-ratelimit-remaining`, `retry-after` and the body: a
  403 or 429 with remaining 0, a `retry-after`, or a body naming a rate limit
  is `rate-limited`; any other 403 stays `access-denied`.
- 5xx and network failures are `unreachable` (the banner already exists for
  them), and join the writers' automatic retry causes.
- A request timeout (default 30 s, injectable) aborts the fetch and counts as
  `unreachable`; the write queue moves on.
- A 422 non-fast-forward on updateRef while bootstrapping an existing branch
  retries once, as `commitOnHead` does.

## Execution path

1. A burst of edits draws a secondary-limit 403.
2. The banner says GitHub is limiting requests; the writers retry on their
   own schedule; the token is not re-checked.

## Value

- **Desirable:** No false "token refused" during normal busy use.
- **Usable:** The banner names the real problem.
- **Valuable:** Writers recover without user action.

## Acceptance criteria

- [ ] Given a 403 with `x-ratelimit-remaining: 0`, a 403 with `retry-after`,
      and a 403 whose body says "rate limit", then each is `rate-limited`.
- [ ] Given a plain 403, then it is `access-denied`.
- [ ] Given 500, 502, 503 and a network error, then each is `unreachable` and
      auto-retried by writers.
- [ ] Given a fetch that never settles (fake clock), then it aborts at the
      timeout and the next queued write runs.
- [ ] Given the token check, then a rate-limited `/user` call does not read as
      unreachable.

## Delivery gate

- [ ] Deployed to production-equivalent environment

## Flags and compromises

None.

## Open decisions

- Timeout length (recommended 30 s; blobs for large files may need longer).
- Whether "unreachable" is auto-retried by writers with the 037 backoff or by
  the 30 s recovery loop only (recommended: the loop, as for rate limits).
