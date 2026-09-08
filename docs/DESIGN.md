# DESIGN: Initiative Planner (white-label core)

This document defines **how** to build what [SPEC.md](SPEC.md) describes:
tech stack, data model, module boundaries, and the brand-pack contract.
It does not prescribe exact markup or CSS — those are implementation
choices, guided by the invariants in [AGENTS.md](../AGENTS.md).

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

  PROCESS: {
    // Fixed ids, editable labels -- see "Stage identifiers vs display
    // names" below. `stages` is ordered and sits between development
    // and closed; it may be empty.
    draft:       { label },
    validation:  { label, gateLabel },
    development: { label, gateLabel },
    stages:      [ { id, label } ],
    closed:      { label }
  },

  ROLES: { [roleId]: { id, name, abbr, factor, active } },
  //  A role carries no rate. The rate comes from the person's country.

  COUNTRIES: {
    [countryId]: {
      id, name, active,
      byYear: {
        [year]: { rate, workingDayReduction: [12 numbers, one per month] }
      }
    }
  },

  PEOPLE: {
    [personId]: {
      id, name, active, countryId, capacityPct,
      roleId:     <roleId|null>,   // exactly one of roleId / customRole
      customRole: null | { label, byYear: { [year]: rate } },
      memberships: [ { teamId, sharePct, active } ]
      // capacityPct  -- ceiling on total concurrent commitment (0-100).
      //                 Never an allocation.
      // sharePct     -- how much of that ceiling one team holds. Active
      //                 shares should sum to <= capacityPct; over that
      //                 warns, never blocks.
    }
  },

  TEAMS: { [teamId]: { id, name, active } },
  //  A team owns no people. Its roster is every person with a
  //  membership pointing here.

  BANDS: [
    { id, name, abbr, lower, upper /* or null = no upper limit */, req,
      severity /* integer rank, higher = stricter -- see below */ }
  ],

  INITIATIVES: [
    {
      id, name, description, teamId, stage, state,
      notes,          // free-text, user-facing only; never parsed or costed
      validation: <Phase>, development: <Phase>,
      gateAApproval: <Approval|null>, gateBApproval: <Approval|null>,
      stageHistory: { [stageId]: <ISO date> }
      // stage        -- "draft" | "validation" | "development"
      //                 | <status stage id> | "closed"
      // stageHistory -- status stages only. A phase's date lives on its
      //                 approval; never record it twice.
    }
  ]
}

Phase = {
  estStartDate, estEndDate,              // ISO date strings or null
  allocations: [{ personId, allocationPct }],
  otherCosts: [{ id, name, month /* YYYY-MM */, amount }],
  actualStartDate, actualEndDate,         // ISO date strings or null
  actualMonths: { [YYYY-MM]: number },
  frozen: null | { estimatedPhaseCost, estLabourTotal, estOtherTotal,
                   perMonth, period, rolesCopy, countriesCopy,
                   peopleCopy },
  backfilled: boolean
}

Approval = { takenAt, grandTotal,
             band: { id, name, abbr, severity },  // snapshot -- see below
             validationCost, developmentCost }
```

Only `validation` and `development` are `Phase` objects. Status stages
hold no data beyond their entry date in `stageHistory` — there is no
third phase shape, and adding one would contradict SPEC §1.

A frozen phase snapshots `peopleCopy` alongside `rolesCopy` and
`countriesCopy`, because a person's custom rate is as capable of moving
an approved figure as a country rate is.

Per-year records — country `byYear` and a person's `customRole.byYear` —
cover a **rolling four-year window**: the previous year, the current year,
and the next two, recomputed on every load so there's never a year to
remember to add. The previous year is included because backfilling an
initiative that started before the tool was adopted (SPEC §3) is a
first-class flow, and clamping those months to a different year's rate or
holidays would misstate already-spent money. A month outside the tracked
window clamps to the nearest tracked year's record rather than defaulting
to zero. Rolling the window forward never discards a year that any
initiative's costed months still reference.

### Rate resolution

One function resolves the pair `(dayRate, factor)` for a person in a given
month, and every cost path calls it — there is no second place where a
rate is derived:

```text
y = year(month)
if person.customRole:  rate = customRole.byYear[y]        , factor = 1
else:                  rate = COUNTRIES[countryId].byYear[y].rate
                       factor = ROLES[roleId].factor
