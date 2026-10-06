---
slice_id: "012"
title: "Initiative header: description, owner and approval track badge"
type: "capability"
status: "valid"
criteria_failures: []
depends_on: ["004", "005"]
verification_status: null
superseded_by: null
supersedes: null
change_summary: "Found while slicing the backlog tail: §5.4's header lists description, owner and the approval track badge, and none of them is built. The data shape already has `description` and `ownerId` (§6) and the conflict banner already knows how to describe an owner conflict, but no screen sets either, and the approval track is computed only for Needs attention. Slice 013's Owner column and filter need owners to exist, so this comes first."
recommended_model: "Claude Sonnet 5"
model_rationale: "Three small, well-specified header fields on existing primitives (CommitInput, the shadcn Select, resolveApprovalTrack). The only care is in the edge cases (an owner later deactivated, a total no band covers), and each is directly testable."
spec_sections: ["§5.4 Initiative detail view (Page sections: Header)", "§6 Data model (Initiative)", "§7.4 Approval tracks", "§9.3 Deletion rules", "§9.5 Accessibility", "§9.10 Icons", "§10.3 Writing"]
---

# Initiative header: description, owner and approval track badge

## Intent

**Problem statement:** An initiative owner opening Checkout Redesign sees its
name, team and status, but not what the initiative is about, who is
accountable for it, or which approval track its current estimate puts it on.
The data model has a description and an owner, yet nothing lets anyone set
them, so every initiative is anonymous and the approval consequence of the
plan is invisible on the page where the plan is made.

**Outcome statement:** The header states what the initiative is, who owns it
and which approval track it needs, each editable in place (§5.4 "Inline
editing"), so anyone landing on the page from a shared link knows what they
are looking at and whom to ask.

## Scope

- **Description (§5.4, §6).** A borderless field under the name, styled like
  the name field until hovered or focused. Plain text, wrapping to at most two
  visible lines. Enter commits; line breaks are not accepted (Shift+Enter
  does nothing, pasted line breaks become spaces). Empty shows the
  placeholder "Add a description". Clearing it and committing removes the
  description. Built on the shared field primitives, so failed-save,
  changed-by-others and conflict states (005h, 005i, 005j) come for free.
- **Owner (§5.4, §6).** A select in the header's meta row, after the team,
  with a person icon. Lists every **active** person, the initiative's
  team's active members first, then everyone else, each group by name.
  A **No owner** choice at the top clears it. The trigger reads the owner's
  name, or "No owner" in secondary text. An owner who has since been
  deactivated (§9.3) still shows on the trigger as "<name> (inactive)" and is
  not offered in the list for a new choice. Editable in every status for
  now; slice 015's freeze makes both fields read-only on a Closed or
  Cancelled initiative, so this slice builds no status rule of its own.
- **Approval track badge (§5.4, §7.4, §9.10).** A badge at the end of the
  meta row naming the live approval track from the grand estimate, e.g.
  "Standard", with the track's requirement text as its tooltip ("Requires
  department head approval"). A total that no band covers reads "No
  approval track" with no tooltip. It updates as the plan changes. One
  shared `ApprovalTrackBadge` component, which slice 020 reuses on
  Portfolio cards.
- **Layout.** One meta row under the name and description: team select,
  owner select, status badge, approval track badge — the existing team row
  extended, not a new block. Slice 014's Actions button joins its end.
- **Commits (§10.3).** "Checkout Redesign: description changed",
  "Checkout Redesign: owner set to Mara Voss", "Checkout Redesign: owner
  cleared".

**Explicitly excluded:** escalation shown on the badge (escalation shows in
Needs attention, 011); owner shown on Portfolio cards (slice 020) and in the
Initiatives table (slice 013); searching by description (slice 034).

## Execution path

1. User triggers: on Checkout Redesign, types "New payment page with
   one-click checkout." into the description and picks Mara Voss as owner.
2. Data: two edits to `initiatives/<id>.json` (`description`, `ownerId`),
   through the one writer.
3. UI: the description wraps under the name; the owner select reads "Mara
   Voss"; the badge reads "Standard" for a grand estimate of €120,000.
4. User receives: a header that says what, who and which approval track.

## Value

- **Desirable:** Owners and team leads expect every initiative to name its
  owner and purpose; an unowned plan is the first thing a reviewer asks
  about.
- **Usable:** In place, no form, the same way the name is edited.
- **Valuable:** Makes the approval consequence of the plan visible while
  planning, and gives slice 013's Owner column and filter real data.

## Acceptance criteria

- [x] Given an initiative without a description, then the header shows the
      placeholder "Add a description" under the name.
- [x] Given a description is typed and Enter pressed, then it is saved and
      shown under the name, wrapping to at most two lines.
- [x] Given text with line breaks is pasted, then it is saved with spaces in
      their place.
- [x] Given the description is cleared and committed, then the field is
      removed from the initiative file and the placeholder shows again.
- [x] Given the owner select is opened, then it lists "No owner", then the
      team's active members by name, then every other active person by name;
      inactive people are not listed.
- [x] Given Mara Voss is chosen, then the select reads "Mara Voss" and the
      commit reads "Checkout Redesign: owner set to Mara Voss".
- [x] Given "No owner" is chosen, then `ownerId` is removed and the select
      reads "No owner".
- [x] Given the owner is deactivated later, then the header reads "Mara Voss
      (inactive)" and the owner is kept until someone changes it.
- [x] Given a grand estimate of €120,000 with the example tracks, then the
      badge reads "Standard" with the tooltip "Requires department head
      approval"; given a total no band covers, it reads "No approval track".
- [x] Given an allocation change moves the total into another band, then the
      badge changes without a reload.
- [x] Given a screen reader, then the description field and the owner select
      have the accessible names "Description" and "Owner", and the badge's
      text is read, not only its colour.

## Flags and compromises

The Closed/Cancelled read-only rule for description and owner belongs to
slice 015's single freeze rule, not to this slice, so the two can't build it
twice or differently.

## Decided in review (pre-implementation)

- **Layout:** one meta row — team, owner, status badge, approval track badge
  — under the name and description; no labelled field block.
- **Description:** wraps to two lines, Enter commits, no line breaks,
  placeholder "Add a description".
- **Owner:** any active person, the team's members first; "No owner" clears
  it; a deactivated owner stays shown with "(inactive)".
- **Badge:** the track's name, its requirement text in the tooltip; "No
  approval track" when no band covers the total.
- **Badge style:** a neutral pill matching the status badge next to it
  (`bg-surface-subtle`, no border or accent colour). An accent-tinted
  variant was considered and rejected: §9.8's colour roles are a closed
  set (Alarm, Warning, Met, Accent — "current phase, selection and
  links"), the badge fits none of them, and §9.8 forbids colour used for
  decoration. This also keeps it visually consistent with the status
  badge, which is neutral for the same reason.
- **Deactivated owner:** "Mara Voss (inactive)" in the select trigger, no
  extra styling on the suffix — the word itself carries the state (§9.5
  "state is never colour alone" already implies text is enough; adding
  colour here would be decoration without a defined role, same reasoning
  as the badge).
- **Owner dropdown grouping:** visible group labels above each part of the
  list — the initiative's team name (e.g. "Platform") above its active
  members, then "Everyone else" above the rest. "No owner" sits above
  both groups, unlabelled.
