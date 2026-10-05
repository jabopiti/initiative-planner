import { freeCapacity, otherLoadMonths, warningMonths, type Load, type OtherLoadMonth } from './capacity';
import type { Period } from './cost';
import { sortRows } from './sortRows';
import { activeMembers, activeMembership } from './teamMembers';
import type { Membership, Person, Team } from './types';

/** What a person has free for a phase, and the month that sets it, with the work behind it (§5.4, §5.11). */
export interface FreeCapacity {
  pct: number;
  limiting: OtherLoadMonth;
}

/**
 * What each of `people` has free for a phase (§5.11, §7.2): the lower of their unused Team FTE % on the team
 * and their unused Capacity % across all teams, taken as the minimum over the phase's months from the current month
 * on (the months the warnings check), in whole percent rounded down so that using it can never trip a ceiling.
 * `loads` are the portfolio's (`activeLoads`), so Provisional phases and initiatives that are not counted are left
 * out (§7.2). Never below 0. Undefined when no month is left to check (no period yet, an inverted one, or one
 * already over). The same calculation as the load bar's Fill free (`freeCapacity`), so the two can't disagree.
 */
export function freeCapacityByPerson({
  people,
  teamId,
  memberships,
  period,
  today,
  loads,
}: {
  people: Person[];
  teamId: string;
  memberships: Membership[];
  period: Period;
  today: string;
  loads: Load[];
}): Map<string, FreeCapacity> | undefined {
  const months = warningMonths(period, today);
  if (months.length === 0) return undefined;
  return new Map(
    people.map((person) => {
      const teamFtePct = activeMembership(person.id, teamId, memberships)?.teamFtePct ?? 0;
      // A Team FTE % always applies here, so with months there is always a figure.
      return [person.id, freeCapacity(otherLoadMonths(person.id, teamId, months, loads), { teamFtePct, capacityPct: person.capacityPct })!];
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
  memberships,
  today,
  loads,
}: {
  plan: Period & { allocations: { personId: string }[] };
  team: Team | undefined;
  withFree: boolean;
  people: Person[];
  memberships: Membership[];
  today: string;
  /** The portfolio's loads (`activeLoads`). */
  loads: Load[];
}): { teamMembers: Person[]; addable: Person[]; free: Map<string, FreeCapacity> | undefined } {
  const teamMembers = team ? activeMembers(team.id, memberships, people) : [];
  const notYetAllocated = teamMembers.filter((p) => !plan.allocations.some((a) => a.personId === p.id));
  const free = withFree && team ? freeCapacityByPerson({ people: notYetAllocated, teamId: team.id, memberships, period: plan, today, loads }) : undefined;
  const addable = sortRows(notYetAllocated, { free: (p) => free?.get(p.id)?.pct ?? 0, name: (p) => p.name }, 'free', 'desc', 'name');
  return { teamMembers, addable, free };
}