```

Working days always come from `COUNTRIES[person.countryId].byYear[y]`,
custom rate or not. Both lookups clamp to the nearest tracked year by the
same rule.

### Capacity, shares and allocations

Three percentages exist and are never interchangeable. `capacityPct`
lives on the person and bounds them globally. `sharePct` lives on a
membership and says how much of that person one team holds. And
`allocationPct` lives on a phase allocation, always expressed as a
percentage of full-time capacity — never of the share.

That last point is what keeps the arithmetic simple: a team's
non-initiative work is `max(0, sharePct - allocatedPct)` using figures on
the same scale, and because each team subtracts from its own share, a
person split across teams is never counted twice. Both ceilings warn and
neither blocks (SPEC §5.2).

Membership also gates allocation: only a person with an active membership
in an initiative's team may be added to its phases. A membership
deactivated later leaves existing allocations in place and still costing,
so the allocation lookup must tolerate a `personId` whose membership is
gone, and surface it rather than dropping the row.

### Band severity and approval snapshots

`severity` is an **integer rank**: higher means stricter oversight. It is
ordered independently of the monetary bounds, so a band can be cheap and
still demand heavy approval. Comparing two bands means comparing this
integer and nothing else — never a name, an abbreviation, or a bound.

Because bands are freely editable and deletable at any time (SPEC §7.7),
an `Approval` **snapshots** the resolved band (`id`, `name`, `abbr`,
`severity`) at the moment the gate is passed rather than storing a
reference. The escalation/de-escalation comparison in SPEC §7.5 reads the
snapshot's `severity` against the live resolution's, so it stays correct
after a band is renamed, re-bounded, or removed. Resolve the snapshot's
`id` back to a live band only to link to it; never to re-derive severity.

### Stage identifiers vs. display names

Every stage has a **fixed internal id** and a **user-editable label**, and
the two must never be confused. The ids of the four permanent stages —
`draft`, `validation`, `development`, `closed` — are wired into the
schema: they are `INITIATIVE.stage` values, the `Phase` field names, the
parameter threaded through gate-related functions, and part of internal
function names. Status-stage ids are generated once at creation and are
equally immutable thereafter. **No id is ever shown to a user, and no id
ever changes — including when its label is renamed.**

Every place stage or gate text is *displayed* goes through one small
lookup (a `stageTerm(id)` / `gateTerm(phaseId)`-style helper reading
`APP.PROCESS`) — never a literal string, and never the id itself. Sorting
and progression always work on the configured order, never on label text.

This split is what lets stage names be freely renamed without touching
the data schema, and what lets the brand pack ship a default vocabulary
(§4) without owning it. Labels are ordinary user data seeded by
`masterData.js`; there is no separate terms module.

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

**Two** things are ever brand-specific; everything else must not depend on
their concrete values, only on their shape:

1. **`src/masterData.js`** exports a factory (e.g.
   `createMasterData(currencyDefault)`) returning a
   **freshly-constructed** seed object every call — never a shared
   mutable module-level constant, since repeated seeding (across tests,
   say) must not leak mutations between calls. It supplies
   `{ PROCESS, ROLES, COUNTRIES, PEOPLE, TEAMS, BANDS, GENERAL }`.

   `PROCESS` is seeded here rather than hardcoded because stage and gate
   labels are brand-specific — but once seeded they are ordinary user
   data, editable in Settings like any other master data. The brand pack
   supplies a *starting point*, not a fixed vocabulary.
2. **CSS custom properties** in `src/styles.css`'s `:root` — a `--brand`
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
values these two provide: no string comparisons against real names, no
assumptions about how many roles, countries, teams, people, bands or
stages exist beyond what the shape guarantees. Stage *ids* are the one
exception — `draft`, `validation`, `development` and `closed` are schema,
not brand content, and may be compared directly (§2).

## 5. Rendering architecture

### Page vocabulary

Use these five words for pages, in code and in prose, and don't invent
synonyms — "screen", "view" and "tab" all mean one of these:

| Kind | What it is | Examples |
|---|---|---|
| **Overview** | lists one entity type | Initiatives, Teams, People |
| **Detail** | one instance of that entity | one team, one person |
| **Dashboard** | read-only, cross-entity | Portfolio |
| **Settings** | configuration, split into **sections** | Roles, Process, Data |
| **Flow** | a resumable multi-step task | the creation wizard |

Below a page sit **panels** (the band panel, a phase panel), and below
those, **regions** — the unit of structural rebuild defined at the end of
this section. Page → panel → region is the whole hierarchy.

### Dispatch

- One `render()` function dispatches on a small piece of view state (the
  current page plus its params) and swaps the contents of one root
  element — there is no client-side router library, just a state variable
  and a `navigate(page, params)` helper that updates it and re-renders.
  An overview is `navigate('people')`; its detail is
  `navigate('person', { id })`.
- A region is the unit of structural rebuild: a render function owns one
  container and replaces its contents wholesale. Anything finer-grained
  than a region — a recalculated total, a warning badge that appears —
  is written into an existing node in place.

The interaction invariants in [AGENTS.md](../AGENTS.md) ("Invariants")
are **normative and are not restated here**; this section describes only
the structure they operate within. Two mechanism notes that follow from
them:

- Global listeners use event delegation on `document`/`window`, resolving
  their target fresh at event time, so a replaced region needs no
  re-binding of them.
- Popover/menu positions are computed at open time and recomputed on
  scroll and resize, since a fixed-positioned element does not follow its
  trigger on its own.

## 6. File/folder layout

```text
src/
  engine.js      -- calendar maths, rate resolution, cost, approval-track
                    resolution, capacity, stage progression. Pure, and with
                    no side effects on import, so node:test imports it
                    directly (AGENTS.md).
  lifecycle.js   -- initiative creation, phase edits, gates, stage
                    transitions, close/reopen/duplicate. Pure, like the
                    engine.
  transfer.js    -- export/import shaping: serialise, validate, diff,
                    merge. Pure.
  store.js       -- the only module reaching outside itself: localStorage
                    and handing the user a file. Deliberately thin, with
                    every decision delegated to the pure modules.
  app.js         -- render/wire functions (one module is fine at this
                    size; split further only if it grows unwieldy)
  main.js        -- bootstrap: theme toggle, top-level event wiring,
                    initial load + render
  masterData.js  -- brand pack: seed data factory (placeholder values),
                    including the default PROCESS labels
  styles.css     -- all styling, brand tokens isolated per §4
