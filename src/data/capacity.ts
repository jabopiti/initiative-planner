import type { PhaseDef } from '../brand/types';
import { monthsInRange } from './cost';
import { monthOf, nextMonth } from './dates';
import { currentPhaseId } from './processState';
import { activeMembers, activeMembership } from './teamMembers';
import type { Initiative, Membership, Person } from './types';

/** Total Team FTE % a person's active memberships claim (§4). */
export function claimedFtePct(personId: string, memberships: Membership[], excludeMembershipId?: string): number {
  return memberships
    .filter((m) => m.personId === personId && m.active && m.id !== excludeMembershipId)
    .reduce((sum, m) => sum + m.teamFtePct, 0);
}

/**
 * Capacity % minus the Team FTE %s already held (§5.6). It caps and defaults
 * a new or edited membership so the person panel can never create an
 * over-Capacity % state (§7.2); the team detail may still raise past it.
 */
export function unclaimedCapacityPct(person: Person, memberships: Membership[], excludeMembershipId?: string): number {
  return Math.max(0, person.capacityPct - claimedFtePct(person.id, memberships, excludeMembershipId));
}

// ---- Month-by-month capacity (§5.8, §7.2) ----

/**
 * Confirmed or Provisional (§4): Confirmed when it is the initiative's current phase or its start date falls in
 * the current or the next calendar month. The threshold is a month-key comparison, not date arithmetic, so it
 * has no day-31 overflow (engine-audit.md). A phase with no start date is Provisional.
 */
export function isPhaseConfirmed(initiative: Initiative, phaseId: string, process: PhaseDef[], today: string): boolean {
  if (currentPhaseId(initiative, process) === phaseId) return true;
  const start = initiative.phases?.[phaseId]?.startDate;
  if (!start) return false;
  const now = monthOf(today);
  const startMonth = monthOf(start);
  return startMonth === now || startMonth === nextMonth(now);
}

/** One person's Allocation % on one phase of an Active initiative, with the months it covers. */
export interface Load {
  personId: string;
  initiativeId: string;
  initiativeName: string;
  teamId: string;
  phaseId: string;
  phaseLabel: string;
  startDate: string;
  endDate: string;
  months: string[];
  allocationPct: number;
  confirmed: boolean;
}

export interface CapacityData {
  initiatives: Initiative[];
  people: Person[];
  memberships: Membership[];
  process: PhaseDef[];
  /** Today, `YYYY-MM-DD`. */
  today: string;
}

/** Every allocation of every Active initiative on a costed phase with a valid period (§7.2: only Active count). Compute once, share across callers. */
export function activeLoads({ initiatives, process, today }: Pick<CapacityData, 'initiatives' | 'process' | 'today'>): Load[] {
  const loads: Load[] = [];
  for (const initiative of initiatives) {
    if (initiative.status !== 'Active') continue;
    for (const phase of process) {
      const plan = initiative.phases?.[phase.id];
      if (!phase.costed || !plan?.startDate || !plan.endDate) continue;
      const months = monthsInRange(plan.startDate, plan.endDate);
      if (months.length === 0) continue;
      const confirmed = isPhaseConfirmed(initiative, phase.id, process, today);
      for (const allocation of plan.allocations) {
        loads.push({
          personId: allocation.personId,
          initiativeId: initiative.id,
          initiativeName: initiative.name,
          teamId: initiative.teamId,
          phaseId: phase.id,
          phaseLabel: phase.label,
          startDate: plan.startDate,
          endDate: plan.endDate,
          months,
          allocationPct: allocation.allocationPct,
          confirmed,
        });
      }
    }
  }
  return loads;
}

/** Allocations are unrounded, so a sum such as 0.1 + 0.2 must not read as over 0.3. */
const EPSILON = 1e-9;

const sum = (loads: Load[]) => loads.reduce((total, l) => total + l.allocationPct, 0);

/** A person's allocations in a month, all teams, Provisional ones included (marked `confirmed: false`). */
export function loadsIn(loads: Load[], personId: string, month: string): Load[] {
  return loads.filter((l) => l.personId === personId && l.months.includes(month));
}

function groupByPerson(loads: Load[]): Map<string, Load[]> {
  const byPerson = new Map<string, Load[]>();
  for (const load of loads) {
    const list = byPerson.get(load.personId);
    if (list) list.push(load);
    else byPerson.set(load.personId, [load]);
  }
  return byPerson;
}

export interface CapacityCell {
  month: string;
  /** Allocation % on this team's Active initiatives, Confirmed phases only. */
  teamPct: number;
  /** Allocation % on this team's Provisional phases: shown apart, counted toward nothing (§7.2). */
  provisionalPct: number;
  /** Allocation % across every team's Confirmed phases. */
  totalPct: number;
  overTeamFte: boolean;
  overCapacity: boolean;
}

export interface CapacityRow {
  person: Person;
  /** The Team FTE % of an active member (§4); null for a person who is not one but still has allocations on the team's initiatives. */
  teamFtePct: number | null;
  cells: CapacityCell[];
  /** The team's Active-initiative allocations that outlived the membership (§7.2). */
  stranded: Load[];
  /** Set when the person's Team FTE %s add up to more than their Capacity % (§7.2). */
  fteSumOverCapacity: { claimedPct: number; capacityPct: number } | null;
}

