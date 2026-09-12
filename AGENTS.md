# Working notes for agents

## What this repository is

This is the **white-label core** of a single-user, offline initiative
planner, built from the documents in this folder rather than from an
existing codebase: [SPEC.md](docs/SPEC.md) (what/why) and
[DESIGN.md](docs/DESIGN.md) (how). These documents were the
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
- Data lives in the browser's `localStorage` — the only thing a load ever
  reads from. It may optionally also mirror to a file on disk (the File
  System Access API, Chromium only, §4.7) purely as a write-through
  convenience; a file edited elsewhere is never read back automatically.
  JSON export/import remains the only sharing and reconciliation mechanism.
- Single-user. No authentication, multi-user editing, FX conversion, time
  tracking, or vacation modelling.
- The process — which phases exist, which carry cost, what each gate
  requires — is **fixed at build time**, never edited by the user. Adding
  a runtime process editor means changing [SPEC.md](docs/SPEC.md) first.
- Nothing may assume a fixed number of phases, that a particular phase is
  costed, or that a gate has a checklist. The process is data the build
  supplies; the code reads its shape.

## Brand-pack contract

Two source files and one CSS block are ever brand-specific:

- `src/process.js` — the compiled-in process: phases, their gates,
  checklist definitions, approval tracks, a process id/version, the
  currency, and the wordmark. **Governance the user cannot change.**
- `src/masterData.js` — the seed factory: roles, countries, people and
  teams. **A starting point the user edits freely afterwards.**
- The `--brand*` and `--brand-font` custom properties in `src/styles.css`'s
  `:root`, plus an optional `@font-face` block. Ships with a generic
  placeholder color and no embedded font here.

Never seed one of the first two from the other; the whole point of the
split is that one is fixed and the other is not.

Everything else — every render function, every calculation, every piece of
copy that isn't a phase, gate or band name — must be brand-agnostic.
Never hardcode a brand string, color, or master-data value anywhere else.
Route phase, gate and checklist display text through a single lookup
against the process constant, and band abbreviations through a
`bands[].abbr`-style field, exactly as described in
[DESIGN.md](docs/DESIGN.md) — don't invent a second way to express the
same thing. Phase and gate **ids** are stored in the dataset and are
therefore permanent: changing one in a later build is a breaking change,
caught by `processVersion`. There is no automated check for any of this;
changes are reviewed manually.

## Product terminology

Use these terms consistently in user-facing text: **phase**, **gate**,
**status**, **checklist item**, **approval track**, **person**,
**membership**, **capacity %**, **share %**, **allocation %**,
**non-initiative work**, and **Estimate / Forecast / Actual**. See
[SPEC.md](docs/SPEC.md) for their definitions — §4 in particular, for why
the three percentages are never interchangeable.

**Phase is not status.** A phase is where an initiative is in the
process; status is Active / On Hold / Cancelled / Closed alongside it.
The two were once called "stage" and "state", one letter apart, which is
exactly the confusion this vocabulary exists to prevent.

For pages, use the vocabulary in [DESIGN.md](docs/DESIGN.md) §5:
**overview**, **detail**, **dashboard**, **settings**, **flow**, and
below them **panel** and **region**. Not "screen", not "view", not "tab".

## Commands

These commands exist and behave as follows:

```text
npm run dev         # local dev server
npm run build       # -> initiative-planner.html (single file)
npm test            # unit tests + a headless smoke test, node:test
npm run typecheck   # tsc --noEmit over src/**/*.js (checkJs, not strict)
npm run lint        # eslint over src/
```

Serve the built file with `python3 -m http.server 8899` for browser
checks. Engine and lifecycle regressions are covered by `npm test`, which
also boots the built file headlessly; that proves it runs, not that it is
right. UI changes still require real browser verification, which you are
expected to do yourself (see "Testing expectations").

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
- Smoke-test the shipped artifact: `test/smoke.test.mjs` serves the built
  file, opens it in headless Chrome and walks every page, so a change that
  stops the app rendering fails a gate instead of reaching a browser. It
  skips when no Chrome is installed. Keep it shallow — it answers "does it
  run", never "is it right".
- UI/interaction correctness beyond that has no automated coverage. **No DOM
  simulator and no browser-automation dependency** — `test/browser.mjs`
  speaks the DevTools protocol over node builtins precisely so `npm install`
  stays as small as the artifact's own promise. Verify interaction by
  building the file, serving it, and driving it in a real browser through
  your own browser tooling. Check the screen against its SPEC section,
  exercise the Invariants above, and confirm all three theme modes repaint
  without a reload. Do not report a UI change as done on the strength of
  reading the diff, and do not hand the check to the user — ask them only
  for aesthetic judgement.

## Durable decisions

- The data schema is versioned (`schemaVersion`). Imports with an unknown
  schema version are rejected outright; no migration path is maintained
  for legacy exports.
- People are top-level and teams own none of them; a person may hold
  several memberships, and membership carries the share of that person's
  capacity the team holds. Ceilings warn; they never block.
- A dataset records the `processId` and `processVersion` it was written
  against. An import disagreeing with this build is refused — data whose
  phases mean something else is worse than no data.
- Skipping a gate requires a reason, approves nothing, and freezes
  nothing. Entering pre-existing work uses that same mechanism rather
  than a concept of its own.
- [SPEC.md](docs/SPEC.md) §1 lists the non-goals. They are not a backlog.
  Anything on that list is out of scope until SPEC.md itself is changed —
  and changing it is a decision to bring to the repo owner, not one to
  make while implementing a phase.

### Prefer Auto-Approvable Command Shapes
To ensure a smooth, uninterrupted "automode" experience, write shell commands in a way that remains prefix-matchable by the security sandbox. 

- **Avoid shell pipes and chains:** Do not use `|`, `&&`, `||`, or `;` unless strictly necessary. (e.g., Instead of `cat file | awk ...` or `cat file | grep ...`, invoke the binary directly on the file: `awk ... file` or `grep ... file`).
- **Avoid command substitutions and variables:** Do not use `$()` or `$VAR`. Run the inner command as its own step, read the result, and pass literal strings into the next command.
- **Avoid wrapper binaries:** Do not use `env`, `xargs`, `eval`, or `sudo`. Call the target binary directly.
- **Break up complex commands:** If a task requires complex shell logic, split it into multiple, simpler, separate command executions rather than stringing them together in one line.

