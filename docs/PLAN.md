# PLAN: from planning tool to a companion that stays out of the way

**This is a temporary working document**, in the same spirit as the old
`REVAMP.md` — it sequences one body of work and holds the decisions it waits
on. It is not a third authority beside `SPEC.md` and `DESIGN.md`: every
durable decision here moves into one of those two in the commit that
implements it, and this file is deleted once the last workstream lands.

It exists because a fresh, no-docs review of the running app (three passes:
a feature-by-feature UX review, a product-vision review against "initiative
planning and gate progression should be a non-event," and a deep dive on
cost-estimation/capacity-allocation and gate checklists) turned up more
findings than fit in a conversation, all with decisions already made on
each. Two further audits (message copy, and general copywriting/terminology)
are folded in below once their own findings are walked through and decided.

---

## 0. Status & execution order

Item detail lives once, in the thematic sections below (§1–§15), each item
keeping its short id (A1, C2, G3, …) so cross-references stay valid. This
section is the sequencing index — reordering the document itself would
risk breaking the many `§4, N3`-style cross-references scattered through
it for no real benefit over just listing the build order here.

Two corrections made while reviewing the plan for this pass: the
"recently viewed" search enhancement Bo accepted (narrowed down from a
full command palette) had only been recorded as prose under §15's
declined list — it now has its own id, **U3**, in that section's table.
And N3 (the blocker badge's calm-text redesign) and I9 (a dot-progression
icon layered onto that same badge) were about to land in two different,
far-apart bundles — bundled together below instead, since it's the one
component either way.

