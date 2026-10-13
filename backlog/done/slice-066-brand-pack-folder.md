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

- [x] Given `grep` for `src/brand/defaultBrand` and `brand/exampleDataset`,
      then no import remains outside the alias.
- [x] Given the unchanged pack content, then `npm run build`, the unit
      suite and `npm run test:e2e` pass with no behaviour change.
- [x] Given a fork that edits only files under `brand/`, then the build uses
      them (test with a temporary changed product name).
- [x] Given a missing font file in `brand/fonts`, then the build still fails.

## Flags and compromises

Logo and favicon (listed in §2) are deferred to slice 069.
`vite.config.ts` imports the pack by relative path (`./brand/brand`), the one import outside `@brand`. Criterion 3 was checked by building with a changed product name, but the built output was not searched for it.

## Decided in review (pre-implementation)

- Folder is root `brand/` (`brand.ts`, `exampleDataset.json`, `fonts/`), imported
  through the alias `@brand` (→ `brand/brand.ts`) in Vite, tsconfig and Vitest.
  `vite.config.ts` imports it by relative path, since aliases don't exist yet
  when the config loads.
- `brand/` ships filled with the default pack, so the repo stays deployable.
- Logo and favicon are not part of this slice: the app has none today and
  `BrandPack` has no field for them. They get their own slice (069).
- The export keeps the name `defaultBrandPack`.
