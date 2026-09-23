---
slice_id: "003b"
title: "Migrate to Vite, Tailwind CSS v4, shadcn/ui and Lucide"
type: "spike"
status: "valid"
criteria_failures: []
depends_on: ["003"]
verification_status: null
superseded_by: null
supersedes: null
change_summary: "Tech-stack change requested after slice 003 shipped: replaces the originally-specified Radix UI/React Aria + CSS Modules styling approach with Vite + Tailwind CSS v4 + shadcn/ui (still Radix-based underneath) + Lucide icons, across the whole app. This slice both migrates slice 003's shipped code AND updates every project document (spec, README, AGENTS.md, backlog files) directly in the repo, since those documents may have drifted from any prior snapshot since slice 003 landed."
recommended_model: "Claude Opus 5"
model_rationale: "A framework/build-tool swap under already-shipped, working code is higher-risk than new-feature work: getting Tailwind v4's CSS-first config, the shadcn CLI's generated-component conventions, and the OKLCH colour-variable wiring right on the first pass avoids a second costly rework. The documentation updates below are close to mechanical once the code migration is done."
spec_sections: ["§2 Brand pack (colour format, branding)", "§9.1 Theming", "§9.8 Visual design", "§9.10 Icons", "§10.1 Framework and UI foundations"]
---

# Migrate to Vite, Tailwind CSS v4, shadcn/ui and Lucide

## Intent

**Problem statement:** The delivery team decided, after slice 003 shipped,
to move from the originally-specified Radix UI/React Aria + CSS Modules
approach to Vite + Tailwind CSS v4 + shadcn/ui + Lucide, in order to build
UI faster with less hand-written code. Slice 003's already-working Connect
screen, top bar, Teams overview, and Portfolio board are built against the
old approach, and the repo's documentation (spec, README, AGENTS.md,
backlog files) still describes that old approach as current — both would
otherwise be inconsistent with everything built from here on.

**Outcome statement:** This slice contributes to a single, consistent
styling and component paradigm — in the code and in every document that
describes it — by migrating slice 003's existing screens to the new stack
and updating the specification, README, AGENTS.md, and backlog files
directly in the repository to match, so slice 004 onward starts from
documentation that's actually true.

## Scope

### A. Code and UI migration

- Add Vite (`@tailwindcss/vite` plugin), Tailwind CSS v4, and initialize
  shadcn/ui (`npx shadcn@latest init`) in the project.
- Define the brand pack's colour roles as CSS variables in OKLCH, per the
  values in the example-data update below, using Tailwind v4's `@theme` /
  `@theme inline` pattern (no `tailwind.config.js`).
- Implement dark mode as a single `.dark` class toggled on the document
  root; remove any prior attribute-based theming approach if one was
  started.
- Re-implement slice 003's screens using shadcn-generated components
  (button, input for the name fields, the team selector) and Tailwind
  utility classes for layout — the Connect screen, top bar, New team /
  New initiative creation, Teams overview cards, and the Portfolio board
  and its empty states.
- Replace any Tabler icon references from slice 003 with Lucide
  equivalents.
- Re-run slice 003's own acceptance criteria against the migrated UI to
  confirm nothing regressed.

### B. Documentation and specification updates

The repo's docs may have changed since any earlier snapshot. For each item
below, **locate the existing passage by its heading or topic**, not by
assuming today's exact wording matches what's quoted as "current" here —
then replace it with the exact "new text" given, preserving everything
else in the file untouched.

**1. `docs/spec.md` §2, Brand pack — Branding bullet.** Find the bullet
listing branding (product name, logo, favicon, page title, typeface,
colour roles). Ensure it states the colour roles are defined "as OKLCH
triplets (§10.1)" for both light and dark theme — add this if not already
present.

**2. `docs/spec.md` §9.1, Theming.** Replace the paragraph describing how
System/Light/Dark theming works so that it states: the resolved theme is
applied as a single `.dark` class on the document root, and every page
repaints under all three because every CSS rule reads a token, never a
colour. Exact replacement text:

> System (follows the OS), Light or Dark, cycled by one control and
> remembered across reloads in the browser (never synced). The resolved
> theme is applied as a single `.dark` class on the document root; every
> page repaints under all three without a reload, because every CSS rule
> reads a token, never a colour. The brand pack defines the colour tokens
> for both the light and the dark theme (§2).

**3. `docs/spec.md` §9.10, Icons.** Find the sentence naming the icon
glyph source (ends the section). Replace with:

> The core icons cover: initiative, team, owner and person, cost, cost
> item; escalated, overrun, overdue actual, gate due, ready and complete,
> on hold, cancelled, frozen and locked, over Team FTE %, and over
> Capacity %. Overrun and the two capacity warnings each have a distinct
> icon. The glyphs come from the Lucide icon set (§10.1), shadcn/ui's
> default.