**Bundling principle:** group by what a change actually touches, and
sequence foundational/shared-shape work before anything that would have
to be rewritten if it landed on top of it. Docs before behavior (spec-first,
already the repo's convention). The dispatcher refactor and page-nav
restructuring before any feature work that adds to what they restructure.
Terminology fixed before icons that reference the new terms. The
Provisional/Confirmed and actual/estimate data-model core before the UX
built on top of it. Calm-signaling (Needs attention, de-alarming) after the
underlying signals (checklist carry-forward, actuals-default) it surfaces
actually exist. Cosmetic polish and copy passes last, since nothing depends
on them.

| Bundle | Items | Why grouped / sequenced here |
|---|---|---|
| 0 | Docs: README, SPEC §1/§2/§3/§5/§6/§7/§9, DESIGN §2/§4 (§14) — numbering-fix sub-items reversed, see §14 | Spec-first discipline — the new vocabulary and rules land before any code that implements them. |
| 1 | A1, U1, U3 | All shell-level `app.js` work (the dispatcher, undo wrapping, search) — one pass over the same file/area. |
| 2 | A2 | Long-page nav structure, before other bundles add content to Initiative/Team detail that would need to be re-slotted into it. |
| 3 | T1, T2, T3b, T4, T5 | Mechanical renames/fixes, no interdependencies, no behavior change — safe to batch, and terminology should be settled before later bundles (esp. 12) build on the new names. (X1 dropped — see §8, no such typo exists in any seed/demo file.) |
| 4 | C2, C3, C6, C1 | The automation core: Provisional/Confirmed must exist before the gate-requirement easing (C3) or the hard/provisional split in the suggestion chip (C6) can be built against it; C1 (actuals-default) resolves its own flagged open data-model question as part of this bundle. |
| 5 | C4, C5, C7, C8, C9 | Estimation-input UX built on top of Bundle 4's data; independent of each other, same phase-panel area. |
| 6 | G3, G2, G4, G5, G6 | Gate-checklist rework, one pass over the same panel — rename before/with the carry-forward mechanism that references the renamed states. |
| 7 | G1, N1, N3 (+ I9), N2, U2 | Needs-attention & calm signaling — depends on Bundle 4 (overdue actuals) and Bundle 6 (Tentative carry-forward) already existing to have anything to surface. N3 and I9 land together since they're the same badge; U2 rides along since it also touches the summary bar N3 does. |
| 8 | F1, F2 | Creation flow, independent of everything above. |
| 9 | S1, S2 | Settings, independent; S2 needs one open call made during implementation (where the password constant lives — see §14's DESIGN note). |
| 10 | P1–P8, T3, T7, T8 | Visual/UX polish and the remaining explainer copy — page-local, lower-risk, sequenced after the structural/behavioral bundles they sit on top of (esp. P2/P8 vs. Bundle 4/5's phase-panel changes). |
| 11 | M1, M3–M8 | Message-copy fixes, scattered small string edits, independent of everything. |
| 12 | I1, I2, I3, I4, I5, I6, I7, I8, I10, I11 | The rest of the icon pass — after Bundle 3 (I1 depends on the Forecast rename) and after Bundle 7 peels off I9 into its own badge. |

Declined/parked items (§9's standing policies aside) need no slot: §10's
parked list, M2, T6, and §15's other declined items stay exactly as
recorded, not scheduled.

Update the row below in the commit that finishes a bundle.

| Bundle | Status |
|---|---|
| 0 | **Done** |
| 1 | **Done** |
| 2 | **Done** |
| 3 | **Done** |
| 4 | **Done** |
| 5 | **Done** |
| 6 | **Done** |
| 7 | **Done** |
| 8 | **Done** |
| 9 | **Done** |
| 10 | **Done** |
| 11-12 | Not started |

---

## 1. Architecture

| # | Item | Detail |
|---|---|---|
| A1 | Registry pattern for the click/input dispatcher | `app.js`'s `onClick`/`onInput` is one ~600-line, 85-case switch handling every action in the app. Replace with each page module registering its own `{act: handler}` map into one shared dispatcher — keeps the "global listener installed once" invariant, decentralizes the logic. |
| A2 | Left-rail scrollspy nav on long pages | Initiative detail and Team detail are long single-scroll pages with only a footer "Jump to" menu. Reuse the same sticky, highlighting section nav Settings already has. |

## 2. Automation — cost estimation & capacity allocation

| # | Item | Detail |
|---|---|---|
| C1 | Actuals default to estimate | Once a month closes, its actual defaults to the estimate, shown as "using estimate" until confirmed or overridden. Removes most manual month-by-month entry. |
| C2 | Provisional phases | A phase is **Provisional** unless it is the current phase or its start date is under a month away, in which case it's **Confirmed** — purely date-driven, no toggle. Provisional phases carry a quiet badge (same slot as today's "Approved and frozen"). Provisional allocations are excluded from Allocated %/over-capacity math on Team and Person pages; shown instead as a separate, quieter "+X% provisional" annotation. |
| C3 | Ease the "complete estimate" gate requirement for provisional phases | Today, passing any gate requires a full estimate for *every* costed phase, including ones many months out. A period + a rough allocation on a Provisional phase should satisfy this, so C2 doesn't fight this rule. |
| C4 | Carry-forward allocation | A person already allocated on an earlier phase defaults to their prior %/role shape when added to a later phase, instead of starting blank/0. |
| C5 | "Usual for this team/role/phase" allocation suggestion chip | One-click apply of the historical median allocation % for that (team, role, phase) combination, computed locally. |
| C6 | "Max available" allocation suggestion chip | Safe headroom (the *minimum* across the phase's own months) before over-allocating, computed against **confirmed (hard) allocations only**. A quiet secondary line ("+20% provisional elsewhere") shows provisional load without folding it into the number. |
| C7 | Bulk allocation edit per phase | One control, three modes: set everyone to X%, set a role to X%, apply the team's usual staffing (from C5's data). (A fourth mode, "scale everyone by X%," was proposed but not selected — parked, see §7.) |
| C8 | Duration-first phase-date input | For a phase with no dates yet: generic presets (6 weeks / 3 months / 6 months) plus a data-driven "usual for this team/phase" preset, computing the end date from the start. Still fully editable as two dates afterward. |
| C9 | Other-cost item suggestions | Recalled from names already used elsewhere in the dataset, **plus** a small build-time-defined library of common recurring items (name + typical amount) — likely belongs alongside `process.js`'s other build-time-fixed data, not `masterData.js`, since it's an org-standard category list rather than something a department invents per-initiative. |

## 3. Automation — gates & checklists

| # | Item | Detail |
|---|---|---|
| G1 | Checklist items feed the "Needs attention" strip (§4) | As soon as a phase goes current, its unresolved checklist items appear on the Portfolio attention strip — spreads resolution over the phase's life instead of a pile discovered at gate time. |
| G2 | Carry-forward of Tentative items | An item left **Tentative** when its gate passes doesn't just sit frozen in history — it reappears on the *next* gate's own checklist, tagged "carried from Gate X," until marked **Complete**. It is never itself a hard blocker at that later gate (only red/Incomplete blocks, as today). |
| G3 | Rename checklist states | red/amber/green → **Incomplete / Tentative / Complete**. (Considered: "Open/In progress/Done" and "Not started/Accepted with follow-up/Resolved" — Bo's own proposal won on precision.) |
| G4 | Note required only on Tentative | Green (Complete) and red (Incomplete) are self-explanatory; Tentative is the one state that inherently needs an explanation of what's still outstanding. Today the note field is offered, unprompted, at every status equally. |
| G5 | Keep the checklist's substance in gate history | "At each gate" today keeps cost totals only. Keep the actual item text/resolution/note too, so what a gate verified is still readable later without archaeology. |
| G6 | State the consequence at the moment of passing | A one-line "this freezes €X and opens [next phase]" next to the Pass-gate button — information, not a blocking confirmation. |

## 4. Guidance / attention (portfolio-level)

| # | Item | Detail |
|---|---|---|
| N1 | Portfolio "Needs attention" strip | Ranked, one-click-action list above the initiatives table: gates ready to pass, overdue actuals, initiatives that just crossed an approval band, carried-forward Tentative items (G1). |
| N2 | Ambient nav badge | A small persistent counter (e.g. on the Initiatives nav item) reflecting the same attention items, visible from anywhere in the app. |
| N3 | De-alarm the gate UI | Replace the repeated amber/red "N BLOCKER(S)" badge (shown 3× per initiative page) with one calm "X of Y complete" indicator; reserve real alarm color for genuinely overdue items (a gate date already past). |

## 5. Creation flow

| # | Item | Detail |
|---|---|---|
| F1 | "Start from an existing initiative" as the front door | "New initiative" opens with a choice: start from an existing one (search, pick, adjust what's different — built entirely on the existing `duplicate()` logic) as the default-focused option, or start from scratch. |
| F2 | Add-person chips | Replace the "every team member pre-listed at 0%" allocation table with click-to-add chips; people not involved never appear as a row to skip past. |

## 6. Settings

| # | Item | Detail |
|---|---|---|
| S1 | Reorder sections | New order: **General → Data → Process → Roles → Countries & rates → Danger zone** (today: Roles, Countries, Process, General, Data, Danger zone). |
| S2 | Admin password gating edits | Introduce an admin password. Data and Danger zone stay editable by any user without it. General, Process, Roles, and Countries & rates require it to *edit* (Process is read-only regardless, so this mostly affects General/Roles/Countries). **Resolved:** explicitly a soft deterrent against casual/accidental changes on a shared device, not real access control — a client-side password in an offline single-file app can't be more than that, and it is framed/documented as such rather than sold as security. The password is a **hardcoded build-time constant** (same category as `process.js`'s other fixed governance data) — not user-set, no first-run prompt, no in-app setup UI. Consequence: no forgotten-password recovery flow is needed either — changing it means rebuilding, the same as any other build-time-fixed value. |

## 7. Visual/UX polish

| # | Item | Detail |
|---|---|---|
| P1 | Whole-card/row clickable | Teams overview cards, and table rows generally (Initiatives list, People list, etc.) — navigate on click anywhere, with destructive buttons as their own stop-propagation targets. |
| P2 | Distinct frozen/approved phase layout | A compact, clearly read-only summary card for frozen phases instead of reusing the live-editing panel shape. |
| P3 | Fade/gradient cue on scroller tables | Capped-height scrollers (e.g. "Month by month") get a subtle top/bottom fade so more-content-below is obvious, not just a thin scrollbar thumb. |
| P4 | Reactive helper captions | Stop showing stale "X is needed" captions once their condition is satisfied (found in the wizard, team/person creation forms). |
| P5 | Inline explainer: Allocated % vs Utilisation % | On the People page, where the two columns currently show identical numbers for everyone (since every seeded person's Capacity % is 100%). |
| P6 | Tooltip on "not in capacity" tags | Explaining that past/cancelled work doesn't count toward current capacity. |
| P7 | Color-code Portfolio Variance by severity | Instead of a plain € figure that reads the same whether it's a rounding drift or a real problem. |
| P8 | De-emphasize cost during active phase-panel editing | Smaller, quieter running total while editing a phase; full prominence stays in Portfolio and other aggregate views. |

## 8. Content fix

| # | Item | Detail |
|---|---|---|
| ~~X1~~ | ~~"AnXalyst" role typo~~ | Checked while executing Bundle 3: no file in the repo, at any commit, ever contains "AnXalyst" — not `masterData.js`, not `examples/exports/demo.json`. It only ever existed as a stray role typed into a live browser's `localStorage` during this session's own fresh-eyes review, mistaken there for seed data. Removed from that test browser directly; nothing to fix in source. |

## 9. Standing policies (not tasks — decisions to hold future work against)

- **Deliberately under-invest in Teams/People.** No new views, charts, or richer capacity dashboards there going forward; the bar is "add a person in under 10 seconds," not a better report.
- **No configurability.** No process/workflow editor, custom fields, tags, or a comments system. The fixed, opinionated process is what makes every automation item in §2–§4 possible — loosening it in the name of flexibility removes the thing that lets defaults/templating/ranking work at all.

## 10. Parked (explicitly declined during review — not forgotten, not scheduled)

- Solve-for-the-unknown allocation input (%, person-days, and total cost mutually interchangeable).
- Live inline "this crosses into [band]" feedback at the allocation/date input itself.
- Hiding/de-emphasizing checklist items that can't honestly be resolved yet (a soonest-sensible-date heuristic).
- A single "everything checks out" batch-resolve action for checklists.
- A reusable "reason bank" suggesting previously-used skip-gate reasons.
- "Scale everyone's allocation by X%" as a bulk-edit mode (relative scaling) — conceptually approved once, not selected when the final mode list was chosen; revisit if it turns out to be missed.

## 11. Message-copy audit

Full findings in the standalone `message-audit.md`. Decided outcomes:

| # | Item | Detail |
|---|---|---|
| M1 | Add Export-now to the "starting fresh" banner | Pairs the load-reason warning with the same Export action every other severe banner already offers, rather than Dismiss-only. |
| M3 | Improve the "Copy failed" toast | State the likely cause (clipboard access blocked) and an alternative ("select the table and copy manually") instead of the bare "Copy failed." |
| M4 | Disable Skip until a reason is typed | Matches every other required-field flow (initiative/team/person name) already disabling submit pre-emptively, instead of erroring only after a failed click. |
| M5 | Bring the deactivated-team message up to the deactivated-person standard | State the consequence explicitly (existing work keeps running, no new membership while deactivated), not just "This team is deactivated." |
| M6 | Move "used by X, Y" into visible text | The team-can't-delete message currently only names the blocking initiatives in a hover tooltip; put the names in the visible paragraph, matching the Role/Country deactivate-confirm pattern. |
| M7 | Add working links/buttons to empty states that describe an action in prose | "Create one from Initiatives, with this team selected," "Allocate them from a costed phase...," "Add people to the team, then allocate them here," and the month table's "give a phase a period" all get the actual destination as a button/link, matching the rest of the app's empty-state pattern. |
| M8 | Add a "nothing was changed" reassurance to import-rejection errors | A trailing clause confirming validation happens before anything is touched. |

**Declined:** M2 (an export/duplicate escape hatch on delete/discard-initiative confirmations) — left as-is, no change.

## 12. Copywriting & terminology audit

Full findings in the standalone `copywriting-audit.md`. Decided outcomes:

| # | Item | Detail |
|---|---|---|
| T1 | Standardize on "Forecast" | The same figure is today called "Effective" (Portfolio), "Forecast" (Initiative detail), and "Blended" (month table) — all three become "Forecast," matching AGENTS.md's own Estimate/Forecast/Actual vocabulary. |
| T2 | Standardize on "Non-initiative work" | Replaces "Spare" (Person page) with the Team page's term, since it's more self-explanatory out of context; carry the Person page's explanatory sentence over too. |
| T3 | Add capacity-vocabulary explainer copy more broadly | Extend the Team roster's existing "share" explanation pattern to the Capacity page and Team capacity grid, for Capacity %/Allocation % as well, not just the renamed term below. |
| T3b | Rename "Share %" → "Team FTE %" | Adopts the standard resource-management term (FTE) for exactly this concept — a team's claim on a person's capacity before it's assigned to specific work — scoped to just this one layer; Capacity % and Allocation % are left alone since they already read clearly in context. |
| T4 | Rename the Initiatives list filter "Track" → "Approval track" | Matches every other filter label on that toolbar, which already match their column names exactly. |
| T5 | Convert 5 curly apostrophes to straight | `person.js` (×3) and `team.js` (×2) are the only spots using ’ instead of the ' used everywhere else. |
| T7 | Add a one-line explainer for "Approved" on Portfolio | Proposed wording: *"Approved is what this initiative's total stood at when its last gate was passed — a fixed point to measure drift against, not a running figure."* Clarifies it's a snapshot of the blended total at last-approval time (which may already include some actuals), not the pure Estimate figure. |
| T8 | Add a short explainer distinguishing the gate panel's three requirement kinds | Clarify near "What this gate needs" that the estimates check is automatic, checklist items are a manual judgment call, and missing actuals only ever warn — today all three read as one visually uniform list. |

**Declined / no change:** T6 (native date-input locale formatting vs. the app's own "1 May 2026" text formatting) — accepted as an inherent tradeoff of using native `<input type="date">` controls, not fixed.

## 13. Icon + tooltip pass

A review of every repeated tag/label/badge in the app for candidates to
convert from text to an icon-with-tooltip — once a shape is learned, it's
faster to scan than re-reading the same word on every row. Grounded in a
full grep of every `badge()` call site (`src/render/components.js`'s
`badge()` helper), not a sample.

| # | Item | Detail |
|---|---|---|
| I1 | Coverage indicator → icon + tooltip | "Estimate"/"Forecast"/"Actual" is the single most-repeated text tag in the app (every initiative row on Portfolio, Initiatives list, the sticky footer, the band panel, and every costed phase panel). Replace with a progress-style glyph (hollow → half → filled, or similar); tooltip carries the exact meaning and month count. Ties directly into §12's T1 (the figure this badges is being unified to "Forecast"). |
| I2 | Approval track → reuse the existing abbreviation badge | Portfolio and Initiatives-list rows currently spell out the full band name ("Standard," "Light touch") on every row; switch to the LT/STD/MAJ abbreviated-badge treatment already used on the band bar and in Settings' Process page, full name as the tooltip. |
| I3 | Status badges gain an icon | Active/On hold/Cancelled/Closed keep their existing color + text, plus a small distinct glyph per status — status is scanned too often to risk dropping the label, so icon is additive, not a replacement. |
| I4 | "inactive" tag → icon + tooltip | One consistent glyph replacing the word in all three places it appears today (People list, Teams list, Team roster's "person inactive"). |
| I5 | "custom rate" tag → icon + tooltip | One glyph (e.g. a currency/coin mark) meaning "paid at a negotiated rate, not the country/role standard," consistent across People list, allocation rows, and the allocation detail popover. |
| I6 | "not in capacity" tag → icon + tooltip | Person page's per-allocation-row tag; tooltip carries the explanation already agreed as a fix in the very first review round (this folds that item in rather than duplicating it). |
| I7 | "out of period" and "no longer in this team" → shrink to icon-only + tooltip | Both already pair a warning icon with text inside already-dense cost/allocation tables; drop the text, keep icon + tooltip, recovering real table width. |
| I8 | "approved and frozen" → lock icon + tooltip | Natural fit (frozen → padlock) for the phase-panel header once a gate has passed. |
| I9 | Blocker badge gets a dot-progression icon alongside its text | Layers onto the already-agreed "X of Y complete" calm-text redesign from the product-vision review (§4, N3) — a small dot-progression (e.g. ●●○) sits next to the text, not replacing it. |
| I10 | Search results get a leading type-icon | Every result today repeats its category as a word ("Person Ada Vance," "Initiative …," "Team …"); a small distinct glyph per type lets results be scanned by shape. |
| I11 | Row-action buttons gain icons, text stays visible | Deactivate/Reactivate/Leave team/Rejoin have no icon at all today, unlike Duplicate/Delete which already pair icon + text. Add an icon to all four, but keep every label visible — including Deactivate — since misreading a state-changing action, even a reversible one, is a real risk not worth the small space saved. |

## 14. Documentation revision — README, SPEC, DESIGN

This session sharpened *why* the product is shaped the way it is (the
companion/non-event philosophy from the product-vision review) well beyond
what `SPEC.md` §1 currently states. Read all three docs in full before
writing this section: nothing here found them wrong — SPEC.md's vocabulary,
calculation rules and lifecycle contract are still accurate, and in one
case (the Estimate/Forecast/Actual glossary) the *code* had drifted from an
already-correct spec, not the reverse. So this is a **heavy revision of
specific sections, not a from-scratch rewrite** of either document —
lower risk to content that already reads right.

**Sequencing note:** this repository was built spec-first (README's own
"Status" section). The SPEC.md changes below describe *new* behavior
(Provisional phases, the checklist rename/carry-forward, actuals-default-
to-estimate, the admin password) that doesn't exist yet — they should land
**before** the corresponding build items in §2/§3/§6 above, not after, to
keep that discipline intact.

### README.md

- Sharpen the opening paragraph(s) to state the companion/non-event
  purpose directly, then point to SPEC §1 for the full articulation rather
  than duplicating it — README's job stays orientation, not the full case.

### SPEC.md

- **§1 Purpose & scope — heavy rewrite.** Capture: the tool is a companion
  that takes over/automates/simplifies, not a management tool that adds
  oversight; the explicit goal of minimum time spent in the tool across
  creation, updates, and getting an overview; initiative planning and gate
  progression as a non-event — governance running quietly alongside the
  work, asking for a decision only at the moment one is genuinely
  unavoidable; cost falling out of planning the work rather than being a
  separate cost-focused chore; the fixed, opinionated process as a
  deliberate advantage (it's what makes defaults, templating and
  automation possible) rather than a limitation to work around; people/team
  management explicitly secondary to initiatives, and not to be over-built.
- **§3 Core definitions:**
  - Add **Provisional / Confirmed**: a costed phase is Provisional unless
    it is the current phase or starts within a month, in which case it's
    Confirmed — purely derived from today's date against the phase's own
    start date, never stored, never a toggle.
  - **Checklist item**: rename the three states red/amber/green to
    **Incomplete / Tentative / Complete**. Add the carry-forward rule: an
    item still Tentative when its gate passes reappears on the *next*
    gate's own checklist, tagged with its origin, until marked Complete —
    it is never itself a blocker at that later gate (only Incomplete
    blocks, as today).
- **§5 Calculation rules:**
  - New rule: actuals default to the estimate once a month closes, shown
    as using-the-estimate rather than blank, until confirmed or overridden.
    **Open question, not yet settled:** the data model needs a way to
    distinguish "defaulting, unreviewed," "explicitly confirmed as
    correct," and "genuinely overridden with a different figure" — three
    states where today there are only two (blank vs. a recorded number).
    Settle this before implementing C1.
  - **§5.2 Capacity:** Provisional-phase allocations are excluded from
    both capacity ceilings (Capacity % and the renamed Team FTE %) and
    shown as a separate, non-blocking annotation instead.
  - Rename **Share %** → **Team FTE %** everywhere it's defined (§3, §5.2,
    §7, the glossary).
- **§6 Lifecycle contract, §6.1:** the "complete estimate" gate requirement
  is eased for Provisional phases — a period plus a rough allocation
  satisfies it; full precision is only required once a phase is Confirmed.
  Document the checklist carry-forward mechanism here too, since it's a
  lifecycle-level behavior, not just a UI treatment.
- **§7 Capacity overview:** note that the Provisional/Confirmed split
  changes what counts toward "over capacity" and "over their team's share."
- **§2 (what the build fixes):** add the admin password as a new
  build-fixed item — a hardcoded constant, explicitly not real access
  control, gating edits to General/Roles/Countries & rates (Data and
  Danger zone stay open to everyone, Process is read-only regardless).
- **Glossary (§9):** add Provisional/Confirmed; update the checklist-item
  row to the renamed states; rename Share % → Team FTE %; retire "Spare"
  in favor of "Non-initiative work" as the sole term (§12's T2).
- ~~Fix the missing §4 in the section numbering.~~ **Reversed:** the gap
  is deliberate, not an oversight — the commit that trimmed this document
  (`787693c`) states surviving sections keep their numbers because ~90
  source comments cite them (79 confirmed live today via
  `grep -roE "SPEC §[0-9.]+|DESIGN §[0-9.]+" src/`). Renumbering would mean
  hunting down and correcting every one of those for a purely cosmetic
  fix. Leave the numbering exactly as it is.
- **Explicitly untouched:** rate resolution, freeze semantics, import/
  export contract, and anything reserved for DESIGN.md — none of this
  session's findings touch them.

### DESIGN.md — kept, not retired

Still earns its place: the brand-pack contract, the data-model invariants,
persistence/versioning rules, and the testing-strategy rationale are
genuinely non-obvious "how" content that would blur SPEC's own what/why
job if folded in. Changes:

- ~~Fix the missing §6 in the section numbering.~~ **Reversed** — same
  reason as SPEC's §4 above: deliberate, not a gap, per the same commit.
- **§2 (data model rules):** add that phase confidence (Provisional/
  Confirmed) is derived at compute time from today's date vs. the phase's
  own start — never a stored field, never a toggle, matching the pattern
  every other derived-not-stored rule in this section already follows.
- Note the checklist carry-forward's data shape: no new stored field is
  needed for the carry-forward display itself — checklist state is
  already stored per-gate (`initiative.checklist[gateId]`); carrying an
  item forward is a query across already-passed gates for still-Tentative
  items, resolved at render time, the same way other cross-gate views
  (the gate comparison table) already work.
- **§4 (brand-pack contract):** decide where the admin password constant
  lives — most likely alongside `process.js`'s other build-fixed
  governance fields (currency, wordmark) rather than a new brand-pack
  file of its own — and document explicitly, in the same place, that it
  is a soft deterrent only, never real access control, given the
  client-side/offline constraints §1 already establishes.

## 15. Further UX/UI patterns

A follow-up pass looking for other cross-cutting patterns worth
introducing or strengthening, the same way the icon+tooltip pass (§13)
took one good pattern and applied it broadly. Decided outcomes:

| # | Item | Detail |
|---|---|---|
| U1 | Extend Undo broadly | Grep-confirmed: 22 mutating actions autosave via `commit()` with no undo, against 5 wrapped in `withUndo`, even though the app's own stated editing model (D1) says autosaved edits should get it. Deactivating a role, changing an allocation %, editing a date, etc. all join the pattern the existing 5 already follow. |
| U2 | Sticky summary bar gains the initiative's name | The bar already carries Estimate/Forecast/Actual/Phase but not what initiative it belongs to — on a five-screen-long page, scrolling loses that anchor. Small addition, real gap. |
| U3 | Search shows recently-viewed items on an empty query | The narrowed-down version of the command-palette idea: opening Search with nothing typed yet shows a short recent-items list, rather than extending Search to trigger actions directly (that fuller version was not selected). |

**Declined / narrowed:**
- **Positive "saved" confirmation:** left silent on success, deliberately. Confirmed as consistent with the calm-technology principle already running through this plan — nothing should announce itself unless it needs attention, and only the existing failure banners qualify.
- **App-wide bulk row-selection** (Initiatives, People): left at phase-level only, matching what's already planned for allocation tables (§2, C7) — not extended further.
- **Mobile/tablet layout:** confirmed out of scope — a desktop-only planning tool. No testing needed; every review this session ran at 1440×960 and that's an accurate reflection of how the tool is meant to be used.

## 16. Handoff to Next Session

**Current Progress:**
- **Bundle 6 (gate-checklist rework) is fully completed.** G3 (Incomplete/Tentative/Complete rename), G2 (carry-forward of still-Tentative items onto every later gate, resolved against their origin gate — `L.carriedForwardItems` in `src/lifecycle.js`), G4 (the note field appears, and is visually required, only once an item is Tentative), G5 (`buildGateRecord` now snapshots each gate's checklist substance — name/description/status/note — so "At each gate" stays readable after a later carry-forward resolution moves the live status), and G6 (a one-line "this freezes €X and opens/closes …" next to the Pass-gate button, computed live) all landed in `src/lifecycle.js` and `src/pages/initiative.js`.
- `src/styles.css` gained the minimal styling the above needed: `.req__required`, the gate-history detail row (`.row--sub`, overriding the frozen-first-column rule since its one cell is a colspan), and `.gate-checklist`'s `<details>`/`<summary>`.
- `docs/SPEC.md` and `docs/DESIGN.md` already described this bundle's target behavior in full (written spec-first, per a prior session) — no further SPEC changes were needed; DESIGN.md gained one paragraph explaining *why* gate records need their own checklist snapshot rather than just referencing the live one (the carry-forward mechanism is exactly what can move the live copy afterward).
- `examples/exports/demo.json`'s checklist items used the old `"green"` literal — updated to `"complete"` so the fixture stays valid against the renamed states.
- 12 new/updated tests in `test/lifecycle.test.mjs` (carry-forward reappearing across multiple gates until resolved, never blocking the gate it reappears on, resolving against the origin gate; gate records snapshotting checklist substance on both pass and skip, and on the createInitiative backfill path). The full suite (168 tests, including the e2e smoke test) passes, along with typecheck, lint and build.
- Verified by hand in a real browser (demo.json loaded via localStorage, all three themes): the note field's required styling, carry-forward showing up on the next gate untagged as a blocker, the frozen "At each gate" history staying put after the live item was later marked Complete, and the consequence line's figure.

- **Bundle 7 (Needs-attention & calm signaling) is fully completed.** Two new
  `src/lifecycle.js` functions carry the shared logic: `gateProgress` (N3) —
  one `{ complete, total, overdue }` ratio derived from `gateRequirements`,
  with `overdue` true only once the phase behind the gate has run past its
  own estimated end date — and `needsAttention` (G1/N1) — every open
  initiative's current-gate state (escalated / overdue / checklist / ready),
  ranked consequential-first, ready-last, finished initiatives excluded.
  Both are documented in `docs/SPEC.md` §6.1 and the new §6.5 (with a
  glossary row), since the ranking and the two distinct meanings of
  "overdue" are decisions the code alone doesn't say.
- **N3 + I9**: the "N BLOCKER(S)" badge — always red, in three places
  (`src/pages/initiative.js`'s stepper, summary bar, and gate banner) — is
  replaced everywhere by a shared `progressMark()` helper: a calm "X of Y
  complete" badge (neutral/ok/danger by `gateProgress`'s own `overdue` flag)
  plus a dot-progression (`●●○`, `.dot-progress` in `src/styles.css`,
  `aria-hidden`).
- **N1**: `src/pages/portfolio.js`'s `attentionMarkup()` renders a "Needs
  attention" panel above the Initiatives table, reusing the `.reqs`/`.req`
  component the gate panel already uses. Omitted entirely when
  `needsAttention` returns nothing — no empty-state box announcing that
  everything is fine, per the calm-technology precedent already set in §15.
- **N2**: `render()` in `src/app.js` now computes `needsAttention` once per
  render and puts the count on the Initiatives nav button as `.nav-badge` —
  the same computation N1 reads, so the two can never disagree.
- **U2**: `summaryBarMarkup` gained a `.summary__name` line (the initiative's
  name) at the top of the sticky bar, `flex: 1 0 100%` so it always forces
  the figures/facts/actions row onto a fresh line beneath it.
- 3 new tests in `test/lifecycle.test.mjs` for `gateProgress` and
  `needsAttention` (the overdue-date transition, ranking order across
  escalated/overdue/checklist/ready, finished initiatives excluded). The
  full suite (171 tests) passes, along with typecheck, lint and build.
- Verified by hand in a real browser (demo.json loaded via localStorage,
  light/dark/system): the nav badge and Portfolio strip agree on the same
  count, the gate badge reads calm neutral gray while merely incomplete and
  turns red once a phase's own end date was pushed into the past, and the
  sticky bar carries the initiative's name while scrolled.

- **Bundle 8 (Creation flow) is fully completed.** F1: "New initiative"'s
  first step now opens with a chooser (`src/pages/wizard.js`) — "Start from
  an existing initiative," the default-focused tab, or "Start from scratch."
  Picking a source pre-fills Name/Description/Team from it (the same
  defaults a manual Duplicate would give); Create-and-continue then calls
  the existing `L.duplicate()` and layers the draft's own edits on top via
  `renameInitiative`/`setDescription`/`setTeam`, so every phase's period,
  allocations and other costs carry over exactly as a Duplicate's would,
  landing in step 2 (Estimates) already populated to "adjust what's
  different." The chooser itself is skipped entirely when there is nothing
  yet to copy from (a brand-new dataset) — no dead-end tab. A `resolveDraftMode`
  helper is shared between the render and the create action specifically so
  a bare, mode-less draft (the state a fresh wizard starts in, since the
  default tab needs no click to already be selected) resolves the same way
  in both places — an early manual test caught the two disagreeing before
  this fix.
- **F2**: `src/render/phase-panel.js`'s allocation table now lists only
  people already allocated; `allocationPeople()` dropped its old whole-
  roster-while-editable branch entirely. A new `addablePeople()` computes
  the team members not yet on the phase, rendered as click-to-add chips
  (`addPersonChipsMarkup`) below the table — clicking one allocates
  immediately via a new `allocation-add` action, at the best guess already
  computed elsewhere for that exact person/phase (C4's carry-forward, then
  C5's usual, then a plain 100% when neither exists), never a 0% row left
  waiting to be typed over. The empty state is skipped when there is anyone
  left to add — the chips are the whole affordance, and a "nobody yet" box
  on top of them would be exactly the noise F2 removed the pre-listed rows
  for. Stale D2-era code comments describing the old pre-listed-roster
  design were corrected in the same commit (`src/render/phase-panel.js`,
  `src/app.js`).
- No SPEC.md/DESIGN.md changes were needed — F1/F2 are UI-flow changes over
  already-documented lifecycle functions (`duplicate`, `setAllocation`),
  not new persisted concepts or vocabulary.
- The full suite (171 tests, unchanged in count — no new lifecycle behavior,
  only new UI wiring already covered by the smoke test and the
  every-action-has-a-handler test) passes, along with typecheck, lint and
  build. Verified by hand in a real browser (demo.json loaded via
  localStorage, light/dark/system): both wizard front-door tabs, a
  duplicated initiative's phases arriving pre-filled, add-person chips on
  both an empty and a partially-staffed phase, the chip's toast/undo, a
  frozen phase still reading its own snapshot with no chips, and the
  no-initiatives-yet fallback (chooser hidden, scratch-only).

- **Bundle 9 (Settings) is fully completed.** S1: `SETTINGS_SECTIONS` in
  `src/pages/settings.js` is now ordered General → Data → Process → Roles →
  Countries & rates → Danger zone. S2: `PROCESS.adminPassword` in
  `src/process.js` is the hardcoded build-time constant — the open call from
  §14's DESIGN note resolved as expected, alongside `currency` and
  `wordmark`, with a doc comment stating explicitly it's a soft deterrent,
  never real access control. `GATED_SECTIONS` (`general`, `roles`,
  `countries`) in `settings.js` gates those three; Data and Danger zone stay
  open, and Process needed no gating since it already renders nothing
  editable. A gated section renders a password prompt in place of its normal
  content instead of the section itself disappearing, so the rail nav and
  every other section's layout stay unaffected. Unlocking is one flag
  (`adminUnlocked`, module state — session-only, like `app.js`'s `navOpen`)
  shared across all three: entering the password correctly in any one of
  them unlocks all three at once, since it's a single trust level, not
  three independent ones. A wrong attempt is scoped to the section it was
  tried in via `view.params.adminError` carrying that section's id, so one
  section's "Incorrect password" doesn't bleed into another's — verified by
  hand (typing it wrong under Roles left Countries' prompt clean, then the
  correct password unlocked General/Roles/Countries together). Three call
  sites that hardcoded the *old* first section (`'roles'`) as their
  no-current-section fallback — `country-expand`, `reset-arm`, `reset-cancel`
  in `settings.js`, and `reset-confirm` in `app.js` — were updated to the new
  first section so a direct `#/settings` deep link still falls back sensibly.
- No SPEC.md/DESIGN.md changes were needed — both already documented S2 in
  full (§2 and the glossary in SPEC.md, §4 in DESIGN.md), written spec-first
  in an earlier session per this plan's own §14 sequencing note; this bundle
  only had to build against what was already decided there.
- The full suite (171 tests, unchanged in count — no new lifecycle behavior,
  pure UI/settings wiring already covered by the smoke test and the
  every-action-has-a-handler test) passes, along with typecheck, lint and
  build. Verified by hand in a real browser (demo.json loaded via
  localStorage, light/dark/system): the new section order, all three gated
  sections showing the lock prompt on a fresh load, the wrong-password error
  scoped to one section, the correct password unlocking all three at once,
  and the pre-existing Danger-zone arm/confirm/cancel flow still working
  unchanged underneath the fallback-value fix.

- **Bundle 10 (Visual/UX polish and remaining explainer copy) is fully
  completed.** **P1** (whole-card/row clickable) turned out to already be
  built — every table row and Teams card in the app already uses the
  stretched-link pattern (`row-link`/`card-link` plus `.row--clickable`/
  `.card--clickable` in `src/styles.css`), a pure-CSS "click anywhere,
  destructive buttons stay their own targets via `z-index`" mechanism with
  no JS involved. Nothing to build; confirmed by grep across every page and
  by hand in the browser.
- **P2**: a non-editable phase panel (`src/render/phase-panel.js`'s
  `phasePanel()`) now reads its period as plain text ("1 Jan 2026 – 30 Apr
  2026") instead of a pair of disabled `<input type="date">` fields that
  still looked like something you could type into — the one part of the
  panel that visibly "reused the live-editing shape." The People/Other
  costs tables were already collapsing to read-only cells correctly
  (AGENTS.md: comparison tables stay tables), so this was the only real gap.
- **P3**: `.scroller--tall` (`src/styles.css`) gained a top/bottom scroll-
  shadow fade — the classic four-layer `background-attachment: local`/
  `scroll` CSS trick, colors composed from `--color-surface`/`--color-fg`
  via `color-mix` rather than literal values, so it re-derives correctly
  under dark mode and a rebrand. Applies automatically to both existing
  `scroller--tall` tables (Person's "Capacity over time," Initiative's
  "Month by month") with no markup change needed.
- **P4**: the wizard's General step and the team/person creation drafts each
  had a stale "X is needed first" caption that only the Create button's
  `disabled` state actually reacted to on keystroke — the caption itself
  needed a full re-render to update. Each caption now carries a
  `data-hint="…-create"` id and renders with a `hidden` attribute computed
  the same way the button's `disabled` is; the three input handlers
  (`wizardInputActions['draft-field']`, `teamsInputActions['team-draft-field']`,
  `personInputActions['person-draft-field']`) now toggle both together, so
  typing a name (or, in the wizard's "existing" mode, picking a source)
  clears the hint the moment it stops being true.
- **P5**: `src/pages/people.js` gained an explainer paragraph above the
  roster table stating that Allocated % and Utilisation % read alike for
  anyone at 100% Capacity % (everyone in the seed data) and diverge once
  someone's ceiling isn't the default.
- **P6**: `badge()` (`src/render/components.js`) gained an optional fourth
  `title` parameter — a native tooltip, escaped through the same `html`
  tag every other value goes through. The Person page's "not in capacity"
  tag (`src/pages/person.js`) is the one call site that uses it so far,
  carrying the explanation already agreed in the very first review round
  (past/cancelled work doesn't count toward current capacity); I6 in §13
  still owns turning the tag into an icon later.
- **P7**: Portfolio's Variance column (`src/pages/portfolio.js`) now reads
  its severity against the approved baseline as a percentage rather than
  coloring every non-zero positive figure the same — under 2% reads as
  plain text (rounding drift), 2–10% amber (`variance--mild`), above that
  the existing red `over` class. Coming in under budget is never colored.
  **Found and fixed a pre-existing bug while wiring this up**: `.grid td`
  (`src/styles.css`) sets `color: var(--color-fg)` at a *higher*
  specificity than a bare `.over`/severity class, so every existing
  over-capacity/over-utilisation figure in a `.grid` table (People's
  Utilisation %, Capacity's two over-allocation tables) was silently
  rendering in the default text color instead of red — the warning icon
  still showed, but the color half of the signal never did. Added
  `.grid td.over` / `.grid td.variance--mild` overrides right beside the
  rule that was winning, which fixes both the pre-existing cells and the
  new Variance ones in one place.
- **P8**: a phase panel's own running total (`phaseTotalsMarkup`'s `<p
  class="results">` line) now renders with a `results--quiet` modifier
  while the phase is actively editable — smaller, regular-weight, muted —
  so the allocation figures being worked on keep the visual weight instead
  of competing with a bold total on every keystroke. A frozen/read-only
  phase, the initiative's own grand total, and Portfolio are all untouched
  and keep full prominence.
- **T3**: the Team roster's existing "a Team FTE is…" explainer pattern is
  now echoed on the Capacity page (`src/pages/capacity.js`, defining
  Capacity % vs. Allocated % up front) and the Team page's capacity grid
  (`src/pages/team.js`'s `capacityGridMarkup`, clarifying that each grid
  figure is read against the member's Team FTE here, not their whole
  Capacity %).
- **T7**: Portfolio's Initiatives panel (`src/pages/portfolio.js`) gained
  the agreed one-line explainer for "Approved" verbatim (reworded from
  "this initiative's" to "each initiative's" for a table caption spanning
  every row).
- **T8**: the gate panel's "What this gate needs" section
  (`src/pages/initiative.js`'s `gateBannerMarkup`) gained a one-line
  explainer distinguishing the three requirement kinds — the estimate
  check is automatic, a checklist item is a manual judgement call, and a
  missing actual only ever warns.
- No SPEC.md/DESIGN.md changes were needed — every item here is UI-layer
  polish and copy over already-documented behavior, not a new persisted
  concept or a changed calculation rule.
- The full suite (171 tests, unchanged in count) passes, along with
  typecheck, lint and build. Verified by hand in a real browser (demo.json
  loaded via localStorage, light/dark/system): the frozen-phase read-only
  period text, the quiet vs. prominent running total side by side on the
  same initiative, the scroll-shadow fade's computed background layers on
  both `scroller--tall` tables, the reactive hints on all three creation
  forms (including the wizard's "existing" mode depending on both a typed
  name and a picked source), the now-red over-allocation figures on People
  and Capacity, Portfolio's Variance in danger red, and every new
  explainer paragraph's placement and wording.

**Next Steps (Bundle 11):**
- The next session should pick up **Bundle 11**: M1, M3–M8 — the
  message-copy audit's decided outcomes, scattered small string/behavior
  edits across several pages, independent of everything else in the plan.
- *Review before starting:* §11 in `docs/PLAN.md`, and the full findings in
  the standalone `message-audit.md`.

