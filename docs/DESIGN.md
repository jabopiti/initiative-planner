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

## 2. Rules the data model has to hold to

The shape itself is in `src/` — `lifecycle.js` constructs it and
`transfer.js` validates it. What follows is what the shape alone does not
say.

**Only costed phases have a record.** An initiative's `phases` map is keyed
by phase id and carries an entry for each costed phase only; a non-costed
phase holds nothing but its gate record. There is no second phase shape, and
adding one would contradict SPEC §1.

Because of that, the cost and capacity functions never need to know the
process: they iterate the initiative's own phase records. Only the
progression helpers take the process, and they take it **as an argument
rather than importing it**, which is what lets the tests run against
differently-shaped processes.

**`PROCESS` and the bands are absent from the dataset.** They are compiled
in (§4). What the dataset keeps is `processId` and `processVersion`, purely
so an import can refuse a file whose phases mean something else (SPEC §8).

**Rate resolution happens in exactly one place.** One function returns
`(dayRate, factor)` for a person in a month, and every cost path — phase
totals and the per-row figures on an allocation table alike — is expressed
through it. An allocation table whose rows do not add up to its own total is
worse than no table.

**Frozen phases carry their own master data.** A freeze snapshots the roles,
countries and people alongside the totals, so an approved figure can be
*reproduced* rather than merely recalled, per row. A skipped gate freezes
nothing.

**Gate records snapshot their band** (`id`, `name`, `abbr`, `severity`)
rather than referencing it, so escalation still resolves after the bands
change in a later build.

**Per-year records cover a rolling four-year window** — last year, this
year, and the next two — recomputed on load. Last year is included because
entering work retrospectively is a first-class flow, and clamping those
months to another year's rate would misstate money already spent.

### Process identifiers vs. display names

Every phase, gate and checklist item has a **fixed internal id** and a
**user-facing label**. Ids are what the dataset stores and are never shown;
labels are what a user reads and are never stored, compared or sorted on.
Ordering always comes from the process's declared order, never from label
text.

Because ids are baked into stored data, **changing one in a new build is a
breaking change** — which is what `processVersion` exists to catch.
Renaming a label is free.

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

1. **`src/process.js`** — the compiled-in process and approval tracks, the
   governance the build fixes (SPEC §2), plus two build-fixed identity
   fields that aren't process structure but have nowhere more agnostic to
   live: `currency` and `wordmark` (§4.8 — the app's own name, read once at
   boot into the shell and the document title). That file is the shape;
   read it rather than a copy of it here.

   Every phase has a gate, including the last, whose gate closes the
   initiative (SPEC §6). Ids in it are permanent — they end up in stored
   data, so changing one is a breaking change and must come with a
   `version` bump. Labels may change freely.

2. **`src/masterData.js`** exports a factory (e.g.
   `createMasterData()`) returning a **freshly-constructed** seed object
   every call — never a shared mutable module-level constant, since
   repeated seeding (across tests, say) must not leak mutations between
   calls. It supplies `{ ROLES, COUNTRIES, PEOPLE, TEAMS, GENERAL }`.

3. **CSS custom properties** in `src/styles.css`'s `:root`, inside the
   block marked `brand pack: replace this block, and nothing else`. Seven
   knobs (§4.8), each with a white-label default that already reads as a
   deliberate, good-looking tool — verifying that is the actual test of
   "good out of the box", since it's the one combination no brand build
   will ever hand-tune:

   | Knob | Default | What it drives |
   |---|---|---|
   | `--brand-hue` | `153` | The accent — selection, the current thing, links. |
   | `--brand`, `--brand-contrast`, `--brand-tint` | derived from the hue | The accent's fill, its contrast text, and its tint background. A brand build may override these directly instead of the hue, if its accent doesn't reduce to one hue at fixed saturation/lightness. |
   | `--brand-font` | unset | An embedded font family; every `--font-*` stack reads `var(--brand-font, <generic fallback>)`, so leaving it unset still produces a fully valid stack with nothing embedded. |
   | `--brand-neutral-hue` | `220` (cool blue-grey) | The whole neutral ramp — canvas, surface, text, lines — independent of the accent hue. A rebrand's accent and its neutrals are separate choices (Farn itself pairs a forest-green accent with warm paper neutrals). |
   | `--brand-radius` | `0` (square) | Every component's corners. Circular elements (status dots) use `--radius-round` instead and are never affected. |
   | `--brand-density` | `1` | A unitless multiplier over row padding and control heights. Above 1 for more air; this tool's own default is already denser than a typical enterprise table, on purpose (§4.1). |
   | `--brand-text-base` | `0.875rem` (14px) | The whole type scale — every `--text-*` size is a fixed ratio of this one number, so a brand sizes up or down from one value instead of seven. |

   Every other rule in the stylesheet reads these, or a token derived from
   them, never a literal color, size, space or radius — so a rebrand never
   requires touching any rule outside this one block.

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
