---
name: next-slice
description: Pick up the next backlog slice — lists the slices whose dependencies are done, asks the user to pick one, then reviews it for gaps, questions and open decisions (copy and UI above all, UI with mockups) and settles them with the user before any implementation. Use when the user asks what's next, says to pick up the next slice, or starts backlog work, named slice or not.
argument-hint: "[slice id]"
allowed-tools: Bash(${CLAUDE_SKILL_DIR}/scripts/find-eligible.sh) Bash(.claude/skills/spec-section/scripts/extract.sh *)
---

# next-slice

Two phases: **pick** a slice with the user, then **review** it with the
user until nothing is open. Implementation starts only after that.

## Eligible slices

!`${CLAUDE_SKILL_DIR}/scripts/find-eligible.sh`

(`status: valid`, not superseded, every `depends_on` done. "Done" = a
commit subject starting `Slice <id>:`. A `type: spike` can ship without
one — if a spike is listed but a slice depending on it is clearly done,
treat the spike as done.)

## 1. Pick

- Requested slice id: $ARGUMENTS — if one is given, use it (warn if it
  isn't eligible) and skip to step 2.
- None eligible → say so and stop.
- Otherwise ask with AskUserQuestion, one option per eligible slice
  (label: id and title; description: what it delivers in one line, and
  its `recommended_model`). Put your recommendation first, marked
  "(Recommended)", using `backlog/slices-overview.md`'s order and what
  the finished slices unblock. With exactly one, still ask: that slice,
  or stop.
- Report the pick: id, title, `depends_on`, `spec_sections`, and
  `recommended_model` + `model_rationale` (the user switches models with
  `/model` — never switch it yourself).

## 2. Load

- The slice file, in full. Its "Decided in review" bullets and
  `change_summary` are settled — don't reopen them.
- Each cited spec section, one call each:
  `.claude/skills/spec-section/scripts/extract.sh 5.8`. Always add §9.2
  Copy, and for visible UI also §9.4 Empty states, §9.5 Accessibility,
  §9.8 Visual design, §9.9 Interface states and §9.10 Icons.
- The code the slice touches, and the screens nearest to it for existing
  patterns and wording. If that means reading many files, have an Explore
  subagent do it and report back.
- `backlog/example-data.md` for realistic names and figures.

## 3. Review

Look for:

- **Conflicts** — slice vs spec, spec vs spec, spec vs built code; any
  rule with two readings that would lead to different code.
- **Gaps** — behaviour the slice needs that nobody has defined: empty,
  error, conflict and inactive/deleted-entity cases; interaction with
  finished and pending slices; data-file shape changes (a spec decision,
  not an implementation detail).
- **Acceptance criteria** — any that can't be tested as written, or a
  scope item with no criterion.
- **Copy** — every new user-visible string: headings, labels, buttons,
  empty states, warnings, errors, tooltips, confirmations, Copy output.
  Check each against §9.2 and the wording already on neighbouring
  screens.
- **UI** — placement, layout, component (shadcn first), states (empty,
  loading, warning, error), focus and keyboard, icon, colour.

Sort each finding into one of:

- **Decision** — more than one reasonable answer, and the user's to make.
- **Question** — a fact only the user has.
- **Assumption** — you can decide it sensibly and it's cheap to change;
  state it so the user can veto it.

Pure implementation details stay out unless they change behaviour or
the data format.

## 4. Settle with the user

1. Give an overview first: the numbered list of decisions, questions and
   assumptions, one line each — so the user sees the size of it.
2. Ask the decisions and questions with AskUserQuestion: up to 4 per
   call, 2–4 options each, your recommendation first marked
   "(Recommended)", and in each option's description the trade-off and
   why you would or wouldn't pick it.
3. **Copy decisions:** each option quotes the exact text as it would
   appear, in its place (e.g. the button with the heading above it), and
   says which §9.2 rule it follows.
4. **UI decisions always come with a mockup of every option:**
   - An ASCII wireframe in each option's `preview` — at the real layout,
     with the real copy and names from `backlog/example-data.md`, showing
     the state the decision is about (the warning, the empty state, the
     open detail), not just the default state.
   - When the choice turns on something a wireframe can't show (colour,
     weight, density, icon), also render the options side by side as a
     visual (HTML using the app's tokens from `src/index.css`) before
     asking.
5. Follow-up questions an answer opens go in the next round. Keep going
   until every decision and question is answered and the user has seen
   the assumptions.
6. If the review finds nothing to decide, say so, list the assumptions,
   and ask to go ahead.

## 5. Record, then implement

- Write the outcome into the slice file: add bullets to "Decided in
  review (pre-implementation)" under Scope (create it if missing), update
  `change_summary`, and amend acceptance criteria any decision changes.
  A decision that changes behaviour the spec describes goes into
  `docs/spec.md` too.
- Commit as `Slice <id> spec: <the decisions in plain words>` — never
  `Slice <id>:`, which marks the slice done.
- Then implement per AGENTS.md's Order of work, and verify every
  acceptance criterion before marking the slice complete.
