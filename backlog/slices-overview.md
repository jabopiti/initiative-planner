---
generated_from: "Initiative Planner (white-label core) spec, v1 — 22 September 2026"
total_slices: 72
valid_slices: 69
flagged_slices: 0
---

# Slice Overview

## Source

The full Initiative Planner spec (`initiative-planner-spec.md`, v1): a
multi-user, stage-gate initiative planning tool with cost derived from
allocated people, GitHub-as-backend sync, and a white-label brand pack.

## Slicing intent

Two adaptations were made to the standard method for this context, both
noted here rather than silently forced:

1. **Two enabling items (001, 002) are not classic capability slices.**
   They have no end-user problem in the strict sense; their "user" is
   framed as the delivery team, and their value is "informed, low-risk
   building" rather than a product outcome. They are marked
   `type: spike` and kept in the same file format for consistency.
2. **The backlog is not fully sliced end to end.** Slices 001–011 are
   detailed to full rigor, chosen to reach the smallest real, demonstrable
   core loop: create → staff → plan → pass a gate → see capacity warnings
   → record actuals → see what needs attention. Everything past that is
   real, valid future work, listed as a one-line **backlog tail** below
   rather than fully specified now — full detail on those is cheap to
   produce once the team is actually approaching them, and producing it
   now would mostly go stale as slices 001–011 change real assumptions.

Ordering follows the dependency graph first (001 and 002 gate everything;
004 must precede any allocation; 005 must precede 006, 007, 008, 009, 010)
and, where the graph allows a choice, the initiative owner's core loop
(005→006→007→008) is kept contiguous before the team lead's capacity view
(009), since the owner's jobs are ranked first in the spec's own Jobs to
be done table. 010 and 011 close the loop for both roles at once.

One structural finding from slicing this spec: because master data
(roles, countries, rates) ships pre-seeded from the brand pack, a person
can be created and correctly costed (slice 004→005) without a Settings
editing UI existing yet. That UI is real, later work, not a hidden
dependency of the core loop — worth knowing before assuming Settings has
to come early.

Every slice's frontmatter adds three fields beyond the standard template,
for the AI-agent-driven build the team asked for:

- `recommended_model` and `model_rationale` — which of Claude Haiku 4.5,
  Sonnet 5 or Opus 5 (Opus 5.5 from slice 012 on) to use, chosen by how hard the slice's correctness is
  to verify by testing alone, not by feature size.
- `spec_sections` — the exact spec sections the slice needs, so an agent
  (or a reviewer) can load only those instead of the whole spec, for
  token efficiency.

## Slice index