index.html       -- shell markup (nav, containers), no inline brand content
scripts/
  bundle.mjs     -- moves the built file to the shipped filename (§1)
vite.config.js
tsconfig.json
eslint.config.js
package.json
test/
  *.test.mjs     -- node:test files
examples/exports/  -- fictional demo JSON export(s) + a short README
```

`engine.js`, `lifecycle.js` and `transfer.js` are kept apart from `app.js`
for one reason: they carry a hard constraint — importable under Node with
no DOM — and mixing them into render code makes that constraint easy to
break by accident. `store.js` is the deliberate boundary where that
constraint ends; keeping it thin is what keeps the rules above it
testable. A test asserts `engine.js` never names `document`, `window` or
`localStorage`.

## 7. Testing strategy

- **Engine unit tests**: pure functions (working days, rate resolution,
  labour cost, phase/grand totals, approval-track resolution,
  HTML-escaping) against fictional fixture data seeded via the masterData
  factory. Rate resolution needs its own cases: a standard role against a
  country whose rate differs year to year, a custom-rate person (the role
  factor must not apply, and working days must still come from their
  country), and both clamping outside the four-year window.
- **Capacity tests**: a person split across two teams must produce
  non-initiative work in each that sums to their unallocated capacity and
  no more — the double-counting this model exists to prevent. Cover an
  allocation surviving a deactivated membership too.
- **Lifecycle integration tests**: build a minimal initiative through the
  real exported functions (create team and person, add a membership, set
  phase periods and allocations, pass gates, advance status stages,
  close, reopen, duplicate) and assert on the resulting numbers/state —
  not a parallel reimplementation of the logic being tested. Include both
  a process with zero status stages and one with several, so the
  progression is never assumed to have a fixed length.
- Tests must never hardcode a specific master-data value (a team name, a
  role id, a stage label) beyond what the shape guarantees — look values
  up dynamically (e.g. `Object.keys(APP.ROLES)[0]`) so the same tests
  work unchanged against any brand pack.
- UI/interaction correctness has no unit-test coverage. How to verify it
  anyway is stated once, in [AGENTS.md](../AGENTS.md) under "Testing
  expectations", and is not repeated here. The one detail that belongs
  to this document: load the fictional demo export (`examples/exports/`)
  first, so screens are exercised with realistic data rather than in
  their empty states.
