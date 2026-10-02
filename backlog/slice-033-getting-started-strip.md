---
slice_id: "033"
title: "Getting started strip on the Portfolio"
type: "capability"
status: "valid"
criteria_failures: []
depends_on: ["030", "004"]
verification_status: null
superseded_by: null
supersedes: null
change_summary: "Promoted from the backlog tail (Getting started strip, full four-step guidance, §5.2). Depends on 030 for Review rates' target and its Rates are correct confirmation."
recommended_model: "Claude Haiku 4.5"
model_rationale: "Four predicates on data the app already has, one session-storage flag, and a strip; fully specified."
spec_sections: ["§5.2 Portfolio overview (Getting started strip)", "§5.9 Settings (Countries & rates)", "§6 Data model (Dataset)", "§9.4 Empty states", "§10.4 Browser storage"]
---

# Getting started strip on the Portfolio

## Intent

**Problem statement:** A first user opens a fresh deployment and sees an empty
Portfolio saying "Create a team". Nothing tells them the rates are
placeholders to review first, or that people must join the team before any
initiative can be staffed, so the first estimates are wrong and the first
initiative can't be planned.

**Outcome statement:** A short first-use path on the Portfolio names the four
things a new deployment needs, links to where each is done and clears itself
from the data as each is done (§5.2), without ever blocking anything.

## Scope

- **Strip (§5.2).** Above the Needs attention strip, one row: title "Getting
  started", four numbered items, and **Dismiss for now** at the right.
  1. **Review rates** → Settings › Countries & rates; done when the dataset's
     `ratesReviewed` is set (any rate edit or Rates are correct, 030).
  2. **Create a team** → Teams; done when any team exists.
  3. **Add people to the team** → the first active team's detail; done when
     any active team has an active member.
  4. **Create your first initiative** → the draft page; done when any
     initiative exists.
  Done items show checked and muted; the strip disappears when all four are
  done.
- **Derived, shared, synced (§5.2).** State comes from the dataset, so every
  user sees the same strip; nothing new is stored for it.
- **Dismiss for now (§5.2, §10.4).** Hides the strip for this browser session
  (session storage, never synced); it returns next visit if items remain.
- Coexists with the Portfolio's empty state (§9.4): the strip shows above it.

**Explicitly excluded:** a tour or illustrations (§9.4).

## Execution path

1. Fresh deployment: the strip shows four open items.
2. The user confirms rates, creates Platform, adds Mara Voss; items 1–3 show
   checked.
3. They create Checkout Redesign; the strip disappears.

## Value

- **Desirable:** New users need to know where to start.
- **Usable:** Four links, nothing more.
- **Valuable:** Right rates before the first estimate; fewer dead ends.

## Acceptance criteria

- [ ] Given a fresh dataset, then the strip shows "Getting started" with four
      open items and Dismiss for now.
- [ ] Given each item is clicked, then it opens Countries & rates, Teams, the
      first active team's detail, and the draft page respectively.
- [ ] Given `ratesReviewed`, a team, an active team with an active member, and
      an initiative in turn, then each item shows checked and muted.
- [ ] Given all four done, then the strip is gone.
- [ ] Given Dismiss for now, then the strip hides until the browser session
      ends, and returns in a new session if items remain.
- [ ] Given session storage throws, then the strip still renders and Dismiss
      hides it for the page's lifetime.
- [ ] Given another user completes an item, then after the pull it shows
      checked here too.

## Delivery gate

- [ ] Deployed to production-equivalent environment

## Flags and compromises

None.

## Decided in review (pre-implementation)

- **Layout:** one row of four numbered steps; done steps stay visible, checked
  and muted, until all four are done.
- **Layout (mockup option A):** a bordered row in the Needs attention card
  style; a done step shows a green check badge in place of its number, an
  open step keeps its number and is an underlined link. The row wraps on
  narrow widths. A done step carries a visually hidden "Done" (§9.8).
- **Copy:** only the §5.2 strings: "Getting started", "Review rates",
  "Create a team", "Add people to the team", "Create your first initiative",
  "Dismiss for now".
- **Links with no active team:** item 3 opens the first active team's
  detail, or Teams when no team is active; item 4 opens the draft page, or
  Teams when no team is active (as the New initiative button does).
- **Active member:** an active membership of an active person on an active
  team. Until the dataset flags have loaded, rates count as not reviewed.
- **Dismissal:** one session-storage key; every access in try/catch with an
  in-memory fallback, so Dismiss lasts for the page's lifetime when storage
  throws. It survives Settings › Reset within the same session.
- **Tests:** component tests beside the strip, and an axe scan of the
  Portfolio with the strip showing in `e2e/a11y.spec.ts`.
