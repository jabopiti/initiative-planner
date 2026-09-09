# Initiative Planner (white-label core)

A single-user, offline planner for the **cost** and **people capacity** of
initiatives: local-first, no server, no accounts. Builds to one
self-contained HTML file with no runtime dependencies or network calls.
Data lives in the browser's `localStorage`; JSON export/import is the
sharing and backup mechanism.

Initiatives run through a stage-gate process that is **fixed when the
tool is built**, not configured by the person using it: which phases
exist, which of them carry cost, and what each gate requires — estimates,
a checklist, or both. People exist independently of teams, so one person
can be split across several, and each team draws only on the share it
holds.

This repository was built **spec-first**: the four documents below came
first and the implementation follows them. Where the two ever disagree,
the implementation wins and the document is corrected.

## Status

Complete. `npm install && npm run build` produces the shipped file; see
[PLAN.md](docs/PLAN.md) for how it was built, phase by phase.

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

## Commands

```text
npm install
npm run dev         # local dev server
npm run build       # -> initiative-planner.html
npm test
npm run typecheck
npm run lint
npm run demo        # regenerate examples/exports/demo.json
```

Serve the built file with `python3 -m http.server 8899` for manual
browser checks. [`examples/exports/demo.json`](examples/exports/demo.json)
is a fictional dataset covering every state the UI renders — import it
through Settings → Data rather than typing one in.

## Brand pack

`src/process.js` (the process, gates, checklists and approval tracks) and
`src/masterData.js` (roles, countries, teams, people) ship with fictional
placeholder content here — see AGENTS.md. A separate, private repository
overlays a real process, branding and master data at build time; nothing
in this repo should ever need to change to support that.

The two are deliberately different in kind: the process is governance the
end user cannot change, while the seed master data is only a starting
point they edit freely afterwards.
