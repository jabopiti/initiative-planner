---
slice_id: "002"
title: "GitHub round-trip technical spike"
type: "spike"
status: "valid"
criteria_failures: []
depends_on: []
verification_status: null
superseded_by: null
supersedes: null
change_summary: null
recommended_model: "Claude Opus 5"
model_rationale: "The highest-uncertainty item in the whole backlog: real external API behaviour, auth edge cases, and a security control (CSP) that is hard to verify by simple tests. Worth the strongest available reasoning; do not downgrade even for token cost."
spec_sections: ["§2 Hosting & technology, Brand pack (GitHub location)", "§3 Storage & sync (Authentication, Sync failures, Damaged data, Versioning and migration)", "§10.1 Framework and UI foundations (CSP)", "§10.2 Data layout", "§10.3 Writing", "§10.5 Merging", "§10.7 Distribution, build and deploy"]
---

# GitHub round-trip technical spike

## Intent

**Problem statement:** The delivery team cannot safely commit to building
slices 003 onward when the core technical mechanisms — a fine-grained
GitHub token authenticating against the Contents/Compare/Git-data APIs,
the fork-sync update flow, and a meta-tag content security policy — are
unverified against the real, already-set-up repository, because a wrong
assumption in any of them (§3, §10) would force a rework of the sync and
security design mid-build.

**Outcome statement:** This slice contributes to a low-risk build by
proving, with real throwaway code against the real repository, that the
chosen GitHub-as-backend approach works end-to-end before any user-facing
feature is built on top of it.

## Scope

- First step: confirm the GitHub plan tier (Free / Team / Enterprise) for
  the account or organization hosting the fork, and note whether it
  supports private Pages and branch protection — both assumed by the
  fork-based setup in §3/§10.7. If the plan doesn't support them, this is
  reported as a finding, not silently worked around.
- Branch names: app branch `main`, data branch `data` (example-data.md).
- A fine-grained personal access token is created and used to read the
  repository's file list and the branch head (Compare API).
- One JSON file is written to the data branch via the Contents API, read
  back, and a deliberately stale write is forced to produce a 409, proving
  the re-read/re-merge/retry path in §10.3 is viable.
- The fork-sync flow is exercised once: a brand-pack-only change is made
  in the fork, and GitHub's sync is confirmed to fast-forward cleanly
  (§10.7).
- A page is served with the CSP as a `<meta>` tag (not a header, since
  GitHub Pages doesn't support custom headers) and confirmed to actually
  block an inline script, proving the policy is enforced despite the
  delivery limitation noted in §10.1.
- Findings are written to a short `spike-findings.md`: what worked, what
  didn't, and any spec section that needs correcting as a result.

**Explicitly excluded:** Any UI, any user-facing screen, and any
performance/rate-limit load testing — this slice proves the mechanisms
work at all, not at scale; a rate-limit burst test is a later, separate
concern if it becomes necessary.

## Execution path

1. Delivery team triggers: runs a small script against the real,
   already-configured repository using a freshly created token.
2. GitHub: the token authenticates, lists files, reads the branch head,
   accepts a write, rejects a stale write with 409.
3. GitHub: fork-sync is triggered and fast-forwards with no conflict.
4. Browser: a minimal page with the meta-tag CSP refuses to execute an
   injected inline script.
5. Delivery team receives: `spike-findings.md`, confirming each mechanism
   works or naming exactly what doesn't and what in the spec must change.

## Value

- **Desirable:** The delivery team would seek this before writing any
  feature code that depends on sync, since discovering a broken
  assumption after slices 003–011 are built would be far more expensive.
- **Usable:** The delivery team can read `spike-findings.md` and know,
  without re-running anything themselves, whether it's safe to proceed.
- **Valuable:** After this slice, every later slice's sync-dependent
  acceptance criteria rest on a proven mechanism rather than an assumption
  — removing the single largest technical risk in the backlog.

## Acceptance criteria

- [ ] Given the GitHub plan tier is checked, when private Pages or branch
      protection is unavailable on it, then this is recorded as a finding
      in `spike-findings.md` before proceeding.
- [ ] Given a fine-grained token scoped to the repository, when a file is
      written via the Contents API, then it appears in the repository and
      can be read back with the same content.
- [ ] Given a write made against a stale file version, when it is
      submitted, then GitHub returns 409 and the re-read/retry path
      successfully lands the change afterward.
- [ ] Given a brand-pack-only change in the fork, when fork-sync runs,
      then it fast-forwards with no conflict.
- [ ] Given the meta-tag CSP is applied, when an inline script is present
      on the page, then the browser refuses to execute it.
- [ ] Given any of the above fails, then `spike-findings.md` names the
      specific spec section affected and the change needed.

## Delivery gate

- [ ] Deployed to production-equivalent environment

## Flags and compromises

None. This slice is an enabling investigation rather than a strict
capability slice — see the overview's Limitations section for why it is
included in this form.
