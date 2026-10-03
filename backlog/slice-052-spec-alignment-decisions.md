---
slice_id: "052"
title: "Align the spec and the build: locale formats, toasts, Teams cards, deep links"
type: "spike"
status: "valid"
criteria_failures: []
depends_on: []
verification_status: null
superseded_by: null
supersedes: null
change_summary: "Added from the post-build review of the implementation against the spec (slices 001 to 041). Review: places where the spec contradicts itself or the build deviates without a recorded decision. Backlog reshuffle (3 Oct 2026): took over the UX review's F14 (one way of writing compact amounts and dates) from 057, so formats are decided and changed once; 060 waits on this item for the decimal separator."
recommended_model: "Claude Sonnet 5"
model_rationale: "Mostly decisions and spec edits; code follows from what the user picks."
spec_sections: ["§9.7 Language and formats", "§9.11 Lists, filters, inputs and amounts", "§9.9 Interface states", "§5.7 Teams overview", "§9.10 Icons", "§10.6 Identifiers and links", "§5.11 Suggestions and shortcuts"]
---

# Align the spec and the build: locale formats, toasts, Teams cards, deep links

## Intent

**Problem statement:** The build and the spec disagree in places no slice
recorded. Each needs a decision, then either a code change or a spec edit.

**Outcome statement:** Every item below is decided with the user and recorded
in `docs/spec.md`, and the code matches.

## Scope (one decision each)

1. **Formats (§9.7).** Spec: format "according to the user's browser locale".
   Build: fixed `en` / `en-GB` in `formatAmount.ts`, `ConnectionSection.tsx`,
   `Repository.ts`, `dates.ts` (English month names, `DD.MM.YYYY`).
   Also F14 from the October 2026 UX review (moved from 057): compact
   amounts are written several ways and date fields show an OS-dependent
   format; 057 assumed "€395k" (no space) and "1 Oct 2026". Decide all
   display formats here in one pass, then change them once in code.
2. **Toasts (§9.9).** Spec: "there is no toast stack", yet §3 (line ~393) and
   §5.11 (line ~1128) call for toasts, and the build uses sonner for copy,
   team change and the token check.
3. **Teams overview (§5.7)** says cards; slice 004c built a table.
4. **Card icons (§9.10).** Team and owner are icons with tooltips in the
   spec; slice 020 chose the text "Team · owner".
5. **Deep-link queries (§10.6).** `?focus=`, `?openPhase=`, `?team=` exist
   but the spec lists only `#/initiatives/<id>`.
6. **Copy drift.** Search no-match quotes (curly vs `'xyz'`); the team-change
   message ("Team changed to X, N allocations removed" vs "Removed. Undo").
7. **Space opens a table row (§9.5)** is not implemented (rows are clickable,
   only the name link takes focus).

## Acceptance criteria

- [ ] Given each item, then the user's decision is in the spec section it
      concerns, and the slice records which way it went.
- [ ] Given a decision that changes behaviour, then tests assert it and any
      follow-up code is its own commit.
- [ ] Given the spec afterwards, then no sentence in it contradicts another
      on these points.

## Flags and compromises

None.

## Open decisions (recommendations)

1. Locale: use the browser locale for display; keep the compact k/M exception
   (§9.11); keep accepting the typed formats in `dates.ts` as input.
2. Toasts: keep sonner for success confirmations that carry an action (Undo),
   amend §9.9 to say so; errors stay inline.
3. Teams: amend the spec to a table (sort and Copy need it).
4. Cards: amend the spec to text.
5. Deep links: add them to §10.6.
6. Copy: follow the spec; show drafts in place.
7. Space on rows: implement (focusable row, Enter and Space open).
