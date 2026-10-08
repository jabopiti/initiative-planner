---
slice_id: "067"
title: "Brand pack build checks"
type: "capability"
status: "valid"
criteria_failures: []
depends_on: ["066"]
verification_status: null
superseded_by: null
supersedes: null
change_summary: "Added from the candidate audit. §10.7 lists build failures for overlapping approval bands, an incomplete process definition and a mismatched example dataset; the build checks only colours and typefaces."
recommended_model: "Claude Sonnet 5.5"
model_rationale: "Pure validation logic with clear table-driven tests."
spec_sections: ["§2 Brand pack", "§7.4 Approval tracks", "§10.7 Distribution, build and deploy", "§10.8"]
---

# Brand pack build checks

## Intent

**Problem statement:** A fork can deploy a pack with overlapping bands, a
half-defined phase or an example dataset for another process.

**Outcome statement:** The build fails with a message naming the problem.

## Scope

- A pack validator in `src/brand/`, run from the existing build plugin's
  `buildStart` next to the colour and font checks, reading the pack through
  slice 066's alias.
- Checks: approval bands overlap or leave a gap the spec forbids (§7.4);
  each phase and gate has id, label, description, icon (a name in the icon
  set), costed phases a default duration; gate checklist items have id, name,
  description; ids unique; example dataset's process identity and structure
  version equal the pack's.
- Messages name the entity and field, in the style of the colour check.

## Acceptance criteria

- [ ] Given each failure above in a fixture pack, then the validator reports
      it with entity and field (unit test per check).
- [ ] Given the default pack, then the validator passes and the build runs.
- [ ] Given an overlapping band in `brand/`, then `npm run build` exits
      non-zero and prints the message.

## Flags and compromises

None.

## Decided in review (pre-implementation)

- **Bands (§7.4):** only overlaps are forbidden; a gap resolves to "No approval
  track", so gaps are not reported. Bounds are lower-inclusive,
  upper-exclusive, so touching bands are fine. Also reported: a band whose
  lower bound is not below its upper bound, and duplicate band ids. Severity is
  not checked.
- **Example dataset:** it carries `processIdentity` (`id`, `structureVersion`)
  in `brand/exampleDataset.json` and the `ExampleDataset` type, and the build
  requires it to equal the pack's. The build also checks that every phase id
  (`phases` keys, `passedGates`), role abbreviation, country name and team key
  the dataset uses exists in the pack. `docs/spec.md` §2 says so.
- **Icons:** the allowed names are one exported list in `src/brand/types.ts`;
  `PhaseIconName` derives from it, and the validator checks against it.
- **Required fields:** an empty string is missing. A costed phase needs a
  default duration above 0. Phase, gate and checklist-item ids are unique
  across the whole pack.
- **Messages:** one `Brand pack:` error listing every problem, each naming the
  entity and field, e.g. `approvalTracks[standard] overlaps approvalTracks[elevated]`,
  `process[validation].exitGate.label is empty`.