export interface TeamCapacity {
  /** From the current month through the last month with an allocation; empty when there is none. */
  months: string[];
  rows: CapacityRow[];
  /** Every Active-initiative allocation of every team, for the detail of a cell or a row. */
  loads: Load[];
}

/** The team's capacity view (§5.8): a row per active member, then a row per person whose allocation outlived their membership. */
export function teamCapacity(teamId: string, data: CapacityData, loads: Load[] = activeLoads(data)): TeamCapacity {
  const { people, memberships, today } = data;
  const teamLoads = loads.filter((l) => l.teamId === teamId);
  const members = activeMembers(teamId, memberships, people);
  const memberIds = new Set(members.map((p) => p.id));
  const loadedIds = new Set(teamLoads.map((l) => l.personId));
  const strandedPeople = people.filter((p) => !memberIds.has(p.id) && loadedIds.has(p.id));
  const allByPerson = groupByPerson(loads);
  const teamByPerson = groupByPerson(teamLoads);

  const first = monthOf(today);
  const lastEnd = teamLoads.reduce((max, l) => (l.endDate > max ? l.endDate : max), '');
  const months = lastEnd && monthOf(lastEnd) >= first ? monthsInRange(`${first}-01`, `${monthOf(lastEnd)}-01`) : [];

  const row = (person: Person, member: boolean): CapacityRow => {
    const membership = member ? activeMembership(person.id, teamId, memberships) : undefined;
    const claimedPct = claimedFtePct(person.id, memberships);
    const personTeamLoads = teamByPerson.get(person.id) ?? [];
    const personAllLoads = allByPerson.get(person.id) ?? [];
    return {
      person,
      teamFtePct: membership ? membership.teamFtePct : null,
      cells: months.map((month) => {
        const here = loadsIn(personTeamLoads, person.id, month);
        const teamPct = sum(here.filter((l) => l.confirmed));
        const totalPct = sum(loadsIn(personAllLoads, person.id, month).filter((l) => l.confirmed));
        return {
          month,
          teamPct,
          provisionalPct: sum(here.filter((l) => !l.confirmed)),
          totalPct,
          overTeamFte: membership !== undefined && teamPct > membership.teamFtePct + EPSILON,
          overCapacity: person.active && totalPct > person.capacityPct + EPSILON,
        };
      }),
      stranded: member ? [] : personTeamLoads,
      fteSumOverCapacity: member && claimedPct > person.capacityPct + EPSILON ? { claimedPct, capacityPct: person.capacityPct } : null,
    };
  };

  const byName = (a: Person, b: Person) => a.name.localeCompare(b.name);
  return {
    months,
    rows: [...members.sort(byName).map((p) => row(p, true)), ...strandedPeople.sort(byName).map((p) => row(p, false))],
    loads,
  };
}

/** Whether any row of the capacity view carries a §7.2 warning: the marker on the Teams overview (§5.7). */
export function teamHasCapacityWarning(capacity: TeamCapacity): boolean {
  return capacity.rows.some((r) => r.stranded.length > 0 || r.fteSumOverCapacity !== null || r.cells.some((c) => c.overTeamFte || c.overCapacity));
}

export interface AllocationWarnings {
  /** The person is no longer an active member of the initiative's team (§7.2). */
  notMember: boolean;
  /** Months of the phase in which the person is over their Team FTE % on the team. */
  overTeamFteMonths: string[];
  /** Months of the phase in which the person is over their Capacity % across all teams. */
  overCapacityMonths: string[];
}

/**
 * The warnings on one allocation row of the initiative page (§5.4). The ceilings look at the phase's own
 * months and stay silent on a Provisional phase or an initiative that is not Active, whose allocation is not
 * counted; the membership warning shows regardless, because such an allocation keeps costing.
 */
export function allocationWarnings(initiative: Initiative, phaseId: string, personId: string, data: CapacityData, allLoads: Load[] = activeLoads(data)): AllocationWarnings {
  const person = data.people.find((p) => p.id === personId);
  const membership = activeMembership(personId, initiative.teamId, data.memberships);
  const none: AllocationWarnings = { notMember: !person?.active || !membership, overTeamFteMonths: [], overCapacityMonths: [] };
  const plan = initiative.phases?.[phaseId];
  if (!person || initiative.status !== 'Active' || !plan?.startDate || !plan.endDate) return none;
  if (!isPhaseConfirmed(initiative, phaseId, data.process, data.today)) return none;

  const loads = allLoads.filter((l) => l.confirmed && l.personId === personId);
  const teamLoads = loads.filter((l) => l.teamId === initiative.teamId);
  const months = monthsInRange(plan.startDate, plan.endDate);
  return {
    ...none,
    overTeamFteMonths: membership ? months.filter((m) => sum(loadsIn(teamLoads, personId, m)) > membership.teamFtePct + EPSILON) : [],
    overCapacityMonths: person.active ? months.filter((m) => sum(loadsIn(loads, personId, m)) > person.capacityPct + EPSILON) : [],
  };
}
