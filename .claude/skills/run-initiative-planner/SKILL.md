---
name: run-initiative-planner
description: Start and drive Initiative Planner in the browser pane — the dev server, the sign-in-free dev token, example data, checking the GitHub API calls, and the production build for CSP checks. Use for the smoke pass after any visible UI change (AGENTS.md Order of work step 5), for /run or /verify, or whenever the app needs to be seen running.
---

# run-initiative-planner

## Start
- `preview_start` `{name: "initiative-planner"}` (from `.claude/launch.json`:
  `npm run dev`, port 5173). Never start it with Bash.
- No sign-in step: `VITE_DEV_TOKEN` in the gitignored `.env.local` skips
  the Connect screen on the dev server only (`src/auth/tokenStore.ts`; it
  is compiled out of production builds). `.worktreeinclude` copies
  `.env.local` into every new worktree. Never read, print or copy that
  file; if it is missing, ask the user rather than looking for a token.
- To see the Connect screen instead, start the server with the token
  blanked: `VITE_DEV_TOKEN= npm run dev`.

## Data
- The app reads and writes the real `data` branch, so every edit made in
  the browser is a real commit — fine while it is a development dataset
  (AGENTS.md, Development data).
- For something to look at, run `npm run dev:seed-data` first (the example
  teams, people and initiatives from `backlog/example-data.md`); after a
  reset the app is empty.

## Check
- Text tools first (`read_page`, `find`); at most one screenshot, at the
  end, as proof.
- `read_network_requests` can miss the `api.github.com` calls; check them
  with `javascript_tool`: `performance.getEntriesByType('resource')`.
- Console errors: `read_console_messages` with `onlyErrors`.

## Production build
`npm run build:quiet`, then `preview_start` `{name:
"initiative-planner-built"}` (port 8899). Only for checking the strict
CSP: the dev token is stripped there, so it opens on the Connect screen.
