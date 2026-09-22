---
name: "example-data"
description: "Reference seed/example data for building and demoing slices 002-011: process definition, roles, countries, branding, teams/people/initiatives."
---

# Example data for slices

This is real reference data to build and demo against, provided by the
user, researched where noted, and confirmed through the batches of
decisions in this conversation. Later slices should use this instead of
inventing throwaway names, so demos are comparable slice to slice.

## Process definition (brand pack)

Phases, in order:

| # | Phase | Costed? | Exit gate | Skippable | Requires estimates? |
|---|---|---|---|---|---|
| 1 | Discovery | No | G1 | Yes | No |
| 2 | Validation | Yes | G2 | Yes | Yes |
| 3 | Development | Yes | G3 | No | Yes |
| 4 | Rollout | No | G4 (closes the initiative) | No | No |

G1 and G4's estimate requirement, and the "no" answers, were confirmed
explicitly: too early at G1, nothing ahead to re-check at G4.

Checklist items (mocked, simple, 1-3 per gate):

- **G1:** Problem statement validated; Stakeholders aligned.
- **G2:** Business case approved; Cost estimate reviewed; Technical
  feasibility confirmed.
- **G3:** Acceptance testing passed; Security review completed; Rollout
  plan approved.
- **G4:** Hypercare period completed; Lessons learned documented.

Approval tracks (bounds lower-inclusive, upper-exclusive; currency EUR):

| Name | Abbreviation | Bounds | Severity | Requirement text |
|---|---|---|---|---|
| Light | L | €0 – €50,000 | 1 | No additional approval required |
| Standard | S | €50,000 – €200,000 | 2 | Requires department head approval |
| Elevated | E | €200,000+ | 3 | Requires steering committee approval |

**Open note:** Rollout being non-costed (no cost tracked for the release
effort itself) was flagged and confirmed as intentional, not an oversight.

## Roles (master data)

| Name | Abbreviation | Cost factor |
|---|---|---|
| Product Manager | PM | 0.8 |
| Experience Designer | XD | 1.0 |
| Tech Lead | TL | 0.8 |
| Developer | Dev | 1.0 |

Confirmed as given: PM and Tech Lead intentionally cost less per day than
a Developer at the same country rate.

## Countries (master data)

Day rates: Germany €1000, Spain €800. Working days per month were computed
from real 2026-2028 public holiday calendars for Hamburg and Madrid
(weekdays minus holidays landing on a weekday). The Madrid 2027 annual
total (251) independently matched a published source, giving confidence
in the method; exact day-by-day placement in 2027-2028 may differ by a day
or two from an official calendar due to how a couple of movable local
observances are counted — acceptable since this field is just an editable
starting number in the product (§6, §7.2).

| Month | Germany 2026 | Germany 2027 | Germany 2028 | Spain 2026 | Spain 2027 | Spain 2028 |
|---|---|---|---|---|---|---|
| Jan | 21 | 20 | 21 | 20 | 19 | 20 |
| Feb | 20 | 20 | 21 | 20 | 20 | 21 |
| Mar | 22 | 21 | 23 | 21 | 20 | 23 |
| Apr | 20 | 22 | 18 | 20 | 22 | 18 |
| May | 18 | 19 | 21 | 19 | 21 | 20 |
| Jun | 22 | 22 | 21 | 22 | 22 | 22 |
| Jul | 23 | 22 | 21 | 23 | 22 | 21 |
| Aug | 21 | 22 | 23 | 21 | 22 | 22 |
| Sep | 22 | 22 | 21 | 22 | 22 | 21 |
| Oct | 22 | 21 | 20 | 21 | 20 | 21 |
| Nov | 21 | 22 | 22 | 19 | 20 | 20 |
| Dec | 22 | 23 | 19 | 20 | 21 | 18 |
| **Total** | **254** | **256** | **251** | **248** | **251** | **247** |

## Branding

- Product name: **Initiative Planner**
- Currency symbol: **€**

Colour palette (Option A — refined forest and mint, confirmed): light
theme only shown here; dark-theme values are still open and should be
derived when building §9.8's token set, following the same role
separation.

| Role | Hex | Use |
|---|---|---|
| Accent | #075E46 (Forest) | Current phase, selection, links, primary buttons |
| Accent tint | #E8FFF2 (Mint Fog) | Selected nav item, current-phase highlight background |
| Met | #16A34A | Complete checklist items, Ready — a distinct brighter green from Accent, so the two don't blend |
| Warning | #B45309 | Escalated, overdue actuals, capacity warnings, Tentative items |
| Alarm | #DC2626 | Overrun only — the one alarm state (§8.1, §8.5) |
| Text primary | #14201B | Body text |
| Text secondary | #5B6B64 | Supporting text |
| Surface (page) | #F7FAF9 | Page background |
| Surface (card) | #FFFFFF | Cards, panels |

**Dark theme** — derived from the light values above, same role separation
kept (Accent lightened to stay legible on a dark page; Met kept distinct
from Accent by leaning more leaf-green where Accent leans teal-green).
Proposed, not independently contrast-verified by hand; the build's
automated contrast check (§9.5, §10.7) is the actual gate before these
ship.

| Role | Hex | Note |
|---|---|---|
| Accent | #2FD9A6 | Forest lightened for legibility on a dark page |
| Accent tint | #12291F | Dark, desaturated green wash for selected/highlighted backgrounds |
| Met | #4ADE80 | Leaf-green, kept distinct in hue from Accent's teal-green |
| Warning | #FBBF24 | Lightened amber |
| Alarm | #F87171 | Lightened red |
| Text primary | #EAF3EE | Body text |
| Text secondary | #9FB0A8 | Supporting text |
| Surface (page) | #0E1512 | Page background |
| Surface (card) | #16211C | Cards, panels |

## Repository configuration

- App branch: **main**
- Data branch: **data**
- Repository owner, name, and GitHub host (github.com vs. Enterprise):
  still open — confirm when starting slice 001.
- GitHub plan tier (Free / Team / Enterprise): **not yet known**. This
  matters directly for slice 002, since private Pages and branch
  protection (both assumed by §3/§10.7's fork setup) aren't available on
  GitHub Free. Slice 002 now includes a first step to confirm this before
  the rest of its validation proceeds.

## Example teams, people, initiatives

| Team | Members (role, country) | Initiatives (current phase) |
|---|---|---|
| **Platform** | Mara Voss (PM, DE) · Lucía Ramos (XD, ES) · Jonas Keller (TL, DE) · Felix Brandt (Dev, DE) · Elena Torres (Dev, ES) | Checkout Redesign (Development) · Fraud Detection Upgrade (Discovery) |
| **Growth** | Carla Fernández (PM, ES) · Tobias Wagner (TL, DE) · Sofia Molina (Dev, ES) · Paul Richter (Dev, DE) | Onboarding Flow v2 (Validation) |
