---
slice_id: "034"
title: "Global search overlay"
type: "capability"
status: "valid"
criteria_failures: []
depends_on: ["012", "013"]
verification_status: null
superseded_by: null
supersedes: null
change_summary: "Promoted from the backlog tail (Global search overlay, §5.1). The top bar's search icon is present but inert ('Search (not yet available)'). Decided in review: adds shadcn command (cmdk); staged loading and the 'Still loading' line are dropped; initiative rows show phase, status chip, description excerpt and an 'N of M' count."
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
  teams are included, marked "(inactive)". An initiative row shows its phase at
  the right, a status chip (icon and text) when not Active, and a one-line
  description excerpt with the match highlighted when only its description
  matched. When a group has more than 5 matches its header reads "5 of 12".
- **Open a result (§5.1).** Enter or click: an initiative's page; a person's
  side panel on the People page; a team's page. The overlay closes. People
  and teams have no direct links (§5.1), so opening a person's panel passes
  the person through in-app navigation state, not a new shareable URL.
- **Close.** Esc, or a click outside; focus returns to where it was.
- **Empty.** Nothing typed: a hint line "Search initiatives, people and
  teams". No match: "No matches for 'xyz'".

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

- [x] Given the search icon, ⌘/Ctrl+K anywhere, or / outside a text field,
      then the overlay opens with the field focused; / typed inside a field
      types a slash.
- [x] Given "fra", then Fraud Detection Upgrade appears under Initiatives.
- [x] Given a word only in an initiative's description, then it appears after
      name matches.
- [x] Given "sofia", then Sofia Molina appears under People; Enter opens the
      People page with that person's side panel open.
- [x] Given "plat", then Platform appears under Teams; Enter opens its page.
- [x] Given "lucia" (no accent), then Lucía Ramos is found.
- [x] Given an inactive person or team, then it is listed with "(inactive)".
- [x] Given more than 5 matches in a group, then 5 show.
- [x] Given no match, then "No matches for '<text>'" shows.
- [x] Given Esc or a click outside, then the overlay closes and focus returns
      to the element focused before.
- [x] Given a description-only match, then its row shows the excerpt; given
      a non-Active initiative, then its row shows the status chip; given more
      than 5 matches in a group, then its header reads "5 of 12".
- [x] Given a screen reader, then the dialog has the name "Search", results
      are announced with their group, and the arrow keys move between them.

## Flags and compromises

The shortcuts are an addition to §5.1, which names only the icon; record them
in §5.1 when this ships.

## Decided in review (pre-implementation)

- **Shortcuts:** Ctrl/⌘+K anywhere, and / outside text fields; shown in the
  icon's tooltip.

- **Staged loading dropped:** the Repository loads the whole dataset in one
  pull and an initiative's status is only known once its file is read, so
  there is no partial state to search. The "Still loading some initiatives…"
  line is removed here, from the Initiatives table, and from §9.9 Opening
  (amended). Without a cache the app waits for the full pull; with one,
  everything is on screen.
- **Dependency:** shadcn `command` (`cmdk`) is added by this slice, with its
  built-in filter off: the overlay ranks and caps the results itself
  (accent-insensitive substring, name before description).
- **Copy:** field placeholder "Search…"; hint "Search initiatives, people and
  teams"; no match "No matches for 'xyz'" (the typed text, in single quotes);
  "(inactive)" suffix; tooltip "Search (Ctrl+K)", "Search (⌘K)" on Mac; the
  dialog's accessible name is "Search".
- **Person panel:** the person's id is passed through an in-app request that
  `PeopleOverview` reads (also when already mounted); a reload does not reopen
  it, and the People status filter is left as is.
- **Shortcuts:** `/` ignores inputs, textareas, selects, contenteditable, open
  dialogs and held modifiers; Ctrl/⌘+K prevents the browser default. Recorded
  in §5.1 and §9.5.
