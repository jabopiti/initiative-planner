# SPEC: Initiative Planner (white-label core)

**v1 — 22 September 2026 — Draft for build handoff**

## 1. Purpose & scope

### Problem and context

Organisations run their initiatives through a defined, aligned stage-gate
process, yet the planning behind it is fragmented. Cost and people capacity
are planned in spreadsheets and presentations, and every manager keeps an
individual solution. The numbers drift apart, they are updated by hand, and
it is hard to say what an initiative was approved at, who is over-committed,
or where the portfolio stands. Product and delivery managers spend their
time maintaining figures instead of running the work, and gates arrive as a
surprise because nobody sees what is still open.

This tool replaces those individual solutions with one shared dataset that
follows the same process for everyone: cost derived from who does what,
capacity per team, and gate status kept visible as the work progresses. Each
organisation deploys it as its own white-label build (§2).

### Purpose

A multi-user **companion** — not a management tool — for planning the
**cost** and the **people capacity** of initiatives (projects) as they run
through a stage-gate process. Both are required outputs, on different
surfaces: cost is the portfolio-level output (Portfolio, Initiatives),
capacity is the team-level output (Teams). The tool answers both "what will
this initiative cost, and what was it approved at?" and "who is committed to
what, and by how much?". It records what a gate was passed at, not the
approval decision itself, which happens outside the tool.

The tool's job is to take the manual work out of planning cost and capacity,
not to add oversight to it. Three things follow from that, and every other
decision in this document is in service of them:

- **Minimum time in the tool.** Creating an initiative, updating one, and
  getting an overview — of one initiative, one team, or the whole portfolio
  — should each take as little time as the underlying decision actually
  needs. Wherever a number, a date or a default can be derived from data the
  tool already has, it should be, rather than asked of the person using it.
- **Gate progression as a non-event.** The stage-gate process is real
  governance, not decoration, but passing through it should feel like a side
  detail of doing the work, never a task with its own weight. A gate should
  read as "here's what's still open," not a wall reached by surprise — which
  means the tool's job is to keep surfacing what's outstanding continuously,
  as it becomes relevant, rather than only revealing it at the moment
  someone tries to pass.
- **Estimated cost falls out of planning the work, not the other way
  around.** People cost is always derived from who's doing the work, for how
  long, at what percentage. Everything else is planned as a named **cost
  item** (a penetration test, hardware), priced once and placed in time. The
  only typed cost figures are cost items and recorded actuals (§7.3).
  Planning an initiative should feel like deciding what needs to happen and
  who's doing it; the cost is a number that falls out of that, not a
  separate thing to manage.

The process itself — which phases exist, which of them carry cost, what each
gate requires — is **fixed in the brand pack when the tool is built** (§2),
not configured by the person using it. A fixed, opinionated process is what
makes the automation above possible; configurability is a non-goal, not a
future enhancement. A new build can change the process; existing data
carries over as described in §3.

People are allocated to initiatives as a percentage of **full-time**
capacity, and a person may belong to more than one team. People and team
management are explicitly secondary to initiatives — the tool should stay
hands-off here: fast to add someone or adjust a membership, never a place
that asks for more time or attention than the initiatives it exists to
support.

### Experience principles

How the tool should feel to use.

- **Guided, not gatekept.** The tool always shows the next logical action,
  and never stops you from working on something else first (§5.4).
- **At a glance, detail on demand.** Every screen answers its main question
  first; detail opens only when asked (§5.2, §5.4, §5.8).
- **Intuitive, no training needed.** A first-time user can create an
  initiative and pass a gate without a manual; the vocabulary is the
  domain's, and empty states say what to do next (§9.4).
- **One home per fact.** Each thing is edited in exactly one place and only
  viewed elsewhere: allocations on the initiative, rates in Settings, a
  person's details in the side panel (§5.4, §5.6, §5.9).

### Working rules

How the tool behaves. These rules came out of the decisions in this document
and apply wherever the spec is silent.

- **Warn, never block.** Limits warn; only rules that would otherwise
  corrupt data refuse (§7.2).
- **No silent data loss.** Conflicts, damaged data and failed writes are
  always shown to the user, never resolved by discarding something (§3).
- **Quiet by default.** The tool surfaces something only when it becomes
  relevant; the ordinary state of the work stays calm (§8.1, §8.5).
- **Derive, don't ask.** Defaults come from data the tool already has (§5.5,
  §5.6, §7.2).
- **Simple over configurable.** The process and the vocabulary are fixed;
  configuration happens only through the brand pack (§2).
- **The repository is the source of truth.** The browser holds a cache, and
  nothing is queued offline (§3).
- **The tool records outcomes; decisions happen outside it.** Approvals,
  sign-off and finance actuals are made elsewhere (§1, Target users).
- **Suggest, don't change.** The suggestions in §5.11 are one-click and
  computed from data the tool already has; taking one is a normal edit.
  The system writes in §3 (baseline creation, the yearly rate copy,
  migration) are the one exception: the tool makes those automatically,
  because without them the tool couldn't function.
- **Explainable numbers.** Every figure and warning can be traced to its
  cause: the grand estimate to its phases and allocations, a defaulted
  actual to its "using the estimate" marker, a capacity warning to its
  months (§4, §5.4, §5.8, §7.3).
- **Forgiving.** Actions are reversible or protected: a gate can be reopened
  (§8.3), and destructive actions sit behind the lock (§2, §5.9). That is
  why passing a gate needs no confirmation (§5.4).

### Target users

Users all have the same permissions — there is no role-based access control,
and the tool has no user accounts of its own: a user is anyone with write
access to the repository (§3). People (§4) are planning entities, not
accounts. Three kinds of people matter, distinguished by what they do, not
by what they may do:

- **Initiative owner** — a product or delivery manager who plans cost and
  people for their initiatives, records actuals and takes them through the
  gates.
- **Team lead** — a delivery manager who looks after a team's members and
  its capacity across the team's initiatives.
- **Administrator** — the person who sets up the repository, maintains the
  build and the brand pack, grants access and reviews the rates. They use
  the tool rarely.

Two groups stay **outside the tool**: **approvers** (steering committee,
management), who decide at the gates and consume the figures, and
**finance**, who supply actuals. Neither needs access; the tool records the
outcomes and figures for them (§1).

Expected scale within a single deployment is up to 25 users (up to 5 writing
concurrently), 200 initiatives, 200 people and 25 teams. This is the design
and test ceiling, and it counts every record regardless of status.
Performance targets are measured at this ceiling (§9.6).

### Jobs to be done

Each job names who has it and which sections serve it. A job that no section
serves, or a section that serves no job, is a gap.

| # | Who | Job (when … I want … so that …) | Served by |
|---|---|---|---|
| 1 | Initiative owner | When a new initiative starts, I want to create it with a name and a team, so that I can plan it on one page without setup work. | §5.1, §5.4 |
| 2 | Initiative owner | When I plan an initiative, I want to say who does what, for how long and at what percentage, so that cost follows without typing figures, apart from named cost items. | §5.4, §7.1 |
| 3 | Initiative owner | When a gate approaches, I want to see what is still open, so that passing it is never a surprise. | §5.4, §8.5 |
| 4 | Initiative owner | When a gate is passed, I want the figure and approval track recorded, so that I can later say what it was passed at. | §8.1, §5.4 |
| 5 | Initiative owner | When a month closes, I want to compare actuals with the plan with minimal effort, so that deviations are visible. | §7.3, §5.2 |
| 6 | Initiative owner | When I prepare a steering review, I want the portfolio by phase with cost and deviation, so that I do not rebuild numbers. | §5.2, §9.2 |
| 7 | Team lead | When I staff initiatives, I want to see over-commitments by month, so that I can fix them early. | §5.8, §5.4 |
| 8 | Team lead | When people join, leave or change teams, I want to update them quickly, so that allocations and warnings stay right. | §5.5–§5.8 |
| 9 | Administrator | When rolling out, I want to set up the repository, rates and first teams quickly, so that people can plan from day one. | §2, §3, §5.2 |
| 10 | Administrator | When rates change, I want to update them once, so that open plans follow and recorded figures stay frozen. | §5.9, §7.2, §8.1 |
| 11 | Everyone | When something goes wrong, I want clear messages and safe recovery, so that no data is lost. | §3 |

### Non-goals (explicitly out of scope)

- Editing the process at runtime. Phases, gates, checklist definitions and
  approval tracks are compiled in (§2). Changing them means a new build.
- Variable monthly allocations (an allocation is one percentage for the
  whole phase, not a per-month schedule). This applies equally to how a
  person's capacity is split across teams (§4): one static Team FTE % per
  membership, never a schedule.
- Cost or capacity on non-costed phases. A phase either carries the full
  cost model or nothing at all — never something in between.
- Multi-team initiatives (one initiative belongs to exactly one team).
- Scenario comparison / what-if modelling.
- Bulk actual-cost entry (actuals are entered one month at a time).
- Audit identity in the app (the tool does not show *who* made a change).
  The repository's commit history records who and when for every change,
  provided each user authenticates as themselves (§3).
- Mobile or tablet layouts. The tool is desktop-first; responsive behaviour
  below desktop widths is not a goal.
- Analytics, telemetry, or usage tracking. Zero telemetry.
- A dedicated capacity overview screen. Capacity information is surfaced in
  the team detail view and on allocation rows (§5.4, §5.8), not as a
  standalone page. Finding available capacity across teams is out of scope.
- Dataset export and import. The repository dataset is the single source of
  truth and its commit history is the backup (§3). Data leaves the tool only
  through table copy (§9.2).
- Print and PDF output. Table copy (§9.2) is the only output route; browser
  print behaviour is not supported.
- Multiple currencies or currency conversion. One currency per deployment
  (§2); country rates are entered in it.
- Offline editing or queued changes. Without sync the tool is read-only
  (§3).
- Notifications by email or chat. Attention is surfaced in the app only
  (§8.5).
- Integrations with other systems (HR, finance, ticketing) and any public
  API.
- Approval workflow. Approvers, sign-off and routing happen outside the
  tool, which records the outcome (§1).
- Localisation. The UI is English only; number and date formats follow the
  browser locale (§9.7).
- Sign-in with GitHub (OAuth). It needs a proxy service, which the
  no-backend rule (§2) excludes; users connect with a token (§3).

---

## 2. What the build fixes, and what the user changes

This is the central distinction in the product, and every other section
depends on it.

### Hosting & technology

The tool is a **statically hosted single-page application** with no custom
backend, hosted on GitHub Pages from the same repository that holds its data
(§3). It works with github.com and with GitHub Enterprise; the API base URL
is a brand-pack setting. The SPA is written in React with TypeScript
(§10.1). Supported browsers are the current major version of Chrome,
Firefox, Safari and Edge.

