---
slice_id: "004c"
title: "Sort and copy the Teams and People tables"
type: "capability"
status: "valid"
criteria_failures: []
depends_on: ["004"]
verification_status: null
superseded_by: null
supersedes: null
change_summary: "Inserted after slice 004 shipped: §9.11 (sorting, long text) and §9.2 (Copy) were not covered by any slice. This slice covers them for the tables that already exist; later slices apply them to the tables they add."
recommended_model: "Claude Sonnet 5"
model_rationale: "Well-specified UI behaviour with one reusable pattern (a sortable header and a Copy action) applied to two tables; no hard reasoning."
spec_sections: ["§9.11 Lists, filters, inputs and amounts (Sorting, Long text)", "§9.2 Copy", "§5.5 People overview"]
---

# Sort and copy the Teams and People tables

## Intent

**Problem statement:** The Teams and People tables show rows in whatever
order they were created, long names run off the row, and there is no way
to get what is on screen into a spreadsheet or a document, which is the
only output route the tool has (§9.2).

**Outcome statement:** This slice contributes to the tool's core loop by
letting a team lead order a roster the way they need it and hand it to
someone who does not use the tool.

## Scope

- A reusable sortable column header: a click sorts by that column and a
  second click reverses it; the sort is stable (§9.11). It is keyboard
  operable and announces the sort direction.
- Default sorts: People, team members and teams by name (§9.11).
- Sorting applied to the Teams overview, the People overview and the team
  detail Members list.
- Long names cut with an ellipsis and shown in full in a tooltip.
- A Copy button on the People table (§5.5) that copies exactly what is
  shown, with the active filter and sort applied, as both plain text and
  rich HTML. The Teams overview and the Members list get the same button
  through the same component.
- The reusable pieces are built so that later slices can add the Portfolio
  board, Initiatives table, capacity grid and cost views without new
  copy or sort code.

**Explicitly excluded:** Filter chips with multi-select dropdowns, the
month and date inputs, and compact amounts (§9.11). The tables that need
them do not exist yet; they arrive with the slices that add those tables.
Copy on the Portfolio board, Initiatives table, capacity grid and cost
summary (§9.2) is added by the slice that builds each of them.

## Execution path

1. User triggers: on the People overview, clicks the Role column header.
2. UI: the rows re-sort by role, the header shows the direction, and a
   second click reverses it.
3. User triggers: clicks Copy.
4. UI/data: the visible rows, in the shown order and under the active
   filter, are written to the clipboard as plain text and as an HTML
   table.
5. User receives: pasting into a spreadsheet gives one cell per value; a
   confirmation appears that the copy worked.

## Value

- **Desirable:** A team lead asked to share the roster with a manager or
  paste it into a planning document would look for this at once.
- **Usable:** The header click and the Copy button follow familiar table
  conventions and need no guidance.
- **Valuable:** Sets the sort and copy pattern once, so every later table
  gets it cheaply, and gives the tool its only output route.

## Acceptance criteria

- [ ] Given the People overview, when a column header is clicked, then
      the rows sort by that column, a second click reverses the order,
      and rows with equal values keep their previous relative order.
- [ ] Given the Teams overview, the People overview and the Members
      list, when they first load, then they are sorted by name.
- [ ] Given a name too long for its cell, when the row renders, then the
      name is cut with an ellipsis and its full text is available in a
      tooltip.
- [ ] Given the People table with a filter and a sort applied, when Copy
      is clicked, then the clipboard holds plain text and HTML containing
      exactly the shown rows and columns in the shown order.
- [ ] Given Copy succeeded or failed, when the click finishes, then the
      user sees a confirmation or an error message.
- [ ] Given a sortable header, when it is used with the keyboard only,
      then it can be sorted and its direction is announced.

## Delivery gate

- [ ] Deployed to production-equivalent environment

## Flags and compromises

None.
