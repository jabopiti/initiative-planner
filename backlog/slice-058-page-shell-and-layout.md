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
change_summary: "From the October 2026 UX review (docs/ux-review-2026-10.md), roadmap group 'Layout update' plus the lens items page shell and process visuals: F11, F16, F17, F25, F26, F27, F30. Layout options are shown as mockups before implementation (AGENTS.md Order of work, step 2); may be split in two when picked up."
recommended_model: "Claude Opus 5.5"
model_rationale: "Layout across every screen, a time strip on the busiest page, and first-run and settings states."
spec_sections: ["§5.1 Navigation", "§5.2 Portfolio overview", "§5.4 Initiative detail view", "§5.9 Settings", "§5.10 Connect screen", "§9.4 Empty states", "§9.8 Visual design", "§9.9 Interface states"]
---

# Page shell and layout: shared container, phase time strip, first-run and empty states

## Intent

**Problem statement:** On a laptop half the window is unused on the main
working page; each screen sets its own width and header. First run shows
three "Create a team" buttons, Getting started never goes away, empty
board columns show nothing, locked settings look disabled, and the Connect
error gives no next step.

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
   headers keep count and sum only, restyled (count as a small pill).
3. **F16** Getting started (§5.2): cleared items ticked and struck through,
   "2 of 4 done" with a progress bar; at three of four done it collapses to
   a chip in the filter row that opens the remaining step in a popover;
   arriving from the strip highlights its target.
4. **F17** First run (§9.4): with no team, the Portfolio shows the welcome
   card (four steps, next step's action the only primary button) and the
   top-bar create button is hidden.
5. **F25** New initiative: muted placeholder; greyed previews of the cost
   summary and phases.
6. **F26** Connect: shadcn Checkbox and Label; the 401 message names the
   likely cause and links "Create a new token" (§5.10).
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
- [ ] Given the detail page at any width, then it is one column of at most
      960 px with the four key figures in a row under the header.
- [ ] Given an initiative with periods, then the header's time strip sizes
      each phase by its period, hatches a phase without one, marks Today,
      and selecting a segment scrolls to that phase.
- [ ] Given first run, then the welcome card is shown and exactly one
      "Create a team" action is visible.
- [ ] Given two of four Getting started steps done, then the strip shows
      them ticked and "2 of 4 done"; given three, it collapses to a chip
      reading "Getting started · 3 of 4 done".
- [ ] Given an empty board column, then it shows "No initiatives in
      <phase>".
- [ ] Given locked Settings, then values render as text, not disabled
      fields, with "Unlock to edit" in the section header; unlocked, the
      button reads "Lock".
- [ ] Given a rejected token on Connect, then the error names the cause and
      links to creating a new token.
- [ ] Given the e2e axe scan in both themes, then every changed screen passes.

## Flags and compromises

If the session finds it too large, split as 058 (shell, detail column,
time strip) and 058b (first-run, empty and settings states).

## Decided in review (pre-implementation)

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
- **Connect 401: cause and one link (A).** Recorded in §5.10.
