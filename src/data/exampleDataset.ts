import type { BrandPack } from '../brand/types';
import { passGate } from './gate';
import { newId } from './ids';
import type { ChecklistState, Country, Initiative, Membership, Person, PhasePlan, Role, Team } from './types';

/** What loading the example dataset (§2, §5.9) writes: its own entities, and the roles and countries it needed to add. */
export interface ExampleData {
  roles: Role[];
  countries: Country[];
  teams: Team[];
  people: Person[];
  memberships: Membership[];
  initiatives: Initiative[];
  /** Whether `roles` or `countries` gained one from the fresh-install baseline, so that file needs writing too. */
  addedRoles: boolean;
  addedCountries: boolean;
}

const iso = (year: number, month: number, day: number) =>
  `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

/** The first or last day of the month `offset` months from `today`'s, as an ISO date. */
function monthDay(today: Date, offset: number, which: 'first' | 'last'): string {
  const first = new Date(today.getFullYear(), today.getMonth() + offset, 1);
  const day = which === 'first' ? 1 : new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  return iso(first.getFullYear(), first.getMonth(), day);
}

/**
 * The brand pack's example dataset made concrete for this dataset and this month (§2, §5.9): new ids, dates from
 * month offsets, people matched to active roles by abbreviation and countries by name — one missing is added from
 * the fresh-install baseline — and each initiative's earlier gates passed through the app's own `passGate`, so frozen
 * snapshots and approval tracks come from these rates. Throws when the brand pack's example doesn't fit its process.
 */
export function buildExampleData(brand: BrandPack, current: { roles: Role[]; countries: Country[] }, today: Date = new Date()): ExampleData {
  const example = brand.exampleDataset;
  const roles = [...current.roles];
  const countries = [...current.countries];
  let addedRoles = false;
  let addedCountries = false;

  const roleId = (abbreviation: string): string => {
    const found = roles.find((r) => r.active && r.abbreviation === abbreviation);
    if (found) return found.id;
    const baseline = brand.freshInstallBaseline.roles.find((r) => r.abbreviation === abbreviation);
    if (!baseline) throw new Error(`The example dataset needs a role ${abbreviation} the brand pack doesn't have.`);
    const role: Role = { id: newId(), ...baseline, active: true };
    roles.push(role);
    addedRoles = true;
    return role.id;
  };
  const countryId = (name: string): string => {
    const found = countries.find((c) => c.active && c.name === name);
    if (found) return found.id;
    const baseline = brand.freshInstallBaseline.countries.find((c) => c.name === name);
    if (!baseline) throw new Error(`The example dataset needs a country ${name} the brand pack doesn't have.`);
    const country: Country = {
      id: newId(),
      name,
      active: true,
      ratesByYear: baseline.ratesByYear.map((r) => ({ ...r, workingDaysByMonth: [...r.workingDaysByMonth] })),
    };
    countries.push(country);
    addedCountries = true;
    return country.id;
  };

  const teams: Team[] = example.teams.map((t) => ({ id: newId(), name: t.name, active: true }));
  const teamId = (key: string) => {
    const index = example.teams.findIndex((t) => t.key === key);
    if (index < 0) throw new Error(`The example dataset has no team ${key}.`);
    return teams[index].id;
  };
  const people: Person[] = example.people.map((p) => ({
    id: newId(),
    name: p.name,
    countryId: countryId(p.country),
    roleId: roleId(p.role),
    capacityPct: 100,
    active: true,
  }));
  const personId = (key: string) => {
    const index = example.people.findIndex((p) => p.key === key);
    if (index < 0) throw new Error(`The example dataset has no person ${key}.`);
    return people[index].id;
  };
  const memberships: Membership[] = example.people.map((p, i) => ({
    id: newId(),
    personId: people[i].id,
    teamId: teamId(p.team),
    teamFtePct: 100,
    active: true,
  }));

  const rates = { roles, countries };
  const initiatives = example.initiatives.map((e): Initiative => {
    const phases: Record<string, PhasePlan> = {};
    for (const [phaseId, plan] of Object.entries(e.phases ?? {})) {
      phases[phaseId] = {
        startDate: monthDay(today, plan.fromMonth, 'first'),
        endDate: monthDay(today, plan.toMonth, 'last'),
        allocations: plan.allocations.map((a) => ({ id: newId(), personId: personId(a.person), allocationPct: a.pct })),
      };
    }
    // A passed gate's checklist was complete when it was passed.
    const checklist: ChecklistState = {};
    for (const gate of e.passedGates) {
      const phase = brand.process.find((p) => p.id === gate.phase);
      if (!phase) throw new Error(`The example dataset names a phase ${gate.phase} the process doesn't have.`);
      checklist[phase.id] = Object.fromEntries(phase.exitGate.checklistItems.map((item) => [item.id, { status: 'complete' as const, note: '' }]));
    }
    let initiative: Initiative = {
      id: newId(),
      name: e.name,
      description: e.description,
      ...(e.owner ? { ownerId: personId(e.owner) } : {}),
      teamId: teamId(e.team),
      status: 'Active',
      ...(Object.keys(phases).length > 0 ? { phases } : {}),
      ...(Object.keys(checklist).length > 0 ? { checklist } : {}),
    };
    for (const gate of e.passedGates) {
      const result = passGate(brand.process, initiative, people, rates, brand.approvalTracks, monthDay(today, gate.month, 'first'));
      if (!result.ok) throw new Error(`${e.name} can't pass the gate after ${gate.phase}: ${result.blockers.join('; ')}`);
      initiative = result.initiative;
    }
    return initiative;
  });

  return { roles, countries, teams, people, memberships, initiatives, addedRoles, addedCountries };
}