### Brand pack

Each deployment is built from a **brand-pack folder** in the repository — a
TypeScript configuration file, checked at build time against the core's
types, plus assets that produce a distinct branded build. The brand pack
fixes:

- **The process**: an ordered list of phases, each with a stable id, a
  display label, a description and a flag saying whether it is **costed**; a
  costed phase also has a default duration in months (§5.11), and every
  phase has an icon, chosen by name from the built-in icon set (§9.10). Each
  phase has exactly one **exit gate**, with its own stable id, label and
  description, whether it requires cost estimates, whether it may be
  **skipped**, and its **checklist item** definitions (each with a stable
  id, a name and a description). Data refers to phases, gates and checklist
  items by id only; labels and descriptions are display text.
- **Approval tracks** (budget bands): name, abbreviation, bounds,
  requirement text and severity.
- **The currency symbol.**
- **The GitHub location**: the API base URL (github.com or a GitHub
  Enterprise host), the repository (owner and name) and the name of the data
  branch (§3).
- **A process identity** — an id and a **structure version**, so a dataset
  is never read by a build whose process structure disagrees with it (§3,
  Versioning and migration).
- **Branding**: product name, logo, favicon and page title, the typeface,
  and the **colour roles** below, each defined as OKLCH triplets (§10.1)
  for both the light and the dark theme (§9.1). The UI vocabulary
  (initiative, team, person, gate) is fixed.
  - Surfaces: page, card, and a subtle fill for chips and columns.
  - Text: primary, secondary and muted, and text on accent.
  - Borders: default and strong.
  - Accent: fill, tint and text.
  - Alarm, Warning and Met: each with fill, tint and text (§9.8 says where
    each is used).
  - Focus ring.

  Every text and background pairing of these roles must meet the contrast
  rule in §9.5.
- The **fresh-install baseline**: placeholder roles, countries and rates.
  People, teams and initiatives start empty. It is loaded only when no
  dataset exists anywhere (§3), never in place of a damaged or foreign one.
- An **example dataset** of people, teams and initiatives, which the user
  can load from the Danger zone (§5.9). It is a plain data file that matches
  the build's process identity, and its dates are stored relative to the
  month it is loaded so it never goes stale.

### Editable by the user

Users change two kinds of data:

- **Master data in Settings** (§5.9): roles, countries and rates.
- **Operational data on its own screens**: initiatives, people, teams and
  memberships (§5.3–§5.8).

The two dataset actions, loading example data and resetting, sit in the
Settings Danger zone (§5.9).

A **lock/unlock toggle** on Roles, Countries & rates and the Danger zone
renders each section read-only (for the Danger zone: its actions disabled).
Every section starts locked, and the lock state is local to the browser and
never synced. A section re-locks when its lock icon is clicked again or when
the user leaves Settings entirely; moving between sections within Settings
does not re-lock. This is a deterrent against casual or accidental changes,
not access control.

Everything in this document other than the fixed items above is durable
product behaviour, identical across all brand packs.

---

## 3. Storage & sync

Data is kept in a **GitHub repository**, which is the source of truth, and
cached in **browser storage**, so the tool stays readable when GitHub is
unreachable. Changes are synchronised automatically through shared file(s)
in the repository. This is the mechanism that lets multiple users read and
write the same data without a custom backend.

### Setup

One user forks the core repository (§10.7) and edits only the brand-pack
folder in the fork; core files are never modified there. Pages deploys only
from the **app branch**; the dataset lives on a dedicated **data branch**,
so data changes never trigger a deploy. Other users are granted **write
access** to the fork. Every user with write access is a full
participant. To keep the process fixed (§1), the app branch should be
protected so that only the people who maintain the build can change it.

Deploy the app on **its own origin** — a custom domain, or an account or
organisation that hosts no other Pages sites. Browser storage is scoped to
the origin, not the URL path, so any other site served from the same origin
(for example another repository under the same `github.io` account) could
read a remembered token.

**Authentication.** With no backend, each user connects with a GitHub
personal access token, created in their own GitHub settings and pasted once
into the tool (§5.10). The tool asks for a fine-grained token limited to the
repository (contents read and write); a classic token is accepted but
triggers a warning, because it reaches all of the user's repositories. The
token stays in the browser, is never written to the dataset, and is used
only to talk to GitHub. By default it is kept for the current tab only
(session storage) and is gone when the tab closes; only when the user ticks
"Remember me on this device" on the Connect screen is it also kept in the
browser's IndexedDB until removed. When it expires or is revoked, the tool shows the
access state (Sync failures) and asks for a new one. Commits are made under
the user's own identity, so every change is committed under the name of the
person who made it.

### Sync behaviour

- **Automatic after every change.** When a user modifies data, the tool
  immediately pushes the change to GitHub and keeps the local copy in step.
  A change counts as saved only once the push has succeeded (see Sync
  failures below). There is no manual save or sync action.
- **Pulling others' changes.** The tool pulls the repository dataset on
  load, when the tab regains focus (at most once every 15 seconds), and at
  least every 5 minutes while the tab is visible; a hidden tab does not
  pull. A push is made against the last version the tool holds, and when the
  repository answers that the file has changed, the tool pulls that file and
  merges it (§10.5), so the push never overwrites a newer version. On load
  the cached data shows immediately while the pull runs, and a change made
  before that first pull completes waits for it. Changes arrive without a
  reload, and a field being edited is never overwritten under the user:
  while a field holds typing that is not yet committed, a pull that arrives
  is held, and once the field is left it merges like any other change (see
  Conflict edge cases). After a failed pull the tool tries again every 30
  seconds and recovers by itself.
- **Field-level merge.** When two users modify different fields on the same
  entity concurrently, both changes are preserved. The sync mechanism merges
  at the field level rather than overwriting entire records, and lists merge
  per item (see Conflict edge cases). The file layout in the repository is
  defined in §10.2.
- **Failure: refuse writes.** If GitHub cannot be reached or accessed, the
  tool enters a **read-only mode** using the last-synced local data. Writes
  are refused until sync is restored. What the UI shows is defined under
  Sync failures below.
- **First-time join.** A new user opens the GitHub Pages URL and, with no
  token stored, sees the Connect screen first (§5.10). On first load with no
  local data, the tool pulls the current dataset from the repository. If no
  dataset exists in the repository either, the first write-capable client
  creates it from the fresh-install baseline (§2).
- **System writes.** Three writes are made by the tool itself rather than by
  a user's edit: creating the baseline dataset, copying rates into a new
  year (§7.2), and migrating the dataset to a new schema or process
  structure (Versioning and migration). Each is idempotent. The first
  write-capable client to need it performs it, and concurrent attempts
  converge on the same result, with no duplicates and no conflicts.

### Sync failures

A persistent **sync indicator** in the top navigation bar (§5.1) shows the
state: synced, syncing, or read-only with the cause. Read-only mode also
shows a banner across the app with **Retry**, and the tool recovers
automatically as soon as sync works again. The message names the cause,
because each needs a different fix:

| Cause | The message says | Recovery |
|---|---|---|
| GitHub unreachable or offline | Cannot reach GitHub; changes are paused | Automatic retry, or Retry |
| Access denied | The token is missing, expired, revoked or lacks write permission | Paste a new token on the Connect screen (§5.10), then Retry |
| Rate limited by GitHub | GitHub is limiting requests; try again shortly | Automatic once the limit resets, or Retry |
| Process mismatch, or dataset newer than this build | Which of the two failed (see Data integrity) | Matching build or dataset; reload to update |

**A failed edit.** If a push fails, including when the connection drops
mid-edit, the write is rejected and the dataset stays unchanged. The field
remains in edit mode with the typed value, the error and **Retry**, and the
tool switches to read-only mode with the cause. No change is ever queued for
later.

### Conflict edge cases

When two users modify the **same field** on the same entity simultaneously
(a true conflict), the tool never overwrites silently. The second writer's
edit is rejected: the field shows both values, the saved one and the typed
one, and offers **Keep theirs** or **Use mine**. Choosing **Use mine** is a
new edit like any other and is pushed again.

List items (allocations, memberships, checklist items) merge per item by
stable id, so two users adding different items at the same time keep both.

References never dangle: people, teams, roles and countries are never
deleted, only deactivated (§9.3), so an allocation, membership or owner
always points at an entity that still exists. An allocation whose
membership was removed at the same moment stays and shows the warning of
§7.2.

### Data integrity

The dataset in the repository carries a **schema version** and the **process
identity** (§2). On sync, these are validated against the running build. A
different process id, or a dataset **newer** than the build (schema or
process structure version), refuses the sync and shows the user which of the
two failed, because "wrong process" and "dataset too new" need different
fixes. A dataset with an **older** schema or process structure version is
migrated (see Versioning and migration below).

### Versioning and migration

A build ships with **migration steps** from every earlier schema version and
process structure version to its own, fixed at build time. The migration is
applied to the dataset stored in the repository, not only to local copies,
and is written as a single commit, so nothing is ever half-migrated and the
commit history is the rollback. Migration is forward-only; there is no
downgrade.

**Process compatibility.** Records refer to phases, gates and checklist
items by stable id (§2). Cosmetic changes — labels, descriptions, checklist
wording, approval-track bounds and requirement text, colours — do not change
the process identity. Structural changes — phases, gates, checklist items,
costed and skippable flags — bump the structure version and ship with a
migration step. If no sensible mapping exists, the build gets a new process
id, which means a new deployment with a new dataset.

- **Dataset older than the build.** It is migrated before use. If the
  migration fails, the tool stays in read-only mode with a message and
  nothing is written.
- **Dataset newer than the build.** It is refused with "Dataset is newer
  than this version — reload to update".
- **Trigger.** The first write-capable client to open the new build performs
  the migration as a system write (Sync behaviour).

### Damaged data

A dataset is **damaged** when it cannot be parsed or fails validation
against the schema, including references to people, teams or other entities
that do not exist. A dataset from another process or schema version is not
damaged but foreign, and is handled under Data integrity above.

- **Local copy damaged or foreign.** The tool discards it and pulls the
  dataset from the repository again. Because edits are never queued (Sync
  failures above), the local copy never holds anything the repository lacks,
  so discarding it loses nothing.
- **Repository dataset damaged.** The tool enters read-only mode with a
  "Dataset damaged" message that names what failed and tells the repo owner
  to restore an earlier version from the repository's commit history, since
  every sync is a commit. There is no in-app repair.
- **No fallback over existing data.** The fresh-install baseline (§2) is
  loaded only when no dataset exists anywhere. It is never loaded in place
  of a damaged or foreign dataset, so an automatic push can never overwrite
  one.

### Storage limits

