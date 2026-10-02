---
slice_id: "045"
title: "Page shell and layout: shared container, two-column detail, first-run and empty states"
type: "feature"
status: "valid"
criteria_failures: []
depends_on: ["043", "044"]
verification_status: null
superseded_by: null
supersedes: null
change_summary: "From the October 2026 UX review (docs/ux-review-2026-10.md), roadmap group 'Layout update' plus the lens items page shell and process visuals: F11, F16, F17, F25, F26, F27, F30. Layout options are shown as mockups before implementation (AGENTS.md Order of work, step 2); may be split in two when picked up."
recommended_model: "Claude Opus 5.5"
model_rationale: "Layout across every screen, a sticky rail on the busiest page, and several mockup decisions."
spec_sections: ["§5.1 Navigation", "§5.2 Portfolio overview", "§5.4 Initiative detail view", "§5.9 Settings", "§5.10 Connect screen", "§9.8 Visual design", "§9.9 Interface states"]
---

# Page shell and layout: shared container, two-column detail, first-run and empty states

## Intent

**Problem statement:** On a laptop half the window is unused on the main
working page; each screen sets its own width and header. First run shows
three "Create a team" buttons, Getting started never goes away, empty
board columns show nothing, locked settings look disabled, and the Connect
error gives no next step.

**Outcome statement:** Every screen sits in one shell with the same header
and toolbar; the detail page uses the width with a sticky summary rail;
first-run and empty states each have one clear action.

## Scope

1. **F11 Page shell.** One container (about 1280 px), 32 px gutters, the
   044 `PageHeader` and a shared toolbar row (filters left, count and Copy
   table right). Detail page at ≥ 1280 px: phases left, sticky right rail
   with the cost summary, the current gate checklist and the next action.
2. **Process visuals.** A thin phase timeline in the initiative header;
   board column headers with a small cost bar. Tailwind HTML only (§10.1).
3. **F16** Getting started shows "3 of 4 done" and collapses to a chip once
   three steps are done; arriving from the strip highlights its target.
4. **F17** First run: one primary action and one sentence.
5. **F25** New initiative: muted placeholder; greyed previews of the cost
   summary and phases.
6. **F26** Connect: shadcn Checkbox and Label; the error names the likely
   cause and the next step.
7. **F27** Empty board column: dashed placeholder "No initiatives in
   <phase>".
8. **F30** Locked settings show values as plain text; the button reads
   "Unlock to edit" / "Lock".

## Execution path

1. 1440 px → detail page shows phases left and the rail right; scrolling
   keeps the rail in view.
2. Fresh dataset → Portfolio shows one "Create a team" action.
3. Settings → locked values read as text; "Unlock to edit".

## Value

- **Desirable:** A layout that looks deliberate on today's laptops.
- **Usable:** The summary and the next action are always in view.
- **Valuable:** Finishes the review's layout and first-run findings.

## Acceptance criteria

- [ ] Given any screen, then it uses the shared container, PageHeader and
      toolbar row.
- [ ] Given the detail page at ≥ 1280 px, then the rail is sticky and holds
      the cost summary, the current gate checklist and the next action;
      below 1280 px it is one column.
- [ ] Given first run, then exactly one "Create a team" action is visible.
- [ ] Given three of four Getting started steps done, then the strip
      collapses to a chip reading "3 of 4 done".
- [ ] Given an empty board column, then it shows "No initiatives in
      <phase>".
- [ ] Given locked Settings, then values render as text, not disabled
      fields.
- [ ] Given a rejected token on Connect, then the error names the cause and
      links to creating a new token.
- [ ] Given the e2e axe scan in both themes, then every changed screen passes.

## Delivery gate

- [ ] Deployed to production-equivalent environment

## Flags and compromises

Every layout choice is shown as a mockup in the next-slice session. If the
session finds it too large, split as 045 (shell, detail rail, process
visuals) and 045b (first-run, empty and settings states).

## Decided in review (pre-implementation)

(none yet)
