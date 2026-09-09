@AGENTS.md

# Claude Code — build appendix

`AGENTS.md` above is the contract, and it is binding. This appendix covers
only the things specific to running the build from Claude Code. Nothing
here overrides a rule above; if the two ever disagree, `AGENTS.md` wins
and this file is the one to correct.

## Working here

The build is complete; this is maintenance now. `main` is the only branch —
branch off it for anything non-trivial and merge back.

Before committing, all four must pass clean:

```bash
npm run lint && npm run typecheck && npm test && npm run build
```

Don't call something done until it is. Not "mostly", not "true once I
circle back".

## Verifying UI yourself

`npm test` says nothing about the UI. Build the single file, serve it, and
drive it in a real browser through the Playwright or Chrome DevTools MCP
server — do not report a screen as done from reading the diff, and do not
push the check onto Bo. Import `examples/exports/demo.json` so screens have
realistic content instead of empty states.

Set an explicit viewport (`resize_window` with a width and height) before
measuring anything positional: a hidden pane reports a 0×0 viewport and
every measurement taken against it is meaningless.

What to actually check, per page: the Invariants in `AGENTS.md` hold
(typing never rebuilds the active input or moves the caret, popovers
position off their trigger, replaced regions keep working), and all three
theme modes repaint with no reload.

A re-render invalidates any `NodeList` you are iterating. Verification
scripts that walk a list of controls and click each one will silently act on
the wrong element — re-query after every interaction.

Ask Bo for aesthetic judgement. Don't ask them whether it works.

## Spec changes

The code is the source of truth. `docs/` keeps only what the code cannot
say: the decisions behind it, what is deliberately excluded, and the
vocabulary. When the two diverge, fix the document in the same commit —
never leave a doc describing behaviour the code doesn't have, and never add
a doc that restates what a function already says plainly.

Anything on SPEC §1's non-goals list is a conversation with Bo before it
is a line of code.

## Also load

- `bo-skills:issue-tracker` — before creating, picking up, or closing a
  GitHub issue, and whenever a phase turns up deferred work or a gap
  worth recording rather than fixing inline.
- `frontend-design` — when reshaping the visual language, so the
  result doesn't read as unstyled defaults. The brand-pack contract
  (`AGENTS.md`) still binds: tokens only, no literal colors.
- `dataviz` — before changing the Portfolio or run-rate charts. They are
  hand-rolled, since the single-file constraint rules out a charting
  library.

## Vocabulary

Pages are **overviews**, **details**, a **dashboard** (Portfolio),
**settings** with sections, or a **flow** (the wizard); inside them,
**panels** and **regions**. DESIGN §5 has the table. Don't write
"screen", "view" or "tab".

Don't conflate **capacity %** (a person's ceiling), **share %** (what one
team holds of them) and **allocation %** (what one phase commits) — SPEC
§4 says why. And don't conflate **phase** (where an initiative is in the
process) with **status** (Active / On Hold / Cancelled / Closed). Those
were once "stage" and "state"; the rename exists to stop that.
