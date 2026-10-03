---
slice_id: "063"
title: "Changed since you last looked: dots on cards and rows, previous figures on the page"
type: "feature"
status: "valid"
criteria_failures: []
depends_on: ["058", "059"]
verification_status: null
superseded_by: null
supersedes: null
change_summary: "Chosen by the user on 2 Oct 2026 from the research page 'Patterns worth borrowing' (pattern 12, collaborative editors). Marks what changed since the user last opened each initiative, never who changed it (§1 Non-goals). After 058 (board, shell) and 059 (key figures), so the markers go onto the final cards, rows and tiles once. §9.9 and §10.4 updated."
recommended_model: "Claude Sonnet 5"
model_rationale: "A small per-repository store and a comparison of key figures; the visible parts are a dot, one line and a struck-through value."
spec_sections: ["§9.9 Interface states", "§10.4 Browser storage", "§5.2 Portfolio overview (landing page)", "§5.3 Initiatives overview", "§5.4 Initiative detail view"]
---

# Changed since you last looked: dots on cards and rows, previous figures on the page

## Intent

**Problem statement:** Several people edit the same initiatives. Someone
coming back after a few days can't tell what moved without comparing from
memory; only a value that changes while it's on screen is tinted.

**Outcome statement:** Returning people see which initiatives changed
since they last opened them, and on the page which figures, with the old
value beside the new.

## Scope

1. **Store** (§10.4): per repository in IndexedDB, for each initiative the
   user opens: when, and its key figures then (grand estimate, deviation,
   current phase, gate count). Never synced; unreadable → nothing marked.
2. **Marks** (§9.9): a dot on the card (§5.2) and the row (§5.3) of each
   opened initiative whose figures or file changed since; the Portfolio
   line "N initiatives changed since you last looked, <day date>" with
   **Mark as seen**. Never-opened initiatives aren't marked.
3. **On the page:** a changed key figure shows its previous value struck
   through beside the new one until the page is left; opening the page
   updates the store.

## Execution path

1. Open Checkout Redesign → leave. Another user changes an allocation.
2. Portfolio → "1 initiative changed since you last looked, today" and a
   dot on its card.
3. Open it → Grand estimate shows ~~€381,600~~ €394,800. Back → the dot
   is gone.

## Value

- **Desirable:** Coming back feels caught up, not lost.
- **Usable:** What changed is pointed at, not hunted for.
- **Valuable:** Shared planning without extra meetings to say what moved.

## Acceptance criteria

- [ ] Given an initiative opened before and changed since, then its card
      and row carry the dot, with an accessible name ("Changed since you
      last looked").
- [ ] Given two such initiatives, then the Portfolio line names 2 and the
      date of the earliest last visit; **Mark as seen** clears all dots.
- [ ] Given the page opened, then each changed key figure shows its
      previous value struck through, and on return to the Portfolio its
      dot is gone.
- [ ] Given an initiative never opened, then nothing marks it.
- [ ] Given IndexedDB unavailable, then nothing is marked and nothing
      fails.
- [ ] Given any mark, then no text names who made the change.

## Flags and compromises

Change detection compares the stored key figures and the file's version,
not a field-level diff; a change that leaves the four figures equal shows
the dot but no struck-through value.

## Decided in review (pre-implementation)

User picked research pattern 12 on 2 Oct 2026. Open for the next-slice
session: whether the Initiatives nav item also shows the count.
