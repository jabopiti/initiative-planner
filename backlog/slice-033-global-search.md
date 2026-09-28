---
slice_id: "033"
title: "Global search overlay"
type: "capability"
status: "valid"
criteria_failures: []
depends_on: ["012", "013"]
verification_status: null
superseded_by: null
supersedes: null
change_summary: "Promoted from the backlog tail (Global search overlay, §5.1). The top bar's search icon is present but inert ('Search (not yet available)')."
recommended_model: "Claude Sonnet 5"
model_rationale: "An overlay on shadcn's command component (added in 013) over cached data, with focus management and two shortcuts; the matching is simple, the keyboard and focus rules are what the tests must pin."
spec_sections: ["§5.1 Navigation (Search)", "§9.5 Accessibility", "§9.9 Interface states (Opening)", "§9.10 Icons", "§9.11 Lists, filters, inputs and amounts (Long text)"]
---

# Global search overlay

## Intent

**Problem statement:** "Where is the fraud initiative?" and "which team is
Sofia on?" have no quick answer: the tool has no search, and §5.1 makes search
the one way to find something by name. The search icon in the top bar does
nothing.

**Outcome statement:** One overlay, opened from the icon or the keyboard,
finds any initiative, person or team by name from the cached data and opens
it (§5.1).

## Scope

- **Open.** The search icon, **Ctrl+K / ⌘+K** anywhere, and **/** when focus
  isn't in a text field. The icon's tooltip reads "Search (Ctrl+K)" (⌘ on
  Mac).
- **Overlay (§5.1).** A centred dialog with a search field (focused) over a
  dimmed page, shadcn `command` in a dialog. Typing shows matches from the
  cached data, grouped **Initiatives** (name and description), **People**
  (name), **Teams** (name); case- and accent-insensitive substring match; up
  to 5 per group, name matches before description matches. Inactive people and
  teams are included, marked "(inactive)"; initiatives show their status when
  not Active.
- **Open a result (§5.1).** Enter or click: an initiative's page; a person's
  side panel on the People page; a team's page. The overlay closes.
- **Close.** Esc, or a click outside; focus returns to where it was.
- **Empty.** Nothing typed: a hint line "Search initiatives, people and
  teams". No match: "No matches for 'xyz'".
- **While loading (§9.9).** On first load, initiatives not yet loaded are not
  found; the list shows "Still loading some initiatives…" while the sync
  indicator says syncing.

**Explicitly excluded:** searching cost items, checklist notes or other
fields; recent searches.

## Execution path

1. User presses ⌘+K anywhere and types "fraud".
2. Initiatives: Fraud Detection Upgrade (Discovery).
3. Enter opens its page; the overlay closes.

## Value

- **Desirable:** Finding things by name is expected in any tool.
- **Usable:** One shortcut, one field, grouped results.
- **Valuable:** The only name-based way in (§5.1).

## Acceptance criteria

- [ ] Given the search icon, ⌘/Ctrl+K anywhere, or / outside a text field,
      then the overlay opens with the field focused; / typed inside a field
      types a slash.
- [ ] Given "fra", then Fraud Detection Upgrade appears under Initiatives.
- [ ] Given a word only in an initiative's description, then it appears after
      name matches.
- [ ] Given "sofia", then Sofia Molina appears under People; Enter opens the
      People page with that person's side panel open.
- [ ] Given "plat", then Platform appears under Teams; Enter opens its page.
- [ ] Given "lucia" (no accent), then Lucía Ramos is found.
- [ ] Given an inactive person or team, then it is listed with "(inactive)".
- [ ] Given more than 5 matches in a group, then 5 show.
- [ ] Given no match, then "No matches for '<text>'" shows.
- [ ] Given Esc or a click outside, then the overlay closes and focus returns
      to the element focused before.
- [ ] Given a screen reader, then the dialog has the name "Search", results
      are announced with their group, and the arrow keys move between them.

## Delivery gate

- [ ] Deployed to production-equivalent environment

## Flags and compromises

The shortcuts are an addition to §5.1, which names only the icon; record them
in §5.1 when this ships.

## Decided in review (pre-implementation)

- **Shortcuts:** Ctrl/⌘+K anywhere, and / outside text fields; shown in the
  icon's tooltip.
