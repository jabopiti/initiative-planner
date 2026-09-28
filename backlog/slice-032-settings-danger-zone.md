---
slice_id: "032"
title: "Settings: Danger zone — Load example data and Reset"
type: "capability"
status: "valid"
criteria_failures: []
depends_on: ["017", "029"]
verification_status: null
superseded_by: null
supersedes: null
change_summary: "Fourth of the four Settings slices (§5.9), added in review. Needs two things the build lacks: the brand pack's example dataset file (§2; today the example exists only as backlog/example-data.md and a dev script), and deleting files in a multi-file commit: `createFilesCommit` (Git data API, used at setup) writes several files in one commit today, but a Reset must also remove every initiative file."
recommended_model: "Claude Opus 5.5"
model_rationale: "The first many-file write: one commit through the Git data API (blobs, tree, commit, ref update) that must fail atomically, and must interleave safely with the one writer's pending edits and other users' pulls. Irreversible for the user, so every path needs fake-repository tests."
spec_sections: ["§5.9 Settings (Danger zone)", "§2 What the build fixes (Brand pack: fresh-install baseline, example dataset; Editable by the user)", "§3 Storage & sync (Setup, Sync behaviour)", "§9.3 Deletion rules", "§9.9 Interface states (Confirmations)", "§10.2 Data layout", "§10.3 Writing"]
---

# Settings: Danger zone — Load example data and Reset

## Intent

**Problem statement:** A team evaluating the tool opens it to an empty
dataset and has to invent teams, people and initiatives before they can see
anything work. And a deployment that has been used for testing can't be
returned to a clean start without someone editing the data branch by hand —
which AGENTS.md forbids.

**Outcome statement:** From Settings, an empty dataset can be filled with the
brand pack's example data in one step, and any dataset can be returned to the
fresh-install baseline after an inline confirmation stating what it removes —
each as one atomic commit.

## Scope

- **Section (§5.9).** Danger zone, lockable (029's lock; locked, its actions
  are disabled). Adds its entry to 029's section list.
- **Example dataset (§2).** A plain data file in the brand-pack folder with
  the example teams, people, memberships and initiatives of
  `backlog/example-data.md`, its dates stored relative to the load month so it
  never goes stale, matching the build's process identity.
- **Load example data (§5.9).** Enabled only while the dataset has no people,
  teams or initiatives; otherwise disabled with the hint "Reset first". Never
  overwrites. One click (it removes nothing).
- **Reset (§5.9, §9.9).** Returns the dataset to the fresh-install baseline:
  roles, countries and rates to the brand pack's placeholders,
  `ratesReviewed` false again (so the Getting started strip's Review rates
  returns), and no people, teams, memberships or initiatives. Locally, each
  removed initiative goes through 017's `forgetInitiative`. Inline confirmation: the button turns
  into "Confirm reset" with Cancel and the line "This removes 3 initiatives,
  9 people and 2 teams." (counts from the dataset).
- **One commit each (§10.3).** Through the existing `createFilesCommit`
  (Git data API: blobs, a tree, a commit on the data branch's head, then the
  ref), extended to delete paths (tree entries with a null sha); a moved head
  (another user's commit meanwhile) retries on the new head. Messages: "Example
  data loaded", "Dataset reset". Pending writer edits are dropped before a
  Reset (they would recreate data); a Load waits for them.
- **After.** Both land on the Portfolio (Reset: its empty state; Load: the
  board with the example initiatives). The Danger zone re-locks.
- **Other users.** Their next pull brings the new files; initiative files
  that vanished leave (005i's rule).

**Explicitly excluded:** partial resets; `npm run dev:reset-data`, which stays
a developer tool.

## Execution path

1. Settings → Danger zone → Unlock → **Reset** → "This removes 3 initiatives,
   9 people and 2 teams." → **Confirm reset**.
2. One commit replaces the dataset with the baseline.
3. The Portfolio shows "No initiatives yet — Create a team".
4. Back in Danger zone: Unlock → **Load example data** → the board shows
   Checkout Redesign, Fraud Detection Upgrade and Onboarding Flow v2.

## Value

- **Desirable:** Evaluators need realistic data at once; testers need a clean
  slate.
- **Usable:** Two buttons behind a lock, with what they do stated.
- **Valuable:** Removes the last reason to touch the data branch by hand.

## Acceptance criteria

- [ ] Given Danger zone locked, then both actions are disabled.
- [ ] Given an empty dataset, then Load example data is enabled; given any
      person, team or initiative, it is disabled with "Reset first".
- [ ] Given Load example data, then the example teams, people, memberships and
      initiatives are written in one commit, with dates relative to this month,
      and the Portfolio opens.
- [ ] Given Reset, then the button becomes "Confirm reset" with Cancel and the
      counted line "This removes <n> initiatives, <n> people and <n> teams."
- [ ] Given Confirm reset, then one commit leaves only the baseline (roles,
      countries, rates, empty teams/people/memberships, no initiative files),
      and the Portfolio empty state opens.
- [ ] Given another user commits between reading the head and moving the ref
      (fake repository), then the operation retries on the new head and still
      makes exactly one commit.
- [ ] Given a failure mid-way (fake), then the data branch is unchanged (no
      partial dataset).
- [ ] Given pending edits, then Reset drops them and they are not pushed
      afterwards.
- [ ] Given Reset after rates were confirmed, then `ratesReviewed` is false
      again.
- [ ] Given another user's client pulls after a Reset, then their lists empty
      and an open initiative shows "This initiative couldn't be found."

## Delivery gate

- [ ] Deployed to production-equivalent environment

## Flags and compromises

The example dataset file duplicates `backlog/example-data.md`'s content in
the brand pack; the dev seed script should read the brand-pack file afterwards
so the two can't drift (small follow-up inside this slice if cheap).

## Decided in review (pre-implementation)

- **After Reset or Load:** land on the Portfolio; the Danger zone re-locks.
