import type { PhaseDef } from '../brand/types';
import { countsTowardCapacity } from './capacity';
import { monthsInRange, periodMonths, type Period } from './cost';
import { currentPhaseId, isPhaseConfirmed } from './processState';
import { activeMembers, activeMembership } from './teamMembers';
import type { Initiative, Membership, Person, Team } from './types';

/** One person's Allocation % in one month over the Confirmed phases of Active initiatives (§7.2). */
interface MonthLoad {
  /** Across all teams: the Capacity % ceiling's scope. */
  total: number;
  /** On the team's own initiatives: the Team FTE % ceiling's scope. */
  onTeam: number;
}

/**
 * What each of `people` has free for a phase (§5.11, §7.2): the lower of their unused Team FTE % on the team
 * and their unused Capacity % across all teams, taken as the minimum over the phase's months, in whole percent
 * rounded down so that using it can never trip a ceiling. Provisional phases and initiatives that are not
 * Active, or belong to an inactive team (§7.2), are left out. Never below 0. Undefined when the phase has no months (no period yet, or an inverted
 * one). One pass over the initiatives serves everyone in the list.
 */
export function freeCapacityByPerson({
  people,
  teamId,
  teams,
  memberships,
  period,
  initiatives,
  process,
  today,
}: {
  people: Person[];
  teamId: string;
  teams: Team[];
  memberships: Membership[];
  period: Period;
  initiatives: Initiative[];
  process: PhaseDef[];
  today: string;
}): Map<string, number> | undefined {
  const months = periodMonths(period);
  if (months.length === 0) return undefined;
  const inPeriod = new Set(months);
  const wanted = new Set(people.map((p) => p.id));

  const load = new Map<string, Map<string, MonthLoad>>();
  for (const initiative of initiatives) {
    if (!countsTowardCapacity(initiative, teams)) continue;
    const current = currentPhaseId(initiative, process);
    const onTeam = initiative.teamId === teamId;
    for (const [phaseId, plan] of Object.entries(initiative.phases ?? {})) {
      if (!plan.startDate || !plan.endDate || !isPhaseConfirmed(plan.startDate, phaseId === current, today)) continue;
      const overlap = monthsInRange(plan.startDate, plan.endDate).filter((m) => inPeriod.has(m));
      if (overlap.length === 0) continue;
      for (const { personId, allocationPct } of plan.allocations) {
        if (!wanted.has(personId)) continue;
        const byMonth = load.get(personId) ?? new Map<string, MonthLoad>();
        load.set(personId, byMonth);
        for (const month of overlap) {
          const cell = byMonth.get(month) ?? { total: 0, onTeam: 0 };
          byMonth.set(month, cell);
          cell.total += allocationPct;
          if (onTeam) cell.onTeam += allocationPct;
        }
      }
    }
  }

  return new Map(
    people.map((person) => {
      const byMonth = load.get(person.id);
      const teamFtePct = activeMembership(person.id, teamId, memberships)?.teamFtePct ?? 0;
      const free = Math.min(
        ...months.map((m) => {
          const cell = byMonth?.get(m);
          return Math.min(person.capacityPct - (cell?.total ?? 0), teamFtePct - (cell?.onTeam ?? 0));
        }),
      );
      // The epsilon keeps 100 - 60.000000000000001 style float dust from costing a whole point.
      return [person.id, Math.max(0, Math.floor(free + 1e-9))];
    }),
  );
}

const nameOrder = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/**
 * Who can still be added to a phase (§5.11, §7.2): the team's active members not yet allocated in it, most free
 * first, ties by name. `free` is computed only when `withFree` (the phase is open and not frozen) and is
 * undefined without a valid period; the list is then by name alone.
 */
export function allocatablePeople({
  plan,
  team,
  withFree,
  people,
  teams,
  memberships,
  initiatives,
  process,
  today,
}: {
  plan: Period & { allocations: { personId: string }[] };
  team: Team | undefined;
  withFree: boolean;
  people: Person[];
  teams: Team[];
  memberships: Membership[];
  initiatives: Initiative[];
  process: PhaseDef[];
  today: string;
}): { teamMembers: Person[]; addable: Person[]; free: Map<string, number> | undefined } {
  const teamMembers = team ? activeMembers(team.id, memberships, people) : [];
  const notYetAllocated = teamMembers.filter((p) => !plan.allocations.some((a) => a.personId === p.id));
  const free = withFree && team ? freeCapacityByPerson({ people: notYetAllocated, teamId: team.id, teams, memberships, period: plan, initiatives, process, today }) : undefined;
  const addable = [...notYetAllocated].sort((a, b) => (free?.get(b.id) ?? 0) - (free?.get(a.id) ?? 0) || nameOrder.compare(a.name, b.name));
  return { teamMembers, addable, free };
}
