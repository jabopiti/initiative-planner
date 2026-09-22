---
slice_id: "003"
title: "Connect, create a team, and create a named initiative"
type: "capability"
status: "valid"
criteria_failures: []
depends_on: ["002"]
verification_status: null
superseded_by: null
supersedes: null
change_summary: null
recommended_model: "Claude Sonnet 5"
model_rationale: "Standard, well-specified CRUD and routing work with a proven sync mechanism underneath (from slice 002); no financial or state-machine correctness risk yet."
spec_sections: ["§5.1 Navigation", "§5.2 Portfolio overview (board and empty state only)", "§5.7 Teams overview", "§5.10 Connect screen", "§6 Data model (Initiative, Team)", "§9.4 Empty states", "§10.2 Data layout", "§10.6 Identifiers and links"]
---

# Connect, create a team, and create a named initiative

## Intent

**Problem statement:** An initiative owner cannot start planning any work
when they first open the tool, because there is no way yet to
authenticate against the repository, create the team an initiative must
belong to, or create the initiative itself.

**Outcome statement:** This slice contributes to the tool's core loop by
enabling an initiative owner to connect, create a team, and create a named
initiative that appears on the Portfolio board.

## Scope

- The Connect screen (§5.10): a token field, the three-step instructions
  with a prefilled GitHub token-creation link, and the checked-token
  outcomes table (works, classic-token warning, can't-see-repo, read-only,
  pending approval, invalid).
- The top bar (§5.1): logo, the five nav items, the New initiative button.
- Teams overview (§5.7): a New team button creating a team from a name
  only; the team appears as a card.
- New initiative (§5.1, §6): name + team required, created via the top
  bar; team defaults to the one last used or the only active team.
- Portfolio board (§5.2): the new initiative appears as a card in its
  process's first phase column; the empty-board and empty-Teams states
  (§9.4) show one line and one primary action each.
- Hash routes for Portfolio, Initiatives, People, Teams, Settings, and a
  specific initiative (§10.6).

**Explicitly excluded:** The People screen and any allocation, phase, or
cost item editing — an initiative with just a name and a team is already a
real, demonstrable outcome; planning it is slice 005 onward. The Getting
started strip's full four-step guidance is also excluded — this slice
ships only the empty-state one-line-and-one-action pattern, because the
richer guided strip requires people and phases to exist first to have
anything to guide toward.

## Execution path

1. User triggers: opens the app with no token stored.
2. UI: Connect screen collects and validates the token against the real
   repository (§5.10); on success, the Portfolio loads.
3. UI/data: user clicks New team, types a name, presses Enter; a commit is
   written to the data branch (§10.2, §10.3) creating the team.
4. UI/data: user clicks New initiative, types a name, the team defaults
   in; Enter creates the initiative and commits it as its own file.
5. User receives: the initiative's own page opens, and the initiative
   appears on the Portfolio board in its first phase's column.

## Value

- **Desirable:** An initiative owner setting up a new deployment would
  seek exactly this first — there is nothing to plan before a team and an
  initiative exist.
- **Usable:** A user unfamiliar with the tool can follow the three-step
  Connect instructions, create a team, create an initiative, and see it
  appear on the board — without being told how.
- **Valuable:** After this slice, an initiative owner can register real
  work in the tool and share it with colleagues with repository access,
  instead of tracking it in a spreadsheet.

## Acceptance criteria

- [ ] Given no token is stored, when the app loads, then the Connect
      screen appears with the three-step instructions and a prefilled
      token-creation link.
- [ ] Given a valid fine-grained token for the configured repository, when
      it is pasted and submitted, then the Portfolio board loads.
- [ ] Given no teams exist, when the user clicks New team and types a
      name, then the team appears as a card on the Teams overview.
- [ ] Given at least one team exists, when the user clicks New initiative,
      types a name, and presses Enter, then the initiative's page opens
      and the initiative appears on the Portfolio board.
- [ ] Given the Portfolio has no initiatives, when it loads, then it shows
      one line and one primary action instead of an empty board.

## Delivery gate

- [ ] Deployed to production-equivalent environment
- [ ] Demonstrated to at least one external stakeholder (user, customer,
      or business owner)

## Flags and compromises

Scope was already minimal on first read — no items removed beyond what is
listed under Explicitly excluded.
