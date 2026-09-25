# AGENTS.md

## Project overview
Initiative Planner: a multi-user stage-gate initiative planning tool with
no custom backend — a GitHub repository is the data store. `docs/spec.md`
is authoritative; cite the section you're following (e.g. §7.1).

## Setup
`npm install`. Node 22.22+ (24 LTS recommended).

## Run
`npm run dev` (Vite, http://localhost:5173). `npm run build:quiet && npm
run preview` to check the production build (strict CSP included — see
vite.config.ts's `csp-meta-tag` plugin; the CSP is dev-server-exempt
because Vite's own HMR needs inline styles the shipped app never does).

## Test
`npm run test:quiet` (Vitest, `--reporter=dot`) runs the suite once with
minimal passing-test noise — failures still print full detail. `npm run
test:watch` for iterating. `npm run typecheck` for a standalone type
check.

## Code style
Run `npm run lint` before finishing (ESLint). No Prettier config yet —
match surrounding style. This project uses Tailwind CSS v4: no
`tailwind.config.js` — tokens live in CSS via `@theme`/`@theme inline`.
Add UI components with `npx shadcn@latest add <component>`, not by
hand-writing them or installing a component kit. Style with Tailwind
utility classes; don't hand-write custom CSS rules or `.css` files
outside the `@theme` token definitions themselves.

## Working from the backlog
One slice at a time from `/backlog`. Read only its frontmatter
`spec_sections`, not the whole spec. Acceptance criteria = definition of
done; verify each before marking complete. The `next-slice` and
`spec-section` Claude Code skills automate this: picking the next
dependency-satisfied slice, and pulling just the cited spec sections
instead of the whole document.

Spec lookups: `.claude/skills/spec-section/scripts/extract.sh <§>`,
or `--toc` / `--find <term>` to locate a section. Don't `sed` line
ranges out of `docs/spec.md`.

## Session hygiene (token cost)
Every call re-reads the whole context, so long sessions get expensive.
- One task per session. When a task is done and the next is unrelated,
  `/clear` (AGENTS.md and memory reload). Above ~80K context, finish
  the current step, then `/clear` or `/compact` instead of continuing.
- Bug reports: reproduce first (one `curl`, test, or console check) and
  name the failing call before editing. Don't ship a guess and wait for
  the user to re-report.
- Keep bulky reference material (design-tool guides, long docs) out of
  the main context: use a subagent, or a text comparison for A/B
  choices instead of a rendered mockup.

## Order of work
1. Bug: reproduce first (failing test, `curl`, console). Feature: write
   the test for the behaviour first where it's cheap.
2. UI copy or layout choices: agree them in chat (text comparison)
   before implementing; implement once.
3. Implement with targeted edits.
4. `npm run test:quiet`, `npm run typecheck`, `npm run lint` — in that
   order, fix before moving on.
5. UI: assert text, roles and labels in component tests (Vitest +
   Testing Library, jsdom is set up; put tests beside the component).
   Then, for any change to visible UI, one smoke pass in the running app
   (see "Browser verification"): text tools (`read_page`, `find`) first,
   at most one screenshot at the end. The only reason to skip it is a dev
   server that won't start — say so and why; "needs a GitHub token" is
   not a reason, the dev token below covers it.
6. Commit per logical change, then `/clear` before an unrelated task.

## Do not touch
- Core app code from within a deployment fork — a fork edits only its
  brand-pack folder (§2, §10.7). This repo is the core; this rule is for
  downstream forks.
- A passed gate's frozen snapshot (§8.1) — never edited after the fact,
  including by migrations.
- The dataset (`data` branch files) — runtime data (§6, §10.2), not
  source code; never edit directly.

## Browser verification
- Start it with `preview_start` `{name: "initiative-planner"}` (from
  `.claude/launch.json`; `npm run dev`, port 5173). Never with Bash.
- No sign-in step: `VITE_DEV_TOKEN` in the gitignored `.env.local` skips
  the Connect screen on the dev server only (`src/auth/tokenStore.ts`; it
  is compiled out of production builds). `.worktreeinclude` copies
  `.env.local` into every new worktree. Never read, print or copy that
  file; if it is missing, ask the user rather than looking for a token.
- The app reads and writes the real `data` branch, so every edit you
  make in the browser is a real commit — fine while it is a development
  dataset (see below). For something to look at, run `npm run
  dev:seed-data` first (the example teams, people and initiatives from
  `backlog/example-data.md`); after a reset the app is empty.
- To see the Connect screen instead, start the server with the token
  blanked: `VITE_DEV_TOKEN= npm run dev`.
- `read_network_requests` can miss the `api.github.com` calls; check them
  with `javascript_tool`: `performance.getEntriesByType('resource')`.
- `npm run build:quiet && npm run preview` (`initiative-planner-built`,
  port 8899) is for the strict CSP only; the dev token is stripped there.

## Development data
While this repo's `data` branch is a development dataset (it is, until a
real dataset is put there), Claude may empty or reset it at any time for
testing, without asking, so tests start from a clean state — but only with
`npm run dev:reset-data`, which empties teams, people and memberships and
deletes initiative files, keeping roles and countries, or `npm run
dev:seed-data`, which does that reset and then writes the example data
(`scripts/seed-dev-data.mjs`). They read the token from `.env.local` and
never print it. This exception ends when real data
lives on that branch: remove this section then.

## Security
- Never log, print, or commit a GitHub token or anything matching
  `github_pat_` / `ghp_`. A Claude Code PreToolUse hook
  (`.claude/hooks/block-github-token.sh`) blocks any Write/Edit whose
  content matches this pattern — a backstop, not a substitute for care.
- Token lives only in browser storage (§3, §10.1) — never write it to a
  file, the dataset, or a commit.
- Outbound requests: only the configured GitHub API host.
- CSP forbids `eval`, `new Function`, inline scripts (§10.1, §10.9) —
  don't write code needing them.

## Commits
One commit per logical change, plain words naming the entity ("Payments
API: Development period set to Apr–Sep"), per §10.3. Never a generic
message like "update file".
