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
  processId, processVersion,   // copied from the build, checked on import
  GENERAL: { lastExportAt, exportReminderDays },

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
      customRole: null | { label, byYear: { [year]: rate }, fromRoleId },
      //   fromRoleId -- the role this person had before their custom rate,
      //   so switching back restores it rather than reassigning them.
      memberships: [ { teamId, sharePct, active } ]
      // capacityPct  -- ceiling on total concurrent commitment (0-100).
      // sharePct     -- how much of that ceiling one team holds. Active
      //                 shares should sum to <= capacityPct; over that
      //                 warns, never blocks.
    }
  },

  TEAMS: { [teamId]: { id, name, active } },
  //  A team owns no people. Its roster is every person with a
  //  membership pointing here.

  INITIATIVES: [
    {
      id, name, description, teamId, notes,
      phaseId,                 // which phase it is in
      status,          // active | on-hold | cancelled | closed
      phases: { [phaseId]: <Phase> },   // costed phases only
      gates:  { [gateId]: <GateRecord> },
      checklist: { [gateId]: { [itemId]: { status, note } } }
      //   status -- "red" | "amber" | "green", starting "red"
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
                   peopleCopy }
}

GateRecord = {
  outcome,        // "passed" | "skipped"
  takenAt,        // ISO date
  reason,         // required when skipped, otherwise null
  grandTotal,
  band: { id, name, abbr, severity } | null,   // snapshot -- see below
  phaseCosts: { [phaseId]: number }
}
```

Only costed phases appear in `phases`. A non-costed phase holds nothing
but its gate record — there is no second phase shape, and adding one
would contradict SPEC §1.

`PROCESS` and `BANDS` are deliberately **absent** from `APP`: they are
compiled in, not stored (§4). What the dataset does keep is
`processId`/`processVersion`, purely so an import can refuse a file whose
phases and gates mean something else (SPEC §8).

A frozen phase snapshots `peopleCopy` alongside `rolesCopy` and
`countriesCopy`, because a person's custom rate is as capable of moving
an approved figure as a country rate is. **A skipped gate freezes
nothing** — it approved nothing, so the phase it exits stays editable
(SPEC §6.2).

Per-year records — country `byYear` and a person's `customRole.byYear` —
cover a **rolling four-year window**: the previous year, the current year,
and the next two, recomputed on every load so there's never a year to
remember to add. The previous year is included because entering work
retrospectively is a first-class flow, and clamping those months to a
different year's rate or holidays would misstate already-spent money. A
month outside the tracked window clamps to the nearest tracked year's
record rather than defaulting to zero. Rolling the window forward never
discards a year that any initiative's costed months still reference.

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

Bands are compiled in rather than edited at runtime (§4), but they still
change **between builds**. A `GateRecord` therefore **snapshots** the
resolved band (`id`, `name`, `abbr`, `severity`) at the moment the gate is
left, rather than storing a reference. The escalation comparison in SPEC
§5.5 reads the snapshot's `severity` against the live resolution's, so a
figure approved under last year's thresholds still reads correctly under
this year's. Resolve the snapshot's `id` back to a live band only to link
to it; never to re-derive severity.

Only a **passed** gate sets that baseline. A skipped gate records a
snapshot for the history, but never becomes the figure an initiative is
held to.

### Process identifiers vs. display names

The process is a compiled-in constant (§4): an ordered list of phases,
each with a gate. Both carry a **fixed internal id** and a
**user-facing label**, and the two must never be confused. Ids are what
the dataset stores — `INITIATIVE.phaseId`, the keys of `phases`, `gates`
and `checklist` — and they are never shown to a user. Labels are what a
user reads, and are never stored, compared or sorted on.

Every place phase, gate or checklist text is *displayed* goes through one
small lookup against the process constant — never a literal string, and
never the id itself. Ordering and progression always work on the
process's declared order, never on label text.

Because ids are baked into stored data, **changing a phase or gate id in
a new build is a breaking change**, which is what `processVersion` exists
to catch (SPEC §8). Renaming a *label* is free and breaks nothing.

## 3. Persistence & schema versioning

- The entire `APP` object is the unit of persistence: serialized to
  `localStorage` under one versioned key, debounced (e.g. ~200ms after the
  last change) rather than saved synchronously on every keystroke.
- On load: missing or unparsable storage falls back to seed data. So does
  a stored `schemaVersion` that doesn't match this build's, and so does a
  stored `processId` that doesn't match — a dataset written against a
  different process would put initiatives in phases this build has never
  heard of. `processVersion` moving forward is not by itself fatal on
  load; a mismatched `processId` is.
- Export produces the entire `APP` object as pretty-printed JSON, named
  with today's date. It carries `processId` and `processVersion` so the
  file says which process it means.
- Import validates required top-level keys, the schema version, **and the
  process identity** before offering a Replace-all/Merge choice. Any of
  the three failing rejects the file outright, and the message says which
  — "this export was taken from a different process" is a different
  problem from "this export is too old", and telling someone the wrong
  one wastes their time. It then shows a diff summary (added/changed/
  removed per entity type) plus which gate records a Merge would
  overwrite.

## 4. Module boundaries & the brand-pack contract

**Three** things are ever brand-specific. Everything else must not depend
on their concrete values, only on their shape:

1. **`src/process.js`** exports the compiled-in process and the approval
   tracks — the governance the build fixes (SPEC §2):

   ```text
   PROCESS = {
     id, version,          // identity, checked on import (SPEC §8)
     currency,
     phases: [
       {
         id, label, costed,
         gate: {
           id, label,
           requiresEstimates,   // boolean
           skippable,           // boolean
           checklist: [ { id, name, description } ]
         }
       }
     ],
     bands: [ { id, name, abbr, lower, upper, req, severity } ]
   }
   ```

   Every phase has a gate, including the last, whose gate closes the
   initiative (SPEC §6). Ids here are permanent: they end up in stored
   data, so changing one is a breaking change and must come with a
   `version` bump. Labels may change freely.

2. **`src/masterData.js`** exports a factory (e.g.
   `createMasterData()`) returning a **freshly-constructed** seed object
   every call — never a shared mutable module-level constant, since
   repeated seeding (across tests, say) must not leak mutations between
   calls. It supplies `{ ROLES, COUNTRIES, PEOPLE, TEAMS, GENERAL }`.

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

The split between (1) and (2) is the split SPEC §2 draws: `process.js`
is governance the user may not change, `masterData.js` is a starting
point they may edit freely afterwards. Never seed one from the other.

The engine and every render function must be fully agnostic to the actual
values these provide: no string comparisons against real names, no
assumptions about how many roles, countries, teams, people, phases, gates
or bands exist beyond what the shape guarantees. In particular, **nothing
may assume a fixed number of phases**, that any particular phase is
costed, or that a gate has a checklist.

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
  people.js      -- people, memberships and shares. A separate aggregate
                    from the initiative lifecycle, with invariants of its
                    own. Pure.
  transfer.js    -- export/import shaping: serialise, validate, diff,
                    merge, and table export (CSV/TSV/HTML). Pure.
  store.js       -- the only module reaching outside itself: localStorage,
                    the clipboard, and handing the user a file.
                    Deliberately thin, with every decision delegated to
                    the pure modules.
  app.js         -- render/wire functions (one module is fine at this
                    size; split further only if it grows unwieldy)
  main.js        -- bootstrap: theme toggle, top-level event wiring,
                    initial load + render
  process.js     -- brand pack: the compiled-in process and approval
                    tracks (placeholder values)
  masterData.js  -- brand pack: seed data factory (placeholder values)
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
  phase periods and allocations, pass gates, skip gates, set checklist
  statuses, close, reopen, duplicate) and assert on the resulting
  numbers/state — not a parallel reimplementation of the logic being
  tested. Cover a gate blocked by a red checklist item, one passed with
  an amber warning, a skip recording its reason and freezing nothing, and
  an initiative entered at a later phase whose earlier gates are skipped
  automatically.
- Tests must never hardcode a specific master-data value (a team name, a
  role id, a phase label) beyond what the shape guarantees — look values
  up dynamically (e.g. `Object.keys(APP.ROLES)[0]`) so the same tests
  work unchanged against any brand pack.
- **Process-shape tests**: the lifecycle must be exercised against more
  than one process, built in the test rather than taken from the brand
  pack — at minimum a two-phase process and one with four phases where
  some are uncosted and one gate carries a checklist. Anything that
  assumes two phases, or that every phase is costed, is a bug this catches
  and nothing else will.
- UI/interaction correctness has no unit-test coverage. How to verify it
  anyway is stated once, in [AGENTS.md](../AGENTS.md) under "Testing
  expectations", and is not repeated here. The one detail that belongs
  to this document: load the fictional demo export (`examples/exports/`)
  first, so screens are exercised with realistic data rather than in
  their empty states.
