import { isActiveMember } from './teamMembers';
import type { Allocation, Initiative, Membership, Person, Team } from './types';

type AllocationShare = Pick<Allocation, 'personId' | 'allocationPct'>;

/** What Copy from <previous phase> would do: who carries over with the same Allocation %, and who is skipped (§5.11). */
export interface CopyPlan {
  copy: AllocationShare[];
  skipped: Person[];
}

/** The allocations to copy from: a passed gate's frozen snapshot, else the phase's live plan (§8.1). */
export function copySource(initiative: Initiative, phaseId: string): AllocationShare[] {
  return initiative.gates?.[phaseId]?.frozenSnapshot?.allocations ?? initiative.phases?.[phaseId]?.allocations ?? [];
}

/** Each source allocation whose person is an active member of the team is copied, in order; everyone else is skipped. */
export function planCopy(source: AllocationShare[], team: Team, people: Person[], memberships: Membership[]): CopyPlan {
  const plan: CopyPlan = { copy: [], skipped: [] };
  for (const { personId, allocationPct } of source) {
    const person = people.find((p) => p.id === personId);
    if (person && isActiveMember(person, team.id, memberships)) plan.copy.push({ personId, allocationPct });
    else if (person) plan.skipped.push(person);
  }
  return plan;
}

/** "Not copied: Lucía Ramos, no longer on Platform." — and "Nothing copied. " first when nobody was (§9.2). */
export function skippedNote(skipped: Person[], copied: number, team: Team): string {
  const note = `Not copied: ${skipped.map((p) => p.name).join(', ')}, no longer on ${team.name}.`;
  return copied === 0 ? `Nothing copied. ${note}` : note;
}
