@AGENTS.md

# Claude Code — build appendix

`AGENTS.md` above is the contract, and it is binding. This appendix covers
only the things specific to running the build from Claude Code. Nothing
here overrides a rule above; if the two ever disagree, `AGENTS.md` wins
and this file is the one to correct.

## How to work a phase

[docs/PLAN.md](docs/PLAN.md) is the build order. Take **one phase at a
time**, on its own branch, as its own PR. Don't start a phase until the
previous one's "Done when" is genuinely true — not "mostly", not "true
once I circle back". If a phase turns out to be bigger than it looked,
split it and say so; don't widen the current PR to swallow it.

Before opening the PR for a phase, all four must pass clean:

```bash
npm run lint && npm run typecheck && npm test && npm run build
```

## Verifying UI yourself

Every phase from 3 onward ships UI, and `npm test` says nothing about it.
Build the single file, serve it, and drive it in a real browser through
the Playwright or Chrome DevTools MCP server — do not report a screen as
done from reading the diff, and do not push the check onto Bo. Load
`examples/exports/` demo data once it exists so screens have realistic
content instead of empty states.

What to actually check, per page: it matches its SPEC §7 subsection;
the Invariants in `AGENTS.md` hold (typing never rebuilds the active
input or moves the caret, popovers position off their trigger, replaced
regions keep working); and all three theme modes repaint with no reload.

Ask Bo for aesthetic judgement. Don't ask them whether it works.

## Spec changes

The specs are the source of truth *until code exists* — after that, a
deliberate implementation choice wins and the spec gets corrected to
match (`AGENTS.md`, "What this repository is"). Either way the correction
is explicit: when implementation and spec diverge, fix the document in
the same PR. Never leave a doc describing behaviour the code doesn't
have.

Anything on SPEC §1's non-goals list is a conversation with Bo before it
is a line of code.

## Also load

- `bo-skills:issue-tracker` — before creating, picking up, or closing a
  GitHub issue, and whenever a phase turns up deferred work or a gap
  worth recording rather than fixing inline.
- `frontend-design` — when shaping the visual language in Phase 10, so the
  result doesn't read as unstyled defaults. The brand-pack contract
  (`AGENTS.md`) still binds: tokens only, no literal colors.
- `dataviz` — before building the Portfolio and run-rate stacked bar
  charts (SPEC §7.1, §7.2). These are hand-rolled, since the single-file
  constraint rules out a charting library.

## Vocabulary

Pages are **overviews**, **details**, a **dashboard** (Portfolio),
**settings** with sections, or a **flow** (the wizard); inside them,
**panels** and **regions**. DESIGN §5 has the table. Don't write
"screen", "view" or "tab" — and don't conflate **capacity %** (a person's
ceiling), **share %** (what one team holds of them) and **allocation %**
(what one phase commits). SPEC §4 says why.
