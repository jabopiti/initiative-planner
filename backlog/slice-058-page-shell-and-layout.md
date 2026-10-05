---
slice_id: "058"
title: "Page shell and layout: shared container, phase time strip, first-run and empty states"
type: "feature"
status: "valid"
criteria_failures: []
depends_on: ["056", "057"]
verification_status: null
superseded_by: null
supersedes: null
change_summary: "From the October 2026 UX review (docs/ux-review-2026-10.md), roadmap group 'Layout update' plus the lens items page shell and process visuals: F11, F16, F17, F25, F26, F27, F30. Layout options are shown as mockups before implementation (AGENTS.md Order of work, step 2); may be split in two when picked up. Backlog reshuffle (3 Oct 2026): F26 (Connect) moved to 049, which changes the same screen and message table; F13 (Copy button placement) joined from 055 and the board column header icons from 050, since the shared toolbar row here is where the button ends up. Review 4 Oct 2026 (mockups 058-M1 to M8): kept as one slice, delivered in four reviewed sub-slices; container, toolbar rows, time strip layout, welcome card action, Getting started edge states, locked Settings and draft previews settled and recorded in §2, §5.1, §5.2, §5.4, §5.9, §9.2, §9.4, §9.8 and §9.9."
recommended_model: "Claude Opus 5.5"
model_rationale: "Layout across every screen, a time strip on the busiest page, and first-run and settings states."
spec_sections: ["§5.1 Navigation", "§5.2 Portfolio overview", "§5.4 Initiative detail view", "§5.9 Settings", "§9.4 Empty states", "§9.8 Visual design", "§9.9 Interface states", "§9.10 Icons"]
---

# Page shell and layout: shared container, phase time strip, first-run and empty states

## Intent

**Problem statement:** On a laptop half the window is unused on the main
working page; each screen sets its own width and header. First run shows
three "Create a team" buttons, Getting started never goes away, empty
board columns show nothing, locked settings look disabled, and the Copy
button sits in a different place on each screen.

**Outcome statement:** Every screen sits in one shell with the same header
and toolbar; the detail page is one deliberate 960 px column with a phase
time strip; first-run and empty states each have one clear action.

## Scope

1. **F11 Page shell.** One container (about 1280 px), 32 px gutters, the
   057 `PageHeader` and a shared toolbar row (filters left, count and Copy
   table right). The detail page is one centred column of 960 px with the
   four key figures (059) in a row under the header; no rail. The magic bar
   is unchanged (§5.4).
2. **Phase time strip** in the initiative header (§5.4): one segment per
   phase sized by its period, labelled with name and cost, past and current
   filled, no period hatched, month labels and a Today marker; selecting a
   segment scrolls to the phase. Tailwind HTML only (§10.1). Board column
   headers keep count and sum only, restyled (count as a small pill), with
   the phase icon beside the label (§9.10; moved here from 050).
3. **F16** Getting started (§5.2): cleared items ticked and struck through,
   "2 of 4 done" with a progress bar; at three of four done it collapses to
   a chip in the filter row that opens the remaining step in a popover;
   arriving from the strip highlights its target.
