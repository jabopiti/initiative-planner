---
slice_id: "036"
title: "Accessibility and membership fixes from the review"
type: "bugfix"
status: "valid"
criteria_failures: []
depends_on: ["004", "005j"]
verification_status: null
superseded_by: null
supersedes: null
change_summary: "Promoted from the backlog tail (Accessibility fixes from the review). Four findings, all re-confirmed in the code while slicing: the add-member list has no keyboard support, the person panel cannot rejoin a team whose membership was deactivated, the sync indicator's read-only cause is hover-only (and uses the Alarm colour, which §9.8 reserves for Overrun), and the synced check icon has no accessible name."
recommended_model: "Claude Sonnet 5"
model_rationale: "Four small, independent fixes, each with a failing test to write first; the keyboard combobox is the only one with several states."
spec_sections: ["§9.5 Accessibility", "§5.1 Navigation (sync indicator)", "§5.6 Person detail view", "§5.8 Team detail view", "§9.3 Deletion rules", "§9.8 Visual design (Colour roles)", "§9.10 Icons"]
---

# Accessibility and membership fixes from the review

## Intent

**Problem statement:** A keyboard user cannot add a member to a team: the
options under "Add member" can't be reached with the arrow keys. A person
whose membership was deactivated can never be added back to that team from
their panel. A screen reader user hears nothing from the sync indicator when
all is synced, and in read-only mode the cause is only in a hover tooltip.

**Outcome statement:** Every one of these works by keyboard and screen
reader, and a deactivated membership can be taken up again.

## Scope

1. **Add-member combobox (§9.5).** TeamDetail's "Add member" field becomes a
   full ARIA combobox: ArrowDown/ArrowUp move an active option
   (`aria-activedescendant`, `aria-selected`), Enter chooses it (existing
   person, or Create "<name>"), Esc clears, Tab leaves. The informational "No
   one else to add." is not an option. Extend the existing list markup; add
   no new component dependency (028 and 013 add shadcn's `command` and may
   run at the same time).
2. **Rejoin a team (§5.6, §9.3).** The person panel's Add to team offers a team
   whose membership is inactive; choosing it **reactivates that membership**
   (same id), its Team FTE % capped at the person's unclaimed capacity with
   the existing cap message. No duplicate membership is created. Commit:
   "Lucía Ramos: rejoined Platform".
3. **Sync indicator cause visible (§5.1, §9.8).** In read-only mode the label
   reads "Read-only" plus the short cause ("Read-only · Cannot reach GitHub"),
   in the **Warning** colour, not Alarm (§9.8 reserves Alarm for Overrun). The
   full message stays in the banner (005j).
4. **Synced icon name (§9.5).** The check icon gets the accessible name
   "Synced" ("Synced, updated by others" when so).

## Execution path

1. Keyboard: Tab to Add member, type "fe", ArrowDown, Enter → Felix Brandt
   added.
2. Person panel for Lucía Ramos (Platform membership inactive): Add to team →
   Platform → membership active again.
3. GitHub unreachable: the top bar reads "Read-only · Cannot reach GitHub" in
   Warning.

## Value

- **Desirable:** Keyboard and screen-reader users must be able to do
  everything (§9.5).
- **Usable:** Standard combobox keys.
- **Valuable:** Closes the review's open accessibility findings and a real
  dead end in memberships.

## Acceptance criteria

- [ ] Given Add member with matches, then ArrowDown/ArrowUp move the active
      option (announced), Enter adds that person, Esc clears the field.
- [ ] Given no exact match, then "Create '<name>'" is reachable by arrow keys
      and Enter creates the person.
- [ ] Given a person whose Platform membership is inactive, then the panel's
      Add to team lists Platform; choosing it reactivates the same membership
      (same id), capped at unclaimed capacity with the cap message.
- [ ] Given that, then no second Platform membership exists.
- [ ] Given read-only, then the sync indicator's visible label includes the
      short cause, in the Warning colour.
- [ ] Given synced, then the indicator has the accessible name "Synced" (or
      "Synced, updated by others").
- [ ] Given axe (or equivalent) on Team detail and the top bar, then no
      violations for these elements.

## Flags and compromises

The short cause labels ("Cannot reach GitHub", "Rate limited", "Access
denied", "Dataset newer than this build") are an assumption from §3's cause
table; the full sentence stays in the banner.

## Decided in review (pre-implementation)

- **Rejoin:** reactivates the existing membership record; no new record.
- **Commit wording:** a membership going from inactive to active is committed
  as "<Person>: rejoined <Team>" from both the person panel's Add to team and
  the team detail's Reactivate button; a changed Team FTE % is appended
  ("…, Team FTE % set to 20%").
- **Sync label:** read-only reads "Read-only · <cause>" in Warning: "Cannot
  reach GitHub", "Rate limited", "Access denied", "Dataset newer than this
  build", "Different process build", and "Cannot save" for any other cause.
  Dataset refusals get their own failure cause so the last three can be told
  apart.
- **Rejoin entry:** the person panel lists a team with an inactive membership
  by its plain name, like any other joinable team.
- **Add member keys:** no option is active until ArrowDown; Enter with none
  active does nothing; arrows wrap; options are not tab stops; blur closes
  the list and keeps the text.
- **Rejoin cap message:** the panel remembers a clamp on rejoin so the
  existing cap message shows beside the field.
- **Synced icon:** `role="img"` with the accessible name; no live region.
- **Tests:** an axe scan of Team detail with the Add member list open joins
  `e2e/a11y.spec.ts`.
