---
slice_id: "013"
title: "Initiatives overview table with filters"
type: "capability"
status: "valid"
criteria_failures: []
depends_on: ["004c", "011", "012", "041"]
verification_status: null
superseded_by: null
supersedes: null
change_summary: "Loading line dropped (no staged loading exists); chip built without cmdk. Found while slicing the backlog tail: the Initiatives nav item opens a placeholder, and the Portfolio board shows Active initiatives only, so once slices 014 to 016 make On Hold, Cancelled and Closed reachable, those initiatives would be listed nowhere. This slice builds §5.3's table and, with it, §9.11's filter chips as the shared pattern the Portfolio filters (slice 021) reuse."
recommended_model: "Claude Sonnet 5"
model_rationale: "The table reuses 004c's sort and copy and 011's Needs attention items. The new part is the filter chip, a shared pattern with keyboard and session-persistence rules; its behaviour is fully testable with Testing Library."
spec_sections: ["§5.3 Initiatives overview", "§9.11 Lists, filters, inputs and amounts", "§9.2 Copy", "§9.4 Empty states", "§9.5 Accessibility", "§9.10 Icons", "§8.5 Needs attention", "§7.4 Approval tracks"]
---

# Initiatives overview table with filters

## Intent

**Problem statement:** A portfolio or team lead who wants to see every
initiative — including those on hold, cancelled or closed — has nowhere to
go: the Initiatives page is a placeholder and the Portfolio board shows only
Active initiatives. Nothing lets them narrow the portfolio by team, owner or
approval track, or copy a list into a spreadsheet for a steering meeting.

**Outcome statement:** One table lists every initiative in every status,
sorted by what needs attention first, filterable on every key dimension, and
copyable exactly as shown — so no initiative is ever unreachable and the
portfolio can be reported on without re-typing it.

## Scope

- **Table (§5.3).** Columns: **Name**, **Team**, **Owner**, **Phase**,
  **Grand estimate**, **Approval track**, **Status**, and a **Needs
  attention** marker. Every row is a link to the initiative page (§5.4);
  the name is the link text for screen readers. All statuses shown by
  default.
  - Phase: the current phase's label; a Closed initiative shows its final
    phase.
  - Grand estimate: full amount (§9.11, tables show full amounts).
  - Approval track: slice 012's `ApprovalTrackBadge`.
  - Owner: name, "(inactive)" suffix for a deactivated owner, "—" for none.
  - Needs attention: icon-only in the item's state colour with a tooltip
    naming the kind and reason (§9.10 state markers are icon-only in
    tables); empty for initiatives without an item (only Active ones can
    have one, §8.5).
- **Sorting (§9.11).** 004c's sortable headers on every column. Default:
  initiatives with a Needs attention item first in priority order (§8.5),
  then by name. Stable.
- **Filter chips (§9.11), a new shared component.** One row of chips —
  **Team**, **Owner**, **Phase**, **Approval track**, **Status** — each a
  multi-select dropdown with a search field and checkboxes; choices apply
  instantly; an active chip is highlighted and shows its count ("Status: 2").
  Beside the list: "2 of 46 initiatives" and **Clear filters** while any
  filter is active, "46 initiatives" otherwise. Filters are kept for the
  browser session while moving around the app (open an initiative, press
  Back, still set) and reset on reload; not synced. Team and Owner list
  inactive teams and people too, marked "(inactive)", because historical
  initiatives reference them. Owner offers "No owner".