4. **F17** First run (§9.4): with no team, the Portfolio shows the welcome
   card (four steps, next step's action the only primary button) and the
   top-bar create button is hidden.
5. **F25** New initiative: muted placeholder; greyed previews of the cost
   summary and phases.
6. **F13** (from 055) Copy button: on every screen at the right end of
   the shared toolbar row, after the count, a ghost button labelled "Copy
   table".
7. **F27** Empty board column: dashed placeholder "No initiatives in
   <phase>".
8. **F30** Locked settings (§5.9): values as plain text, "Unlock to edit"
   in the section header; unlocked, an "Editing" tag and "Lock".

## Execution path

1. 1440 px → detail page is one 960 px column with the key figures row
   and the phase time strip; Today marker on the current month.
2. Fresh dataset → Portfolio shows the welcome card with one "Create a
   team" action.
3. Settings → locked values read as text; "Unlock to edit".

## Value

- **Desirable:** A layout that looks deliberate on today's laptops.
- **Usable:** Where the initiative is in time is visible at a glance.
- **Valuable:** Finishes the review's layout and first-run findings.

## Acceptance criteria

- [ ] Given any screen, then it uses the shared container, PageHeader and
      toolbar row.
- [ ] Given the detail page at any width, then it is one centred column of
      at most 960 px with the time strip and then the cost summary (059's
      key figures row) under the header.
- [ ] Given an initiative with periods, then the header's time strip sizes
      each phase by its period on one month axis, shows a phase without one
      as a hatched block reading "Not costed" or "No period yet", marks
      Today, and selecting a segment scrolls to that phase.
- [ ] Given a screen at 1440 px, then its content sits in a centred
      container of at most 1280 px and the top bar's content lines up with it.
- [ ] Given first run, then the welcome card is shown, "Create a team" is
      its only primary button, and exactly one "Create a team" action is
      visible (the top bar's create button hidden on the Portfolio).
- [ ] Given three of four steps done and no initiatives, then the strip
      stays expanded above the empty state.
- [ ] Given arrival from a Getting started step, then its target has focus
      and the Accent highlight.
- [ ] Given the new-initiative draft, then greyed previews of the time
      strip, key figures and phase rows show under the header, hidden from
      screen readers.
- [ ] Given two of four Getting started steps done, then the strip shows
      them ticked and "2 of 4 done"; given three, it collapses to a chip
      reading "Getting started · 3 of 4 done".
- [ ] Given a board column header, then it shows the phase icon beside
      the label, the count as a pill and the sum.
- [ ] Given an empty board column, then it shows "No initiatives in
      <phase>".
- [ ] Given locked Settings, then values render as text, not disabled
      fields, with "Unlock to edit" in the section header; unlocked, the
      button reads "Lock"; a locked Danger zone shows no action buttons.
- [ ] Given each screen with a table, then "Copy table" is a ghost button
      at the right end of the toolbar row, after the count.
- [ ] Given the e2e axe scan in both themes, then every changed screen passes.

## Flags and compromises

If the session finds it too large, split as 058 (shell, detail column,
time strip) and 058b (first-run, empty and settings states).

## Decided in review (pre-implementation)

Review of 4 October 2026, mockups 058-M1 to M8 (all recommended options
picked):

- **Delivery.** One slice, four sub-slices, each reviewed, committed and
  pushed before the next: (1) shell — container, top bar alignment,
  PageHeader and toolbar row on every screen, Copy table, board column
  headers and empty column; (2) detail column and time strip; (3) welcome
  card, Getting started progress, chip and arrival highlights; (4) locked
  Settings and draft previews. The `Slice 058:` commit comes with the last.
- **Container (M1 A).** Centred, at most 1280 px, 32 px gutters; the top
  bar's content aligned to the same container.
- **Page titles (M1).** The Portfolio gets a visible "Portfolio" title;
  Settings a visible "Settings" title above its nav and section.
- **Portfolio toolbar (M2 A).** One row: filters left; count, Clear
  filters and Copy table right; "Total cost · Deviation" on the line under
  it. §5.2 updated.
- **Other screens (M3).** Initiatives: filters left, count and Copy table
  right. People: the status select moves into the toolbar row, count "9
  people" added, the add-person form stays below. Teams: New team stays
  in the header; the row holds "2 teams" and Copy table. Team page:
  section tables keep Copy table in their section header, without a
  count. Every Copy table is the same ghost button; one in a section is
  named "Copy table: <section>" for screen readers.
- **Time strip (M4 A).** Dated phases on one month axis; a phase without
  a period is a fixed-width hatched block at its place in phase order,
  "Not costed" or "No period yet". Past neutral with a tick, current in
  Accent, future outlined. Today on the axis, on the current phase's block
  when it has no period, or "Today ›" at the axis end once every period
  has passed. A segment is a button (name, state, period and full cost in
  its tooltip and accessible name) that scrolls to its phase, expanding
  it. Shown on Closed and Cancelled initiatives too. Key figures stay
  059's; this slice places today's cost summary under the strip.
- **Welcome card (M5 B).** "Create a team" is the only primary button
  while no team exists; Review rates keeps a text link in its row; later
  rows plain text. No Dismiss for now on the card.
- **Getting started (M6).** Strip "2 of 4 done" with a progress bar; at
  three of four a dashed chip with a circle-check icon first in the
  toolbar row, "Getting started · 3 of 4 done", whose popover reads "One
  step left" with the step link, the bar and Dismiss for now. With no
  initiatives (no toolbar row) the strip stays expanded (A). Arrival
  highlight: focus plus an Accent ring and tint for 3 s (static under
  reduced motion) on Rates are correct, New team, the add-member field,
  and the draft's name field.
- **Empty column.** Dashed placeholder "No initiatives in <phase>", shown
  whenever a column is empty, filters or not.
- **Locked Settings (M7).** Values as text; "Unlock to edit" (lock icon)
  in the section header; Add role, Add country and Reset to weekdays
  hidden while locked; unlocked, an Accent "Editing" tag (pencil) and
  "Lock". The "Locked. Unlock to edit." line goes (§9.9). Danger zone
  locked (A): headings and today's descriptions only, buttons on unlock.
  Rates are correct stays usable while locked.
- **Draft previews (M8 A).** Greyed, aria-hidden previews of the hatched
  time strip, four key-figure tiles reading "—" and one row per phase.
  The placeholder already uses the muted colour.

Earlier review (2 October 2026):

Mockups 045-1 to 045-7 (2 October 2026, when this slice was numbered 045):

- **Detail layout: one wide column (C).** 960 px, key figures in a row,
  gate panel after the current phase; no sticky rail. Keeps 059's
  segmented checklist control at full width and the magic bar as §5.4
  specifies.
- **Header timeline: time strip (A).** Recorded in §5.4.
- **Getting started: progress strip, then chip (B).** Recorded in §5.2.
- **Board column headers: count and sum only (B).** No share bar.
- **First run: welcome card (A).** Recorded in §9.4 and §5.1.
- **Locked settings: button in section header (A).** Recorded in §5.9.
- **Connect 401: cause and one link (A).** Recorded in §5.10; built in
  049 since the 3 Oct 2026 reshuffle.
