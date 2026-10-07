---
slice_id: "068"
title: "CodeQL and WCAG 2.2 scans"
type: "capability"
status: "valid"
criteria_failures: []
depends_on: []
verification_status: null
superseded_by: null
supersedes: null
change_summary: "Added from the candidate audit. §10.8 asks for static security analysis (none in .github/workflows); §9.5 says WCAG 2.2 AA but a11y scans use 2.0/2.1 tags only. Two small CI-hygiene items merged into one slice."
recommended_model: "Claude Sonnet 5.5"
model_rationale: "Config plus fixing whatever the 2.2 scan finds."
spec_sections: ["§9.5 Accessibility", "§10.8"]
---

# CodeQL and WCAG 2.2 scans

## Intent

**Problem statement:** Two CI promises in the spec are not enforced.

**Outcome statement:** CodeQL runs on pushes, PRs and weekly; the axe scans
check WCAG 2.2 AA.

## Scope

- `.github/workflows/codeql.yml` for JavaScript/TypeScript, actions pinned
  as the other workflows are.
- Add the `wcag22aa` tag in `e2e/a11y.spec.ts`; fix violations on each screen
  (target size, focus appearance and similar). AGENTS.md and comments say
  "WCAG 2.2 A/AA".

## Acceptance criteria

- [ ] Given a push or PR, then the CodeQL workflow runs and passes.
- [x] Given `npm run test:e2e`, then every screen's scan includes
      `wcag22aa` and passes.
- [x] Given a 2.2 violation that cannot be fixed cheaply, then it is listed
      here under Flags, not silenced.

## Flags and compromises

None. The CodeQL run itself (criterion 1) can only be confirmed on the first push or PR.

## Decided in review (pre-implementation)

- CodeQL only reports (Security tab and PR check); it is not a required status
  check. Gating is a branch-protection setting and can be switched on later
  without changing the workflow.
- The workflow runs on push to `main`, on PRs and weekly, scans
  `javascript-typescript` with the default queries and has least-privilege
  permissions.
- The 2.2 scan (`target-size`, the only `wcag22aa` rule in axe 4.13) passes on
  every screen today, so no copy or layout changes. Focus appearance and
  dragging alternatives are not covered by axe and stay manual checks.