At the volume ceiling (§1) the dataset must use no more than half of the
smallest supported browser's storage quota, verified by an automated size
test. The sync file(s) must also stay within the limits of the GitHub API.
If a local write fails because storage is full, it is handled like a failed
push: the edit is rejected, the input is kept, and the message says that
storage is full (Sync failures above). The storage mechanism and the
repository file layout are defined in §10.

---

## 4. Core definitions

Each entry below is a definition only. Behavioural rules governing these
concepts live in §7 (calculation rules) and §8 (lifecycle contract);
cross-references point there.

- **Initiative:** a piece of planned work (a project) that belongs to one
  team, has an owner, and moves through the process's phases. It is the
  tool's central entity; its fields are in §6.
- **Phase:** a step of the process. The process defines an ordered list of
  phases shared by every initiative, and an initiative's **current phase**
  is the one it is in. A phase is **costed** or not; only a costed phase
  carries a period, allocations, cost items and actuals. A non-costed phase
  records only that the initiative reached it.
- **Cost item:** a named, priced cost that is not people time (a penetration
  test, hardware) in a costed phase. It has a label, an amount and a timing:
  one month within the phase, or spread evenly over the phase (§6, §7.1).
- **Provisional / Confirmed:** a costed phase's *confidence*, not its
  progress. A phase is **Confirmed** when it is the initiative's current
  phase or its start date falls in the current or the next calendar month;
  otherwise it is **Provisional**. It is derived purely from today's date
  against the phase's own start date, never stored, never a toggle. See
  §7.2 for how this affects capacity accounting.
- **Gate:** the transition out of one phase. Every phase has exactly one,
  including the last, whose gate is what **closes** the initiative. A gate
  defines what an initiative must satisfy to move on: cost figures,
  checklist items, or both. See §8.1 for passing rules.
- **Status:** `Active`, `On Hold`, `Cancelled` or `Closed` — independent of
  phase, except that Closed is reached only through the final gate (§8.4).
  See §8.4 for freeze rules and §7.2 for capacity exclusion.
- **Checklist item:** a named condition on a gate, defined by the build with
  a name and a description. Against each initiative it carries a **status**
  — **Incomplete**, **Tentative** or **Complete**, starting Incomplete — and
  a **note**, required when Tentative and optional otherwise. See §8.1 for
  blocking/carry-forward rules.
- **Grand estimate:** an initiative's total cost across all its costed
  phases: recorded actuals where they exist, estimates everywhere else
  (§7.3).
- **Deviation:** recorded actuals minus their estimates, over the months
  that have a recorded actual. Positive means the actuals ran over the
  estimate (overspend); negative means under (§7.3, §9.8).
- **Approval track:** the budget band resolved from an initiative's grand
  estimate. See §7.4.
- **Estimate:** a costed phase's cost while no month of its period has a
  recorded actual.
- **Forecast:** a costed phase's cost while some months have a recorded
  actual and the rest use estimates.
- **Actual:** a costed phase's cost once every month of its period has a
  recorded actual. A closed month that merely defaults to its estimate
  (§7.3) does not count as recorded.
- **Skipped gate:** a gate passed over rather than satisfied, with a
  **reason** the user must supply. It records that it was skipped and why,
  records no figure, and freezes nothing. See §8.2.
- **Person:** someone who can be allocated to initiatives. A person has a
  country, a **capacity %** ceiling, and either a standard role or a custom
  role (§7.2). People exist independently of teams.
- **Membership:** a person's association with one team, carrying a **Team
  FTE %**. A person may hold several memberships. Membership governs
  allocation: only a team's members may be allocated to that team's
  initiatives.
- **Active member:** an active membership held by an active person. A
  deactivated person is an active member of no team, whatever their
  membership records say; the records are kept, so reactivating the person
  restores them (§5.6). Team size (§5.7) and who can be allocated (§7.2)
  both count active members.
- **Custom role:** a free-text role label with its own day rate per year and
  its own cost factor, configured on one person rather than in shared master
  data. Used for contractors and anyone whose rate is individually
  negotiated.
- **Capacity %:** a person's ceiling on total concurrent commitment across
  all teams.
- **Team FTE %:** how much of a person's full-time capacity one team holds,
  before any of it is committed to specific work. It is a percentage of
  full-time capacity, on the same scale as Allocation %. A person's Team FTE
  %s should not add up to more than their Capacity %; if they do, the tool
  warns (§7.2).
- **Allocation %:** the percentage of full-time capacity a person is
  committed at on one phase — always expressed as a percentage of full-time
  capacity, never of the Team FTE %.

---

## 5. Screens & flows

### 5.1 Navigation

A **top navigation bar** shows the brand logo and product name and the
following items; at its right sit the **New initiative** button, the search
icon, the sync indicator (§3) and the theme control (§9.1):

- **Portfolio** (landing page)
- **Initiatives**, with the Needs attention count (§8.5)
- **People**
- **Teams**
- **Settings**

The **New initiative** button names the missing prerequisite while there is
no active team, so it is never a dead end: it reads **Create a team** while no
team exists and **Reactivate a team** while teams exist but none is active,
and either opens the Teams overview. With an active team it reads **New
initiative** and opens a **draft page**, laid out like the
initiative's header (§5.4): the name field is the title and is focused, with
the team selector beside it, a "Draft" chip and the **Create initiative**
button. The team selector always starts on "Select team", even when only
one team exists; the tool never chooses a team for the user. The next thing
to fill in is highlighted: the name, then the team, then, once both are
filled, the Create initiative button, which is disabled until then. A line
under the header names the next step in text, so the highlight never
carries it by colour alone. No phases appear on the draft. Nothing is
saved until Create initiative is chosen (Enter in the name field does the
same once a team is selected); leaving a field saves nothing. Creating the
initiative saves it and its detail page replaces the draft, so Back skips the
draft. Esc discards the draft, without asking, and returns to the Portfolio.
The Portfolio's empty state (§9.4) opens the same draft page. The **sync indicator** is a small check icon while everything is
synced; its label appears while syncing and stays visible in read-only mode
with the cause (§3).

**Search.** The search icon opens a search overlay. Typing shows matches
from the cached data, grouped as Initiatives (by name and description),
People (by name) and Teams (by name). Enter or a click on a result opens it:
an initiative's page, a person's side panel on the People page, or a team's
page. Esc closes the overlay. This is the one way to find something by
name; the Initiatives and People tables are not separately searchable,
since the specific-initiatives filter (§9.11) already narrows the board by
name where that's the more natural place to do it.

Filtering is provided within each list view. Every initiative has a stable
link that opens it directly, so it can be shared; browser back and forward
work. Teams and people are reached through their overview pages and have no
direct links.

### 5.2 Portfolio overview (landing page)

A **board** giving an at-a-glance view of the whole portfolio and guiding
the user to what needs their attention. It is a read-only summary with calls
to action: clicking a card opens the initiative's detail view (§5.4).

Contents, top to bottom:

- **Getting started strip** — a short first-use path of four self-clearing
  items: **Review rates** (links to Countries & rates in Settings and clears
  once any rate is edited or **Rates are correct** is confirmed, §5.9),
  **Create a team**, **Add people to the team**, and **Create your first
  initiative**. Each item links to where it is done and clears when the data
  shows it is done; the strip disappears when none remain. A **Dismiss for
  now** on the strip hides it for the browser session; it reappears on the
  next visit if items are still outstanding. It never blocks anything. The
  state is derived from the dataset, so every user sees the same strip, and
  clearing an item syncs (§3), while dismissal is local to the browser and
  not synced.
- **Needs attention strip** (§8.5) — the ranked list of current-gate states
  worth a look, prioritized by severity. It shows the top three items;
  **Show n more** expands the rest in place. Each item shows the
  initiative's name, the kind of item and a short reason. The name is a
  link: it opens the initiative page at the place where the action is taken,
  scrolled and focused there (§5.4). That place is the cost summary for
  Escalated, the current phase for Overrun, the phase and month with the
  missing actual for Overdue, the gate panel for Due, and the magic bar for
  Ready.
- **Filters** (§9.11) — one row of dropdown chips: team, phase, year,
  specific initiatives, approval track and status. Active filters are
  highlighted. Status defaults to Active and is shown as a chip, so On Hold,
  Closed and Cancelled initiatives appear only when the filter is widened.
- **Key metrics** for the initiatives shown:
  - **Total cost** — the grand estimate (§4) summed over the initiatives
    shown.
  - **Deviation** — recorded actuals minus their estimates, over the months
    that have a recorded actual.
- **The board** — one column per phase, in process order, holding the
  initiatives currently in that phase; columns without initiatives stay
  visible, so the process is always shown in full. Each column header shows
  the number of initiatives and the sum of their grand estimates. Each
  initiative is a compact **card**: its name, team and owner, its grand
  estimate, the approval track badge (including "No approval track", §7.4) and
  an attention marker in the item's own state colour (§8.5). Status shows
  only when it is not Active. The whole card opens the initiative page.
  Cards are not draggable: an initiative moves between phases only by
  passing a gate (§8).
- **Copy** — the initiatives shown and the key metrics can be copied as a
  table (§9.2).

**Year filter.** With no year selected, cards, column headers and metrics
show the lifetime grand estimate. With a year selected, they show only the
cost falling in that year, deviation counts only months of that year, and
initiatives with no cost in that year are hidden. The approval track badge
is always based on the lifetime grand estimate.

### 5.3 Initiatives overview

A **table** of all initiatives with clickable rows. Clicking a row opens the
initiative detail view.

Key columns: **Name**, **Team**, **Owner**, **Phase**, **Grand estimate**,
**Approval Track**, **Status** and a **Needs attention** marker (§8.5).

Filters across all key dimensions (team, owner, phase, approval track,
status; §9.11). All statuses are shown by default. Sortable columns, with
the default sort in §9.11. Copy support: the rows and columns currently
shown, as plain text and rich HTML.

New initiatives are created with the New initiative button in the top bar
(§5.1), or from the team detail with the team preset (§5.8).

### 5.4 Initiative detail view

This is the **core page** of the entire application. It is where the user
sees an initiative's full information at a glance, modifies it, and
progresses it through the process. The creation flow and the editing flow
converge here: after typing a name to create an initiative, the user lands
on this page and fills in everything else.

#### Design principles

- **One page, no sub-pages.** Everything about an initiative is visible and
  editable (where permitted) on a single scrollable page. No modals for core
  data entry, and no tabbed sub-navigation. Inputs that accompany an action,
  such as a skip reason or a delete confirmation, appear inline.
- **Inline editing.** Fields are edited in place. Past phases that have been
  frozen by a passed gate display the **frozen snapshot** and are visually
  locked.
- **Guided, not gatekept.** The page continuously surfaces what's
  outstanding and what the next logical action is, without preventing the
  user from working on something else first.

