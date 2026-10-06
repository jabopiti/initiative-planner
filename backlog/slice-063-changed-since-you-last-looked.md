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
change_summary: "Chosen by the user on 2 Oct 2026 from the research page 'Patterns worth borrowing' (pattern 12, collaborative editors). Marks what changed since the user last opened each initiative, never who changed it (§1 Non-goals). Settled in review on 5 Oct 2026: own edits never mark (the snapshot is also written while the page is open), the Portfolio line counts every changed initiative regardless of filters, accent dot, previous value struck before the new one, no nav count. After 058 (board, shell) and 059 (key figures), so the markers go onto the final cards, rows and tiles once. §9.9 and §10.4 updated."
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

- [x] Given an initiative opened before and changed since, then its card
      and row carry the dot, with an accessible name ("Changed since you
      last looked").
- [x] Given two such initiatives, then the Portfolio line names 2 and the
      date of the earliest last visit; **Mark as seen** clears all dots.
- [x] Given the page opened, then each changed key figure shows its
      previous value struck through, and on return to the Portfolio its
      dot is gone.
- [x] Given an initiative never opened, then nothing marks it.
- [x] Given IndexedDB unavailable, then nothing is marked and nothing
      fails.
- [x] Given any mark, then no text names who made the change.
- [x] Given the user's own edit on the initiative page, then no dot appears
      on its card or row afterwards and the edited figure shows no previous
      value.
- [x] Given a changed initiative the filters hide, then the Portfolio line
      still counts it, and **Mark as seen** clears it.
- [x] Given Settings → Danger zone → Reset, then the store is emptied and
      nothing is marked.
- [x] Given the e2e axe scan, then the Portfolio line, a dot and a struck
      figure pass in both themes.

## Flags and compromises

Change detection compares the stored key figures and the file's version,
not a field-level diff; a change that leaves the four figures equal shows
the dot but no struck-through value.

## Decided in review (pre-implementation)

User picked research pattern 12 on 2 Oct 2026. Settled in the next-slice
session on 5 Oct 2026:

- **Own edits:** the snapshot (time, four figures, file version) is written
  when the page opens and again whenever the open initiative changes, so a
  user's own edits, and changes that arrive while the page is on screen,
  never mark a dot. The strike-through baseline is the snapshot read once
  at opening and stays fixed for the visit; a figure that did not differ at
  opening shows no previous value, whatever happens later.
- **Stored figures:** the four tile values: Grand estimate, Deviation,
  current phase, and the current gate's "X of Y complete" (the "gate count").
  The struck value is the previous primary value of the tile (previous phase
  name, previous "X of Y").
- **Portfolio line:** "N initiatives changed since you last looked, <day
  date>" ("1 initiative", "today" or "yesterday" when it applies, otherwise
  "Tuesday 29 Sep") with **Mark as seen**, under the strips and above the
  filter row. It counts every changed initiative regardless of the filters;
  **Mark as seen** rewrites all their snapshots to now. The dots show only on
  what the filters show.
- **Dot:** accent-coloured, top right of the card beside the markers, before
  the name in the row; accessible name "Changed since you last looked".
- **Struck value:** on the tile, struck through before the new value; screen
  readers get "was <previous value>". The cost summary Copy and Copy table
  copy current figures only, without marks.
- **Nav:** the Initiatives nav item shows no count.
- **Store:** new IndexedDB object store (`DB_VERSION` 4), keyed by
  repository and branch scope plus initiative id, outside the cache budget,
  never synced, emptied by Reset; records of removed initiatives are
  ignored. An unnamed draft is recorded once it has a file. With IndexedDB
  unreadable nothing is marked. Two tabs: last write wins.
