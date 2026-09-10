# Judgment calls made while executing the revamp plan

`docs/REVAMP.md` is the plan and the tracker. This file is neither — it is a
running log of judgment calls I made while carrying the plan out, wherever
the plan (or SPEC/DESIGN) left more than one reasonable path and it wasn't
worth stopping to ask. Each entry names the options, what I picked, and why,
so you can reverse a call later without having to reconstruct the reasoning
from a diff. Entries are removed once you've reviewed them and either
confirmed the call or told me to change it — this file should stay short.

Nothing here is a durable decision in the SPEC.md/DESIGN.md sense (AGENTS.md,
REVAMP.md §3). If a call below turns out to matter beyond this repo's
internal structure, it gets promoted into one of those documents instead of
staying here.

---

## §4.1 — split `app.js` into per-page render modules

**Question:** the plan said "per-page render modules" but didn't say what to
do with the large amount of code several pages share (the DOM/templating
primitives, the named-table registry, the year-navigation and stacked-bar
chart code, the per-phase estimate panel used by both the wizard and
initiative detail).

**Options considered:**
1. Leave shared code in `app.js`, only pull out what's genuinely
   page-exclusive. Keeps the diff smaller but leaves `app.js` still fairly
   large (~800–1000 lines) and mixes "shared render infrastructure" with
   "app state and wiring" in one file.
2. Duplicate the shared code into whichever page needs it. Rejected outright
   — duplication is exactly what a pure-move refactor should not introduce,
   and it would let the wizard's and initiative detail's phase panels drift.
3. Extract the shared pieces into a small `src/render/` module set
   (`dom.js`, `tables.js`, `charts.js`, `phase-panel.js`), alongside
   `src/pages/*.js` for what's genuinely per-page.

**Decision: option 3.** `app.js` now holds only state, the `render()`
dispatch, and event wiring — nothing page-shaped and nothing shared-but-not-
state. Reasoning: the whole point of this row is "keeps the rest reviewable"
(REVAMP.md §4.1), and a bloated `app.js` with three unrelated concerns
(state, wiring, shared rendering) would still be the thing later rows have
to fight. The extra four files are a small, well-named surface, not sprawl.

**If you'd reverse this:** fold `src/render/*.js` back into `app.js` as
plain (unexported) functions and have each `pages/*.js` file that needs them
duplicate the ~20–200 lines instead. I'd recommend against it, but it's a
mechanical change either way.

---

## §4.1 — one file per page vs. one per overview/detail pair

**Question:** `people`/`person` and `teams`/`team` are two `view.page`
values each (an overview and a detail), sharing a domain but almost no
render code (only `person.js`'s helpers are used by `renderPerson`, and only
`team.js`'s by `renderTeam`). Combine each pair into one file, or split by
page the way the dispatch table already does?

**Decision:** split by page (`pages/people.js` + `pages/person.js`,
`pages/teams.js` + `pages/team.js`), matching the ten branches in `render()`
one-to-one. Reasoning: DESIGN §5 already treats "overview" and "detail" as
distinct page kinds, `render()`'s dispatch already treats them as distinct
pages, and `pages/teams.js` in particular would be a 35-line file glued to a
280-line one for no shared code. One page, one file, is the least surprising
rule for whoever adds the eleventh page.

---

## §4.1 — circular imports between `app.js` and `pages/*`, `render/*`

**Question:** every page needs the shared `app`/`view` state and the
`navigate`/`commit` functions that live in `app.js`; `app.js`'s `render()`
dispatch needs every page's render function. That's unavoidably circular
however the files are drawn.

**Decision:** accept the circularity rather than restructure state behind
getters/setters to avoid it. ES modules resolve circular imports correctly
as long as nothing uses an imported binding while its module is still
initializing — and nothing here does; every use is inside a function body
called well after `boot()`. Getters/setters would have meant touching nearly
every read site in the app for no behavioural gain, which the row's "pure
move" scope ruled out.

**Watch for:** if a future row adds top-level (module-scope) code in any
`pages/*.js` or `render/*.js` file that reads `app`/`view` immediately on
import (rather than inside a function), the circularity could surface a
`undefined` instead of a live binding. Keep all such code inside functions.

---

## §4.1 — `pendingImport` stayed in `app.js`, not moved to `settings.js`

**Question:** `pendingImport` (the validated-import-awaiting-a-choice state)
is read by `settings.js`'s `renderData`/`importPreviewMarkup` but written by
`app.js`'s wiring (`import-mode`, `import-cancel`, `import-apply`,
`onFileChange`). Moving the variable to `settings.js` would need a setter
function for the wiring to call, since an imported `let` binding can't be
reassigned from outside its own module.

**Decision:** left `pendingImport` declared in `app.js`; `settings.js`
imports it read-only. Reasoning: it avoids inventing a setter-function
pattern that doesn't exist anywhere else in the codebase, for a piece of
state that is arguably "wiring state" (which file a picked import is
sitting in, mid-decision) as much as it is "Settings > Data state." No
behavioural difference either way — flag if you'd rather it lived beside
the render code that displays it.

---

## §4.1 — test fixtures updated to recurse into `src/`

**Question:** `test/shell.test.mjs`'s third test read only `src/app.js`
directly (not even the already-recursive-in-spirit pattern its first test
uses), and `test/smoke.test.mjs`'s staleness check did a non-recursive
`readdir('src')`. Splitting `app.js` into subdirectories breaks both silently
— the shell test would report every action newly "unhandled" once its
markup moved out of `app.js`, and the smoke test's mtime check would stop
noticing edits to files under `src/pages/` or `src/render/` (a directory's
own mtime doesn't change when a file inside it does).

**Decision:** updated both to recurse (`fs.readdir(dir, { recursive: true
})`, Node 20+, confirmed available here on Node 24). Treated this as part of
the same row rather than a separate "while I'm here" fix — the tests were
checking an invariant ("every action has a handler," "test the artifact your
sources actually produced") that a non-recursive scan can no longer uphold
once the split exists. Skipping it would have meant landing a row that
breaks its own gate, or landing a gate that silently stopped checking what
it claims to check.