Initiative-level actions live in an **Actions menu** in the header, which is
available in every status: Put on hold / Resume, Cancel, Duplicate (§5.11),
Reopen (§8.3) and Delete (only if no gate was passed, §9.3). Skipping a gate
is a secondary action next to Pass gate in the magic bar.

#### The magic bar (sticky bottom bar)

A persistent, **sticky bar at the bottom** of the initiative detail view.
Always visible while the initiative is open, serving three purposes:

1. **Phase overview** — a compact visual summary of all phases, showing
   which are complete, which is current, and which are ahead. Functions as a
   progress indicator / stepper.
2. **Guidance** — contextual calls to action based on the current state. For
   example: "Allocate capacities for Development" (scrolls/focuses the
   relevant section on the page), "2 checklist items incomplete," or "All
   requirements met — pass gate."
3. **Gate action** — Pass gate is always visible. While a requirement blocks
   the gate it is muted, and selecting it (or the count of open items) jumps
   to the first open requirement and names it. When nothing blocks, it
   becomes the prominent action, the natural payoff of completing the work
   above, not a separate bureaucratic step. One click passes the gate, with
   no confirmation step, because the last gate can always be reopened
   (§8.3). The bar then shows "Passed <gate> — Reopen" for a few seconds.
   Skipping a gate, where the build allows it (§8.2), is a text action
   beside Pass gate; its reason is entered inline in the bar.

The bar's states are: requirements open, ready, skipping, overrun (in the
Alarm colour, naming the phase and how late the gate is), passed, on hold
(§8.4) and, for an untouched initiative, a choice of starting phase (§8.2).
Its layout follows the design rules in §9.8.

**Behaviour:**

- Appears **only** on the initiative detail view.
- **Hidden** for Closed and Cancelled initiatives (nothing is actionable).
  For an On Hold initiative the bar shows "On hold — Resume", and Pass gate
  is muted; selecting it says the initiative is on hold (§8.4).
- For initiatives in the **first phase**, the bar shows the phase overview
  and the current gate's state; there is no prior gate to reference. For an
  untouched initiative, the phase overview also lets the user choose a
  starting phase, asking for one reason (§8.2).

#### Page sections (top to bottom)

- **Header**: initiative name (editable), description (editable, plain text,
  1–2 lines), owner (selected from People list), team, status badge,
  approval track badge, and the Actions menu. Changing the team while
  allocations exist asks for an inline confirmation first, naming the people
  who are not on the new team and will be removed from the phases that are
  still open (§7.2); it is not possible on a Closed or Cancelled initiative.