**4. `docs/spec.md` §10.1, Framework and UI foundations.** Replace the
whole section with:

> ### 10.1 Framework and UI foundations
>
> The SPA is written in React with TypeScript, built with **Vite** (the
> official `@tailwindcss/vite` plugin drives the CSS build). Styling is
> **Tailwind CSS v4**, CSS-first configured (no `tailwind.config.js`;
> tokens are declared in CSS via `@theme`), reading the brand pack's
> colour roles as CSS variables (§9.8) — this is a static, build-time
> stylesheet, never runtime CSS-in-JS, since that would need inline
> styles the content security policy below forbids.
>
> UI components — button, combobox, popover, menu, dialog, tooltip and
> similar — are generated into the codebase with the **shadcn/ui** CLI,
> built on **Radix UI** primitives underneath for the accessible
> behaviour and keyboard/screen-reader handling required by §9.5.
> Generated components are owned and reviewed like any other code in the
> repository, not imported as an opaque dependency; each one that's added
> pulls in its specific Radix package plus small shared utilities
> (`class-variance-authority`, `clsx`, `tailwind-merge`). No charting
> library is included; the board, metrics and capacity grid (§5.2, §5.8)
> are Tailwind-styled HTML.
>
> Dependencies are still kept as few as the above allows, and pinned with
> a lockfile. A strict content security policy limits scripts to the
> app's own origin and connections to the configured GitHub API host, and
> forbids `eval`, `new Function` and inline scripts, because the token
> lives in the browser (§3). It is delivered as a `<meta>` tag, because
> GitHub Pages supports no custom response headers; this means
> `frame-ancestors` cannot be enforced by the policy itself, so the app
> additionally refuses to render when it detects it is running inside a
> frame (`window.self !== window.top`). Icons come from the Lucide icon
> set (§9.10), shadcn/ui's default.

**5. `README.md`, Tech stack section.** Replace with:

