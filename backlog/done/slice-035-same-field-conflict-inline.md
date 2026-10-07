---
slice_id: "035"
title: "Same-field conflict shown inline under the field"
type: "capability"
status: "valid"
criteria_failures: []
depends_on: ["005h", "005j"]
verification_status: null
superseded_by: null
supersedes: null
change_summary: "Promoted from the backlog tail (Same-field conflict shown inline under the field, §9.9). 005h shows every conflict in a top banner as a first step; §9.9 puts it under the field. Review: in tables the block is a full-width row under the field's row; select/toggle and whole-item conflicts keep 005h's banner row; a pull can settle an open conflict; typing a new value settles it too."
recommended_model: "Claude Opus 5.5"
model_rationale: "Moves conflict display into the two shared field primitives (as 005j did for failed edits) while keeping the banner for conflicts whose field isn't rendered; must interleave correctly with a failed edit on the same path, a field being edited, and a pull that resolves the conflict remotely."
spec_sections: ["§9.9 Interface states (Same-field conflict)", "§3 Storage & sync (Conflict edge cases)", "§10.5 Merging", "§9.5 Accessibility"]
---

# Same-field conflict shown inline under the field

## Intent

**Problem statement:** When Mara and Jonas both change Felix Brandt's
Allocation % in Development, the conflict appears in a banner at the top of
the page, away from the field. On a page with many allocations, the user has
to work out which field the banner means before they can decide.

**Outcome statement:** A same-field conflict shows directly under the field
it concerns, with both values and Keep theirs / Use mine (§9.9); the top
banner only points to conflicts whose field isn't on screen.

## Scope

- **Inline (§9.9).** Wired once into `CommitInput` and `PopoverTextField`
  (like 005j's failed state): a field whose path has an open conflict shows
  under it "Changed by someone else while you edited", "Theirs: 60% · Yours:
  80%" (formatted as the field formats values, 005h's `describeConflict`),
  **Keep theirs** and **Use mine**. Accessible names name the field ("Keep
  theirs for Felix Brandt's Allocation %").
- **Banner for off-screen conflicts.** ConflictBanner shows only conflicts
  whose field isn't rendered (collapsed phase, another page, closed panel), as
  one line per initiative/person: "1 unresolved change on Checkout Redesign —
  Show", where Show navigates and expands to the field (the Needs attention
  jump mechanism). With none off-screen, no banner.
- **Precedence.** A path under a conflict never shows 005j's failed-edit
  state too (005j's rule, now inline). Read-only banner stays above.
- **Resolution** unchanged (005h): choosing saves; a failed save keeps the
  conflict open with its message.

**Explicitly excluded:** conflicts on list items as a whole (merged by id,
§3) — only same-field conflicts.

## Execution path

1. Jonas saves Felix Brandt at 60%; Mara, editing, commits 80%.
2. Mara's field shows "Theirs: 60% · Yours: 80%" with Keep theirs / Use mine
   under it; no top banner.
3. Mara collapses Development: the banner shows "1 unresolved change on
   Checkout Redesign — Show".

## Value

- **Desirable:** Decide where the value is, not in a banner.
- **Usable:** Both values and both choices beside the field.
- **Valuable:** Fewer wrong choices in conflict resolution.

## Acceptance criteria

- [x] Given a same-field conflict on a rendered text field, then under it (in a
      table: a full-width row under its row) show "Changed by someone else
      while you were editing. Theirs: 60% · Yours: 80%", both values formatted
      as the field does, Keep theirs and Use mine; no top banner for it.
- [x] Given a conflict on a select or toggle, or an item removed on one side
      and changed on the other, then the banner shows 005h's full row with
      Keep theirs / Use mine, wherever the user is.
- [x] Given a new value typed and committed in a conflicted field, then the
      conflict closes and that value is saved, the commit message ending
      "(conflict: replaced)".
- [x] Given Show on a person, then People opens with that person's panel
      (opened on arrival, not through the URL); on a membership, the team's page; on a role or
      country, its Settings section; on an initiative, its page with the
      phase opened. Focus lands on the block's Keep theirs.
- [x] Given Keep theirs or Use mine, then 005h's resolution runs and the inline
      block disappears once saved.
- [x] Given the save fails, then the block stays with the failure message.
- [x] Given the conflicted field isn't rendered, then the top banner reads
      "<n> unresolved change(s) on <entity> — Show", and Show brings the
      field into view with its inline block.
- [x] Given a conflicted path that also failed to save, then only the conflict
      block shows.
- [x] Given two conflicts on one screen, then each inline block's buttons have
      distinct accessible names naming their field, and each block is
      announced (`role="alert"`).
- [x] Given another user's pull settles the conflict remotely (theirs equals
      mine), then the block disappears.

## Flags and compromises

None.

## Decided in review (pre-implementation)

- **Banner:** kept only as a pointer to conflicts whose field isn't on screen,
  with Show; inline everywhere else.

Settled in the 035 review session (2026-10-01):
- **Placement (U1 B).** Under a field outside a table, the block is one line
  directly beneath it. In a table (allocations, cost items, actuals,
  memberships, roles, countries) it is a full-width row under the field's
  row. The primitives (`CommitInput`, `PopoverTextField`, `CommitTextarea`)
  look up and resolve the conflict; a table only places the block.
- **Copy (C1, C2).** Block: "Changed by someone else while you were editing.
  Theirs: <theirs> · Yours: <mine>" with **Keep theirs** / **Use mine**,
  values via `describeConflict`. Banner pointer: "<n> unresolved change(s)
  on <entity> — Show", one line per entity (a membership reads "Felix Brandt
  in Platform"), Show an underlined link. A failed choice keeps 005h's
  "Your choice was not saved: <cause>. Choose again to retry."
- **No inline home (D1 A).** Conflicts on selects and toggles (Owner, Team,
  Role, Country, Active, checklist status, cost item timing, suggested
  periods) and on removed-vs-changed list items keep 005h's full banner row
  under its intro sentence, below the pointer lines.
- **On screen (D2).** A field showing a conflict registers file + path in a
  UI-side registry while mounted; the banner points only to conflicts no
  mounted field has registered (and that have an inline home).
- **Typing in a conflicted field (D3).** Committing a new value is a third
  choice: the conflict closes and the value is saved, the commit message
  noting "(conflict: replaced)".
- **Show (D4).** Initiative → its page, phase opened; person → People with
  the panel open; membership → the team's page;
  role / country → its Settings section. Scrolls to the block and focuses
  Keep theirs (§9.5). Implementation note: Show hands the target to the page
  it opens (which expands the phase, opens the person's panel or the
  country's rates) rather than through a `?person=` URL, so it works again
  on a page that is already open.
- **Assumptions.** Accessible names come from the field's label ("Keep
  theirs for Allocation % for Jonas Keller"); the block is `role="alert"`
  and the field's `aria-describedby` points to it. The field shows the
  saved value until a choice. A pull that arrives while a conflict is open
  merges against the screen: a conflict whose pulled value equals mine
  closes, one whose theirs changed shows the new value. Buttons stay
  enabled in read-only mode and in a locked Settings section. A refusal
  from fresh typing shows above the block; 005j's Not saved never shows on
  a conflicted path.
