---
generated_from: "Initiative Planner (white-label core) spec, v1 — 22 September 2026"
total_slices: 55
valid_slices: 55
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
  Sonnet 5 or Opus 5 to use, chosen by how hard the slice's correctness is
  to verify by testing alone, not by feature size.
- `spec_sections` — the exact spec sections the slice needs, so an agent
  (or a reviewer) can load only those instead of the whole spec, for
  token efficiency.

## Slice index

| ID | Title | Status | Depends on |
|---|---|---|---|
| 001 | Audit prototype engine code for reuse | ✅ valid | — |
| 002 | GitHub round-trip technical spike | ✅ valid | — |
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
| 013 | Initiatives overview table with filters | ✅ valid | 004c, 011, 012 |
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
| 032 | Settings: Danger zone — Load example data and Reset | ✅ valid | 029 |
| 033 | Getting started strip on the Portfolio | ✅ valid | 030, 004 |
| 034 | Global search overlay | ✅ valid | 012, 013 |
| 035 | Same-field conflict shown inline under the field | ✅ valid | 005h, 005j |
| 036 | Accessibility and membership fixes from the review | ✅ valid | 004, 005j |
| 037 | Retry a rejected write with a short backoff | ✅ valid | 005g |
| 038 | Entity ids in each commit's trailer lines | ✅ valid | 005h |
| 039 | Commit messages describe the net effect of grouped edits | ✅ valid | 005g |
| 040 | GitHub client edge cases: slashed branch names, large files, token check failures | ✅ valid | 003 |
| 041 | Copied cells that look like formulas stay text | ✅ valid | 004c |

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
- **Team/pace:** building is done by an AI coding agent with the user
  reviewing; slices are sized and modelled accordingly (small, bounded
  spec-section scope per slice) rather than for a larger human team that
  could parallelize more aggressively.
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

## Backlog tail (not yet fully sliced)

Empty: every tail topic is now a slice (012 to 041), or was removed or
dropped as recorded under Mid-flight changes.
