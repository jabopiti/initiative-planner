# Working notes for agents

## What this repository is

This is the **white-label core** of a single-user, offline initiative cost
estimator, built from the documents in this folder rather than from an
existing codebase: [SPEC.md](SPEC.md) (what/why), [DESIGN.md](DESIGN.md)
(how), and [PLAN.md](PLAN.md) (build order). There is no reference
implementation to copy from or compare against — these documents are the
authoritative source until code exists, at which point **the implementation
becomes authoritative** and these documents should be corrected if they
turn out to disagree with a deliberate implementation choice.

This repo never contains real branding, real master data, or a licensed
components. A user can fork and overlay those at build time. See
"Brand-pack contract" below. It's the one rule this entire repository
exists to protect.

## Non-negotiable constraints

- The shipped artifact is **one self-contained HTML file** with no runtime
  dependencies, no network calls, and no server.
- **Vanilla JavaScript only** — no UI framework, no state-management
  library, no CSS framework.
- Data lives in the browser's `localStorage`. JSON export/import is the
  only sharing and backup mechanism.
- Single-user. No authentication, multi-user editing, FX conversion, time
  tracking, or vacation modelling.

## Brand-pack contract

Exactly two source files and one CSS block are ever brand-specific:

- `src/masterData.js` — roles, countries, teams, and approval-track
  ("budget band") definitions. Ships with fictional placeholder values here.
- `src/terms.js` — user-facing gate display names. Ships with placeholder
  names here (e.g. "Gate 1"/"Gate 2").
- The `--brand*` and `--brand-font` custom properties in `src/styles.css`'s
  `:root`, plus an optional `@font-face` block. Ships with a generic
  placeholder color and no embedded font here.

Everything else — every render function, every calculation, every piece of
copy that isn't a gate name or a band name — must be brand-agnostic. Never
hardcode a brand string, color, or master-data value anywhere else. Route
gate display text through a single `gateTerm(code)`-style helper and band
abbreviations through a `BANDS[].abbr`-style field, exactly as described in
[DESIGN.md](DESIGN.md) — don't invent a second way to express the same
thing. There is no automated check for this; changes are reviewed manually.

## Product terminology

Use these terms consistently in user-facing text: **approval track**,
**stage**, **state**, **capacity %**, and **Estimate / Forecast / Actual**.
See [SPEC.md](SPEC.md) for their definitions.

## Commands

Once the project is scaffolded (see [PLAN.md](PLAN.md) Phase 0), these
commands must exist and behave as follows:

```text
npm run dev         # local dev server
npm run build       # -> initiative-cost-estimator.html (single file)
npm test             # engine + lifecycle unit tests, node:test
npm run typecheck   # tsc --noEmit over src/**/*.js (checkJs, not strict)
npm run lint         # eslint over src/
```

Serve the built file with `python3 -m http.server 8899` for manual browser
checks. UI changes require real browser verification; engine and lifecycle
regressions are covered by `npm test`.

## Invariants

These apply to any implementation built from this spec, regardless of the
order it's built in:

- Keep structural rendering separate from live recalculation. Keystrokes
  must not rebuild the active input or move focus.
- Numeric inputs are text inputs with `inputmode="numeric"`, not
  `type="number"` — caret handling depends on this.
- Escape every user-controlled value before interpolating it into
  `innerHTML`.
- Re-wire listeners whenever a replaced DOM region contains interactive
  elements. Global listeners (keyboard shortcuts, click-outside-to-close,
  scroll/resize handlers) are installed once, not from render functions.
- Table cells declare their own text color so theme changes repaint
  reliably, instead of relying on an ancestor's color cascading.
- Popovers and dropdown menus use fixed positioning computed from the
  trigger element's bounding rectangle, not CSS anchoring alone.
- Use design tokens (CSS custom properties) for color, spacing,
  typography, and radius — never a literal hex/px value in a rule. Corners
  are square except for explicitly circular elements (e.g. status dots).
- A module implementing the calculation engine must have **no side effects
  on import** (no DOM/`window` access at module scope) so it can be
  imported directly under `node:test` without a browser.

## Testing expectations

- Unit-test the calculation engine (working days, labour cost, phase/grand
  totals, approval-track resolution) against fictional fixture data.
- Integration-test the lifecycle (gate preconditions, passing a gate,
  locking, reopening, closing) by driving the real exported functions, not
  a duplicate implementation.
- UI/interaction correctness is verified manually in a real browser —
  there is no DOM testing framework in this project.

## Durable decisions

- The shipped artifact remains one self-contained HTML file.
- The data schema is versioned (`schemaVersion`). Imports with an unknown
  schema version are rejected; no migration path is maintained for
  unavailable legacy exports.
- Features outside [SPEC.md](SPEC.md)'s contract — variable monthly
  allocations, multi-team initiatives, scenario comparison, bulk actual
  entry, audit identity — are out of scope unless SPEC.md is updated first.
