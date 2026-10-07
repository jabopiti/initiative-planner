---
slice_id: "021"
title: "Portfolio filters, year filter, key metrics and Copy"
type: "capability"
status: "valid"
criteria_failures: []
depends_on: ["013", "020"]
verification_status: null
superseded_by: null
supersedes: null
change_summary: "Found while slicing the backlog tail: §5.2's filter row, year filter, key metrics (Total cost, Deviation) and Copy were never built; the board shows every Active initiative with no way to narrow it. Reuses 013's filter chips. Review settled: chips name a single picked value, the Year chip is a radio list, a non-Active card shows a status icon, metrics sit inline on the count row, Copy appends the metrics as rows."
recommended_model: "Claude Opus 5.5"
model_rationale: "The year filter changes every figure on the page (cards, column sums, both metrics) to in-year cost and in-year deviation, and hides initiatives with no cost that year; those year-scoped sums over phases, cost items and actuals need careful data-layer functions and tests across year boundaries."
spec_sections: ["§5.2 Portfolio overview (Filters, Key metrics, Copy, Year filter)", "§9.11 Lists, filters, inputs and amounts", "§9.2 Copy", "§4 Core definitions", "§7.3 Actuals default to the estimate once a month closes", "§9.4 Empty states"]
---

# Portfolio filters, year filter, key metrics and Copy

## Intent

**Problem statement:** Before a steering meeting, a portfolio lead needs
"Platform's initiatives, this year: what do they cost, how far are actuals
off, and can I paste that into the deck" — and the board can't narrow by
team, can't scope to a year, shows no totals, and can't be copied.

**Outcome statement:** The Portfolio narrows to any slice of the portfolio,
scopes every figure to a year when asked, states the total cost and deviation
of what is shown, and copies exactly that — so portfolio reporting is done
from the board, not rebuilt in a spreadsheet.

## Scope

- **Filter row (§5.2, §9.11).** 013's chips: **Team**, **Phase**, **Year**,
  **Initiatives** (specific initiatives, by name), **Approval track**,
  **Status**. **Status defaults to Active** and shows as an active chip
  ("Status: Active"), so On Hold, Closed and Cancelled appear only when
  widened; Clear filters returns Status to Active, not to all. "2 of 3
  initiatives" and Clear filters beside the list as in 013. Kept for the
  session, reset on reload, **separate** from the Initiatives table's
  filters.
- **Year filter (§5.2).** A single-select chip: **All years** (default) and
  every year any initiative has cost in. With a year selected: cards, column
  headers and metrics show only cost falling in that year; deviation counts
  only months of that year; initiatives with no cost in that year are
  hidden. The approval track badge stays on the lifetime grand estimate.
  Year-scoped cost and deviation are data-layer functions beside
  `grandEstimate` and `grandDeviation`.
- **Key metrics (§5.2).** Above the board, for the initiatives shown: **Total
  cost** (grand estimate, or in-year cost) and **Deviation** (recorded
  actuals minus their estimates, over months with a recorded actual), compact
  amounts with the full amount in a tooltip, deviation always signed and
  overspend in the Warning colour (§9.11).
- **Copy (§5.2, §9.2).** A Copy button beside the count copies the initiatives
  shown (name, team, owner, phase, cost, approval track, status) and the two
  metrics, as plain text and HTML, with full amounts, filters applied.
- **Empty (§9.4).** Filters matching nothing: the board's columns stay, and
  one line "No initiatives match these filters." with Clear filters.

**Explicitly excluded:** the Getting started strip (033).

## Execution path

1. User triggers: Portfolio → Team: Platform, Year: 2026.
2. Data: Platform's Active initiatives with cost in 2026; their 2026 cost and
   2026 deviation.
3. UI: "2 of 3 initiatives"; Total cost €310 k, Deviation +€4 k in Warning;
   cards and column sums show 2026 cost.
4. User receives: Copy puts that table and the two metrics into the deck.

## Value

- **Desirable:** Scoped totals are the first thing a portfolio review asks for.
- **Usable:** The same chips as the Initiatives table.
- **Valuable:** Makes the board the reporting tool, the one output route the
  tool has (§9.2).

## Acceptance criteria

