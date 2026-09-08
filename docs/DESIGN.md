# DESIGN: Initiative Cost Estimator (white-label core)

This document defines **how** to build what [SPEC.md](SPEC.md) describes:
tech stack, data model, module boundaries, and the brand-pack contract.
It does not prescribe exact markup or CSS — those are implementation
choices, guided by the invariants in [AGENTS.md](AGENTS.md).

## 1. Tech stack & constraints

- **Vanilla JavaScript** (ES modules), no UI framework, no CSS framework,
  no runtime dependencies. `checkJs`/`allowJs` TypeScript (`strict:
  false`) for lightweight type-checking without a compile step.
- **Vite** for dev server and bundling, with a single-file plugin (e.g.
  `vite-plugin-singlefile`) so the production build inlines all JS/CSS
  into one `<script>`/`<style>` block in `index.html` — the shipped
  artifact must be exactly one HTML file with no other assets.
- Build the app into a temporary output directory, then move/rename the
  single produced HTML file to the repo's shipped filename and remove the
  temporary directory — never build directly over the source `index.html`.
- **ESLint** (flat config) with `no-unused-vars` at minimum; **`node:test`**
  (Node's built-in test runner) for unit/integration tests — no external
  test framework needed for this project's size.

## 2. Data model

```text
APP = {
  schemaVersion: <int>,
  GENERAL: { currency, lastExportAt, exportReminderDays },
  ROLES: { [roleId]: { id, name, abbr, factor, active } },
  COUNTRIES: {
    [countryId]: {
      id, name, rate, active,
      workingDayReduction: { [year]: [12 numbers, one per month] }
    }
  },
  TEAMS: {
    [teamId]: {
      id, name, active,
      members: [
        { id, label, role: roleId, country: countryId, capacityPct, active, autoLabel }
      ]
    }
  },
  BANDS: [
    { id, name, abbr, lower, upper /* or null for no upper limit */, req, severity }
  ],
  INITIATIVES: [
    {
      id, name, description, teamId, stage, state, notes,
      validation: <Phase>, development: <Phase>,
      gateAApproval: <Approval|null>, gateBApproval: <Approval|null>
      // field names are internal identifiers, not display text -- see
      // "Gate identifiers vs display names" below
    }
  ]
}

Phase = {
  estStartDate, estEndDate,              // ISO date strings or null
  allocations: [{ memberId, capacityPct }],
  otherCosts: [{ id, name, month /* YYYY-MM */, amount }],
  actualStartDate, actualEndDate,         // ISO date strings or null
  actualMonths: { [YYYY-MM]: number },
  frozen: null | { estimatedPhaseCost, estLabourTotal, estOtherTotal,
                   perMonth, period, rolesCopy, countriesCopy },
  backfilled: boolean
}

Approval = { takenAt, grandTotal, band /* band name at approval time */,
             validationCost, developmentCost }
```

Working-day reduction tables are a **rolling three-year window** (current
year plus the next two), recomputed on every load so there's never a year
to remember to add. A month outside the tracked window clamps to the
nearest tracked year's row rather than defaulting to zero.

### Gate identifiers vs. display names

Internally, the two gates are addressed by fixed codes (this document uses
`GATE_A`/`GATE_B` as an arbitrary placeholder naming; a real build may
choose any internal identifier, as long as it isn't a real gate name) used
as: the two `Approval` field names on an
initiative, the parameter value threaded through gate-related functions,
and part of internal function names. **These internal codes never change
and are never shown to a user.** Every place gate text is actually
*displayed*, it must go through one small lookup (e.g. a `gateTerm(code)`
function reading from the brand pack's terms module) — never a literal
string. This split is what makes the gate names brand-pack content (see
§4) without touching the data schema.

## 3. Persistence & schema versioning

- The entire `APP` object is the unit of persistence: serialized to
  `localStorage` under one versioned key, debounced (e.g. ~200ms after the
  last change) rather than saved synchronously on every keystroke.
- On load: missing or unparsable storage falls back to seed data; a
  stored `schemaVersion` that doesn't match the current version also
  falls back to seed data (no migration).
- Export produces the entire `APP` object as pretty-printed JSON, named
  with today's date. Import validates required top-level keys and the
  schema version *before* offering a Replace-all/Merge choice, and shows a
  diff summary (added/changed/removed per entity type) plus which
  approval records a Merge would overwrite.

## 4. Module boundaries & the brand-pack contract

Three things are ever brand-specific; everything else must not depend on
their concrete values, only on their shape:

1. **`src/masterData.js`** exports a factory (e.g. `createMasterData(currencyDefault)`)
   returning a **freshly-constructed** `{ ROLES, COUNTRIES, TEAMS, BANDS, GENERAL }`
   object every call (never a shared mutable module-level constant — repeated
   seeding, e.g. across tests, must not leak mutations between calls).
2. **`src/terms.js`** exports the gate display names (e.g.
   `TERMS.gate.validation` / `TERMS.gate.development`), consumed only
   through the `gateTerm()`-style helper described in §2.
3. **CSS custom properties** in `src/styles.css`'s `:root` — a `--brand`
   family of colors and a `--brand-font` variable that a font-embedding
   `@font-face` block (if any) feeds into. Every other rule in the
   stylesheet reads colors/fonts through these properties, never a literal
   value, so re-theming never requires touching any rule but these.
   `--font-ui`/`--font-cond`-style properties should read
   `var(--brand-font, <generic fallback stack>)` so that omitting
   `--brand-font` entirely (the white-label default) still produces a
   fully valid, sensible font stack with no embedded font.

Mark each brand-pack file with a short header comment stating its
"contract version" — a number bumped whenever the *shape* changes, so a
downstream brand build can detect drift instead of silently applying
stale data.

The engine and every render function must be fully agnostic to the actual
values these three provide: no string comparisons against real names, no
assumptions about how many roles/countries/teams/bands exist beyond what
the shape guarantees (at least one of each, generally).

## 5. Rendering architecture

- One `render()` function dispatches on a small piece of view state (the
  current "page" plus its params) and swaps the contents of one root
  element — there is no client-side router library, just a state variable
  and a `navigate(page, params)` helper that updates it and re-renders.
- **Structural rendering is separate from live recalculation.** Typing
  into a field that only affects computed numbers elsewhere (e.g. an
  allocation percentage) must update just those computed numbers in place
  — never rebuild the input the user is actively typing into or move
  focus/caret. Only a structural change (adding/removing a row, changing
  which fields are visible) rebuilds a region.
- Global listeners (click-outside-to-close for popovers/menus, Escape to
  close, scroll/resize handlers, keyboard navigation within a table) are
  installed exactly once, using event delegation on `document`/`window`
  looked up fresh at event time — never re-attached per render. Anything
  scoped to a specific rendered region (a button's `onclick`, an input's
  `oninput`) must be re-wired every time that region is replaced.
- Popovers and dropdown menus compute a fixed position from their trigger
  element's bounding rectangle at open time (and on scroll/resize), rather
  than relying on CSS containment/anchoring alone.

## 6. File/folder layout

```text
src/
  app.js         -- data model, calculation engine, lifecycle functions,
                    all render/wire functions (single module is fine at
                    this project's size; split further only if it grows
                    unwieldy)
  main.js        -- bootstrap: theme toggle, top-level event wiring,
                    initial load + render
  masterData.js  -- brand pack: master data factory (placeholder values)
  terms.js       -- brand pack: gate display names (placeholder values)
  styles.css     -- all styling, brand tokens isolated per §4
index.html       -- shell markup (nav, containers), no inline brand content
vite.config.js
tsconfig.json
eslint.config.js
package.json
test/
  *.test.mjs     -- node:test files
examples/exports/  -- fictional demo JSON export(s) + a short README
```

## 7. Testing strategy

- **Engine unit tests**: pure functions (working days, labour cost,
  phase/grand totals, approval-track resolution, HTML-escaping) against
  fictional fixture data seeded via the masterData factory.
- **Lifecycle integration tests**: build a minimal initiative through the
  real exported functions (create team/member, set phase periods and
  allocations, pass gates, close, reopen, duplicate) and assert on the
  resulting numbers/state — not a parallel reimplementation of the logic
  being tested.
- Tests must never hardcode a specific master-data value (a team name, a
  role id) beyond what the shape guarantees — look values up dynamically
  (e.g. `Object.keys(APP.ROLES)[0]`) so the same tests work unchanged
  against any brand pack.
- UI/interaction correctness has no automated coverage — verify manually
  in a real browser per screen, using the fictional demo export
  (`examples/exports/`) to populate realistic-looking data quickly.