- **Copy (§9.2).** 004c's Copy button copies the rows and columns shown,
  with filters and sort applied, as plain text and HTML. Grand estimate is
  declared a numeric column (041's cell kinds), every other column text.
- **Empty states (§9.4).** No initiatives at all: the Portfolio's existing
  empty state (one line, one action). Filters matching nothing: "No
  initiatives match these filters." with **Clear filters** as the action.

**Explicitly excluded:** Portfolio board filters, year filter and key
metrics (slice 021, which reuses the chip); a search field on the table
(§5.1 — search is the global overlay, slice 034).

## Execution path

1. User triggers: opens **Initiatives** in the top bar.
2. Data: all cached initiatives, with each one's current phase, grand
   estimate, approval track and Needs attention item from the data layer.
3. UI: the table, attention items first; the user opens **Status**, ticks
   On Hold, and the list narrows to "1 of 3 initiatives".
4. User receives: every initiative reachable, the view narrowed to what
   they need, and **Copy** puts exactly that into a spreadsheet.

## Value

- **Desirable:** Leads expect one list of everything, including finished and
  paused work.
- **Usable:** Familiar table conventions: click a header to sort, chips to
  narrow, a row to open.
- **Valuable:** Makes non-Active initiatives reachable, a precondition for
  the lifecycle slices 014 to 016, and establishes the filter pattern the
  Portfolio reuses.

## Acceptance criteria

- [x] Given the example data, when Initiatives is opened, then all three
      initiatives are listed with Name, Team, Owner, Phase, Grand estimate,
      Approval track, Status and a Needs attention marker.
- [x] Given no sort chosen, then initiatives with a Needs attention item come
      first in §8.5 priority order, then the rest by name.
- [x] Given a column header is clicked, then rows sort by it; clicked again,
      the order reverses; rows with equal values keep their relative order.
- [x] Given an On Hold, a Cancelled and a Closed initiative (fixture), then
      all three are listed by default, and none shows a Needs attention
      marker.
- [x] Given a Closed initiative, then its Phase column shows the final
      phase.
- [x] Given the Status chip is opened, then it shows a search field and one
      checkbox per status; ticking On Hold narrows the table at once, the
      chip reads "Status: 1" and is highlighted, and "1 of 3 initiatives"
      and Clear filters appear.
- [x] Given text typed in a chip's search field, then only matching choices
      are listed.
- [x] Given filters on Team and Status, then only rows matching both show
      (AND across chips, OR within a chip).
- [x] Given a filter is set, when an initiative is opened and Back pressed,
      then the filter is still set; after a reload, it is cleared.
- [x] Given Clear filters is clicked, then every chip is cleared and all rows
      show.
- [x] Given filters that match nothing, then the table shows "No initiatives
      match these filters." with a Clear filters action.
- [x] Given Copy is clicked, then exactly the rows and columns shown, in the
      shown order, are copied as plain text and HTML, with full amounts.
- [x] Given a row is clicked, or focused and Enter pressed, then the
      initiative page opens.
- [x] Given keyboard only, then every chip opens with Enter or Space, its
      options are reachable with the arrow keys, Space toggles one, and Esc
      closes it with focus back on the chip.
- [x] Given a screen reader, then each Needs attention marker has an
      accessible name naming the kind (e.g. "Overrun").

## Delivery gate

- [ ] Deployed to production-equivalent environment

## Flags and compromises

The filter chip is built from shadcn's `popover`, `checkbox` and `input`
(via `npx shadcn@latest add`) with its own keyboard handling, because
§9.11 specifies searchable multi-select, no current component offers it,
and `command` (cmdk) keeps Space for typing in its search field. Depends on 041 so the new Copy declares its
numeric columns from the start instead of being retrofitted.

## Decided in review (pre-implementation)

- **Why this slice exists:** without it, initiatives outside Active are
  unreachable once the lifecycle slices ship; it comes before them.
- **Filters:** §9.11 chips on all five dimensions in this slice, built as the
  shared pattern the Portfolio filters (slice 021) reuse — not People's
  plain status Select.
- **Loading line dropped:** Repository loads the whole dataset in one pull
  (no staged loading exists), so "Still loading some initiatives…" has no
  signal. Dropped for good in slice 034's review (a partial list is never shown).
- **Chip build:** popover + checkbox + search input, no `cmdk`. Open with
  Enter or Space; the search field is focused; ↓ moves into the options,
  Space or Enter toggles one, ↑ from the first option returns to search,
  Esc closes with focus back on the chip.
- **Layout:** chips on one row with "1 of 3 initiatives" and **Clear
  filters** at the right of that row; Copy beside the title, as on People.
- **Needs attention column:** header "Needs attention"; icon-only marker in
  the item's state colour; tooltip "<Kind>: <reason>"; accessible name the
  kind. Icons and colours as in the Portfolio strip.
- **Assumptions:** sort keys (owner by name, none last; estimate numeric;
  approval track by severity, none first; attention by §8.5 priority, none
  last; default "attention, then name"); a missing team or owner reads
  "Unknown team" / "Unknown person"; kept filters live in memory above the
  screen, keyed by screen name so slice 021 can reuse them; the Portfolio's
  empty state is extracted and shared; Copy writes the kind name for
  attention and "(inactive)" for an inactive owner; the Copy confirmation
  reads "Copied N initiatives".
