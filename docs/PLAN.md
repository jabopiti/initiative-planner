# PLAN: build order for the white-label core

An ordered, incremental path from an empty repo to the full tool described
in [SPEC.md](SPEC.md), built per [DESIGN.md](DESIGN.md). Each phase should
be its own reviewable chunk of work; don't start a phase until the
previous one's "Done when" checklist is genuinely true. Phases 0–2 must
come first, nothing else works without them; People (4) precedes Teams
(5), because a team's roster is made of people; and the capacity grid (8)
follows Initiative detail (7), since it can only be verified against real
allocations. The rest can reorder if it's more convenient.

## Phase 0 — Repo scaffold & tooling

- `package.json`, `vite.config.js` (single-file plugin), `tsconfig.json`
  (`checkJs`, `allowJs`, `strict: false`), `eslint.config.js`.
- `index.html` shell (nav markup, empty containers), `src/main.js` with a
  trivial "Hello world" render.
- `.gitignore` (`node_modules/`, build output).

**Done when:** `npm run dev`, `npm run build` (producing one HTML file),
`npm run lint`, and `npm run typecheck` all work against the trivial shell.

## Phase 1 — Data model, engine, and brand pack (no UI)

- `src/masterData.js` (placeholder seed factory, including the default
  `PROCESS` labels) and the `--brand`/`--brand-font` CSS tokens.
- Calendar/working-day math over the rolling four-year window, including
  the clamp for months outside it (DESIGN §2).
- **Rate resolution** — the single function returning `(dayRate, factor)`
  for a person in a month, covering standard roles, custom rates, and
  per-year country rates (DESIGN §2).
- Labour cost, phase/grand totals, and approval-track resolution — with
  "Not yet known" for any total no band covers, and severity ordering for
  the escalation comparison (SPEC §5.5).
- **Capacity math**: per-team allocation against share, per-person
  allocation against capacity, and non-initiative work per team.
- The stage progression built from `PROCESS`, and a `stageTerm(id)`-style
  helper (DESIGN §2).
- Unit tests for all of the above against the placeholder seed data.

**Done when:** `npm test` passes for every calculation rule in SPEC §5,
including: a gap in band coverage resolving to "Not yet known"; a
backfilled month in the previous year costing against that year's own
rate and holiday row; a custom-rate person ignoring the role factor while
still using their country's working days; and a person split across two
teams whose non-initiative work sums to their unallocated capacity and no
more. No UI and no DOM access anywhere in the tested modules.

## Phase 2 — Persistence, export, import

- `localStorage` load/save (debounced), schema-version gate.
- Export (full JSON download) and import (validation, Replace-all vs.
  Merge, diff preview, approval-collision warning) — SPEC §8, DESIGN §3.
- Lifecycle integration tests: create → estimate → pass Gate 1 → pass
  Gate 2 → advance status stages → close, plus reopen (walking back one
  stage at a time) and duplicate. Run them against a process with zero
  status stages and one with several.

**Done when:** `npm test` covers the full lifecycle contract (SPEC §6),
and a hand-built export/import round-trip preserves the data exactly.

## Phase 3 — Settings screen

Roles, Countries & rates (per-year), Budget bands, **Process**, General,
Data (export/import UI), Danger zone — SPEC §7.7. This page comes before
People/Teams/Initiatives because those need editable master data to be
useful to build against.

**Done when:** every master-data entity (role, country with its per-year
rates, band) can be added, edited, deactivated/deleted through the UI,
and the process can be renamed and have status stages added, reordered
and deleted — with deletion refused, by name, for a stage an initiative
currently sits in. Matches SPEC §7.7.

## Phase 4 — People

People overview (table, month picker, utilisation, over-allocation flag)
and Person detail (identity and rate, custom-role rate table, memberships
with shares, initiative distribution, capacity over time) — SPEC §7.3.
People come before Teams because a team's roster is made of them.

**Done when:** a person can be created, given either a standard role or a
custom per-year rate, and deactivated; the overview's utilisation figures
track the month picker; and a person over 100% is flagged without being
blocked.

## Phase 5 — Teams

Team card grid and team detail: editable name, roster (assigning existing
people, editing shares, deactivating memberships), and the team's own
initiative table — SPEC §7.2. The capacity grid and run-rate chart are
deliberately **not** built here; they need real allocations, which don't
exist until Phase 7. Splitting them out avoids the temptation to verify
against hand-built fake data.

**Done when:** a team can be created, staffed from existing people with
shares, renamed and deactivated; a team referenced by an initiative
cannot be deleted; and shares exceeding a person's capacity warn on both
the team and the person.

## Phase 6 — Initiatives registry + creation wizard

Initiatives list (search/filter/sort/actions) and the two-step wizard —
SPEC §7.4, §7.6.

**Done when:** a new initiative can be created end-to-end through the
wizard — including starting at a later stage to backfill existing work —
and appears correctly in the registry.

## Phase 7 — Initiative detail

Stepper over the configured progression, stage banner, band panel with
threshold bar, phase panels (reusing the wizard's phase-panel rendering),
month-by-month table, gate comparison, copy-table/CSV export — SPEC §7.5.

**Done when:** an initiative can be taken from Draft through both gates,
through every configured status stage, to Closed entirely from this page,
then reopened back down one stage at a time, with every SPEC §7.5 element
present and correct. Only people with an active membership in the
initiative's team can be allocated.

## Phase 8 — Team capacity grid & run-rate chart

The rest of SPEC §7.2: the capacity grid (one row per active member, one
column per month, bounded by each member's share), the cell popover
breaking a month down by initiative, the non-initiative-work row and its
cost, and the stacked run-rate chart with year navigation.

**Done when:** allocating one person across two initiatives shows the
combined percentage in the grid, the popover attributes it correctly to
both, over-allocation past the member's share warns without blocking, the
run-rate chart's monthly totals agree with the same months on Initiative
detail, and a person split across two teams produces non-initiative work
in both that sums to their unallocated capacity and no more.

## Phase 9 — Portfolio

Band-tile summary/filter, cost-per-month chart with year navigation,
filtered initiative table — SPEC §7.1.

**Done when:** the chart and tiles agree with the numbers shown on
Teams/Initiative-detail for the same data, and an initiative whose total
no band covers lands in the "Not yet known" tile (SPEC §5.5).

## Phase 10 — Theming & polish

System/Light/Dark toggle, dark-mode token set, accessibility pass
(keyboard navigation within tables, `aria-sort`, focus management),
responsive review.

**Done when:** every page repaints correctly in all three theme modes
with no reload, and table keyboard navigation (SPEC §7.5, AGENTS.md
invariants) works throughout.

## Phase 11 — Demo fixture & final verification

- `examples/exports/` fictional demo JSON (one initiative per stage, at
  least one person split across two teams, at least one custom-rate
  person, generated by driving the real engine functions, not
  hand-written) plus its README.
- Full pass: `npm test`, `npm run lint`, `npm run typecheck`, `npm run
  build`, then a browser walkthrough of every SPEC.md section.

**Done when:** a fresh clone can `npm install && npm run build` and the
resulting single HTML file matches SPEC.md end to end.
