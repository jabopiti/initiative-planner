import type { Membership, Person } from './types';

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