| ID | Title | Status | Depends on |
|---|---|---|---|
| 001 | Audit prototype engine code for reuse | 🗄 retired | — |
| 002 | GitHub round-trip technical spike | 🗄 retired | — |
| 003 | Connect, create a team, and create a named initiative | ✅ valid | 002 |
| 003b | Migrate to Vite, Tailwind CSS v4, shadcn/ui and Lucide | ✅ valid | 003 |
| 003c | Portfolio empty state names active and inactive teams | ✅ valid | 003 |
| 004 | Add a person and assign them to a team | ✅ valid | 003b |
| 004b | Upgrade to React 19 | ✅ valid | 004 |
| 004c | Sort and copy the Teams and People tables | ✅ valid | 004 |
| 004d | Team size counts only active people | ✅ valid | 004 |
| 005 | Plan a costed phase and see its cost calculated | ✅ valid | 001, 004 |
| 005b | Give a person a custom role and day rate | ✅ valid | 004, 005 |
| 005c | A new initiative starts with a default plan | ✅ valid | 003, 005 |
| 005d | Create an initiative on a guided skeleton page | ✅ valid | 003, 005 |
| 005e | Change an initiative's team | ✅ valid | 005 |
| 005f | Percent fields refuse out-of-range values inline | ✅ valid | 004, 005 |
| 005g | One writer for every file | ✅ valid | 005 |
| 005h | Merge initiative files by path | ✅ valid | 005g |
| 005i | Open from the cache and pull others' changes | ✅ valid | 005g |
| 005j | Read-only banner, automatic recovery, and a failed edit stays in edit | ✅ valid | 005g |
| 006 | Availability suggestion in the person picker | ✅ valid | 005 |
| 007 | Add cost items to a phase | ✅ valid | 005 |
| 008 | Pass a gate with its checklist | ✅ valid | 005, 007 |
| 009 | View team capacity grid with warnings | ✅ valid | 005 |
| 010 | Record actuals for a closed month | ✅ valid | 005 |
| 011 | See Needs attention on the Portfolio | ✅ valid | 008, 010 |
| 012 | Initiative header: description, owner and approval track badge | ✅ valid | 004, 005 |
| 013 | Initiatives overview table with filters | ✅ valid | 004c, 011, 012, 041 |
| 014 | Actions menu, with Put on hold and Resume | ✅ valid | 008, 012, 013 |
| 015 | Cancel an initiative, and a Cancelled or Closed initiative is frozen | ✅ valid | 014 |
| 016 | Reopen from the Actions menu: the last gate, or a Closed initiative | ✅ valid | 008, 014, 015 |
| 017 | Delete an initiative no gate has passed | ✅ valid | 013, 014 |
| 018 | Skip a skippable gate with a reason | ✅ valid | 008, 014 |
| 019 | Choose a starting phase for an untouched initiative | ✅ valid | 005c, 018 |
| 020 | Portfolio cards show owner, estimate, approval track and attention; columns show their sum | ✅ valid | 011, 012 |
| 021 | Portfolio filters, year filter, key metrics and Copy | ✅ valid | 013, 020 |
| 022 | Team detail lists its initiatives and starts a new one for the team | ✅ valid | 005d, 013 |
| 023 | Domain rules out of components | ✅ valid | 009, 010 |
| 024 | Copy allocations from the previous costed phase | ✅ valid | 005, 006, 023 |
| 025 | Duplicate an initiative | ✅ valid | 005c, 007, 014 |
| 026 | Extend an overrun phase by one month | ✅ valid | 008 |
| 027 | Fix suggestions for capacity warnings | ✅ valid | 009, 023 |
| 028 | Cost item label suggestions | ✅ valid | 007 |
| 029 | Settings page with section lock, and the Roles editor | ✅ valid | 005 |
| 030 | Settings: Countries & rates, and Rates are correct | ✅ valid | 029 |
| 031 | Settings: Process, Connection and About | ✅ valid | 029 |
| 032 | Settings: Danger zone — Load example data and Reset | ✅ valid | 017, 029 |
| 033 | Getting started strip on the Portfolio | ✅ valid | 030, 004 |
| 034 | Global search overlay | ✅ valid | 012, 013 |
| 035 | Same-field conflict shown inline under the field | ✅ valid | 005h, 005j |
| 036 | Accessibility and membership fixes from the review | ✅ valid | 004, 005j |
| 037 | Retry a rejected write with a short backoff | ✅ valid | 005g |
| 038 | Entity ids in each commit's trailer lines | ✅ valid | 005h, 039 |
| 039 | Commit messages describe the net effect of grouped edits | ✅ valid | 005g |
| 040 | GitHub client edge cases: slashed branch names, large files, token check failures | ✅ valid | 003 |
| 041 | Copied cells that look like formulas stay text | ✅ valid | 004c |
| 042 | Frozen phases: the data layer refuses every edit, and the snapshot keeps what its figures came from | ✅ valid | 008, 015 |
| 043 | Classify GitHub failures correctly: rate-limit 403, 5xx, timeouts | ✅ valid | 005j, 037 |
| 044 | Detect damaged data, never bootstrap over it, and refuse writes in read-only | ✅ valid | 005j, 040 |
| 045 | Warn before closing with unsaved changes, and handle a full local cache | ✅ valid | 005i |
| 046 | Theme control (System, Light, Dark) and reduced motion | ✅ valid | — |
| 047 | Brand pack colours are the single source; contrast enforced in the build | ✅ valid | 046 |
| 048 | Rename a team, and Undo removing a membership | ✅ valid | — |
| 049 | Connect screen: check on paste, show the classic-token warning, name the repository | ✅ valid | 040 |
| 050 | Initiative page and Needs attention fixes from the review | ✅ valid | 011, 019, 026 |
| 051 | Frozen snapshot keeps the rates, roles, countries and person data | ↪ merged into 042 | 008 |
| 052 | Align the spec and the build: locale formats, toasts, Teams cards, deep links | ✅ valid | — |
| 053 | Close the §10.8 test and CI gaps | ✅ valid | 037, 044 |
| 054 | Small fixes from the review | ✅ valid | — |
| 055 | UX review quick fixes: fields, focus, row actions and small copy | ✅ valid | 036 |
| 056 | Initiative detail: current phase first, complete gate panel, clearer magic bar | ✅ valid | 015, 026, 050 |
| 057 | Visual refresh: type scale, surfaces, status badges and team colours | ✅ valid | 046, 047, 055 |
| 058 | Page shell and layout: shared container, phase time strip, first-run and empty states | ✅ valid | 056, 057 |
| 059 | Detail components: key figures with bullet bar, labelled checklist, motion | ✅ valid | 056, 057 |
| 059b | Period range picker: Start and End in one control, saved on Done | ✅ valid | 056, 057 |
| 060 | Amount input: shorthand, simple sums and the currency inside the field | ✅ valid | 052 |
| 061 | Phase editing: allocation load bar and team roster | ✅ valid | 056, 057 |
| 061b | Phase editing: cost item month strip, actuals that record in one click | ✅ valid | 056, 057, 059b, 060 |
| 062 | Team capacity: split bar in the person panel, heatmap with fixes on the team page | ✅ valid | 048, 057 |
| 063 | Changed since you last looked: dots on cards and rows, previous figures on the page | ✅ valid | 058, 059 |
| 064 | Write budget: fewer commits, many-file commits in one request, pauses when GitHub limits | ✅ valid | 043, 045 |
| 065 | Cheaper pulls: one listing request, no re-listing after own commits, batched first load | ✅ valid | 064 |

