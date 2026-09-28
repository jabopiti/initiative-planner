---
slice_id: "031"
title: "Settings: Process, Connection and About"
type: "capability"
status: "valid"
criteria_failures: []
depends_on: ["029"]
verification_status: null
superseded_by: null
supersedes: null
change_summary: "Third of the four Settings slices (§5.9), added in review: the read-only Process view, Connection (user, repository, remaining API requests, Disconnect) and About."
recommended_model: "Claude Sonnet 5"
model_rationale: "Mostly read-only display of the brand pack. The two technical parts — reading the rate-limit headers off every response without an extra request, and a Disconnect that respects unsaved edits — are small and testable with a fake client."
spec_sections: ["§5.9 Settings (Process, Connection, About)", "§2 What the build fixes (Brand pack)", "§3 Storage & sync (Setup, Data integrity)", "§5.10 Connect screen", "§9.9 Interface states (Confirmations)", "§9.10 Icons", "§10.1 Framework and UI foundations", "§10.4 Browser storage"]
---

# Settings: Process, Connection and About

## Intent

**Problem statement:** Nobody can see, inside the tool, what its process is —
which gates can be skipped, which need estimates, what G3's checklist asks —
or the approval tracks' bounds. There is no way to disconnect, to see which
GitHub user and repository are connected, or how close the tool is to GitHub's
hourly request limit; and when reporting a problem, nobody can tell which
build and schema they run.

**Outcome statement:** Settings shows the process and approval tracks as the
build defines them, the connection with its remaining request budget and a
safe Disconnect, and the build's identity — so users understand the rules they
work under and can support themselves.

## Scope

- **Process (§5.9, read-only).** A vertical timeline: each phase with its
  icon, label, description and, if costed, its default duration ("3 months");
  its exit gate beneath with label, "Requires estimates" / "No estimates
  required", "Can be skipped" / "Cannot be skipped", and "3 checklist items".
  Selecting a gate expands its checklist items with their descriptions. Below
  the timeline, the approval tracks: name, abbreviation, bounds ("€50,000 –
  €200,000"), requirement text, severity.
- **Connection (§5.9).** The connected GitHub user (login) and repository
  (owner/name, data branch). Remaining requests: "4,812 of 5,000 API requests
  left this hour, resets at 14:20", read from the rate-limit headers of the
  latest response the client already made (no extra request); "Not known
  yet" before any response.
- **Disconnect (§5.9, §9.9).** With nothing pending or failed: one click
  removes the token from the browser and opens the Connect screen (§5.10).
  With pending or failed edits: the button turns into "Disconnect and discard
  2 unsaved changes" with Cancel. The cache stays (§10.4); only the token
  goes.
- **About (§5.9, read-only).** Product name, build version (package version
  and short commit, injected at build time), schema version, process identity
  (id and structure version).

**Explicitly excluded:** editing the process (fixed by the brand pack, §2);
Danger zone (032).

## Execution path

1. Settings → Process: the four phases, G3 "Cannot be skipped", select G3 to
   read its three checklist items.
2. Connection: "jmustermann · jabopiti/initiative-planner (data)", "4,812 of
   5,000 API requests left this hour".
3. Disconnect with one unsaved edit: "Disconnect and discard 1 unsaved
   change" / Cancel.

## Value

- **Desirable:** Users need to see the rules and the connection they work
  under.
- **Usable:** Read-only, no lock needed.
- **Valuable:** Self-service support and a safe way to switch accounts.

## Acceptance criteria

- [ ] Given Process, then each phase shows label, description, and (costed)
      default duration; each gate shows its estimates and skippable flags and
      its checklist count; selecting a gate lists its checklist items with
      descriptions.
- [ ] Given Process, then the approval tracks are listed with bounds,
      requirement text and severity.
- [ ] Given Connection, then the GitHub user, repository and data branch are
      shown.
- [ ] Given the last response carried rate-limit headers remaining 4,812 of
      5,000 resetting at 14:20, then Connection shows exactly that, and opening
      Connection made no extra request.
- [ ] Given no response yet, then the remaining requests read "Not known yet".
- [ ] Given nothing pending, then Disconnect removes the token and shows the
      Connect screen in one click.
- [ ] Given 2 pending or failed edits, then Disconnect first turns into
      "Disconnect and discard 2 unsaved changes" with Cancel; Cancel keeps
      everything.
- [ ] Given About, then product name, build version, schema version and process
      identity are shown.

## Delivery gate

- [ ] Deployed to production-equivalent environment

## Flags and compromises

The build version's source (package version plus short commit via a Vite
`define`) is an assumption; §5.9 only says "build version".

## Decided in review (pre-implementation)

- **Disconnect with unsaved edits:** inline confirmation naming the count;
  otherwise one click.
