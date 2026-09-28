---
slice_id: "029"
title: "Settings page with section lock, and the Roles editor"
type: "capability"
status: "valid"
criteria_failures: []
depends_on: ["005"]
verification_status: null
superseded_by: null
supersedes: null
change_summary: "Promoted from the backlog tail (Settings: edit roles, countries and rates, §5.9), split in review into four slices (029 to 032). This one replaces the Settings placeholder with the page's section navigation, builds §2's lock/unlock as the pattern 030 and 032 reuse, and ships the Roles section."
recommended_model: "Claude Sonnet 5"
model_rationale: "A list editor on existing field primitives plus a small, browser-local lock state with a re-lock-on-leave rule; the impact count on a cost-factor change reuses the cost engine. All directly testable."
spec_sections: ["§5.9 Settings (Roles)", "§2 What the build fixes, and what the user changes (Editable by the user)", "§6 Data model (Role)", "§7.2 Capacity, rates, and the three percentages", "§8.1 Passing a gate", "§9.3 Deletion rules", "§9.9 Interface states (Locked sections)", "§10.3 Writing", "§10.4 Browser storage"]
---

# Settings page with section lock, and the Roles editor

## Intent

**Problem statement:** The roles and cost factors that drive every estimate
ship as placeholders from the brand pack, and there is no screen to correct
them — Settings is a placeholder page. A deployment whose "Tech Lead" costs 1.4×
a developer, not 1.2×, gets wrong estimates everywhere, silently.

**Outcome statement:** Settings exists as a real page, and its Roles section
lets the organisation name its roles and set their cost factors, protected by
a lock against casual changes (§2), with the effect of a change on live
estimates stated where it is made.

## Scope

- **Page (§5.9).** A left section list — Roles, Countries & rates, Process,
  Connection, About, Danger zone — and the chosen section on the right. The
  section is in the URL (`#/settings/roles`), default Roles. Sections not yet
  built (030 to 032) are listed and show one line "Not available yet."
- **Lock (§2, §9.9).** Lockable sections (Roles, Countries & rates, Danger
  zone) have a labelled toggle button in their header: "🔒 Locked" /
  "🔓 Unlocked" (pressed state when unlocked, `aria-pressed`). Every section
  starts locked; a locked section shows its values read-only with the hint
  "Locked. Unlock to edit." Lock state is browser-local, never synced, and
  held in memory: clicking the button again re-locks; leaving Settings
  entirely re-locks every section; moving between sections does not. One
  shared `useSectionLock` for all three.
- **Roles table (§5.9, §6).** Columns Name, Abbreviation, Cost factor, Active.
  Inline editing when unlocked (CommitInput). Cost factor accepts a number
  above 0 (refused inline otherwise, like 005f). Name and abbreviation are
  required (a blank commit is refused inline).
- **Add role.** "Add role" opens an unsaved draft row (007's pattern): name,
  abbreviation, cost factor (default 1.0); nothing saved until **Add**.
- **Deactivate / Reactivate (§9.3).** The Active toggle; an inactive role is
  greyed out, kept in data, and no longer offered for people (their existing
  role stays).
- **Impact note.** After a cost-factor change, a note beside the field until
  its next edit: "Changes the estimate of 4 initiatives." — counting
  initiatives with an unfrozen allocation of a person with that role
  (frozen phases don't change, §8.1). No confirmation.
- **Commits (§10.3).** "Roles: Tech Lead cost factor set to 1.4", "Roles:
  Designer added", "Roles: Designer deactivated".

**Explicitly excluded:** Countries & rates (030); Process, Connection, About
(031); Danger zone (032); deleting a role (never, §9.3).

## Execution path

1. User triggers: Settings → Roles → **Unlock**; sets Tech Lead's cost factor
   to 1.4.
2. Data: `roles.json` edited, one commit.
3. UI: "Changes the estimate of 2 initiatives." beside the field; estimates on
   Checkout Redesign already reflect it.
4. User leaves Settings; coming back, Roles is locked again.

## Value

- **Desirable:** Every organisation's roles and cost factors differ from the
  placeholders.
- **Usable:** Inline, like every other table, with its impact stated.
- **Valuable:** Makes estimates correct for the deployment; the lock keeps
  them from changing by accident.

## Acceptance criteria

- [ ] Given Settings is opened, then the six sections are listed and Roles is
      shown; `#/settings/roles` survives a reload.
- [ ] Given Roles is opened, then it is locked: values read-only, "Locked.
      Unlock to edit." shown, the button reads "Locked".
- [ ] Given Unlock, then fields become editable and the button reads
      "Unlocked"; clicking it again re-locks.
- [ ] Given Roles unlocked, when moving to another Settings section and back,
      then it is still unlocked; when leaving Settings and returning, locked.
- [ ] Given a lock state, then nothing about it is written to the dataset.
- [ ] Given a cost factor of 0, -1 or text, then it is refused inline with a
      message and nothing is saved.
- [ ] Given a blank name or abbreviation, then it is refused inline.
- [ ] Given Add role with name, abbreviation and factor, then Add saves it in
      one commit; without a name, Add is disabled.
- [ ] Given a role is deactivated, then it is greyed out, not offered in a
      person's role list, and people who have it keep it.
- [ ] Given Tech Lead's factor changes and two initiatives have unfrozen
      allocations of Tech Leads, then "Changes the estimate of 2 initiatives."
      shows beside the field, and a frozen phase's figures are unchanged.
- [ ] Given keyboard only, then the lock button toggles with Enter or Space and
      announces its pressed state.

## Delivery gate

- [ ] Deployed to production-equivalent environment

## Flags and compromises

None.

## Decided in review (pre-implementation)

- **Split:** Settings is four slices (029 shell + lock + Roles, 030 Countries &
  rates, 031 read-only sections, 032 Danger zone).
- **Layout:** section list on the left, one section on the right, section in
  the URL.
- **Lock:** a labelled toggle button ("Locked" / "Unlocked") in the section
  header, plus the §9.9 hint while locked.
- **Impact:** an inline note after a rate-affecting edit, no confirmation.
