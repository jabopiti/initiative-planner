import type { PhaseDef } from '../brand/types';
import { activeLoads, fillFreePct, otherLoadMonths, warningMonths, type Load } from './capacity';
import type { Period } from './cost';
import { sortRows } from './sortRows';
import { activeMembers, activeMembership } from './teamMembers';
import type { Initiative, Membership, Person, Team } from './types';

/**
 * What each of `people` has free for a phase (§5.11, §7.2): the lower of their unused Team FTE % on the team
 * and their unused Capacity % across all teams, taken as the minimum over the phase's months from the current month
 * on (the months the warnings check), in whole percent rounded down so that using it can never trip a ceiling.
 * Provisional phases and initiatives that are not Active, or belong to an inactive team (§7.2), are left out. Never
 * below 0. Undefined when no month is left to check (no period yet, an inverted one, or one already over). Built on
 * the same per-month split as the load bar (`otherLoadMonths`), so the two can't disagree.
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
  loads = activeLoads({ initiatives, teams, process, today }),
}: {
  people: Person[];
  teamId: string;
  teams: Team[];
  memberships: Membership[];
  period: Period;
  initiatives: Initiative[];
  process: PhaseDef[];
  today: string;
  /** The portfolio's loads, when the caller has them already. */
  loads?: Load[];
}): Map<string, number> | undefined {
  const months = warningMonths(period.startDate, period.endDate, today);
  if (months.length === 0) return undefined;
  return new Map(
    people.map((person) => {
      const teamFtePct = activeMembership(person.id, teamId, memberships)?.teamFtePct ?? 0;
      const model = { months: otherLoadMonths(person.id, teamId, months, loads), teamFtePct, capacityPct: person.capacityPct };
      return [person.id, fillFreePct(model) ?? 0];
    }),
  );
}

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
  loads,
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
  /** The portfolio's loads, when the caller has them already. */
  loads?: Load[];
}): { teamMembers: Person[]; addable: Person[]; free: Map<string, number> | undefined } {
  const teamMembers = team ? activeMembers(team.id, memberships, people) : [];
  const notYetAllocated = teamMembers.filter((p) => !plan.allocations.some((a) => a.personId === p.id));
  const free = withFree && team ? freeCapacityByPerson({ people: notYetAllocated, teamId: team.id, teams, memberships, period: plan, initiatives, process, today, loads }) : undefined;
  const addable = sortRows(notYetAllocated, { free: (p) => free?.get(p.id) ?? 0, name: (p) => p.name }, 'free', 'desc', 'name');
  return { teamMembers, addable, free };
}