- **Cost summary**: the grand estimate (§4), what the initiative was last
  approved at (the figure of the last passed gate that carried cost, with
  the gate's name), the difference between the two, and the deviation (§4)
  of recorded actuals from their estimates. Until a gate that carries cost
  has passed, this figure shows the grand estimate itself, with no
  "approved at" label — the difference then reads as zero. A **Copy**
  button copies the cost summary and the phase costs (§9.2).
- **Phases**: the process's phases in order, as a vertical sequence. The
  current phase is expanded with full editing controls (allocations, period,
  actuals), and the **Gate / Checklist panel** for the gate leaving it sits
  directly beneath it. Every other phase is collapsed to one line showing
  its period, cost and state (frozen, or estimate); a click expands it in
  place, and a future phase shows editable estimates. A phase whose gate was
  passed shows its frozen snapshot, visually distinct and locked (period and
  allocations; actuals stay recordable, also after the initiative is Closed
  or Cancelled); a phase behind a skipped gate stays editable (§8.2). Each
  allocation row shows a warning when the person is over their Capacity % or
  their team's Team FTE % in any month of the phase, or is no longer a
  member of the team (§7.2). A phase that starts on or before the previous
costed phase's end date shows a warning saying so; no phase moves on its own.
The current phase shows its **period** as two
  date fields (§9.11), an **allocation table** (person, Allocation %, and
  the person's cost for the phase), a **cost items table** (label, amount,
  and when: one month, or spread over the phase) beneath it, with the phase
  total in the phase header covering both, and an **actuals table** with a
  row per month: the estimate, and the actual. A closed month with no
  recorded actual reads "using the estimate"; its check icon records the
  estimate as the actual in one act, and typing another amount records that
  instead (§7.3). A month not yet closed shows "not closed yet".
- **Gate / Checklist panel** (beneath the current phase): the current gate's
  requirements, read as "X of Y complete" (§8.1), and its checklist items.
  Each item has a name, a description that opens on demand, and a status set
  with three icon toggles — Incomplete, Tentative, Complete — each with a
  tooltip; the current status is also named in text beside them (§9.5).
  Selecting Tentative opens a note field; the status is saved together with
  the note, and Esc cancels. Items carried forward from earlier gates sit
  under their own subheading with their notes visible.
- **The magic bar** (sticky at bottom, always visible while the initiative
  is open).

### 5.5 People overview

A **table** of all people. Clickable rows open the person detail view in a
**side panel** on the right of the table; the table stays visible and the
selected row is highlighted.

Key columns: name, role, country, team(s), capacity %, active/inactive.

Filters, sort (§9.11) and copy support (§9.2). Active people are shown by
default.

A **quick-add row** above the table creates a person from a name, country
and role. Capacity % defaults to 100%, and country and role default to the
last values used. Team memberships are added afterwards, in the panel or on
the team detail (§5.8).

### 5.6 Person detail view

Opened as a **side panel** from the People overview. Edits happen in place,
with no save button, and Esc or the close icon closes the panel and returns
focus to the row (§9.5). It shows and allows editing of all person details:

- Name, country, role (standard or custom), capacity %. A custom role shows
  a label, a cost factor and a day rate for each year of the tracked window
  (§7.2), saying which years take another year's rate; earlier years are
  shown read-only.
- Team memberships with Team FTE %s, capped at the person's unclaimed
  capacity (Capacity % minus the Team FTE %s already held) and defaulting
  to it, so a membership can never be created or edited here into an
  over-Capacity % state (§7.2). A value above the cap is set to the cap and
  the field says so beside it ("Set to 40%, the most left. Other teams hold
  the rest.") until it is edited again. Raising it further is done from the
  team detail (§5.8), where the warning is visible.
- Actions: Deactivate / Reactivate (§9.3).

The panel carries no warnings and no allocation list. Who is committed to
what is seen on the team detail (§5.8) and on the initiatives (§5.4).

### 5.7 Teams overview

A **card layout**, one card per team, each showing a high-level summary:
team name, team size (the number of active members), the team's Active
initiatives as one count chip per phase, and a **warning** marker when any
member has a capacity warning (§7.2). Cards show no capacity figures; the
detail is on the team detail view. Clicking a card opens the team detail
view.

A **New team** button creates a team from a name. Inactive teams are shown
greyed out.

### 5.8 Team detail view

A full page showing all detail information for a team:

- Team name (editable).
- **Members list**: add a member by picking an existing person or creating
  one inline (name, country and role, with the defaults of §5.5); deactivate
  or remove members (§9.3). Each member shows the Team FTE %, which defaults
  to the person's unclaimed capacity (§5.6).
- **Initiatives list**: all initiatives belonging to the team, with phase
  and status. Allows starting the creation of a new initiative for this
  team.
- **Capacity view**: a month-by-month grid from the current month through
  the last month with an allocation. Rows are the team's members, with their
  Team FTE % under the name; each cell shows the member's Allocation % on
  this team's Active initiatives. A cell is tinted with the Warning colour
  and carries an icon when it exceeds the Team FTE % or when the member's
  total across all teams exceeds their Capacity % (§7.2); the two cases have
  different icons, and the row detail names which one applies. Allocations
  on Provisional phases appear as a lighter figure beside the number and are
  not counted toward the flags. Selecting a cell or a row shows the
  contributing initiatives, including those of other teams, and any other
  §7.2 warning for that member: Team FTE %s that add up to more than
  Capacity %, and allocations that outlived the membership.
  On a deactivated team the capacity view is replaced by a note that its
  initiatives are not counted (§7.2).
- **Actions**: Deactivate team / Reactivate team (§9.3), one click with no
  confirmation, at the top right of the header. An inactive team shows an
  **Inactive** chip beside its name.

The capacity grid has a **Copy** button (§9.2).

### 5.9 Settings

Contains the following sections:

- **Roles** (lockable): name, abbreviation, cost factor, active toggle. A
  role can be added and deactivated (§9.3).
- **Countries & rates** (lockable): a list of countries. Opening a country
  shows one table with a row per tracked year: the day rate and the working
  days for each of the 12 months. Working days are prefilled with the
  weekdays of each month; a cell that differs from the weekday count is
  tinted, and each row has **Reset to weekdays**. Years that have left the
  tracked window sit in a collapsed, read-only row (§7.2). A country can be
  added and deactivated (§9.3); a new country's day rate is entered once
  and copied to all years of the tracked window. A locked section shows its
  values read-only with a hint on how to unlock. A **Rates are correct**
  confirmation clears the Getting started item (§5.2).
- **Process** (read-only): a vertical timeline of the phases in order, each
  with its label, description and, for costed phases, its default duration.
  The phase's exit gate sits beneath it, with its label, whether it requires
  estimates, whether it can be skipped and how many checklist items it has;
  selecting a gate opens its checklist definitions with their descriptions.
  Below the timeline, the approval tracks are listed with their bounds,
  requirement text and severity.
- **Connection**: the connected GitHub user and the repository, the
  remaining GitHub API requests for the current hour (from the rate-limit
  headers GitHub returns on every response, so this costs no extra
  request), and **Disconnect**, which removes the token from the browser
  and opens the Connect screen (§3, §5.10).
- **About** (read-only): product name, build version, schema version and
  process identity (§2, §3).
- **Danger zone** (lockable): two actions.
  - **Load example data**: loads the example dataset (§2). Enabled only
    while the dataset has no people, teams or initiatives; otherwise it is
    greyed out with the hint "Reset first". It never overwrites anything.
  - **Reset**: returns the dataset to the fresh-install baseline (§2), which
    also removes any loaded example data.

Lock/unlock behaviour is defined in §2.

### 5.10 Connect screen

Shown on first load and whenever no working token is stored (§3,
Authentication); in read-only mode with the cause "Access denied", the
banner's action opens it. It is one screen: a **token field** at the top
with a Connect button and a **Remember me on this device** checkbox (off by
default), because pasting is the fastest path. It is three stacked cards, so
the one required action stands apart from the help: the **input card**
(headed "Connect to <product>", with the line "Paste your GitHub token to
continue.", and an accent border), the **guide card**, and the **protection
card**. Every link uses the GitHub host, owner and repository of the brand
pack (§2).

The guide is headed **No token yet? Create one in 4 steps**:

1. **Open GitHub token settings.** A button opens GitHub's token page in a
   new tab, with the name, description and resource owner prefilled where
   GitHub supports it.
2. **Set the expiry to 1 year.**
3. **Choose the repository.** Under Repository access, choose "Only select
   repositories" and pick the repository, whose name is shown with a copy
   button.
4. **Add the permission.** Under Permissions, add Contents and set it to Read
   and write. Everything else stays at No access.

A closing line says to select Generate token, copy it and paste it above, and a
tip says to save the token in a password manager, because GitHub shows it only
once.

The protection card is collapsed by default: a shield icon and **How we
protect your token** with a chevron, which opens the details on click or
keyboard (a native disclosure, so it works without scripts). Opened, it states
each measure with a bold lead-in, all of which the build actually does: the token stays in
the browser, in this tab only unless Remember me is ticked, with no server in
between; it goes only to the GitHub API host, enforced by the content security
policy, which also blocks inline scripts and `eval`, and the app refuses to
load inside a frame (§10.1); it is never written to the repository, the dataset
or a commit; it is limited to the one repository with Contents access and
expires after a year, with a link to revoke it in GitHub; and, plainly, the
browser keeps it unencrypted, so Remember me is for trusted devices only. The
card's text uses the primary text colour on its tint, not the tint's own text
colour, to keep contrast at AA.

The screen meets §9.5: one `h1`, a heading per card, every control labelled,
results announced (`status` for success, `alert` for errors), new-tab links
announced as such, and the copy button confirming in text.

A pasted token is checked immediately, and the result is specific:

| Situation | Message |
|---|---|
| Works and can write | "Connected as <user>", then the Portfolio opens |
| Classic token that works | Connected, with a warning that a classic token reaches all of the user's repositories, and a link to create a fine-grained one |
| Cannot see the repository | "This token can't see <repository>. Create it with access to that repository." |
| Read-only | "This token can read but not write. Set Contents to Read and write." |
| Waiting for approval | "Your GitHub organisation needs to approve this token first. Ask your GitHub owner." |
| Expired or invalid | "GitHub doesn't accept this token." |

### 5.11 Suggestions and shortcuts

Every suggestion is computed from data the tool already has, is optional and
one click, and never changes user data on its own. A suggestion that is
taken is a normal edit, so it syncs like any other (§3). Wherever a
suggestion re-chains phases from today (the default plan, Duplicate, the
starting-phase mechanism), that date is today's actual date in the user's
local time, determined the same way as Confirmed vs. Provisional in §4.

- **Default plan.** A new initiative gets a period for every costed phase,
  chained from the day it is created, each with the default duration the
  brand pack defines for that phase (§2). A phase starts on the day after
  the previous costed phase ends, and ends on the day before the same day of
  the month, that many months later (a day the later month lacks counts as
  its last day). The initiative page says the dates are
  a suggestion until the user first edits the plan. The user adjusts instead
  of building the schedule. Editing one phase's dates moves no other phase.
- **Copy allocations.** A costed phase with no allocations offers **Copy
  from <previous costed phase>** when that phase has some. It copies each
  active team member with the same Allocation %, and lists anyone skipped
  because they are no longer on the team.
- **Availability in the person picker.** **Add person** lists the team's
  active members with their free capacity for the phase's months, most free
  first. Free capacity is the lower of the person's unused Team FTE % on
  this team and their unused Capacity % across all teams, taken as the
  minimum over the months of the phase; Provisional phases and initiatives
  that do not count (§7.2) are left out. Allocation % is prefilled with the
  free capacity, so the default never causes a warning.
- **Extend on overrun.** When the current phase is past its end date, the
  Overrun state (§5.4, §8.5) offers **Extend <phase> by one month**. It
  moves the phase's end date a month later and keeps its allocations; later
  phases do not move.
- **Fix suggestions.** A capacity warning on an allocation row or in the
  capacity grid's detail (§5.4, §5.8) offers up to two fixes: reduce the
  person's Allocation % to the value that fits for every month of the phase,
  or, for a Team FTE % warning that fits within their Capacity %, raise
  their Team FTE % on the team.
- **Undo.** Removing an allocation, a cost item or a membership shows
  "Removed. Undo" for 10 seconds; Undo restores it as a normal edit.
  Deleting an initiative is not undoable; it is protected by an inline
  confirmation and the rules in §9.3.
- **Cost item suggestions.** Typing a cost item's label suggests earlier
  labels from all initiatives, most frequent first. Choosing one prefills
  its most recent amount and timing, all editable.
- **Duplicate.** **Duplicate** in the Actions menu creates a new initiative
  with the same team, owner and description, and for each costed phase the
  same length, allocations (active team members only) and cost items,
  keeping each one-month item's position within its phase. Phase periods are
  re-chained from today, the same rule the default plan and the
  starting-phase mechanism use (§2). It carries no gate records, checklist
  state or actuals. The new initiative is named "<name> copy" and opens in
  place.

---

## 6. Data model

Every entity and every list item (allocations, memberships, checklist items)
has a **stable, unique id** generated by the client when it is created, so
concurrent creations by different users cannot collide and references and
merges (§3) stay valid. List items (Allocations, Cost items) carry their id
alongside their other fields, as already noted in their table rows below;
top-level entities also list Id as their first field.

**Field encodings.** Id: UUID (RFC 4122), as text. Month: `"YYYY-MM"`. Date:
ISO 8601 `"YYYY-MM-DD"`. Currency and Percentage: a plain number, unrounded;
formatting for display (compact amounts, locale, percent signs) is a
presentation concern (§9.7, §9.11), never part of the stored value.

### Dataset

| Field | Type | Notes |
|---|---|---|
| Schema version | Number | §3, Data integrity |
| Process identity | Id and structure version | §2, §3 |
| Rates reviewed | Boolean | Set when any rate is edited or **Rates are correct** is confirmed (§5.2, §5.9); clears the Getting started item |

### Initiative

| Field | Type | Required | Notes |
|---|---|---|---|
| Id | UUID | Auto | Assigned when the initiative is created (§6) |
| Name | Text | Yes | Required at creation, together with the team |
| Description | Plain text | No | Short, 1–2 lines |
| Owner | Person reference | No | Selected from the People list |
| Team | Team reference | Yes | Exactly one team; required at creation. Only its members can be allocated (§7.2); changing the team removes the allocations of people who are not on the new team from every phase that is not frozen, after a confirmation (§7.2) |
| Status | Enum | Auto | Active, On Hold, Cancelled, Closed. Defaults to Active |
| Current phase | Derived | — | Position in the process |
| Approval track | Derived | — | From the grand estimate (§7.4) |

Creation requires a **name** and a **team**. Everything else is filled in on
the initiative detail view — the creation flow and the editing flow are the
same place.

### Phase data (per costed phase, per initiative)

| Field | Type | Notes |
|---|---|---|
| Start date | Date | First day of the phase |
| End date | Date | Last day of the phase |
| Allocations | List | Each item has an id: person reference + Allocation % |
| Cost items | List | Each item has an id: label, amount (in the deployment's currency) and timing, either one month within the phase or spread evenly over the phase. Items whose month lies outside the phase's period stay and keep counting; the phase shows a warning |
| Actuals | Per month | Recorded cost per month, or absent (§7.3). Actuals outside the phase's period stay and keep counting; the phase shows a warning. Actuals remain recordable after the phase's gate is passed, and even after the initiative is Closed or Cancelled (§8.4) |

Non-costed phases record only that the initiative reached them.

### Checklist state (per initiative, per checklist item)

| Field | Type | Notes |
|---|---|---|
| Status | Enum | Incomplete (initial), Tentative or Complete |
| Note | Text | Required when Tentative, optional otherwise |

Checklist state is worked on before a gate is passed, so it is stored apart
from the gate record. It is kept when a gate is reopened (§8.3), and notes
stay writable on Closed and Cancelled initiatives (§8.4).

### Gate record (per gate, per initiative)

Created when a gate is passed or skipped; cleared when it is reopened
(§8.3).

| Field | Type | Notes |
|---|---|---|
| Outcome | Enum | Passed, Skipped |
| Skip reason | Text | Required when skipped |
| Passed on | Date | Set when the gate is passed; not set for a skipped gate |
| Recorded grand estimate | Currency | Passed gates that carried cost: the grand estimate (§4) at pass time, shown as "approved at" (§5.4) |
| Recorded approval track | Id, name and severity | Passed gates that carried cost: the band resolved at pass time; the baseline for escalation (§7.4) |
| Frozen estimate snapshot | Object | The exited phase's period, allocations, cost items and monthly estimate, with the rates, roles, countries and person data behind them (§8.1) |

### Person

| Field | Type | Required | Notes |
|---|---|---|---|
| Id | UUID | Auto | Assigned when the person is created (§6) |
| Name | Text | Yes | |
| Country | Country reference | Yes | Determines working days and day rate |
| Role | Role reference | Yes | The standard role. Kept while the person has a custom role, so switching back restores it; the custom role, when in use, is costed and shown instead (see below) |
| Capacity % | Percentage | Yes | Ceiling on total concurrent commitment |
| Active | Boolean | Auto | See §9.3 for deactivation rules |

### Custom role (on a Person)

| Field | Type | Notes |
|---|---|---|
| Active | Boolean | Whether the person is costed and shown with the custom role. Switching back to the standard role clears it and keeps the rest, so the custom entries are still there when the custom role is chosen again |
| Label | Text | Free-text role name |
| Cost factor | Number | Multiplied against the day rate, like a standard role's cost factor. Defaults to 1 |
| Day rate | Currency, per year | Replaces the country day rate for the given year; the cost factor still applies. A year with no entry takes the nearest entered year's rate. Same tracked window and yearly copy rule as country rates (§7.2) |

### Team

| Field | Type | Required | Notes |
|---|---|---|---|
| Id | UUID | Auto | Assigned when the team is created (§6) |
| Name | Text | Yes | |
| Active | Boolean | Auto | See §9.3 for deactivation rules |

### Membership (Person × Team)

| Field | Type | Notes |
|---|---|---|
| Person | Person reference | |
| Team | Team reference | |
| Team FTE % | Percentage | The team's claim on this person's full-time capacity |
| Active | Boolean | See §9.3 for deactivation rules |

### Role (master data, editable in Settings)

| Field | Type | Notes |
|---|---|---|
| Id | UUID | Assigned when the role is created (§6) |
| Name | Text | |
| Abbreviation | Text | |
| Cost factor | Number | Multiplied against the country day rate |
| Active | Boolean | Inactive roles are excluded from the role selection for people (§9.3) |

### Country (master data, editable in Settings)

| Field | Type | Notes |
|---|---|---|
| Id | UUID | Assigned when the country is created (§6) |
| Name | Text | |
| Day rate | Currency, per year | Rate for the given year; one entry per year, tracked-window years editable, past years read-only (§7.2) |
| Working days | Days, per month per year | Working days in each month of the year, prefilled with the weekdays (Monday to Friday) of that month. The user edits only the number; no holiday calendar is kept. Same window rules as day rate (§7.2) |
| Active | Boolean | Auto; see §9.3 for deactivation rules |

---

## 7. Calculation rules

The arithmetic itself lives in the engine, where each rule is a named
function with tests. This section states the rules a reader could not infer
from the code.

### 7.1 Time granularity and cost of an allocation

All costs, allocations, and actuals are computed on a **calendar-month**
basis within a **calendar year**. There is no weekly, quarterly, or
fiscal-year mode. Months follow the user's local time; when a month changes
while the tool is open, the states derived from it (Overdue, Confirmed and
Provisional, the current month in the capacity grid) update at the next pull
or when the tab regains focus (§3).

The monthly cost of an allocation is working days × Allocation % × country
day rate × role cost factor. Working days are the country's working days for
that month and year (§6), and the country day rate is the one for that year.
For a person with a custom role, the cost is working days × Allocation % ×
the custom role's day rate for that year × the custom role's cost factor.
The standard role's cost factor and the country day rate do not apply. Amounts
are computed unrounded and rounded only for display. A phase's monthly
estimate adds its cost items: an item timed in one month counts in that
month, and an item spread over the phase counts equally in each month of the
period.

A phase's period is a start date and an end date (§6), not whole months, so
its first and last calendar months are usually partial. A month fully inside
the period counts its country's full working days for that month; the
period's first and last months are **prorated** by the share of that
month's weekdays the period actually covers — that month's working days ×
(weekdays between the period's edge and the month's edge, inclusive ÷ total
weekdays in that month). A phase whose start and end fall in the same month
prorates that one month against its own weekday span.

### 7.2 Capacity, rates, and the three percentages

The three percentages (§4) are never interchangeable.

**Capacity.** Two ceilings are checked for every month, and only **Active**
initiatives of **active teams** count; On Hold, Cancelled and Closed
initiatives, and those of a deactivated team (§9.3), are excluded from
capacity accounting but keep their cost calculations. Deactivating a team
therefore lifts its initiatives' load from every member's Capacity % and from
the grids of the other teams they belong to, and reactivating it puts the load
back. The deactivated team's own capacity view says so instead of showing a
grid (§5.8).

- The **Capacity % ceiling**: a person's total Allocation % across all their
  teams' initiatives may not exceed their Capacity %.
- The **Team FTE % ceiling**: a person's Allocation % on one team's
  initiatives may not exceed that team's Team FTE % for them.

A team's non-initiative work is `max(0, teamFtePct - allocatedPct)` on the
same scale, and because each team subtracts from its own Team FTE %, a
person split across teams is never counted twice.

Both ceilings **warn and never block**. So does every other limit in this
tool; there is no hard constraint anywhere except the ones that would
otherwise corrupt data. Neither ceiling counts a **Provisional** phase's
allocation (§4) — shown instead as its own, separate, non-blocking figure,
since a rough plan for a phase many months out isn't a real commitment yet.

A person whose Team FTE %s add up to more than their Capacity % also gets a
warning, shown on the team detail (§5.8).

Only a team's members may be allocated to that team's initiatives. An
allocation that outlives its membership **stays and keeps costing** and is
surfaced as a warning rather than dropped.

**Changing an initiative's team** is the one act that does remove such
allocations, because the person is not a member of the new team. It removes
the allocations of people who are not active members of the new team from
every phase that is not frozen by a passed gate (§8.1); people who are on
both teams stay. Frozen phases, their snapshots and all recorded actuals are
never touched. The change is confirmed first, in place, with the affected
people named, and is undoable for 10 seconds (§5.11). A Closed or Cancelled
initiative keeps its team.

**Rates and working days.** A **custom role's day rate replaces the country
day rate**, and its own cost factor replaces the standard role's. Working
days still come from the person's country.

Rates and working days are read for **the month's own year**, so a rate rise
next year never moves this year's figures. The **tracked window** is always
the current calendar year and the next two. When a new calendar year enters
the window, the tool creates its entries (a system write, §3): rates and
custom day rates are copied from the preceding year, and working days are
prefilled with the weekdays of each month. Users can then adjust them. Years
that have left the window keep their entries: they stay in use for
calculation and are shown read-only, so a later change never moves past
figures. Only a year beyond the window (it takes the last tracked year's
entries) or before the earliest entry (it takes the earliest entry, e.g.
work that predates the tool) clamps to the nearest available year, using the
same calendar month for working days, rather than falling back to zero.

### 7.3 Actuals default to the estimate once a month closes

A costed phase's actual for a month is one cost figure for the phase and
month, not one per person or cost item. It is either recorded or it isn't. A
month is **closed** once it has ended; from then on an unrecorded actual is
shown and computed **as if it were the estimate** — marked as using the
estimate rather than left blank — until someone records an actual. It counts
as overdue for Needs attention (§8.5) only once a further calendar month has
passed. Recording an actual — whether it matches the estimate or overrides
it — is a single act; there is no separate confirmation step.

### 7.4 Approval tracks

The **grand estimate** (§4) is compared with the approval tracks. Bounds are
lower-inclusive and upper-exclusive. A total that no band covers — a gap
between two, or below the lowest — resolves to **No approval track**, and is
never rounded to the nearest band. "No approval track" is a statement about band
configuration, never about how complete an estimate is. A brand pack whose
bands overlap does not build.

**Escalation** compares severity alone: the live approval track against the
recorded approval track of the last passed gate that carried cost (§6, Gate
record), so it survives the bands changing in a later build. Only a
**passed** gate sets that baseline; a skipped gate records nothing. With no
baseline yet, or when no band covers the live total, there is no
escalation.

---

## 8. Lifecycle contract

An initiative moves through the phases in order. Each phase is left by its
gate, and the last phase's gate is what closes the initiative.

### 8.1 Passing a gate

A gate requiring estimates needs the phase behind it and **every costed
phase still ahead** to be estimated: passing a gate records the whole
initiative's budget (the grand estimate, §4) as the figure it was passed at,
which is why the requirement looks forward as well as back. A costed phase
counts as estimated once it has a period and at least one allocation or cost
item; this is the same for Provisional and Confirmed phases (§4), which
differ only in capacity accounting (§7.2). Phases before the current one are
not checked: they were estimated when their own gate was passed, or were
skipped (§8.2).

A checklist item that is **Incomplete blocks**; **Tentative** passes with a
warning and **carries forward**: an item still Tentative when its gate
passes reappears on the *next* gate's own checklist, tagged with which gate
it came from, until someone marks it Complete. It is never a blocker at a
later gate — only Incomplete ever blocks. Items start Incomplete, so a gate
with a checklist is blocked until someone has looked at each one. On the
final gate there is no next gate, so a Tentative item stays Tentative on the
closed initiative.

Missing actuals never block — they only warn, since a closed month defaults
to its estimate (§7.3).

Unmet requirements are the ordinary state of a gate for most of its phase's
life, not an alarm — the current gate reads calmly as "X of Y complete"
everywhere it appears, with real alarm colour reserved for the one thing
that is genuinely late: the phase behind it running past the date it was
itself estimated to end on.

Passing **freezes** the exited phase's estimate, allocations and cost
items, along with the role, country and person data behind them, so later
master-data changes can never move a recorded figure. Every gate records one gate record, whether or not it
required cost.

### 8.2 Skipping a gate

A gate the build marks skippable can be passed over instead, and **skipping
requires a reason**. A skip bypasses both checks (the estimate check and the
checklist check), **records no figure** and **freezes nothing** — so the
phase it exits stays editable — and never becomes the baseline for an
escalation comparison.

Entering work that predates the tool uses a separate mechanism: while an
initiative is untouched (no data entered by a user and no gate record; the
default plan, §5.11, does not count), the user can choose a later **starting
phase** and types one reason. That reason is recorded on every gate behind
it, each as skipped, regardless of the skippable flags. The default periods
are then chained again so that the starting phase begins today. Until the initiative is touched, the starting phase can be changed
again; afterwards only Reopen (§8.3) moves it back.

### 8.3 Reopening

Reopening reverses exactly one transition — always the most recent, never an
earlier one still buried under it. It clears that gate's record and discards
the frozen estimate, and **never touches recorded actuals**. Checklist
statuses and notes are **kept**: what someone assessed is a record, not a
side effect of the gate. The previous passed gate becomes the baseline for
escalation again (§7.4), and passing the gate again creates a new gate
record with new figures.

### 8.4 Closing and cancelling

**Closed** is reached only by passing or skipping the final gate — finishing
is a governed act, never a bare status change. **Cancelled** is for work
abandoned before the process finishes, and is a plain status change. **On
Hold** pauses an initiative: it stays fully editable, but its gates cannot
be passed until it is resumed.

Closed and Cancelled freeze the whole initiative: phases, allocations,
cost items and every field on it. The exceptions are checklist-item **notes** and recorded
**actuals**, which stay writable, because recording why something ended, and
the actuals that arrive after it, is exactly what a finished initiative
still needs to accept. **Reopen** unlocks everything: for a Closed
initiative it reverses the final gate (§8.3), and for a Cancelled one it
returns the status to Active.

### 8.5 Needs attention

The Portfolio's "Needs attention" strip, and the matching count on the
Initiatives nav item (the number of initiatives with at least one item),
surface the current-gate state of **Active** initiatives continuously. On
Hold, Closed and Cancelled initiatives never appear.

Five kinds of thing can appear, in priority order — consequential first, an
opportunity last:

1. **Escalated** — the live total now needs a stricter approval track than
   the one recorded at the last passed gate (§7.4).
2. **Overrun** — the current phase is past its end date and its gate has
   not been passed. This is the one alarm state (§8.1).
3. **Overdue** — a **closed** month with no actual recorded against it, once
   a further calendar month has passed since it ended (§7.3). A month that
   has not yet ended is not overdue.
4. **Due** — the current phase's end date has been reached and the gate
   still has open requirements: a costed phase without an estimate (§8.1),
   or a checklist item that is Incomplete or still Tentative (including one
   carried forward from an earlier gate).
5. **Ready** — nothing is left blocking the current gate. A "you could do
   this now," never a problem.

Each item's own state (blocker/warning/met) is kept from wherever it was
computed, so the strip never invents a separate colour scale.

---

## 9. Cross-cutting rules

### 9.1 Theming

System (follows the OS), Light or Dark, cycled by one control and
remembered across reloads in the browser (never synced). The resolved
theme is applied as a single `.dark` class on the document root; every
page repaints under all three without a reload, because every CSS rule
reads a token, never a colour. The brand pack defines the colour tokens
for both the light and the dark theme (§2).

### 9.2 Copy

A **Copy** button is offered on the Portfolio board (§5.2), the Initiatives
table (§5.3), the People table (§5.5), the team's capacity grid (§5.8), and,
on an initiative, its cost summary and phase costs (§5.4). It copies what is
currently shown, with the active filters and sort applied, as both plain
text and rich HTML, so it lands as cells in a spreadsheet or as a table in a
document. Print and PDF are not supported, so copy is the only output route.

### 9.3 Deletion rules

**People, teams, roles and countries are never deleted, only deactivated.**
They stay in the data, are hidden by default, and only Reset (§5.9) removes
them. This keeps every reference valid, which git alone cannot guarantee
across files (§3, Conflict edge cases). Initiatives and memberships can be
removed, because nothing points at them.

| Entity | Removal |
|---|---|
| Initiative | Deletable when no gate was passed; otherwise use On Hold or Cancelled |
| Membership | Removable; allocations that outlive it stay and warn (§7.2) |
| Person | Deactivate only |
| Team | Deactivate only |
| Role | Deactivate only |
| Country | Deactivate only |

Deactivated entities are excluded from active capacity accounting (for a
team, that includes its initiatives, §7.2) and from selection lists for new
allocations (and, for roles and countries, for people), but their historical
data is preserved and they can be reactivated.

### 9.4 Empty states

Every screen that can be empty — the Portfolio board, the Initiatives,
People and Teams overviews, and the members, initiatives and capacity
sections of the team detail — shows a single line saying what it holds and
**one primary action** (for example "No initiatives yet — Create your first
initiative"). The Portfolio with no initiatives shows the same instead of an
empty board; its action is **Create a team** while no team exists,
**Reactivate a team** (opening the Teams overview) while teams exist but none
is active, and **Create your first initiative** after. The first two add a
line under the heading saying why: "No teams yet." and "All your teams are
inactive."

An action blocked by a missing prerequisite links to it instead of
dead-ending: an allocation section on a team without members reads "This
team has no members — add one", and creating an initiative when no team
exists points to creating a team. Empty states carry no illustrations and no
tour.

### 9.5 Accessibility

The built-in UI targets **WCAG 2.2 Level AA**.

- **Contrast, enforced at build.** Every colour token in a brand pack must
  meet AA contrast against its intended background in both the light and the
  dark theme (§9.1). A pack that fails does not build, and the failure says
  which token.
- **State is never colour alone.** Blocker, warning, met, over-capacity,
  Provisional/Confirmed and similar states carry a second cue, an icon or a
  text label, in addition to colour.
- **Visualisations have a text alternative.** Any chart or indicator that
  carries a figure also shows that figure as text.
- **Keyboard operability.** Everything is operable by keyboard, with a
  logical tab order and a visible focus indicator. Defined behaviours:
  - Enter or Space opens a table row (§5.3, §5.5).
  - Esc closes the person side panel (§5.6) and returns focus to the row
    that opened it.
  - In inline editing, Enter commits and Esc cancels; after a failed push
    the field stays in edit mode (§3, Sync failures).
  - Magic bar actions (§5.4) are reachable by keyboard, and those that point
    to a section move focus to it.
  - The search overlay (§5.1) opens with a defined shortcut; Up and Down
    move between grouped results, and Enter opens the selected one.
  - No other global shortcuts are defined.
  - Animations (a tinted field, the "Passed — Reopen" fade, §9.9) are brief
    and non-essential; under `prefers-reduced-motion` they are skipped and
    the end state shows instantly.

### 9.6 Performance

Targets are measured at the volume ceiling (§1) on an ordinary business
laptop with a normal broadband connection:

- Every view is interactive within **1 s** of navigation.
- An edit shows a "saving" state within **100 ms** and is confirmed within
  **2 s** after the burst of edits ends (a burst ends after 1 s without a
  further edit, §10.3), under normal network conditions.
- On the first load the Portfolio appears within **5 s**: it shows once the
  master data and the Active initiatives have loaded, and the other
  initiatives load in the background (§9.9).

### 9.7 Language and formats

The UI is in English only. Numbers, currency amounts and dates are formatted
according to the user's browser locale, using the deployment's currency
symbol (§2). Calculations run on calendar months, prorated at a phase's own
start and end date (§7.1), and do not depend on display format.

### 9.8 Visual design

**Density.** The UI is comfortable: 15 px base text and 40 px table rows,
with two text weights, regular and medium, in a fixed scale. This is the
same in every build; the typeface comes from the brand pack (§2).

**Colour roles.** Colour carries meaning and is never used for decoration.

- **Alarm** — only the Overrun (§8.1, §8.5).
- **Warning** — escalation, overdue actuals, capacity warnings (over Team
  FTE % and over Capacity %, told apart by icon and text), the overspend in
  a deviation (§9.11) and Tentative checklist items.
- **Met** — Complete checklist items and Ready.
- **Accent** — the current phase, selection and links.
- Everything else is neutral.

State is always carried by an icon or text as well (§9.5).

**Window width.** The UI is desktop-first with a minimum supported width of
1200 px; below it the page scrolls horizontally. The board and the capacity
grid always scroll horizontally.

**Tooltips.** They appear on hover and on keyboard focus, after a short
delay. Critical information is never only in a tooltip.

**Icons.** See §9.10.

### 9.9 Interface states

- **Read-only banner:** a Warning-coloured banner directly below the top
  bar, on every page. It shows the cause and **Retry**, and cannot be
  dismissed while the tool is read-only (§3).
- **Saving:** a field shows a subtle saving state within 100 ms (§9.6). If
  the push fails, it stays in edit mode with the error and **Retry** (§3).
- **Same-field conflict:** shown inline under the field, with both values
  and **Keep theirs** / **Use mine** (§3).
- **Locked sections:** values are read-only with the hint "Locked. Unlock to
  edit." (§2).
- **Using the estimate:** a closed month without a recorded actual shows the
  estimate in a muted style with the label "using the estimate" (§7.3).
- **Frozen:** frozen phases, and Closed or Cancelled initiatives, show a
  lock icon and a muted look. Notes and actuals stay editable where allowed
  (§8.4).
- **Gate passed:** the magic bar shows "Passed <gate> — Reopen" for a few
  seconds (§5.4).
- **Changed by others:** a value that another user's change updates while it
  is on screen is tinted for a few seconds, and the sync indicator's tooltip
  says "Updated by others". A field the user is editing is never overwritten
  (§3).
- **Removed:** "Removed. Undo" for 10 seconds after removing an allocation,
  a cost item or a membership (§5.11).
- **Empty:** one line and one action (§9.4).
- **Confirmations:** reversible actions (put on hold, cancel, pass gate) act
  in one click and offer their undo (Resume, Reopen). Irreversible actions
  (delete, Reset) ask inline: the button turns into "Confirm …" with Cancel.
  Reset says what it removes, for example "This removes 12 initiatives, 34
  people and 5 teams."
- **Messages:** there is no toast stack. A message appears where the action
  happened, near the control or in the magic bar. Success is silent; errors
  stay until they are resolved or dismissed.
- **Opening:** the cached data shows immediately and refreshes in the
  background; the sync indicator shows syncing (§3). On the very first load
  the Portfolio appears once the master data and the Active initiatives are
  in; the Initiatives table and the search include the other initiatives as
  they arrive, and the indicator shows syncing until all are loaded.
- **Validation:** percent fields (Allocation %, Capacity %, Team FTE %)
  accept 0 to 100; anything else is refused inline with a message, because
  it would otherwise corrupt data (§7.2).

### 9.10 Icons

Where an icon with a tooltip says the same as a label, the UI uses the icon,
to reduce noise once users have learned its meaning. Every icon has a
tooltip and an accessible name, and state is never carried by an icon alone
(§9.5).

- **Team and owner** appear as icons with tooltips on cards, rows and header
  lines; the full detail pages keep their labels.
- **Phases** each have an icon defined in the brand pack (§2). It is shown
  icon-only in the stepper (§5.4), and beside the label in board column
  headers (§5.2) and in the process view (§5.9).
- **State markers** are icon-only with a tooltip on cards and in tables, and
  icon plus a short label in the Needs attention strip and in panels.
- **Labels stay** on navigation, table column headers, buttons (for example
  Pass gate), the approval track badge and anything used only once.

The core icons cover: initiative, team, owner and person, cost, cost item;
escalated, overrun, overdue actual, gate due, ready and complete, on hold,
cancelled, frozen and locked, over Team FTE %, and over Capacity %. Overrun
and the two capacity warnings each have a distinct icon. The glyphs come
from the Lucide icon set (§10.1), shadcn/ui's default.

### 9.11 Lists, filters, inputs and amounts

**Filters.** Every filter chip opens a multi-select dropdown with a search
field and checkboxes; choices apply instantly, and active chips are
highlighted. The number of matches ("2 of 46 initiatives") and **Clear
filters** show beside the list. Filters are kept while the user moves around
within the session, so they are still set after opening an initiative and
coming back, and they reset on reload.

**Sorting.** A click on a column header sorts by it, and the sort is stable.
Defaults: Initiatives with a Needs attention item first, in priority order
(§8.5), then by name; People, team members and roles by name; a team's
initiatives by phase, then name.

**Long text.** Long names are cut with an ellipsis and shown in full in a
tooltip.

**Month input.** Every month field (a cost item's month, the year filter's
months) is one compact control: type a month such as "Sep 2026", or open a
small popover with a year stepper and the twelve months. It is fully
operable by keyboard.

**Date input.** A phase's start and end date is a compact control: type a
date such as "3 Sep 2026", or open a small calendar popover. It is fully
operable by keyboard.

**Amounts.** Cards, board headers and metrics show compact amounts (for
example 4.2 M and 210 k) with the full amount in a tooltip; tables, editors
and copy (§9.2) show full amounts. Deviation always shows its sign, and
overspend uses the Warning colour (§9.8).

---

## 10. Technical decisions

Decisions that shape the build. They follow from the product rules above and
do not change them.

### 10.1 Framework and UI foundations

The SPA is written in React with TypeScript, built with **Vite** (the
official `@tailwindcss/vite` plugin drives the CSS build). Styling is
**Tailwind CSS v4**, CSS-first configured (no `tailwind.config.js`;
tokens are declared in CSS via `@theme`), reading the brand pack's
colour roles as CSS variables (§9.8) — this is a static, build-time
stylesheet, never runtime CSS-in-JS, since that would need inline
styles the content security policy below forbids.

UI components — button, combobox, popover, menu, dialog, tooltip and
similar — are generated into the codebase with the **shadcn/ui** CLI,
built on **Radix UI** primitives underneath for the accessible
behaviour and keyboard/screen-reader handling required by §9.5.
Generated components are owned and reviewed like any other code in the
repository, not imported as an opaque dependency; each one that's added
pulls in its specific Radix package plus small shared utilities
(`class-variance-authority`, `clsx`, `tailwind-merge`). No charting
library is included; the board, metrics and capacity grid (§5.2, §5.8)
are Tailwind-styled HTML.

Dependencies are still kept as few as the above allows, and pinned with
a lockfile. A strict content security policy limits scripts to the
app's own origin and connections to the configured GitHub API host, and
forbids `eval`, `new Function` and inline scripts, because the token
lives in the browser (§3). It is delivered as a `<meta>` tag, because
GitHub Pages supports no custom response headers; this means
`frame-ancestors` cannot be enforced by the policy itself, so the app
additionally refuses to render when it detects it is running inside a
frame (`window.self !== window.top`). Icons come from the Lucide icon
set (§9.10), shadcn/ui's default.

### 10.2 Data layout

The data branch holds **one master file per kind** — roles, countries, teams,
people and memberships — a small file for the dataset flags (§6), and **one
file per initiative**, holding its phases, cost items, allocations, actuals,
checklist state and gate records. Every file is JSON and carries the stable ids
of §6.

A client reads the data branch as follows. It checks the branch's head with a
conditional request (an unchanged head costs one request that GitHub does not
count against the rate limit). Only when the head has moved does it list the
data branch's files with their versions and fetch those whose version differs
from the one it holds. On first load it reads the full file list once. Fetched
files are cached by version (§10.4).

### 10.3 Writing

A single edit is written through the Contents API against the file's last-seen
version, as one commit. A text or number field makes its edit when it loses
focus or Enter is pressed, never on each keystroke, so typing a value is one
edit rather than several. Edits are grouped into one commit after 1 second
without a further edit, one write is in flight at a time, and closing the tab
while a write is pending shows a warning. A stale version is rejected with a
409: the client re-reads the file, re-applies the change with the merge rule of
§10.5 and retries up to three times with a short backoff, then shows the
conflict flow (§3). Operations that change many files — Reset, Load example
data, a migration (§3) — are a single commit through the Git data API. GitHub
allows, in general, no more than 80 content-generating requests per minute and
500 per hour, and the limits can change; this rule keeps the tool well inside
them.

Every Contents API call the client makes — read or write — must pass the data
branch explicitly. GitHub's Contents API silently defaults an omitted `branch`
parameter to the repository's default branch (the app branch), not to
whatever branch was last used, so a single missing parameter would write
dataset changes onto the app branch instead of the data branch with no error
(confirmed against the real API; spike-findings.md). No code path may omit it.

Commit messages are written by the app in plain words, for example "Payments
API: Development period set to Apr–Sep", with the entity's id in a trailer
line, so the history reads as a change log.

### 10.4 Browser storage

The cache is kept in IndexedDB: each file with its version, for one repository
and branch, together with the branch head the last complete pull read. It
shows on opening (§3), and a cache that cannot be read, or belongs to another
process or schema version, is discarded. The token is kept there too,
separately from the dataset (§3, Authentication), and is never dropped to make
room. The cache holds at most half the storage quota; over that, the oldest
files are dropped first, initiative files before master files. The size rule in
§3 (at most half the storage quota) is checked by an automated test.

### 10.5 Merging

No merge library is used: the shape is narrow enough — records merged key
by key, plus lists identified by id — that a small, purpose-built
function is more auditable than an external dependency, and it can enforce
the one rule a generic library wouldn't: a same-field conflict is always
surfaced to the user, never auto-resolved (§3).

When an edit is made against a stale file version:

1. Fetch the current file from the repository.
2. Compare it against the **last-synced version** the client held before
   the user's edit (the three-way base), field by field.
3. For each field, at every level (a record inside the file, such as a
   phase, is merged key by key down to its values, so a field no code knows
   about merges too): if only the user changed it, keep the user's
   value. If only the repository's version changed it, keep that value. If
   both changed it to the same value, keep it. If both changed it to
   different values, it is a **conflict** (§3): shown to the user with both
   values and resolved by their choice, not merged automatically.
4. For each list field (allocations, cost items, checklist items,
   memberships): union the items by id. An item added on one side is kept.
   An item removed on one side and unchanged on the other is removed; one
   removed on one side and changed on the other is a conflict, as in step 3.
   An item present on both sides is itself merged field by field per step 3.
   A phase frozen by a passed gate (§8.1) is not merged: its period,
   allocations and cost items keep their snapshot, and its actuals merge as
   above.
5. Write the merged result as the new commit, against the version just
   fetched in step 1.

### 10.6 Identifiers and links

Ids are UUIDs generated by the client (§6). Every top-level page has a hash
route, because GitHub Pages serves no fallback page for other paths (§5.1):
`#/portfolio`, `#/initiatives`, `#/initiatives/<id>` (the only shareable
one, §5.1), `#/people`, `#/teams`, `#/settings`. People and teams are
reached only through their overview routes, per §5.1.

### 10.7 Distribution, build and deploy

**Distribution.** The core is published as a repository that deployers fork.
Taking a new core version uses GitHub's fork-sync, which fast-forwards cleanly
as long as the brand pack is the deployer's only local change; a conflict
during sync means core files were modified and need manual resolution before
continuing. Dataset migrations run automatically on first use of a new version
(§3, Versioning and migration).

**Build and deploy.** A GitHub Actions workflow on the app branch builds the
SPA from the brand pack folder and deploys it to GitHub Pages (§3, Setup). The
build fails, and nothing is deployed, when the brand pack has a problem: a
colour role that is missing or fails the contrast rule (§9.5), overlapping
approval bands (§7.4), an incomplete process definition (ids, labels,
descriptions, durations and icons; §2), or an example dataset that does not
match the process identity (§2).

### 10.8 Testing

- Unit tests for the calculation engine: cost (§7.1), capacity (§7.2) and
  approval tracks (§7.4).
- Automated checks in the build: colour contrast (§9.5), the storage size
  test (§3), migration from every earlier schema and process structure
  version (§3), merge and conflict cases (§3, §10.5), and automated
  accessibility checks of the main screens (§9.5).
- A small set of end-to-end tests of the main flows: creating and planning
  an initiative, passing a gate, a same-field conflict, and read-only
  mode.

**Security, dependency and vulnerability checks.** They run in every
build and on a weekly schedule, because new vulnerabilities appear without
a code change.

- **Dependencies:** a scan of all dependencies for known vulnerabilities
  fails the build on high and critical findings; the lockfile is verified
  and versions are pinned; licences are checked against an allowed list;
  a software bill of materials is produced with each build; updates are
  proposed automatically.
- **Code:** static analysis for security issues (for example CodeQL or
  ESLint security rules), and a scan that no secret or token (for example
  a string starting `github_pat_` or `ghp_`) is committed to the code or
  the dataset.
- **Build output:** a check that the output contains the content security
  policy, no inline scripts, no `eval` or `new Function`, and no
  third-party origins.
- **Behaviour:** tests that the token never appears in a committed file,
  the console or an error message (§10.9); that every outbound request
  goes to the configured GitHub host; that user-entered text (names,
  descriptions, notes, labels) is always escaped, using injection
  payloads; and that a malformed or hostile dataset (including keys such
  as `__proto__`) is reported as damaged data (§3) and never executed or
  merged.
- **Pipeline:** workflow actions are pinned to a commit, and the workflow
  has only the permissions it needs.

### 10.9 Security

The token is sent only to the configured GitHub API host, is never logged,
and is never written to the dataset (§3, Authentication). The app loads no
third-party scripts, and its dependencies are audited in the build (§10.1).

---

## 11. Glossary

| Term | Meaning |
|---|---|
| Initiative | A piece of planned work (a project) that belongs to one team, has an owner and moves through the process (§4) |
| Phase | A step of the process; costed or not (§4) |
| Provisional / Confirmed | A costed phase's confidence, derived from today's date vs. its start date (§4) |
| Gate | The transition out of a phase; the last one closes the initiative |
| Status | Active, On Hold, Cancelled or Closed — independent of phase, except that Closed is reached only through the final gate |
| Checklist item | A named Incomplete/Tentative/Complete condition on a gate (§4, §8.1) |
| Skipped gate | A gate passed over with a recorded reason; records no figure and freezes nothing (§8.2) |
| Cost item | A named, priced non-people cost in a costed phase, timed in one month or spread over the phase (§4, §7.1) |
| Grand estimate | An initiative's total cost across all costed phases: recorded actuals where they exist, estimates elsewhere (§4, §7.3) |
| Deviation | Recorded actuals minus their estimates; positive is overspend, negative is underspend (§4, §7.3) |
| Approval track | The budget band resolved from the grand estimate (§7.4) |
| Severity | A band's integer oversight rank; higher is stricter (§7.4) |
| No approval track | A total no configured band covers (§7.4) |
| Overrun | The current phase running past its end date with its gate not passed; the one alarm state (§8.1, §8.5) |
| Capacity % | A person's ceiling on total concurrent commitment |
| Allocation % | The percentage of full-time capacity a person is committed at on one phase |
| Team FTE % | How much of a person's full-time capacity one team holds (§4) |
| Person | Someone allocatable to initiatives; exists independently of teams |
| Membership | A person's link to one team, carrying a Team FTE % |
| Custom role | A per-person role label with its own absolute day rate per year (§7.2) |
| Non-initiative work | The portion of a person a team holds but hasn't allocated |
| Estimate / Forecast / Actual | See §4; a closed month with no recorded actual defaults to its estimate (§7.3) |
| Needs attention | The ranked list of current-gate states worth a look, for Active initiatives (§8.5) |
| Magic bar | The sticky bottom bar on the initiative detail view (§5.4) |
| Process identity | The process id plus its structure version; a dataset must match it (§2, §3) |
| Brand pack | The build-time configuration folder that fixes the process, approval tracks, branding, GitHub location and fresh-install baseline (§2) |
| Fresh-install baseline | Placeholder roles, countries and rates; people, teams and initiatives start empty (§2) |
| Working days | A country's working days in each month of a year, prefilled with the weekdays and edited as a number (§6, §7.1) |
| Starting phase | The phase an untouched initiative is placed in when its work predates the tool; earlier gates are recorded as skipped (§8.2) |
| Example dataset | Bundled people, teams and initiatives, loadable from the Danger zone on an empty dataset (§2, §5.9) |
| Getting started strip | Self-clearing Portfolio strip guiding day one in four steps: review rates, create a team, add people, create the first initiative (§5.2) |
