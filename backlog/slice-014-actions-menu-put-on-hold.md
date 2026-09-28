---
slice_id: "014"
title: "Actions menu, with Put on hold and Resume"
type: "capability"
status: "valid"
criteria_failures: []
depends_on: ["008", "012", "013"]
verification_status: null
superseded_by: null
supersedes: null
change_summary: "Promoted from the backlog tail (Put on hold / Resume, §8.4). Also builds the initiative Actions menu (§5.4) that slices 015 to 018 and 025 add to. Depends on 013 so an On Hold initiative, which leaves the Portfolio board, is still listed somewhere."
recommended_model: "Claude Sonnet 5"
model_rationale: "A status change and a menu on existing patterns. The magic bar's on-hold state is a new branch in a component with several states already, so its tests must pin the interplay (on hold while overrun, on hold right after a pass)."
spec_sections: ["§5.4 Initiative detail view (Actions menu, magic bar)", "§8.4 Closing and cancelling", "§8.5 Needs attention", "§7.2 Capacity, rates, and the three percentages", "§9.5 Accessibility", "§9.9 Interface states (Confirmations, Messages)", "§9.10 Icons", "§10.3 Writing"]
---

# Actions menu, with Put on hold and Resume

## Intent

**Problem statement:** When Checkout Redesign is paused — budget frozen, team
pulled onto an incident — its owner has no way to say so. It keeps showing on
the Portfolio, keeps raising Needs attention items, and keeps counting
against Platform's capacity, so the team lead sees warnings about work nobody
is doing.

**Outcome statement:** One click marks an initiative On Hold: it leaves the
Portfolio board and Needs attention, stops counting toward capacity, stays
fully editable, and cannot pass a gate until it is resumed — and Resume is
always one click away.

## Scope

- **Actions menu (§5.4).** A "⋯" icon button at the end of the header's meta
  row (after the approval track badge, slice 012), tooltip and accessible
  name "Actions", opening a shadcn `dropdown-menu` (new component, via
  `npx shadcn@latest add dropdown-menu`). It lists **only the actions that
  apply now**: an unbuilt action is absent, and an action that doesn't
  apply to the current status is hidden, never shown disabled. In this
  slice: **Put on hold** (Active) and **Resume** (On Hold), each with a
  Lucide icon (Pause, Play). Later slices add Cancel (015), Reopen (016),
  Delete (017), Duplicate (025).
- **Put on hold / Resume (§8.4, §9.9).** One click, no confirmation, no
  reason. Status becomes On Hold / Active. Commits: "Checkout Redesign: put
  on hold", "Checkout Redesign: resumed".
- **While On Hold (§8.4, §8.5, §7.2).** Every field stays editable (name,
  description, owner, team, periods, allocations, cost items, checklist,
  actuals). It leaves the Portfolio board (Active only) and never appears in
  Needs attention (already true in the data layer); its allocations don't
  count toward capacity (already true: `countsTowardCapacity`). It stays in
  the Initiatives table (013).
- **Status badge (§9.10).** The header's status chip gains an icon: Pause for
  "On Hold". Same neutral chip, no colour — On Hold is not a problem state.
- **Magic bar on hold (§5.4).** The stepper stays. The guidance line reads
  "On hold" with a pause icon and a **Resume** button beside it; Pass gate is
  muted (and Skip gate, once slice 018 adds it). Selecting the muted Pass gate
  changes the line to "Checkout Redesign is on hold. Resume it to pass G2."
  with Resume still beside it. Overrun is not shown while on hold.

**Explicitly excluded:** Cancel and the whole-initiative freeze (015); Reopen
in the menu (016); Delete (017); Duplicate (025).

## Execution path

1. User triggers: on Checkout Redesign, opens ⋯ Actions and picks **Put on
   hold**.
2. Data: `status: "On Hold"` in `initiatives/<id>.json`, one commit.
3. UI: the badge reads "⏸ On Hold"; the magic bar reads "⏸ On hold
   [Resume]" with Pass gate muted; the Portfolio board and Needs attention
   no longer show it; Platform's capacity grid drops its allocations.
4. User receives: a paused initiative that stops generating noise, resumed
   with one click from the bar or the menu.

## Value

- **Desirable:** Pausing work without cancelling it is routine; owners expect
  to say so without losing the plan.
- **Usable:** One click each way, and the way back is always on screen.
- **Valuable:** Removes false capacity warnings and attention items for
  paused work, keeping both signals trustworthy.

## Acceptance criteria

- [ ] Given an Active initiative, when ⋯ Actions is opened, then it lists
      Put on hold and no action that isn't built or doesn't apply.
- [ ] Given Put on hold is chosen, then the status is On Hold, the commit
      reads "<name>: put on hold", and no confirmation was asked.
- [ ] Given an On Hold initiative, then the Actions menu lists Resume and not
      Put on hold, and the status badge shows the pause icon and "On Hold".
- [ ] Given an On Hold initiative, then the magic bar shows "On hold" and a
      Resume button, and Pass gate is muted.
- [ ] Given the muted Pass gate is selected while on hold, then the bar reads
      "<name> is on hold. Resume it to pass <gate>." and no gate is passed.
- [ ] Given Resume is chosen (bar or menu), then the status is Active, the
      commit reads "<name>: resumed", and the bar returns to its gate state.
- [ ] Given an On Hold initiative, then its name, description, owner, team,
      periods, allocations, cost items, checklist and actuals are all still
      editable.
- [ ] Given an On Hold initiative, then it is not on the Portfolio board, not
      in Needs attention or the nav count, and its allocations are not in the
      team capacity grid's counted figures; it is listed in the Initiatives
      table.
- [ ] Given an On Hold initiative whose phase is past its end date, then the
      bar shows the on-hold state, not the overrun alarm.
- [ ] Given keyboard only, then the ⋯ button opens the menu with Enter or
      Space, items are reachable with the arrow keys, and Esc closes it with
      focus back on the button; the button's accessible name is "Actions".

## Delivery gate

- [ ] Deployed to production-equivalent environment

## Flags and compromises

None.

## Decided in review (pre-implementation)

- **Menu trigger:** a "⋯" icon button with tooltip "Actions", at the end of
  the header's meta row — not a labelled "Actions ▾" button.
- **Menu contents:** only applicable, built actions; nothing disabled,
  nothing placeholder.
- **Magic bar on hold:** "On hold" with a Resume button; the muted Pass gate,
  when selected, turns the line into "<name> is on hold. Resume it to pass
  <gate>."
- **Status badge:** the existing neutral chip with an icon per status (Pause
  for On Hold; Ban and Lock for Cancelled and Closed in 015); no colour.
- **No confirmation and no reason** for Put on hold, per §9.9's one-click rule
  for reversible actions.
