# Initiative Planner

A multi-user companion for planning the cost and people capacity of
initiatives as they move through a stage-gate process — with no custom
backend, running entirely on GitHub as its data store.

![Status](https://img.shields.io/badge/status-in%20development-orange)
![License](https://img.shields.io/badge/license-TBD-lightgrey)

## Overview

Organizations run their initiatives through a defined, aligned stage-gate
process, yet the planning behind it is fragmented across spreadsheets and
presentations, with every manager keeping an individual solution.
Initiative Planner replaces that with one shared dataset that follows the
same process for everyone: cost derived automatically from who does what,
capacity tracked per team, and gate status kept visible as work
progresses.

It's a white-label, statically hosted single-page app — each deployment is
its own GitHub repository fork, with no server to run and no database to
host. See [`docs/spec.md`](./docs/spec.md) for the full specification.

## Architecture at a glance

- **No custom backend.** The app is a statically hosted single-page
  application; a GitHub repository *is* the backend. There's no server to
  run and no database to host.
- **GitHub as the data store.** One branch (`main`) holds the built app
  and the brand pack; a separate branch (`data`) holds the dataset as
  plain JSON files — one master file per kind (roles, countries, teams,
  people, memberships) plus one file per initiative. Every edit is a
  single git commit.
- **Client-side only.** Each user authenticates with their own
  fine-grained GitHub token, kept in the browser (this tab only unless
  "Remember me on this device" is ticked). Reads and writes go
  straight from the browser to GitHub's API — no server sits in between.
- **White-label by fork.** The process (phases, gates, checklists,
  approval tracks), branding, and seed data are all defined in one
  TypeScript **brand pack** file. A deployment is a fork of this
  repository with its own brand pack; core code is never edited in a
  fork.
- **Hosted on GitHub Pages**, built by a GitHub Actions workflow that
  fails the build if the brand pack is invalid (bad colours, overlapping
  approval bands, an incomplete process definition).

See [`docs/spec.md`](./docs/spec.md) §2–§3 and §10 for the full design and
rationale.

## Tech stack

- **React + TypeScript + Vite** — the SPA itself and its build tool
- **Tailwind CSS v4** — styling, CSS-first configured, reading the
  brand pack's colour roles as CSS variables; no CSS-in-JS
- **shadcn/ui** (on **Radix UI** primitives) — generated into the
  codebase and owned as regular source, not an installed component kit;
  covers combobox, popover, menu, dialog, tooltip and similar
- **IndexedDB** — the browser-side cache of the GitHub dataset
- **Lucide** — the icon set (shadcn/ui's default)
- No charting library, no runtime CSS-in-JS — kept deliberately light
  given the strict content security policy the app runs under (§10.1,
  §10.9)

## Getting started

**Prerequisites**
- Node.js (LTS)
- A GitHub account with access to this repository (or your fork of it)
- A fine-grained GitHub personal access token, scoped to this
  repository with Contents read/write — see [`docs/spec.md`](./docs/spec.md)
  §5.10 for how to create one

**Install and run**

```sh
npm install
npm run dev
```

On first run, the app shows a Connect screen asking for the token above.

## Deploying your own instance

Initiative Planner is distributed as a fork: each deployment forks this
repository, edits only its own brand pack (process, branding, seed data —
currently `src/brand/defaultBrand.ts`, a single default pack; splitting
that into a swappable per-fork file is follow-up work, not yet needed with
one deployment), and takes updates via GitHub's fork-sync. This
repository's own deployment (`main` branch, GitHub Actions →
GitHub Pages) is the reference: push to `main` builds and deploys via
[`.github/workflows/deploy.yml`](./.github/workflows/deploy.yml). See
[`docs/spec.md`](./docs/spec.md) §3 and §10.7 for the full design.

## Documentation

| Doc | What it covers |
|---|---|
| [`docs/spec.md`](./docs/spec.md) | The full product, UI/UX and technical specification |
| [`AGENTS.md`](./AGENTS.md) | Instructions for AI coding agents working in this repo |
| [`backlog/slices-overview.md`](./backlog/slices-overview.md) | The build backlog, sliced into independent, valuable steps |
| [`backlog/example-data.md`](./backlog/example-data.md) | Seed data (process, roles, countries, branding) used across slices |

## License

To be determined.
