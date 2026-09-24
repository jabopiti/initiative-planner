---
generated_from: "Initiative Planner (white-label core) spec, v1 — 22 September 2026"
total_slices: 12
valid_slices: 12
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
| 004 | Add a person and assign them to a team | ✅ valid | 003b |
| 004b | Upgrade to React 19 | ✅ valid | 004 |
| 004c | Sort and copy the Teams and People tables | ✅ valid | 004 |
| 005 | Plan a costed phase and see its cost calculated | ✅ valid | 001, 004 |
| 006 | Availability suggestion in the person picker | ✅ valid | 005 |
| 007 | Add cost items to a phase | ✅ valid | 005 |
| 008 | Pass a gate with its checklist | ✅ valid | 005, 007 |
| 009 | View team capacity grid with warnings | ✅ valid | 005 |
| 010 | Record actuals for a closed month | ✅ valid | 005 |
| 011 | See Needs attention on the Portfolio | ✅ valid | 008, 010 |

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
- Slice 004 "Add a person and assign them to a team": depends on 003b — a
  membership requires a team to exist, and 004 onward builds on the
  migrated stack.
- Slice 005 "Plan a costed phase and see its cost calculated": depends on
  001 (the audited engine logic it wires in) and 004 (a team member to
  allocate).
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

## Backlog tail (not yet fully sliced)

One line each; dependencies noted loosely. Detail these in full when the
team is approaching them.

- **Skip a gate with a reason** (§8.2) — depends on 008; lets an owner
  bypass a skippable gate's checks.
- **Choose a starting phase for an untouched initiative** (§8.2) —
  depends on 008; enters historical work with earlier gates auto-skipped.
- **Put on hold / Resume** (§8.4) — depends on 003; pauses an initiative
  without freezing it.
- **Cancel and Reopen a Cancelled initiative** (§8.4) — depends on 003.
- **Reopen a Closed initiative** (§8.3, §8.4) — depends on 008 and the
  final-gate-closes-initiative behaviour.
- **Copy allocations from the previous phase** (§5.11) — depends on 005,
  needs two phases to exist.
- **Default plan on initiative creation** (§5.11) — depends on 003; needs
  brand-pack default phase durations.
- **Duplicate an initiative** (§5.11) — depends on 005, 007.
- **Fix suggestions for capacity warnings** (§5.11) — depends on 009.
- **Cost item suggestions** (§5.11) — depends on 007, needs multiple
  initiatives to draw from.
- **Settings: edit roles, countries and rates** (§5.9) — depends on 003;
  the brand pack's seeded defaults cover the core loop without this.
- **Getting started strip, full four-step guidance** (§5.2) — depends on
  004, 005; richer than the plain empty states shipped in 003.
- **Global search overlay** (§5.1) — depends on 003, 004.
- **Approval-track escalation display nuance and "Not yet known"**
  (§7.4) — the core figure is recorded in 008; the fuller display polish
  can follow.
- **Schema/process migration and versioning** (§3) — has no real trigger
  until a second schema version actually exists; deliberately deferred
  rather than built speculatively.
- **Accessibility, density and colour-token compliance** (§9.5, §9.8) —
  not modelled as a standalone slice; treated as an acceptance-criterion
  attached to every UI-bearing slice above, since it fails the
  Desirable/Valuable test as a standalone capability.
