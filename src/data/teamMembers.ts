import type { Membership, Person } from './types';

/** The person's active membership of a team, if any. */
export function activeMembership(personId: string, teamId: string, memberships: Membership[]): Membership | undefined {
  return memberships.find((m) => m.personId === personId && m.teamId === teamId && m.active);
}

/**
 * Whether a person is an active member of a team: an active membership held
 * by an active person (§4). A deactivated person is a member of no team,
 * whatever their membership records say; the records are kept, so
 * reactivating them restores it (§5.6).
 */
export function isActiveMember(person: Person, teamId: string, memberships: Membership[]): boolean {
  return person.active && activeMembership(person.id, teamId, memberships) !== undefined;
}

/** A team's active members, each once. Team size (§5.7) and who can be allocated (§7.2) both use this. */
export function activeMembers(teamId: string, memberships: Membership[], people: Person[]): Person[] {
  return people.filter((p) => isActiveMember(p, teamId, memberships));
}