- [x] Given the Portfolio opens, then the chip row shows Team, Phase, Year,
      Initiatives, Approval track and Status, with Status active on "Active".
- [x] Given Status widened to On Hold, then On Hold initiatives appear in
      their phase columns with the On Hold icon (tooltip "On Hold").
- [x] Given one value picked in a chip, then the chip reads "<Chip>: <value>";
      two or more read "<Chip>: <n>" — on the Portfolio and the Initiatives
      table.
- [x] Given Clear filters, then every chip clears except Status, which returns
      to Active.
- [x] Given a filter set on the Portfolio, then the Initiatives table's filters
      are unchanged, and vice versa.
- [x] Given the Initiatives chip, then typing narrows the list of initiative
      names and ticking two shows only those.
- [x] Given Year: 2026, then each card and column header shows only cost in
      2026, initiatives with no 2026 cost are hidden, and the approval track
      badge is unchanged.
- [x] Given a phase spanning Nov 2026 to Feb 2027 (fixture), then Year 2026
      counts Nov and Dec only, and 2027 counts Jan and Feb only.
- [x] Given the initiatives shown, then Total cost is the sum of their (in-year)
      cost and Deviation the sum of actual minus estimate over months with a
      recorded actual (in that year), signed, overspend in Warning.
- [x] Given Copy, then the shown initiatives and, after a blank row, "Total
      cost" and "Deviation" rows are copied as plain text and HTML with full
      amounts; with a year picked the cost header is "Cost in <year>".
- [x] Given filters matching nothing, then the columns stay, "No
      initiatives match these filters." shows with Clear filters, and the
      metrics read €0.
- [x] Given only the default Status: Active, then the count reads "x of n
      initiatives" over every initiative and Clear filters is hidden.
- [x] Given a reload, then every filter is back to its default.

## Flags and compromises

§9.11 says every filter chip is a multi-select; the Year chip is
single-select by decision (one year's figures, or all). Record that
exception in §9.11 and §5.2 when this ships. Copy declares its amount
columns numeric (041).

## Decided in review (pre-implementation)

- **Year filter:** a single-select chip, All years or one year.
- **Filter state:** separate from the Initiatives table's, per list.
- **Chip label (both lists):** an active chip names its value when one is
  picked ("Status: Active", "Team: Platform") and counts when more are
  ("Team: 2"). Changes the Initiatives table's chips too.
- **Chips:** Team, Phase, Year, Initiatives, Approval track, Status — no
  Owner chip (§5.2). The Year and Initiatives chips are Portfolio-only.
  AND across chips, OR within one. The Initiatives chip lists every
  initiative; the Year chip lists every year any initiative (any status)
  has non-zero cost in, not narrowed by the other chips.
- **Year chip:** a radio list — "All years", then each year — with no
  search field; picking applies and closes. Label "Year", or "Year: 2026".
- **Status on a card:** a non-Active card shows a neutral status icon in
  its top-right corner, left of the attention marker when both show: On
  Hold circle-pause, Cancelled circle-x, Closed circle-check; the status is
  its accessible name and tooltip. Active shows none.
- **Layout:** chip row; under it one row with "Total cost €310 k ·
  Deviation +€4 k" on the left and the count, Clear filters and Copy on
  the right; then the board. Deviation is signed ("+€4 k", "−€3 k", "€0"),
  overspend in Warning.
- **Count:** "x of n initiatives", n being every initiative in the
  dataset, also in the default state ("3 of 4 initiatives"). Clear filters
  shows only when it would change something (any chip other than Status:
  Active set).
- **Empty:** the line "No initiatives match these filters." with Clear
  filters sits above the still-visible columns; the metrics stay at €0.
- **Phase filter:** columns are never removed; filtered-out phases just
  hold no cards.
- **Copy:** one table — Name, Team, Owner, Phase, cost ("Grand estimate",
  or "Cost in 2026" with a year), Approval track, Status — in board order
  (phase, then card order), then a blank row and the rows "Total cost" and
  "Deviation" with their full amounts in the cost column.
- **Year figures:** month by month, recorded actuals where they exist and
  estimates elsewhere (a frozen phase from its snapshot);
  `yearEstimate`/`yearDeviation` beside `grandEstimate`/`grandDeviation`.
