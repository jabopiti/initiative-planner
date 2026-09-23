# AGENTS.md

## Project overview
Initiative Planner: a multi-user stage-gate initiative planning tool with
no custom backend — a GitHub repository is the data store. `docs/spec.md`
is authoritative; cite the section you're following (e.g. §7.1).

## Setup
`npm install`. Node 20+.

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

## Do not touch
- Core app code from within a deployment fork — a fork edits only its
  brand-pack folder (§2, §10.7). This repo is the core; this rule is for
  downstream forks.
- A passed gate's frozen snapshot (§8.1) — never edited after the fact,
  including by migrations.
- The dataset (`data` branch files) — runtime data (§6, §10.2), not
  source code; never edit directly.

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
