---
slice_id: "069"
title: "Brand pack logo and favicon"
type: "capability"
status: "valid"
criteria_failures: []
depends_on: ["066"]
verification_status: null
superseded_by: null
supersedes: null
change_summary: "Split out of slice 066: §2 lists logo, favicon and page title as brand-pack branding, but the app has no logo or favicon and BrandPack has no field for them."
recommended_model: "Claude Sonnet 5.5"
model_rationale: "A type field, two asset files and a few places that show them."
spec_sections: ["§2 Brand pack", "§9.1", "§10.9"]
---

# Brand pack logo and favicon

## Intent

**Problem statement:** §2 says the pack carries a logo, favicon and page
title, so a fork can brand the build with files in `brand/` alone. Today the
app shows neither a logo nor a favicon.

**Outcome statement:** The pack names a logo and a favicon in `brand/`; the app
shows the logo where the product name appears and serves the favicon.

## Scope

- `BrandPack` gains logo and favicon fields; default assets in `brand/`.
- The build copies them as hashed assets (no third-party fetch, strict CSP).
- Where the logo appears, the favicon link in `index.html`, and the page
  title coming from the pack.

## Acceptance criteria

- [ ] Given a pack with a logo and favicon, then the build serves both and the
      page title is the pack's.
- [ ] Given a missing logo or favicon file, then the build fails naming it.
- [ ] Given the logo, then it is decorative (empty alt) beside the visible
      product name, which is its text alternative, and passes the axe scans.
- [ ] Given the strict CSP, then `npm run test:e2e` reports no violation.

## Flags and compromises

None.

## Decided in review (pre-implementation)

- Logo shows in the top bar (22px high, beside the product name, replacing
  the hardcoded `LogoMark`) and above the Connect heading (36px). Width auto.
- One logo file for both themes; the default asset is a mid-tone that reads on
  light and dark surfaces. No dark variant.
- `BrandPack` gains `logo: { path }`, `favicon: { path }` and `pageTitle`
  (default "Initiative Planner"), separate from `productName`, as §2 lists it.
  Paths are relative to `brand/`, like the font paths.
- The logo is decorative (`alt=""`): the product name beside it is its text
  alternative, so screen readers don't read the name twice.
- The build plugin emits both files as hashed assets and injects the favicon
  link and `<title>` (dev and build); a missing file fails the build with the
  existing `Brand pack:` error. Accepted types: svg, png, ico, webp.
- Defaults: the current four-square mark as `brand/logo.svg` and
  `brand/favicon.svg`.
