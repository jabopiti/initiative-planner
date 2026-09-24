---
slice_id: "005d"
title: "Create an initiative on a guided skeleton page"
type: "capability"
status: "valid"
criteria_failures: []
depends_on: ["003", "005"]
verification_status: null
superseded_by: null
supersedes: null
change_summary: "Reworks the creation flow slice 003 shipped, after using it: the team was chosen for the user, choosing a team or leaving the name field created the initiative at once, and the team could no longer be changed. §5.1 was rewritten to match. Slice 003's acceptance criteria about the old draft behaviour are superseded by this slice's."
recommended_model: "Claude Sonnet 5"
model_rationale: "One screen with a small state machine (name, team, create) and a reuse of slice 005's highlight pattern. The rules are explicit in §5.1 and verifiable with component tests."
spec_sections: ["§5.1 Navigation (New initiative draft page)", "§5.4 Initiative detail view (Header)", "§6 Data model (Initiative)", "§9.4 Empty states"]
---

# Create an initiative on a guided skeleton page

## Intent

**Problem statement:** An initiative owner starting a new initiative is
handed a team they did not choose, and the initiative is saved the moment
they pick a team or click out of the name field, so they cannot finish
typing, change their mind, or see what is still missing.

**Outcome statement:** This slice contributes to the principle that the
tool guides without gatekeeping by making creation one visible, deliberate
step: fill in a name and a team, see the next thing highlighted, and create
the initiative when ready.

## Scope

- **New initiative** opens a skeleton page laid out like the initiative
  header (§5.4): the name field is the title and takes focus, the team
  selector sits beside it, with the "Draft" chip and the **Create
  initiative** button (disabled until a name and a team exist).
- The team selector always starts on **Select team**, even with one team.
  The tool never chooses a team. There is no "last used" team any more:
  the dropdown lists the active teams as they are.
- The next missing thing is highlighted with the brand accent used in
  slice 005: the name first, then the team, then, once both are filled, the
  **Create initiative** button.
- A line under the header states the next step in text (a polite live
  region, so a screen reader hears it change): "Next: name the initiative.",
  then "Next: choose a team.", then "Ready. Create the initiative to start
  planning." No phases are shown on the draft.
- Nothing is saved until **Create initiative** is chosen. Enter in the name
  field does the same once a team is selected; with no team yet it moves
  focus to the team selector. Leaving the name field, or choosing a team,
  saves nothing.
- Esc discards the draft, without a confirmation because nothing was saved,
  and returns to the Portfolio. Browser Back does the same.
- Creating saves the initiative in one commit ("<name>: created"), and its
  detail page replaces the draft, so Back skips the draft. The phases
  appear there, with slice 005's guidance.
- On the initiative page, the name is editable in place (§5.4), so a typo is
  not permanent. It saves on blur or Enter as "<old name>: renamed to <new
  name>"; an empty name is refused and the old one stays. Changing the team is slice 005e.
- With no active team, the button that opens the draft stays unavailable,
  as it is today, and the Portfolio's empty state (§9.4) points to creating a
  team.

**Explicitly excluded:** Changing the team of an existing initiative
(005e), the default plan (005c), and the rest of the header (owner,
description, Actions menu), which arrive with their own slices.

## Execution path

1. User triggers: clicks New initiative.
2. UI: the skeleton page opens with the name field focused and highlighted.
3. User triggers: types a name; the team selector becomes the highlighted
   step; they choose a team; Create initiative becomes the highlighted step.
4. User triggers: clicks Create initiative (or presses Enter).
5. Data: the initiative file is written once (§10.2), with its default plan (slice 005c) when that slice is done.
6. User receives: the initiative's page, with its phases and the next
   highlighted step from slice 005.

## Value

- **Desirable:** An owner expects to be able to type a name, look at the
  options, and only then commit.
- **Usable:** One highlighted next step at a time; nothing happens behind the
  user's back.
- **Valuable:** Removes accidental and half-finished initiatives from the
  portfolio and the surprise of an initiative that appears while typing.

## Acceptance criteria

- [x] Given the New initiative button, when it is clicked, then the draft
      page opens with the name field focused and highlighted, the team
      selector reading "Select team" (even when only one team exists),
      Create initiative disabled, and no phases shown.
- [x] Given the team dropdown, when it opens, then it lists the active teams
      with none marked or preselected.
- [x] Given a name only, when the field is left, then nothing is saved and
      the team selector is the highlighted step.
- [x] Given a team only, when Create initiative is looked for, then it is
      disabled and the name is the highlighted step.
- [x] Given both a name and a team, when the page renders, then Create
      initiative is available and highlighted, and no initiative exists yet.
- [x] Given both a name and a team, when Create initiative is chosen (or
      Enter is pressed in the name field), then exactly one commit is made,
      the initiative's page replaces the draft, Back skips the draft, and its
      phases appear (with their default dates once slice 005c is done).
- [x] Given a draft with a name, when the team is chosen and then changed to
      another team before creating, then the selection changes and nothing is
      saved.
- [x] Given a draft, when Esc is pressed or Back is used, then nothing is
      saved and the Portfolio opens with no confirmation.
- [x] Given an initiative's page, when its name is edited, then the change
      saves in place with a commit naming the initiative.
- [x] Given the highlight, when read by a screen reader, then the guidance
      line states the next step in text and is announced as it changes; it
      is not carried by colour alone.
- [x] Given an initiative's page, when its name is cleared, then the change
      is refused and the previous name stays.

## Delivery gate

- [ ] Deployed to production-equivalent environment

## Flags and compromises

This changes a spec rule, not just its wording: the team no longer defaults
to the only active team, the last-used team memory is removed, and leaving
the name field no longer creates the initiative. §5.1 was updated with this slice.
