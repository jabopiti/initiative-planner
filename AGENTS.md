# AGENTS.md

## Project overview
Initiative Planner: a multi-user stage-gate initiative planning tool with
no custom backend — a GitHub repository is the data store. `docs/spec.md`
is authoritative; cite the section you're following (e.g. §7.1).

## Setup
`npm install`. Not yet finalized — update once confirmed.

## Run
`npm run dev`. Same caveat.

## Test
None yet. `npm test` once configured.

## Code style
Once configured, run `npm run lint` before finishing. ESLint/Prettier/
strict TS configs are the source of truth — don't invent style beyond
them.

## Working from the backlog
One slice at a time from `/backlog`. Read only its frontmatter
`spec_sections`, not the whole spec. Acceptance criteria = definition of
done; verify each before marking complete.

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
  `github_pat_` / `ghp_`.
- Token lives only in browser storage (§3, §10.1) — never write it to a
  file, the dataset, or a commit.
- Outbound requests: only the configured GitHub API host.
- CSP forbids `eval`, `new Function`, inline scripts (§10.1, §10.9) —
  don't write code needing them.

## Commits
One commit per logical change, plain words naming the entity ("Payments
API: Development period set to Apr–Sep"), per §10.3. Never a generic
message like "update file".
