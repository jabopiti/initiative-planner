/**
 * People and their team memberships (SPEC §7.3).
 *
 * A separate aggregate from the initiative lifecycle, with invariants of its
 * own: exactly one of a standard role or a custom rate, shares that should
 * not outrun a person's capacity, and nothing ever hard-deleted once
 * referenced. Pure, and never touches the DOM.
 */

import * as E from './engine.js';
import { newId } from './lifecycle.js';

/**
 * A person starts on a standard role, unassigned to any team.
 * @param {object} app
 * @param {{ name?: string, countryId?: string, roleId?: string, capacityPct?: number }} [input]
 */
export function createPerson(app, input = {}) {
  const { name = 'New person', countryId, roleId, capacityPct = 100 } = input;
  const person = {
    id: newId('person'),
    name,
    active: true,
    countryId: countryId ?? Object.keys(app.COUNTRIES)[0],
    capacityPct,
    roleId: roleId ?? Object.keys(app.ROLES)[0],
    customRole: null,
    memberships: [],
  };
  app.PEOPLE[person.id] = person;
  return person;
}

/**
 * People are never hard-deleted once referenced — an allocation, a frozen
 * estimate or an approval may depend on them. Deactivating stops them
 * counting toward capacity from now on; existing allocations keep costing,
 * exactly as a deactivated membership does (SPEC §5.2).
 */
export function setPersonActive(person, active) {
  person.active = active;
}

/* ------------------------------------------------------------------ *
 * Role and rate
 * ------------------------------------------------------------------ */

/**
 * Exactly one of `roleId` and `customRole` ever applies. These two functions
 * are the only way to change which, so the pair can never both be set.
 *
 * Passing no `roleId` restores the role the person had before their custom
 * rate, so toggling between the two is reversible. Without that, exploring
 * the choice would silently reassign someone's role — and their cost.
 */
export function useStandardRole(person, roleId) {
  person.roleId = roleId ?? person.customRole?.fromRoleId ?? person.roleId;
  person.customRole = null;
}

/**
 * Switch to an individually negotiated rate. Seeds one rate per tracked year,
 * defaulting to what the person costs today so the change starts neutral
 * rather than zeroing their cost.
 */
export function useCustomRole(app, person, label = 'Contractor') {
  const years = Object.keys(app.COUNTRIES[person.countryId].byYear).map(Number);
  const current = years.reduce((out, year) => {
    const { dayRate, factor } = E.resolveRate(person, app.ROLES, app.COUNTRIES, year);
    out[year] = Math.round(dayRate * factor);
    return out;
  }, {});

  person.customRole = { label, byYear: current, fromRoleId: person.roleId };
  person.roleId = null;
}

export function setCustomRate(person, year, rate) {
  person.customRole.byYear[year] = rate;
}

/* ------------------------------------------------------------------ *
 * Memberships
 * ------------------------------------------------------------------ */

/**
 * Join a team. Re-joining a team the person previously left reactivates the
 * existing membership rather than adding a second one — a person holds at
 * most one membership per team.
 */
export function addMembership(person, teamId, sharePct = 0) {
  const existing = (person.memberships ?? []).find((m) => m.teamId === teamId);
  if (existing) {
    existing.active = true;
    existing.sharePct = sharePct || existing.sharePct;
    return existing;
  }
  const membership = { teamId, sharePct, active: true };
  person.memberships.push(membership);
  return membership;
}

export function setMembershipShare(person, teamId, sharePct) {
  const membership = person.memberships.find((m) => m.teamId === teamId);
  if (membership) membership.sharePct = sharePct;
}

/**
 * Leaving a team never removes the membership record and never touches
 * allocations: the work was estimated, and once gated, approved. The caller
 * is expected to surface what is now stranded (SPEC §5.2).
 */
export function setMembershipActive(app, person, teamId, active) {
  const membership = person.memberships.find((m) => m.teamId === teamId);
  if (membership) membership.active = active;
  return E.strandedAllocations(app, person.id);
}

/**
 * A person's shares should not outrun their capacity. Like every other
 * ceiling here this warns and never blocks (SPEC §4).
 */
export function shareWarning(person) {
  const total = E.totalSharePct(person);
  return {
    totalSharePct: total,
    capacityPct: person.capacityPct,
    overCommitted: total > person.capacityPct,
    unassignedPct: Math.max(0, person.capacityPct - total),
  };
}

/**
 * A person's month-by-month capacity picture: what they are allocated, and
 * what each team holds but has not allocated (SPEC §7.3).
 */
export function capacityOverTime(app, personId, months) {
  const person = app.PEOPLE[personId];
  const teams = (person.memberships ?? [])
    .filter((m) => m.active)
    .map((m) => ({ teamId: m.teamId, name: app.TEAMS[m.teamId]?.name ?? m.teamId }));

  return months.map((month) => {
    const allocated = E.allocatedPct(app, personId, month);
    return {
      month,
      allocatedPct: allocated,
      capacityPct: person.capacityPct,
      overAllocated: allocated > person.capacityPct,
      nonInitiative: teams.map((team) => ({
        ...team,
        pct: E.nonInitiativeWorkPct(app, personId, team.teamId, month),
      })),
    };
  });
}
