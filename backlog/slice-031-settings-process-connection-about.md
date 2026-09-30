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
change_summary: "Third of the four Settings slices (§5.9), added in review: the read-only Process view, Connection (user, repository, remaining API requests, Replace token, Disconnect) and About. Widened in review to replace the token in place, from the read-only banner and from Connection, with a specific diagnosis of the access failure."
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

- **Sections.** Adds Process, Connection and About to 029's section list,
  in §5.9's order.
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
  goes. Connecting again to another repository or branch discards it, by
  §10.4's existing one-repository rule.
- **About (§5.9, read-only).** Product name, build version (package version
  and short commit, injected at build time), schema version, process identity
  (id and structure version).

- **Replace token (§3 Sync failures, §5.9).** One shared component, in
  the read-only banner for the cause "Access denied" and in Connection.
  See Decided in review.

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

- [x] Given Process, then each phase shows label, description, and (costed)
      default duration; each gate shows its estimates and skippable flags and
      its checklist count; selecting a gate lists its checklist items with
      descriptions.
- [x] Given Process, then the approval tracks are listed with bounds,
      requirement text and severity.
- [x] Given Connection, then the GitHub user, repository and data branch are
      shown.
- [x] Given the last response carried rate-limit headers remaining 4,812 of
      5,000 resetting at 14:20, then Connection shows exactly that, and opening
      Connection made no extra request.
- [x] Given no response yet, then the remaining requests read "Not known yet".
- [x] Given nothing pending, then Disconnect removes the token and shows the
      Connect screen in one click.
- [x] Given 2 pending or failed edits, then Disconnect first turns into
      "Disconnect and discard 2 unsaved changes" with Cancel; Cancel keeps
      everything.
- [x] Given an access-denied failure, then the token check runs once and the
      banner shows its outcome: rejected, read-only, can't see the
      repository or organisation approval pending, in §5.10's wording.
- [x] Given a rejected token, then the banner shows the field, Replace,
      Create a token and Show steps, and no Retry; given read-only or can't
      see the repository, then it also shows Edit this token in GitHub and
      Retry.
- [x] Given a token pasted into the field, then it is checked without
      pressing Replace; a failing check shows §5.10's message under the
      field and keeps the read-only state.
- [x] Given a token that passes, then it is saved with the earlier
      Remember me choice, the toast reads "Connected as jmustermann", the
      banner goes and 2 failed edits are pushed with their typed values
      intact (the app is not remounted).
- [x] Given the check cannot reach GitHub, then everything failed is
      resent and the cause it fails with (unreachable: automatic retry)
      takes over.
- [x] Given Connection, then the same field replaces the token without
      Disconnect.
- [x] Given About, then product name, build version, schema version and process
      identity are shown.

## Delivery gate

- [ ] Deployed to production-equivalent environment

## Flags and compromises

The build version's source (package version plus short commit via a Vite
`define`) is an assumption; §5.9 only says "build version".

## Decided in review (pre-implementation)

- **Disconnect with unsaved edits:** inline confirmation naming the count;
  otherwise one click.
- **Replace token (widened scope).**
  - Diagnosis: on access-denied, run the §5.10 token check once (2
    requests, only on failure); the banner shows its outcome. Expired and
    revoked cannot be told apart, so one message covers both.
  - Edits survive: `Repository` gets a swappable token, additive, instead
    of being rebuilt per token (`RepositoryProvider` memoises on it today);
    failed and pending edits retry automatically after a valid token.
  - Entry point: inline in the banner (C1), field always shown for
    access-denied; auto-check on paste, Replace or Enter as fallback.
  - Copy approved as drawn in review; guide via prefilled link plus a
    "Show steps" disclosure; success is a toast and the banner going.
  - Assumptions: the earlier Remember me choice is kept; a token of a
    different GitHub user is accepted, later commits use that identity.
- **Phase icons:** `PhaseDef` gets an `icon` (a fixed Lucide set: Search,
  ClipboardCheck, Hammer, Rocket in the default pack); only Process shows it
  for now, later slices reuse it.
- **GitHub user:** stored beside the token (same place, cleared with it),
  fetched once with `GET /user` when missing (dev token, older sessions).
  The rate-limit line stays request-free, read in `GithubClient.request`.
- **Layouts and copy** approved as mockups: Process timeline with gate
  disclosures and approval tracks ("€200,000 and above" for an open top);
  Connection rows, Replace token block ("Paste a new token to swap it in.
  Your unsaved changes are kept."), Disconnect ("Removes the token from
  this browser and opens the Connect screen."; "Disconnect and discard 2
  unsaved changes" / "1 unsaved change" + Cancel); About rows.
- **Assumptions:** unsaved changes = failed fields + files waiting to be
  written; build version = package version + short commit via Vite
  `define`; sections not lockable, order Roles, Process, Connection, About
  (Countries & rates from 030 slots in after Roles); empty checklist
  descriptions are left out; Disconnect goes through an app-level session
  context.
