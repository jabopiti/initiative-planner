# PLAN: build order for the white-label core

An ordered, incremental path from an empty repo to the full tool described
in [SPEC.md](SPEC.md), built per [DESIGN.md](DESIGN.md). Each phase should
be its own reviewable chunk of work; don't start a phase until the
previous one's "Done when" checklist is genuinely true.

Phases 0–2 must come first, nothing else works without them. People (5)
precedes Teams (6), because a team's roster is made of people. The
capacity grid (9) follows Initiative detail (8), since it can only be
verified against real allocations. The rest can reorder if convenient.

> **Where the build currently is.** Phases 0–2 and 5 are complete, and 3
> is complete apart from the rework below. Moving the process to build
> time (SPEC §2) landed after those were written, so it has to be
> retrofitted: the process becomes a constant rather than data in `APP`,
> gates and phases become keyed collections rather than named fields,
> checklists and skipping are new, `Closed` becomes a status, and
> Settings loses its Process and Approval-track editors. Treat that
> retrofit as Phase 3.5 — it touches 1, 2 and 3 — and do it before
> Phase 4.

## Phase 0 — Repo scaffold & tooling

- `package.json`, `vite.config.js` (single-file plugin), `tsconfig.json`
  (`checkJs`, `allowJs`, `strict: false`), `eslint.config.js`.
- `index.html` shell (nav markup, empty containers), `src/main.js` with a
  trivial render.
- `.gitignore` (`node_modules/`, build output).

**Done when:** `npm run dev`, `npm run build` (producing one HTML file),
`npm run lint`, and `npm run typecheck` all work against the trivial shell.

## Phase 1 — The process, the brand pack, and the engine (no UI)

- `src/process.js`: the compiled-in process — phases with their costed
  flags, gates with their requirements, skippability and checklists,
  the approval tracks, the currency, and the process id/version
  (DESIGN §4).
- `src/masterData.js` (placeholder seed factory) and the
  `--brand`/`--brand-font` CSS tokens.
- Calendar/working-day math over the rolling four-year window, including
  the clamp for months outside it (DESIGN §2).
- **Rate resolution** — the single function returning `(dayRate, factor)`
  for a person in a month, covering standard roles, custom rates, and
  per-year country rates.
- Labour cost, phase and grand totals over *whatever* phases the process
  declares costed, and approval-track resolution — with "Not yet known"
  for any total no band covers, and severity ordering for the escalation
  comparison (SPEC §5.5).
- **Capacity math**: per-team allocation against share, per-person
  allocation against capacity, and non-initiative work per team.
- The phase progression and label lookups read from the process constant.

**Done when:** `npm test` passes for every calculation rule in SPEC §5,
including: a gap in band coverage resolving to "Not yet known"; a month in
the previous year costing against that year's own rate and holiday row; a
custom-rate person ignoring the role factor while still using their
country's working days; and a person split across two teams whose
non-initiative work sums to their unallocated capacity and no more. Every
test runs against **two differently-shaped processes**, not just the
brand pack's. No UI and no DOM access anywhere in the tested modules.

## Phase 2 — Persistence, export, import, lifecycle

- `localStorage` load/save (debounced), schema-version **and process-id**
  gate (DESIGN §3).
- Export (full JSON download, carrying the process identity) and import
  (validation, Replace-all vs. Merge, diff preview, gate-record collision
  warning) — SPEC §8.
- The lifecycle: creating initiatives at any phase, editing costed
  phases, checklist statuses and notes, passing gates, skipping gates
  with a reason, reopening, cancelling, and duplicating.

**Done when:** `npm test` covers the lifecycle contract (SPEC §6) — a
gate blocked by a red checklist item, one passed with an amber warning, a
skip that records its reason and freezes nothing, an initiative entered at
a later phase whose earlier gates are skipped automatically, closing by
passing the final gate, and reopening back down one step at a time — and a
hand-built export/import round-trip preserves the data exactly while an
export from another process is refused.

