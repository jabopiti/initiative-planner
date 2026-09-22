---
slice_id: "003"
title: "Connect, create a team, and create a named initiative"
type: "capability"
status: "valid"
criteria_failures: []
depends_on: ["002"]
verification_status: null
superseded_by: null
supersedes: null
change_summary: null
recommended_model: "Claude Sonnet 5"
model_rationale: "Standard, well-specified CRUD and routing work with a proven sync mechanism underneath (from slice 002); no financial or state-machine correctness risk yet."
spec_sections: ["§5.1 Navigation", "§5.2 Portfolio overview (board and empty state only)", "§5.7 Teams overview", "§5.10 Connect screen", "§6 Data model (Initiative, Team)", "§9.4 Empty states", "§10.2 Data layout", "§10.3 Writing", "§10.4 Browser storage", "§10.5 Merging", "§10.6 Identifiers and links"]
---

# Connect, create a team, and create a named initiative

## Intent

**Problem statement:** An initiative owner cannot start planning any work
when they first open the tool, because there is no way yet to
authenticate against the repository, create the team an initiative must
belong to, or create the initiative itself.

**Outcome statement:** This slice contributes to the tool's core loop by
enabling an initiative owner to connect, create a team, and create a named
initiative that appears on the Portfolio board.

## Scope

- The Connect screen (§5.10): a token field, the three-step instructions
  with a prefilled GitHub token-creation link, and the checked-token
  outcomes table (works, classic-token warning, can't-see-repo, read-only,
  pending approval, invalid).
- The top bar (§5.1): logo, the five nav items, the New initiative button.
- Teams overview (§5.7): a New team button creating a team from a name
  only; the team appears as a card.
- New initiative (§5.1, §6): name + team required, created via the top
  bar; team defaults to the one last used or the only active team.
- Portfolio board (§5.2): the new initiative appears as a card in its
  process's first phase column; the empty-board and empty-Teams states
  (§9.4) show one line and one primary action each.
- Hash routes for Portfolio, Initiatives, People, Teams, Settings, and a
  specific initiative (§10.6).
- This is the first slice that writes to the dataset — every Contents API
  call must pass the data branch explicitly (§10.3, spike-findings.md): an
  omitted `branch` silently defaults to the app branch instead of erroring,
  which is exactly how slice 002's spike briefly landed test data on
  `main`. Cover this with a test, not just review — e.g. a regression test
  asserting every write call includes `branch`, or one that replicates the
  incident against a mock and fails if it doesn't.

**Explicitly excluded:** The People screen and any allocation, phase, or
cost item editing — an initiative with just a name and a team is already a
real, demonstrable outcome; planning it is slice 005 onward. The Getting
started strip's full four-step guidance is also excluded — this slice
ships only the empty-state one-line-and-one-action pattern, because the
richer guided strip requires people and phases to exist first to have
anything to guide toward.

## Execution path

1. User triggers: opens the app with no token stored.
2. UI: Connect screen collects and validates the token against the real
   repository (§5.10); on success, the Portfolio loads.
3. UI/data: user clicks New team, types a name, presses Enter; a commit is
   written to the data branch (§10.2, §10.3) creating the team.
4. UI/data: user clicks New initiative, types a name, the team defaults
   in; Enter creates the initiative and commits it as its own file.
5. User receives: the initiative's own page opens, and the initiative
   appears on the Portfolio board in its first phase's column.

## Value

- **Desirable:** An initiative owner setting up a new deployment would
  seek exactly this first — there is nothing to plan before a team and an
  initiative exist.
- **Usable:** A user unfamiliar with the tool can follow the three-step
  Connect instructions, create a team, create an initiative, and see it
  appear on the board — without being told how.
- **Valuable:** After this slice, an initiative owner can register real
  work in the tool and share it with colleagues with repository access,
  instead of tracking it in a spreadsheet.

## Acceptance criteria

- [x] Given no token is stored, when the app loads, then the Connect
      screen appears with the three-step instructions and a prefilled
      token-creation link.
- [x] Given a valid fine-grained token for the configured repository, when
      it is pasted and submitted, then the Portfolio board loads.
- [x] Given no teams exist, when the user clicks New team and types a
      name, then the team appears as a card on the Teams overview.
- [x] Given at least one team exists, when the user clicks New initiative,
      types a name, and presses Enter, then the initiative's page opens
      and the initiative appears on the Portfolio board.
- [x] Given the Portfolio has no initiatives, when it loads, then it shows
      one line and one primary action instead of an empty board.

Verified by the automated suite (27 tests: `src/github/client.test.ts`'s
branch-explicit regression coverage, `src/sync/DebouncedFileWriter.test.ts`
and `Repository.test.ts` against a mocked GitHub API, `validateToken.test.ts`
for the §5.10 outcomes table, `merge.test.ts` for §10.5) and by a full
interactive walkthrough in a real browser against a mocked network
(Connect → bootstrap → New team → New initiative → Portfolio placement),
screenshotted in both themes. No real GitHub commits were made in this
verification — that's the one remaining step; see TODO.md.

## Delivery gate

- [ ] Deployed to production-equivalent environment — the GitHub Actions
      Pages workflow (`.github/workflows/deploy.yml`) is wired up and Pages
      is enabled (`build_type: workflow`); this checks off once it's
      pushed to `main` and the first deploy run completes.
- [ ] Demonstrated to at least one external stakeholder (user, customer,
      or business owner) — needs a human; see TODO.md.

## Flags and compromises

Scope was already minimal on first read for the *product* surface — no
product-facing items were removed beyond what's listed under Explicitly
excluded. Building it surfaced several infrastructure/technical
compromises worth naming:

- **UI primitives**: Radix UI / React Aria (§10.1) aren't added yet — this
  slice only needed a plain text input and a native `<select>`, which are
  already accessible; the searchable combobox §9.11 calls for is real
  future work when filters land.
- **Icons**: placeholder inline SVGs stand in for the Tabler Icons outline
  set (§9.10, not in this slice's spec_sections).
- **Theming**: light/dark follow `prefers-color-scheme` automatically;
  the manual theme control (§9.1, not in this slice's spec_sections) isn't
  built.
- **Search**: the top bar's search icon (§5.1) renders but is inert — the
  grouped Initiatives/People/Teams search overlay isn't built; no
  acceptance criterion needed it.
- **Sync (§10.2)**: initial pull-on-load and a pull-before-every-write are
  implemented; the periodic 5-minute/on-focus poll and the conditional-GET
  "only fetch what changed" optimization aren't — nothing in this slice's
  flows is multi-user-concurrent, so there was nothing to prove either way.
- **Approval track badge**: hardcoded to "Not yet known" rather than
  computed via the §7.4 engine, since no initiative has cost data yet in
  this slice (that engine is slice 005+ per engine-audit.md).
- **Token-creation link** and the **pending-approval outcome** are
  best-effort against GitHub's real behaviour — see TODO.md for what to
  verify live.
- **Found and fixed in passing, not part of this slice's own scope**: all
  of docs/, README.md, AGENTS.md and engine-audit.md linked
  `docs/spec.md` (lowercase) while the file was `docs/SPEC.md` — a broken
  link on GitHub's case-sensitive filesystem even though it worked
  locally on macOS. Renamed the file to match every reference rather than
  the other way around, since that's what everything already assumed.