## Dependency chain

- Slice 001 "Audit prototype engine code for reuse": depends on none — no
  prior capability exists to audit against; it reads the standing
  prototype and the finalized spec.
- Slice 002 "GitHub round-trip technical spike": depends on none — it
  validates the sync mechanism in isolation, against the already-set-up
  repository, before any feature depends on it.
- Slice 003 "Connect, create a team, and create a named initiative":
  depends on 002 — every write in this slice goes through the sync
  mechanism 002 proves works.
- Slice 003b "Migrate to Vite, Tailwind CSS v4, shadcn/ui and Lucide":
  depends on 003 — it migrates that slice's already-shipped screens to the
  new stack.
- Slice 003c "Portfolio empty state names active and inactive teams":
  depends on 003 (the Portfolio and its empty states). Inserted after the
  review of slices 003 to 005d found the empty state and the New initiative
  button disagreeing when every team is inactive. It also builds the team
  detail's Deactivate / Reactivate (§5.8), which no slice covered, so that
  Reactivate a team leads somewhere.
- Slice 004 "Add a person and assign them to a team": depends on 003b — a
  membership requires a team to exist, and 004 onward builds on the
  migrated stack.
- Slice 004d "Team size counts only active people": depends on 004 (the
  memberships whose count it defines). Inserted after the same review.
- Slice 005 "Plan a costed phase and see its cost calculated": depends on
  001 (the audited engine logic it wires in) and 004 (a team member to
  allocate).
- Slice 005b "Give a person a custom role and day rate": depends on 004
  (the person panel it extends) and 005 (the custom-rate cost rule it feeds).
  Inserted while planning 005, which ships the data shape and engine but no
  screen that sets a custom role.
- Slice 005c "A new initiative starts with a default plan": depends on 003
  (initiative creation, where the plan is built) and 005 (the phase period it
  fills in). Promoted from the backlog tail.
- Slice 005d "Create an initiative on a guided skeleton page": depends on
  003 (the creation flow it reworks) and 005 (the next-step highlight it
  reuses). It supersedes slice 003's acceptance criteria about the draft
  page's old behaviour.
- Slice 005e "Change an initiative's team": depends on 005 (allocations to
  remove). Its locked-phase rule is a predicate that slice 008 makes real.