## Phase 3 — Settings

Roles, Countries & rates (per-year), General, Data (export/import UI),
Danger zone — SPEC §7.8. No process editor and no band editor: both are
compiled in. This page comes before the entity pages because those need
editable master data to be useful to build against.

**Done when:** every editable master-data entity (role, country with its
per-year rates) can be added, edited and deactivated through the UI,
matching SPEC §7.8, and nothing on the page offers to change the process.

## Phase 4 — Process page (read-only)

The phases in order with their costed flags, each gate with its
requirements, skippability and checklist definitions, the approval tracks
on a proportional threshold bar, and the process identity and currency —
SPEC §7.7.

**Done when:** the page reflects the compiled-in process exactly,
including a process shaped differently from the placeholder one, and
offers no control that suggests anything is editable.

## Phase 5 — People

People overview (table, month picker, utilisation, over-allocation flag)
and Person detail (identity and rate, custom-role rate table, memberships
with shares, initiative distribution, capacity over time) — SPEC §7.3.

**Done when:** a person can be created, given either a standard role or a
custom per-year rate, and deactivated; the overview's utilisation figures
track the month picker; and a person over 100% is flagged without being
blocked.

## Phase 6 — Teams

Team card grid and team detail: editable name, roster (assigning existing
people, editing shares, deactivating memberships), and the team's own
initiative table — SPEC §7.2. The capacity grid and run-rate chart are
deliberately **not** built here; they need real allocations, which don't
exist until Phase 8.

**Done when:** a team can be created, staffed from existing people with
shares, renamed and deactivated; a team referenced by an initiative
cannot be deleted; and shares exceeding a person's capacity warn on both
the team and the person.

## Phase 7 — Initiatives registry + creation wizard

Initiatives list (search/filter/sort/actions) and the two-step wizard —
SPEC §7.4, §7.6.

**Done when:** a new initiative can be created end-to-end through the
wizard — including starting at a later phase, which records the earlier
gates as skipped with a reason — and appears correctly in the registry.

## Phase 8 — Initiative detail

Stepper over the process (distinguishing passed from skipped gates), gate
banner with its pass and skip actions, checklist panel, band panel with
threshold bar, one panel per costed phase, month-by-month table, gate
comparison, copy-table/CSV export — SPEC §7.5.

**Done when:** an initiative can be taken from its first phase to Closed
entirely from this page — passing some gates, skipping one with a reason,
blocked by a red checklist item until it is set — then reopened back down
one step at a time with checklist statuses intact, with every SPEC §7.5
element present and correct. Only people with an active membership in the
initiative's team can be allocated.

## Phase 9 — Team capacity grid & run-rate chart

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

## Phase 10 — Portfolio

Band-tile summary/filter, cost-per-month chart with year navigation,
filtered initiative table — SPEC §7.1.

**Done when:** the chart and tiles agree with the numbers shown on
Teams/Initiative-detail for the same data, and an initiative whose total
no band covers lands in the "Not yet known" tile (SPEC §5.5).

## Phase 11 — Theming & polish

System/Light/Dark toggle, dark-mode token set, accessibility pass
(keyboard navigation within tables, `aria-sort`, focus management),
responsive review.

**Done when:** every page repaints correctly in all three theme modes
with no reload, and table keyboard navigation (SPEC §7.5, AGENTS.md
invariants) works throughout.

## Phase 12 — Demo fixture & final verification

- `examples/exports/` fictional demo JSON (one initiative per phase, one
  with a skipped gate, at least one person split across two teams, at
  least one custom-rate person, generated by driving the real engine
  functions, not hand-written) plus its README.
- Full pass: `npm test`, `npm run lint`, `npm run typecheck`, `npm run
  build`, then a browser walkthrough of every SPEC.md section.

**Done when:** a fresh clone can `npm install && npm run build` and the
resulting single HTML file matches SPEC.md end to end.
