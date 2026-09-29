import { isPhaseFrozen } from './frozen';
import type { Initiative, Person } from './types';

/**
 * How many initiatives a role's cost-factor change would affect (§5.9, §8.1): those with an unfrozen
 * allocation of a person whose standard role is this one. A person whose active custom role (§6) currently
 * replaces the standard role's factor is excluded — the edit has no effect on their cost while that's active.
 */
export function initiativesAffectedByRole(roleId: string, initiatives: Initiative[], people: Person[]): number {
  const affected = new Set(people.filter((p) => p.roleId === roleId && !p.customRole?.active).map((p) => p.id));
  if (affected.size === 0) return 0;

  let count = 0;
  for (const initiative of initiatives) {
    const phases = initiative.phases ?? {};
    const hit = Object.entries(phases).some(
      ([phaseId, plan]) => !isPhaseFrozen(initiative, phaseId) && plan.allocations.some((a) => affected.has(a.personId)),
    );
    if (hit) count += 1;
  }
  return count;
}
