---
slice_id: "066"
title: "Brand pack in its own folder"
type: "capability"
status: "valid"
criteria_failures: []
depends_on: []
verification_status: null
superseded_by: null
supersedes: null
change_summary: "Added from the candidate audit of spec vs code. §2 and §10.7 say a fork edits only the brand-pack folder; the pack is still one file inside core `src/brand/` (README: 'planned')."
recommended_model: "Claude Sonnet 5.5"
model_rationale: "Mechanical move plus one alias; wide import churn, little logic."
spec_sections: ["§2 Brand pack", "§10.7 Distribution, build and deploy"]
---

# Brand pack in its own folder

## Intent

**Problem statement:** The fork-sync promise (§10.7) holds only if the pack
is the sole local change, but the pack shares `src/brand/` with core code.

**Outcome statement:** The pack lives in one folder a fork overwrites; core
imports it through a single path.

## Scope

- Move the fork-owned files to a root `brand/` folder: the pack config (from
  `defaultBrand.ts`), `exampleDataset.json`, `fonts/`.
- Core stays in `src/brand/` (`types.ts`, `contrast.ts`, `coloursCss.ts`,
  `csp.ts`, `brandColoursPlugin.ts` and tests).
- One import alias for the pack, resolved in `vite.config.ts`, `tsconfig` and
  Vitest; replace every direct `defaultBrand` import.
- The build plugin reads fonts and colours from `brand/`.
- Update the README line 94 and AGENTS.md "Do not touch" wording.

## Acceptance criteria

- [ ] Given `grep` for `src/brand/defaultBrand` and `brand/exampleDataset`,
      then no import remains outside the alias.
- [ ] Given the unchanged pack content, then `npm run build`, the unit
      suite and `npm run test:e2e` pass with no behaviour change.
- [ ] Given a fork that edits only files under `brand/`, then the build uses
      them (test with a temporary changed product name).
- [ ] Given a missing font file in `brand/fonts`, then the build still fails.

## Flags and compromises

None.

## Decided in review (pre-implementation)

Open, to settle in review:
- Folder name and place: root `brand/` (recommended) or other.
- Ship `brand/` filled with the default pack (recommended, keeps the repo
  deployable) or as a copy-on-setup example.
- Logo and favicon as pack assets now (§2 lists them): what the app uses
  today decides.
