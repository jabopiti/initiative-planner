# Initiative Planner (white-label core)

A single-user, offline planner for the **cost** and **people capacity** of
initiatives: local-first, no server, no accounts. Builds to one
self-contained HTML file with no runtime dependencies or network calls.
Data lives in the browser's `localStorage`; JSON export/import is the
sharing and backup mechanism.

Initiatives run through a configurable stage progression. Two of those
stages — Validation and Development — are gated and carry cost and
capacity; any stages after them record only that they were reached.
People exist independently of teams, so one person can be split across
several, and each team draws only on the share it holds.

This repository is being built **spec-first**: there is no reference
implementation to copy from. Everything needed to build it correctly
lives in the four documents below.

## Status

Specs only, no code yet. Follow [PLAN.md](docs/PLAN.md) in order, starting
from Phase 0.

## Start here

1. [AGENTS.md](AGENTS.md) — non-negotiable constraints and the brand-pack
   contract. Read this first; every other document assumes it. Claude
   Code picks it up through [CLAUDE.md](CLAUDE.md), which adds the
   phase-by-phase build workflow on top of it.
2. [SPEC.md](docs/SPEC.md) — what the tool does and why (product/domain
   behavior, screen by screen).
3. [DESIGN.md](docs/DESIGN.md) — how it's built (tech stack, data model,
   module boundaries, brand-pack contract in implementation terms).
4. [PLAN.md](docs/PLAN.md) — the ordered build phases.

## Commands (once Phase 0 is done)

```text
npm install
npm run dev         # local dev server
npm run build       # -> initiative-planner.html
npm test
npm run typecheck
npm run lint
```

Serve the built file with `python3 -m http.server 8899` for manual
browser checks.

## Brand pack

`src/masterData.js` ships with fictional placeholder content here,
including the default stage and gate labels (see AGENTS.md). A separate,
private repository overlays real branding and master data at build time —
nothing in this repo should ever need to change to support that.
