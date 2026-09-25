---
name: next-slice
description: Pick up the next backlog slice — the user picks from the eligible slices, then every open decision (copy and UI above all) is settled with them before implementation. Use when the user asks what's next, to pick up a slice, or starts backlog work.
argument-hint: "[slice id]"
allowed-tools: Bash(${CLAUDE_SKILL_DIR}/scripts/find-eligible.sh) Bash(.claude/skills/spec-section/scripts/extract.sh *)
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

If `$ARGUMENTS` names a slice, take it (say if it isn't eligible).
Otherwise the user picks — even when only one is eligible — with your
recommendation from `backlog/slices-overview.md`. Mention the slice's
`recommended_model` so they can switch; don't switch it yourself.

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

## Settle

Ask until nothing is open, recommending an option each time.
- Copy options quote the exact text, in its place, and name the §9.2
  rule they follow.
- UI options are always shown as a visual in the chat before the
  question: one per decision, options side by side and named as in the
  question, in the app's look (`src/index.css` tokens, shadcn, §9.10
  icons), with names and figures from `backlog/example-data.md`, in the
  state being decided. No inline visual tool: ASCII in the option preview.

Nothing to decide: say so, list the assumptions, ask to go ahead.

## Record

Put the outcome in the slice file ("Decided in review
(pre-implementation)" under Scope, `change_summary`, changed criteria)
and in `docs/spec.md` where it changes specified behaviour. Commit as
`Slice <id> spec: …` — never `Slice <id>:`, which marks it done. Then
implement.
