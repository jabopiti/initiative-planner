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
| 0 | Docs: README, SPEC §1/§2/§3/§5/§6/§7/§9 + numbering fix, DESIGN §2/§4/§6 + numbering fix (§14) | Spec-first discipline — the new vocabulary and rules land before any code that implements them. |
| 1 | A1, U1, U3 | All shell-level `app.js` work (the dispatcher, undo wrapping, search) — one pass over the same file/area. |
| 2 | A2 | Long-page nav structure, before other bundles add content to Initiative/Team detail that would need to be re-slotted into it. |
| 3 | T1, T2, T3b, T4, T5, X1 | Mechanical renames/fixes, no interdependencies, no behavior change — safe to batch, and terminology should be settled before later bundles (esp. 12) build on the new names. |
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
| 0–12 | **Not started** |

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
| X1 | "AnXalyst" role typo | Seed/demo data: fix to "Analyst," add its abbreviation (the only role currently missing one). |

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
- Fix the missing §4 in the section numbering.
- **Explicitly untouched:** rate resolution, freeze semantics, import/
  export contract, and anything reserved for DESIGN.md — none of this
  session's findings touch them.

### DESIGN.md — kept, not retired

Still earns its place: the brand-pack contract, the data-model invariants,
persistence/versioning rules, and the testing-strategy rationale are
genuinely non-obvious "how" content that would blur SPEC's own what/why
job if folded in. Changes:

- Fix the missing §6 in the section numbering.
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