- Slice 005f "Percent fields refuse out-of-range values inline": depends on
  004 (Capacity % and Team FTE %) and 005 (Allocation %); §9.9 already
  requires the refusal, the build silently capped instead.
- Slice 005g "One writer for every file": depends on 005 (the initiative
  files that gave sync its second writer). Refactor from the same review.
- Slice 005h "Merge initiative files by path": depends on 005g (it plugs into
  the one writer as its merge).
- Slice 005i "Open from the cache and pull others' changes": depends on 005g
  (pulled changes go through the writer's merge and the per-file status).
- Slice 006 "Availability suggestion in the person picker": depends on
  005 — it enhances the picker that slice introduces.
- Slice 007 "Add cost items to a phase": depends on 005 — it adds to a
  phase total that must already exist and be correct.
- Slice 008 "Pass a gate with its checklist": depends on 005 (a phase to
  estimate) and 007 (cost items count toward the estimate check).
- Slice 009 "View team capacity grid with warnings": depends on 005 —
  allocations must exist to have a grid to show.
- Slice 010 "Record actuals for a closed month": depends on 005 — an
  estimate must exist for an actual to be recorded against.
- Slice 011 "See Needs attention on the Portfolio": depends on 008 (gate
  and escalation state) and 010 (overdue-actual state).
- Slices 012 to 041 were sliced from the backlog tail after 011 shipped
  (see Mid-flight changes). Their `depends_on` frontmatter is authoritative;
  the load-bearing links:
  - 012 (header owner) before 013 (the table's Owner column and filter).
  - 013 before the lifecycle slices 014 to 017: On Hold, Cancelled and Closed
    initiatives leave the Portfolio board, so the table is where they stay
    reachable.
  - 014 builds the Actions menu that 015, 016, 017 and 025 add to; 015's
    freeze precedes 016's Reopen of a Closed initiative.
  - 018 (skip) before 019 (starting phase), which records skips.
  - 023 (domain rules out of components) before 024 and 027, which reuse
    those rules.
  - 029 (Settings shell and lock) before 030 to 032; 030 (Rates are
    correct) before 033 (Getting started strip).
  - 041 (copy cell kinds) before 013, so new Copy buttons declare their
    numeric columns from the start.
  - 017 (the first delete, `forgetInitiative`) before 032, whose Reset
    removes initiatives the same way.
  - 039 (structured commit notes carrying the entity) before 038, which only
    renders those entities as trailers.

- Slices 055 to 059, from the October 2026 UX review
  (`docs/ux-review-2026-10.md`), run in order in one lane: 055 first,
  because its focus token and ⋯ row-actions menu are shared patterns 057
  and 058 reuse; 056 after 015 and 026, which own the magic bar and the
  frozen gate; 057 after 055 (it restyles the controls 055 fixes); 058
  and 059 last, on 056's detail page and 057's tokens and PageHeader (059
  was split from 057 for the detail page's new components).
- Slices 060 to 063 come from the interaction patterns the user chose on
  2 Oct 2026 and are placed so no screen is reworked twice: 060 builds the
  shared amount field first (after 052 settles number formats), so 061's
  tables use it from the start; 061 rebuilds the current phase's three
  tables in one pass and takes over F02 (from 055) and F15 (from 056);
  062 waits for 048's membership Undo and 057's team colours; 063 adds
  its markers last, onto 058's cards and 059's key figures. The bullet bar
  went into 059 itself, where the Grand estimate tile is built.
- **Backlog reshuffle, 3 Oct 2026.** With the review-fix slices (042 to
  054) and the UX slices (055 to 063) both open, the user had every open
  slice checked for work done twice, slices too big for one session and
  stale entries. Applied: 001 and 002 retired (spikes the build no longer
  needs); 051 merged into 042 (same freeze code); 057's F14 formats moved
  to 052 (one formats decision), its motion item to 059 (one motion list),
  and 057 now waits on 047 (palette edited in the brand pack once);
  058's F26 moved to 049 (same Connect screen); 050's Overrun blocker line
  and phase overview moved to 056 and its board column icons to 058, and
  056 now waits on 050; 055's F09 moved to 056 and F13 to 058's toolbar;
  059 split into 059 and 059b (range picker); 061 split into 061
  (allocations) and 061b (cost items and actuals). Suggested order:
  (1) any time, no UI overlap: 042, 044, 045, 048, 049, 052, 053;
  (2) foundations: 046 → 047 → 055 → 057; (3) initiative page: 050 → 056
  → 058, 059, 059b; (4) editing: 060 → 061, 061b; 062; 063. The user then
  moved 057's theme control (F04, icon button with a menu) into 046, so
  it is built once.
- **Request budget, 6 Oct 2026.** An analysis of the requests to the data
  branch, measured against the in-memory fake GitHub at the volume
  ceiling, found reads well within GitHub's limits and the risk on the
  write side (80 content-creating requests a minute, 500 an hour). It
  became 064 (commit window 4 s / 20 s, a write budget, waiting out a
  limit, many-file commits in a fixed number of requests, one commit per
  multi-file action, the budget in Settings) and the optional 065 (cheaper
  pulls). 064 waits on 043, which fixes the rate-limit 403 it builds on
  (built on 6 Oct 2026; an earlier `Slice 043:` commit had only edited the
  slice file, so the tooling counted it as done before it was),
  and on 045's unload handling; it opens with a GraphQL spike
  (`scripts/spike-graphql.mjs`) that must run outside a Claude Code cloud
  session, whose proxy refuses GraphQL.

## Build plan (slices 012 to 041, parallel sessions)

Five lanes, one session at a time per lane, so at most five sessions run at
once (each opens with its own questions to the user, so more would make
the user the bottleneck). A session takes one slice: start it with
`/next-slice <id>` on the model named, from the latest `main`. When its PR is
merged, the lane's next slice starts in a fresh session. A slice whose
dependency sits in another lane waits for that PR to merge; take the lane's
next slice in the meantime if its dependencies are merged.
`find-eligible.sh` shows what is merged, what is eligible, and what another
branch has in progress.

Lanes are grouped to keep each hot file in one lane at a time. The hot
files are the magic bar (`MagicBar.tsx`: 026, 014, 018, 019), the header
and Actions menu (012, 014, 015, 017, 025), the phase editor
(`PhasesSection.tsx`: 023, 027, 024, 015, 018), the file writer
(`FileWriter.ts`: 037, 017, 032, 039, 038) and `Repository.ts`, which almost
every slice extends. Changes to `Repository.ts` are additive (new methods);
only 039 and 038 change every method, so they come last.

| Lane | Order (model) | Waits on other lanes |
|---|---|---|
| A — Initiative lifecycle (the critical path) | 012 (Sonnet 5) → 013 (Sonnet 5) → 014 (Sonnet 5) → 015 (Opus 5.5) → 016 (Sonnet 5) → 018 (Sonnet 5) → 019 (Opus 5.5) | 013 on 041 (lane E) |
| B — Portfolio and navigation | 020 (Sonnet 5) → 021 (Opus 5.5) → 022 (Haiku 4.5) → 034 (Sonnet 5) → 017 (Opus 5.5) → 025 (Sonnet 5) | 020 on 012; 021, 022, 034 on 013; 017, 025 on 014 (lane A) |
| C — Settings | 029 (Sonnet 5) → 030 (Opus 5.5) → 031 (Sonnet 5) → 033 (Haiku 4.5) → 032 (Opus 5.5) | 032 on 017 (lane B) |
| D — Planning helpers | 026 (Haiku 4.5) → 023 (Sonnet 5) → 027 (Opus 5.5) → 024 (Haiku 4.5) → 028 (Sonnet 5) | none |
| E — Sync and robustness | 041 (Haiku 4.5) → 040 (Sonnet 5) → 037 (Sonnet 5) → 035 (Opus 5.5) → 036 (Sonnet 5) → 039 (Sonnet 5) → 038 (Sonnet 5) | 039 and 038 last, once lanes A to D have merged every slice that adds repository writes |

Start now: **012** (A), **029** (C), **026** (D), **041** (E). Lane B's first
slice, 020, needs 012 merged; until then the fifth session can take
**040** from lane E, which is independent. 026 comes first in lane D so the
magic bar is free before lane A reaches 014.

Collisions to expect, and to resolve by merging `main` before pushing:
015's freeze (lane A) with 024, 027 and 028's phase and cost-item edits
(lane D); 015's frozen line (A) and 017's delete confirmation (B), both under
the header's meta row; 036 (E) with 022 (B) in `TeamDetail.tsx` and with 034 (B) in the top
bar; 013 (A), 029 (C) and 034 (B) each add a route in `App.tsx`.

## Assumptions made

- **Existing capabilities:** the repository is already set up (per the
  user) and a prototype exists for some engine functions; slice 001 exists
  specifically to resolve the uncertainty in the second of these rather
  than assuming a scope for it.
- **Example data no longer assumed:** `example-data.md` in this folder
  provides a real process definition (phases, gates, checklists, approval
  tracks), roles, countries with researched working days, branding, and a
  worked team/people/initiative example. Slices 002-011 should build and
  demo against this rather than inventing placeholder names.
- **Team/pace:** building is done by AI coding agents with the user
  reviewing; slices are sized and modelled accordingly (small, bounded
  spec-section scope per slice). From slice 012 on, several sessions run in
  parallel, one slice each, following the build plan below.
- **Suggestions interleaving:** per the user's explicit choice, §5.11
  suggestions are interleaved with the core flow as their dependencies
  become ready (e.g. 006 right after 005) rather than pushed to the end
  as a block.

## Limitations and compromises

All 11 slices are valid against the standard criteria. The two exceptions
worth naming explicitly:

### 001 — adapted Intent framing
Slices 001 and 002 use "the delivery team" as the named role rather than
a product end-user, since they are enabling investigations, not
user-facing capabilities. This is a deliberate, disclosed adaptation, not
a passed-under-remediation failure — no rewrite attempts were needed
because the adaptation was chosen up front rather than discovered as a
failure.

### 002 — same adaptation
See 001. Both remain genuinely Desirable, Usable and Valuable under the
adapted framing (a delivery team would seek, use, and benefit from
exactly what each produces).

## Iteration log

Initial run entries:
- **Pass 1 (Intent + Desirability):** Slices 001 and 002 required the
  named-role adaptation described above; all other slices passed with
  their initial named roles (initiative owner, team lead) unchanged.
- **Pass 2 (Thin + Vertical + Independence):** Availability suggestion
  (006) and the two-fix capacity suggestion were split out of what would
  otherwise have been an over-thick slice 005 and slice 009 respectively,
  per the thinness test (each is removable without breaking core
  behaviour). Settings rate-editing was excluded from slice 004 once it
  was confirmed the brand pack's seeded defaults make it a non-dependency
  of the core loop, not a prerequisite.
- **Pass 3 (Value + Completeness):** Acceptance criteria were tightened
  throughout to name exact thresholds (e.g. "409", "top three", "one
  action") rather than descriptive behaviour, so each is verifiable by a
  reviewer without asking the author.

## Mid-flight changes

- **After slice 003 shipped**, the delivery team requested a tech-stack
  change: Vite + Tailwind CSS v4 + shadcn/ui (still Radix UI-based
  underneath) + Lucide icons, replacing the originally-specified Radix
  UI/React Aria + CSS Modules + Tabler Icons combination, across the
  whole app. `docs/spec.md` §2, §9.1, §9.10 and §10.1 were updated
  accordingly, and slice 003b was added to migrate slice 003's
  already-built screens before slice 004 continues on the new stack. No
  other slice needed a content change, since none of them named the old
  stack directly — they only reference spec sections, which now
  describe the new one.

- **After slices 003 to 005d shipped**, a simplify pass and a code review
  covered all of them. Bugs were fixed in place (edits lost while a save was
  in flight, conflict resolution discarding clean fields, status hidden
  between files, a failed create leaving an initiative that never saved).
  What needed a decision or was too large for a fix became slices 003c, 004d,
  005f, 005g, 005h and 005i. No existing slice changed content, except that
  slice 003's ticked criteria about the old draft page were marked
  superseded by 005d.

- **After slice 011 shipped**, every backlog-tail topic was sliced in full
  (012 to 041), each with its open decisions settled with the user before
  writing ("Decided in review" in each file). Checking the tail against the
  spec and the code found gaps that were in neither: the initiative header's
  description, owner and approval track badge (012), the Initiatives table
  (013), Delete (017), the Portfolio cards, column sums, filters, metrics and
  Copy (020, 021), the team detail's initiatives list (022), Extend on
  overrun (026), and Settings beyond roles and rates
  (split into 029 to 032). Two tail items were removed at the user's request
  (schema/process migration, and accessibility/density/colour compliance,
  which stays a criterion on every UI slice), and "Approval-track
  escalation display nuance and 'Not yet known'" was dropped as stale: the
  spec no longer has "Not yet known". The domain-rules refactor was numbered
  023, ahead of the suggestion slices that reuse it.

- **Review of slices 012 to 041, before any was built**, for completeness,
  correctness against the spec and parallel building. Changes:
  - Rules that two slices would have built twice now have one owner: the
    freeze of description and owner moved from 012 to 015; 015's freeze
    exempts Reopen, Delete and Duplicate, which it would otherwise have
    refused.
  - Shared parts are built once so parallel slices can extend them without
    editing each other's code: 014's Actions menu takes its items from one
    action list (the ⋯ button is absent while no action applies), 029's
    Settings sections are one list (unbuilt sections are not listed, no
    placeholder), 017's `forgetInitiative` is reused by 032, 039's
    structured notes carry the entity that 038 renders, and shadcn's
    `command` is added once by whichever of 028, 013 or 034 comes first.
  - New dependencies: 013 on 041, 032 on 017, 038 on 039.
  - Correctness: 026 extends a month-end date to the next month-end (30 Sep
    → 31 Oct; periods are prorated by day, §7.1); 032's Reset sets
    `ratesReviewed` back to false; 013 gains §9.9's loading state; 025's
    navigation keeps the original on Back; 031 notes the one-repository
    cache rule; 034 opens a person without a direct link (§5.1).
  - Spec deviations that must be recorded when the slice ships: 019 (§5.4
    starting-phase entry point, §8.2 "untouched", §6 `startingPhase`) and
    021 (§9.11, a single-select Year chip).
  - `recommended_model` Opus 5 became Opus 5.5.
  - The build plan above was added. `find-eligible.sh` now counts a slice as
    done only when it is merged into `main` (or on the current branch) and
    lists slices in progress on other branches. The next-slice skill opens
    every session with the list of gaps, questions and decisions, and shows
    UI and copy options as rendered mockups (`scripts/screenshot.mjs`), not
    text sketches.
- **After slices 001 to 041 were built**, five parallel reviews compared the
  code with the spec and the slices (storage and sync; calculation and
  lifecycle; Portfolio, Initiatives and the initiative page; people, teams,
  capacity and Settings; cross-cutting rules). The suite was green; the
  review found gaps no test covered. They became slices 042 to 054, listed in
  the index above. Each lists its open decisions, which `/next-slice` settles
  with the user before implementation. Highest priority: 042 (frozen phases),
  043 (rate-limit 403), 044 (damaged data), 045 (unsaved changes), 046 (theme).
  Findings that conflict with the spec itself (locale, toasts, Teams cards)
  are in 052 as decisions, not code.

- **After slices 042 to 054 were sliced**, the October 2026 UX review
  (`docs/ux-review-2026-10.md`, 31 findings) was turned into four slices,
  numbered after the review-fix slices, following its roadmap: 055 quick fixes, 056 detail page, 057 visual
  refresh (theme, type, surfaces) and 058 page shell and layout. F18, left
  out of the review's roadmap, went into 055. 056 carries an open spec
  question: §9.10 makes the stepper icon-only, the review recommends
  labels. While settling 057's look with the user, its new components
  (key figures, checklist control, period range picker, extra motion) were
  split into 059; §5.4, §9.1 and §9.11 were updated.

## Backlog tail (not yet fully sliced)

Empty: every tail topic is now a slice (012 to 041), or was removed or
dropped as recorded under Mid-flight changes.