> ## Tech stack
>
> - **React + TypeScript + Vite** — the SPA itself and its build tool
> - **Tailwind CSS v4** — styling, CSS-first configured, reading the
>   brand pack's colour roles as CSS variables; no CSS-in-JS
> - **shadcn/ui** (on **Radix UI** primitives) — generated into the
>   codebase and owned as regular source, not an installed component kit;
>   covers combobox, popover, menu, dialog, tooltip and similar
> - **IndexedDB** — the browser-side cache of the GitHub dataset
> - **Lucide** — the icon set (shadcn/ui's default)
> - No charting library, no runtime CSS-in-JS — kept deliberately light
>   given the strict content security policy the app runs under (§10.1,
>   §10.9)

**6. `README.md`, Getting started section.** Remove any "placeholder" or
"not yet finalized" caveats on the install/run commands and the Node.js
prerequisite, now that the toolchain is decided:

> **Prerequisites**
> - Node.js (LTS)
> - A GitHub account with access to this repository (or your fork of it)
> - A fine-grained GitHub personal access token, scoped to this
>   repository with Contents read/write — see [`docs/spec.md`](./docs/spec.md)
>   §5.10 for how to create one
>
> **Install and run**
>
> ```sh
> npm install
> npm run dev
> ```
>
> On first run, the app shows a Connect screen asking for the token above.

**7. `AGENTS.md`, Setup and Run sections.** Remove "not yet finalized" /
placeholder caveats:

> ## Setup
> `npm install`.
>
> ## Run
> `npm run dev` (Vite).

**8. `AGENTS.md`, Code style section.** Append this to the existing
paragraph (don't remove the existing lint-before-finishing instruction):

> This project uses Tailwind CSS v4: no `tailwind.config.js` — tokens
> live in CSS via `@theme`/`@theme inline`. Add UI components with
> `npx shadcn@latest add <component>`, not by hand-writing them or
> installing a component kit. Style with Tailwind utility classes;
> don't hand-write custom CSS rules or `.css` files outside the
> `@theme` token definitions themselves.

**9. `backlog/slices-overview.md`.** Update the slice count in frontmatter
to 12. Add a row for this slice (003b) to the slice index table, between
003 and 004, with dependency `003`. Update slice 004's row to depend on
`003b` instead of `003`. Add a new section (before "Backlog tail"):

> ## Mid-flight changes
>
> - **After slice 003 shipped**, the delivery team requested a tech-stack
>   change: Vite + Tailwind CSS v4 + shadcn/ui (still Radix UI-based
>   underneath) + Lucide icons, replacing the originally-specified Radix
>   UI/React Aria + CSS Modules + Tabler Icons combination, across the
>   whole app. `docs/spec.md` §2, §9.1, §9.10 and §10.1 were updated
>   accordingly, and slice 003b was added to migrate slice 003's
>   already-built screens before slice 004 continues on the new stack. No
>   other slice needed a content change, since none of them named the old
>   stack directly — they only reference spec sections, which now
>   describe the new one.

**10. `backlog/example-data.md`, colour palette tables.** Add an "OKLCH
(stored)" column to both the light and dark palette tables, alongside the
existing hex column, with these values:

Light: Accent `oklch(0.429 0.085 167.5)` · Accent tint
`oklch(0.98 0.029 161.1)` · Met `oklch(0.627 0.17 149.2)` · Warning
`oklch(0.555 0.146 49.0)` · Alarm `oklch(0.577 0.215 27.3)` · Text primary
`oklch(0.23 0.02 167.0)` · Text secondary `oklch(0.512 0.022 167.2)` ·
Surface (page) `oklch(0.983 0.003 174.5)` · Surface (card)
`oklch(1.0 0.0 89.9)`.

Dark: Accent `oklch(0.79 0.152 167.0)` · Accent tint
`oklch(0.258 0.035 163.9)` · Met `oklch(0.8 0.182 151.7)` · Warning
`oklch(0.837 0.164 84.4)` · Alarm `oklch(0.711 0.166 22.2)` · Text primary
`oklch(0.956 0.012 162.0)` · Text secondary `oklch(0.742 0.022 165.9)` ·
Surface (page) `oklch(0.187 0.012 167.0)` · Surface (card)
`oklch(0.235 0.018 165.2)`.

Add one line above the tables noting these OKLCH values are what the
brand pack actually stores (§10.1); hex remains for human reference only.

**11. `backlog/slice-004-add-person-and-membership.md`.** Change its
frontmatter `depends_on` from `["003"]` to `["003b"]`.

**Explicitly excluded:** Any new user-facing behaviour — this slice
changes *how* slice 003's screens are built and how the project describes
itself, not what the product does. No slices 005 onward are touched
beyond what's listed; they build on the new stack directly rather than
needing their own migration step.

## Execution path

1. Delivery team triggers: sets up Vite, Tailwind v4, and shadcn/ui in the
   project per the four-step CSS-variable/`@theme` pattern.
2. Brand pack: colour roles are declared as OKLCH CSS variables, light and
   dark, per the values in Scope item 10.
3. Slice 003's screens are rebuilt with shadcn components and Tailwind
   utility classes; Lucide replaces any Tabler icon usage.
4. Every document listed in Scope, Part B is updated directly in the repo,
   locating each passage by meaning and replacing it with the given text.
5. Delivery team receives: slice 003's original acceptance criteria all
   still pass on the new stack, and every project document accurately
   describes it — nothing left describing the old approach as current.

## Value

- **Desirable:** The delivery team explicitly requested this change to
  build faster with less code for every remaining slice, and asked that
  the documentation be brought in line in the same pass rather than left
  to drift further.
- **Usable:** Once this lands, an agent building slice 004 onward can
  generate a shadcn component and style with Tailwind utilities directly,
  reading accurate documentation, without inventing CSS Modules alongside
  it or being misled by a stale spec.
- **Valuable:** Removes the two largest inconsistency risks in the
  backlog at once — one screen built one way while everything else is
  built another, and documentation that no longer matches the code.

## Acceptance criteria

- [ ] Given the project, when it's built, then no `tailwind.config.js`
      exists and colour tokens are declared via `@theme`/`@theme inline`
      in CSS.
- [ ] Given the theme control is used, when Dark is selected, then a
      `.dark` class is applied to the document root and every token-driven
      colour updates without a reload.
- [ ] Given slice 003's original acceptance criteria, when re-run against
      the migrated screens, then all of them still pass.
- [ ] Given any icon from slice 003, when inspected, then it comes from
      the Lucide set, not Tabler.
- [ ] Given the content security policy (§10.1, §10.9), when the migrated
      app is loaded, then no inline styles or `eval` are introduced by the
      Tailwind or shadcn tooling.
- [ ] Given the migrated screens, when their source is inspected, then
      styling is done with Tailwind utility classes — no hand-written
      `.css` files outside the `@theme` token definitions.
- [ ] Given `docs/spec.md`, `README.md`, `AGENTS.md`, and the backlog
      files listed in Scope Part B, when they are read after this slice,
      then each contains the exact new text specified, with no leftover
      reference to CSS Modules, Radix UI/React Aria as the primitive
      source, or Tabler Icons as current.
- [ ] Given `backlog/slices-overview.md`, when read, then it lists 12
      total slices, shows 003b between 003 and 004, and 004 depends on
      003b.

## Delivery gate

- [ ] Deployed to production-equivalent environment
- [ ] Demonstrated to at least one external stakeholder (user, customer,
      or business owner)

## Flags and compromises

This slice is a retrofit migration rather than new capability — see
`slices-overview.md`'s Limitations section for why it's included in this
form, alongside 001 and 002. Scope Part B assumes the repo's documents may
have diverged from any earlier snapshot; if a described passage genuinely
can't be located, note it in the delivery summary rather than guessing
where to insert the replacement text.
