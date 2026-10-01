---
name: next-slice
description: Pick up the next backlog slice — the user picks from the eligible slices, then the gaps, questions and open decisions are listed and every one is settled with the user (copy and UI shown as rendered mockups) before implementation. Use when the user asks what's next, to pick up a slice, or starts backlog work.
argument-hint: "[slice id]"
allowed-tools: Bash(${CLAUDE_SKILL_DIR}/scripts/find-eligible.sh) Bash(.claude/skills/spec-section/scripts/extract.sh *) Bash(node ${CLAUDE_SKILL_DIR}/scripts/screenshot.mjs *)
---

# next-slice

Goal: the user picks the slice, and nothing about it is left to guess
before code is written — every decision that's theirs is settled,
recorded in the slice file and committed first.

## Eligible slices

!`${CLAUDE_SKILL_DIR}/scripts/find-eligible.sh`

A spike can ship without a `Slice <id>:` commit: once a slice depending
on it is done, treat the spike as done.

## Pick

If `$ARGUMENTS` names a slice, take it (say if it isn't eligible, or in
progress on another branch). Otherwise the user picks — even when only one
is eligible — with your recommendation from the build plan in
`backlog/slices-overview.md`. Never offer a slice marked IN PROGRESS: another
session has it. Mention the slice's `recommended_model` so they can switch;
don't switch it yourself.

Several sessions run slices in parallel, one slice each, on their own
branches. Start from the latest `origin/main` (merge it in if the branch is
older), keep edits to shared hot files (`Repository.ts`, `MagicBar.tsx`,
`App.tsx`, the Actions menu and Settings section lists) additive, and merge
`origin/main` again before the final test run and push.

## Review

Read the slice, its cited spec sections, §9.2 Copy and — for visible UI
— §9.4, §9.5, §9.8, §9.9 and §9.10, and the code it touches. The slice's
"Decided in review" bullets and `change_summary` are settled.

Find everything implementation would otherwise have to guess:
- conflicts between slice, spec and built code;
- undefined behaviour: empty, error, conflict, inactive or deleted
  entities, other slices, data-file shape;
- acceptance criteria that can't be tested, or scope with none;
- every new user-visible string, against §9.2 and the wording on
  neighbouring screens;
- every UI choice: placement, component, states, keyboard, icon, colour;
- technical or architectural choices that fundamentally change things —
  a new dependency, how data is stored, loaded or written to GitHub, a
  new shared pattern later slices will follow, anything hard to reverse.

What you can decide sensibly and change cheaply is an assumption: state
it, don't ask. Other implementation details stay out.

## Present the findings first

Before any question, and before any code, post one list: the gaps found,
the questions, the open decisions (each with its options and your
recommendation) and the assumptions. This happens in every session, also
when the slice's "Decided in review" section looks complete — those
bullets are settled, but what the code and spec show today can still leave
something open. Then settle it item by item.

## Settle

Ask until nothing is open, recommending an option each time. The user
picks; nothing is implemented before every item is settled.
- **Copy:** show every new or changed string as a draft **in place** —
  rendered in the mockup of its screen, not only quoted — and quote the
  exact text in the question, naming the §9.2 rule it follows.
- **UI:** every decision is shown as a **rendered visual mockup** before
  the question — never an ASCII or text sketch alone. One mockup per
  decision, options side by side and labelled as in the question, in the
  state being decided, with names and figures from
  `backlog/example-data.md`.
  - **Default: inline widget.** Load `mcp__visualize__read_me` (modules
    `mockup`; add `interactive` if needed) once, then `show_widget`. Style
    with the `src/index.css` tokens, shadcn look and Lucide icons (§9.10).
  - **Fallback: PNG**, when the decision depends on real layout, real data
    or a state only the dev server reaches (dense tables, planner grid), or
    when `show_widget` is unavailable. Capture the real screen
    (`run-initiative-planner` skill, options injected) or a scratchpad HTML
    page with `node ${CLAUDE_SKILL_DIR}/scripts/screenshot.mjs
    <page.html|url> <out.png>`; show it with SendUserFile (display
    `render`).
  - Show it right before asking. Option previews in the question may add a
    short ASCII reminder; the mockup is the visual.
- Copy and layout the user has seen and picked are what gets built; a
  change during implementation goes back to them with a new mockup.

Nothing to decide: say so, list the assumptions, and ask to go ahead —
still a question, never a silent start.

## Record

Put the outcome in the slice file ("Decided in review
(pre-implementation)" under Scope, `change_summary`, changed criteria)
and in `docs/spec.md` where it changes specified behaviour. Commit as
`Slice <id> spec: …` — never `Slice <id>:`, which marks it done. Then
implement.
