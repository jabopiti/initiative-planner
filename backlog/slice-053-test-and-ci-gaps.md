---
slice_id: "053"
title: "Close the §10.8 test and CI gaps"
type: "capability"
status: "valid"
criteria_failures: []
depends_on: ["037", "044"]
verification_status: null
superseded_by: null
supersedes: null
change_summary: "Added from the post-build review of the implementation against the spec (slices 001 to 041). Review: e2e flows, axe scans and CI steps §10.8 requires that do not exist; the CSP hard-codes the API host."
recommended_model: "Claude Sonnet 5"
model_rationale: "Writing tests and workflow steps against a clear checklist."
spec_sections: ["§10.8 Testing", "§10.9 Security", "§10.1 Framework and UI foundations", "§9.5 Accessibility", "§3 Storage & sync (Storage limits)"]
---

# Close the §10.8 test and CI gaps

## Intent

**Problem statement:** §10.8 requires e2e flows for passing a gate, a
same-field conflict and read-only mode; none exists (connect, planning, CSP,
a11y only). AGENTS.md says a new screen gets an axe scan: the person panel,
new-initiative draft, search overlay, populated initiative page, capacity
grid, banners, frozen strip, Cancelled/Closed pages, the unlocked Countries
section and open menus are unscanned. There is no size test at the volume
ceiling (200 initiatives, 200 people, 25 teams, within half the smallest
quota), no check that the build output has no inline script, `eval` or
third-party origin, and CI lacks the SBOM, licence, static-analysis and
secret-scan steps. The CSP hard-codes `https://api.github.com`, so a fork on
GitHub Enterprise (brand pack `apiBaseUrl`) would have every call blocked.

**Outcome statement:** The checks §10.8 names exist and run in CI, and the CSP
follows the brand pack's API host.

## Scope

- E2E: pass a gate; same-field conflict; read-only (token refused).
- Axe scans for the unscanned screens and states above.
- Volume-ceiling test; build-output scan; tests that the token never reaches
  console or errors and that outbound requests go only to the configured host.
- `csp-meta-tag` derives `connect-src` from the brand pack's `apiBaseUrl`.
- CI: SBOM, licence check, CodeQL, secret scan, weekly scheduled security run
  (§10.8), actions pinned.

## Acceptance criteria

- [ ] Given CI, then each §10.8 item above runs, and fails on a violation.
- [ ] Given `apiBaseUrl` set to another host, then the built CSP allows that
      host and not `api.github.com`.
- [ ] Given a generated max-size dataset, then it is at most half the smallest
      quota.
- [ ] Given each new axe scan, then no violations.

## Flags and compromises

None.

## Open decisions

- Which scanners (CodeQL, gitleaks or similar, a licence checker); recommended:
  CodeQL, gitleaks, `license-checker`, CycloneDX for the SBOM.
