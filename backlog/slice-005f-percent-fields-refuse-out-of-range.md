---
slice_id: "005f"
title: "Percent fields refuse out-of-range values inline"
type: "capability"
status: "valid"
criteria_failures: []
depends_on: ["004", "005"]
verification_status: null
superseded_by: null
supersedes: null
change_summary: "Found in the review of slices 003 to 005d: typing 120 in an Allocation % field saves 100 with no message, and typing a negative number or text puts the old value back with no message. §9.9 Validation says percent fields accept 0 to 100 and refuse anything else inline with a message. The Team FTE cap (§5.6) also flashes its message only while typing and is silent once the value is saved."
recommended_model: "Claude Sonnet 5"
model_rationale: "One shared input, one rule from §9.9, and three places that use it. The work is making a rejected entry visible and keeping the field in edit; each case is a small component test."
spec_sections: ["§9.9 Interface states (Validation)", "§9.5 Accessibility (Enter commits, Esc cancels)", "§7.2 Capacity, rates, and the three percentages", "§5.6 Person detail view", "§5.4 Initiative detail view (allocation table)", "§5.8 Team detail view"]
---

# Percent fields refuse out-of-range values inline

## Intent

**Problem statement:** A person who types 120 as an Allocation % is told
nothing: the field quietly shows 100. Someone who mistypes a minus sign or a
letter sees the old number come back and cannot tell whether their entry
was read. Even where the tool caps a value on purpose (a person's Team FTE
% cannot pass their unclaimed capacity), the explanation disappears the
moment the value is saved.

**Outcome statement:** This slice contributes to the principle that the
tool never changes what someone typed without saying so, by refusing an
invalid percentage inline with a message, and by keeping a deliberate cap's
message on screen after it is applied.

## Scope

**The rule (§9.9 Validation):** Allocation %, Capacity % and Team FTE %
accept 0 to 100. Anything else, including an empty field, text and a
negative number, is **refused inline with a message**, not corrected.

- A refused entry is not saved. The field **stays in edit** with what was
  typed, marked as invalid (`aria-invalid`), with the message under it,
  linked to the field (`aria-describedby`) and announced. Enter or leaving
  the field with an invalid value repeats the refusal rather than reverting.
- **Esc cancels** the edit and puts the last saved value back (§9.5), as it
  does for every other inline field.
- Fixing the value and pressing Enter or leaving the field saves it as
  today, and the message clears.
- **Deliberate caps stay, and say so.** Where the spec caps a value (a
  person's Team FTE % at their unclaimed capacity, §5.6), the value is set
  to the cap and the message stays visible next to the field after it is
  saved, until the field is edited again: "Set to 40%, the most left. Other
  teams hold the rest." The team detail, where the value may exceed the cap
  and warn (§5.8), is unchanged.
- One implementation: the shared text input gains a way for a commit to
  return an error message, and the percent input uses it. The three places
  that use the percent input (the phase's allocation table, the person
  panel's Capacity and Team FTE, the team detail's Team FTE) get it at once.

**Proposed copy (to agree in chat before implementing):**

| Case | Message |
|---|---|
| Not a number or empty | "Enter a percentage from 0 to 100." |
| Below 0 or above 100 | "Enter a percentage from 0 to 100." |
| Team FTE % capped in the person panel | "Set to 40%, the most left. Other teams hold the rest." |

The one message for all invalid entries keeps it short; the field's own
label names what it is.

**Explicitly excluded:** Whether Allocation % may exceed a person's Capacity
% (that is a warning, §7.2, not a refusal), and decimals, which are accepted
as today.

## Execution path

1. User triggers: types 120 into an Allocation % field and presses Enter.
2. UI: the entry is refused; the field stays in edit with "120", invalid,
   and the message under it.
3. User triggers: types 60 and presses Enter.
4. Data: 60 is saved as today; the message disappears.
5. User triggers (alternative): presses Esc; the last saved value returns.

## Value

- **Desirable:** People expect a number field to say when it did not take
  their number.
- **Usable:** The invalid entry stays where it was typed, so it is fixed,
  not retyped.
- **Valuable:** Removes silent data changes, the most trust-eroding kind.

## Acceptance criteria

- [ ] Given an Allocation % field, when 120 is entered and committed, then
      nothing is saved, the field keeps "120" and is marked invalid, and
      "Enter a percentage from 0 to 100." is shown and announced.
- [ ] Given the same for a negative number, text, and an empty field, then
      each is refused with the same message and none reverts silently.
- [ ] Given a refused entry, when Esc is pressed, then the last saved value
      returns and the message clears.
- [ ] Given a refused entry, when a valid value is entered and committed,
      then it saves with one commit and the message clears.
- [ ] Given the person panel's Team FTE % above the person's unclaimed
      capacity, when it is committed, then the value is set to the cap and
      the message naming the cap stays visible until the field is edited.
- [ ] Given the team detail's Team FTE % above the unclaimed capacity, when
      it is committed, then it saves and the over-capacity warning shows, as
      today.
- [ ] Given Capacity % of 0 to 100, when committed, then it saves as today.
- [ ] Given any invalid entry, when read by a screen reader, then the field
      is reported as invalid with the message as its description.

## Delivery gate

- [ ] Deployed to production-equivalent environment

## Flags and compromises

The current behaviour is a deviation from §9.9, not a spec rule; the spec
already says "refused inline with a message". No spec text changes except
adding the visible cap message to §5.6's Team FTE line. The Esc rule for
inline fields (§9.5) was already applied to `CommitInput` in the slice
003 to 005d review; this slice relies on it.
