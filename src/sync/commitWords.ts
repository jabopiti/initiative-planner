import { formatMonthEn } from '../data/dates';
import type { CommitNote, EntityKind } from './FileWriter';
import type { Allocation, CostItem, Country, Membership, Person, Role, Team } from '../data/types';

/**
 * The plain-words subject lines of commit messages (§10.3). Each takes the record as it was and as it is
 * (`undefined` for added / removed) and names the net change, so a message never describes a state that was not
 * saved. Pure: whatever a line must look up (a name, a currency) comes in as an argument.
 */

export type Words<T> = (from: T | undefined, to: T | undefined) => string;

/** The net change of a role, in plain words; the subject is the name it was saved under. */
export const roleWords: Words<Role> = (from, to) => {
  if (!from) return `Roles: ${to?.name} added`;
  if (!to) return `Roles: ${from.name} removed`;
  const parts: string[] = [];
  if (to.name !== from.name) parts.push(`renamed to ${to.name}`);
  if (to.abbreviation !== from.abbreviation) parts.push(`abbreviation set to ${to.abbreviation}`);
  if (to.costFactor !== from.costFactor) parts.push(`cost factor set to ${to.costFactor}`);
  if (to.active !== from.active) parts.push(to.active ? 'reactivated' : 'deactivated');
  return `Roles: ${from.name} ${parts.join(', ') || 'updated'}`;
};

export const countryWords: Words<Country> = (from, to) => {
  if (!from) return `Countries: ${to?.name} added`;
  if (!to) return `Countries: ${from.name} removed`;
  const parts: string[] = [];
  if (to.name !== from.name) parts.push(`renamed to ${to.name}`);
  if (to.code !== from.code) parts.push(`code set to ${to.code}`);
  if (to.active !== from.active) parts.push(to.active ? 'reactivated' : 'deactivated');
  return `Countries: ${from.name} ${parts.join(', ') || 'updated'}`;
};

export const teamWords: Words<Team> = (from, to) => {
  if (!from) return `${to?.name}: team created`;
  if (to && to.name !== from.name) return `${from.name}: team renamed to ${to.name}`;
  return `${from.name}: team ${to?.active ? 'reactivated' : 'deactivated'}`;
};

/** Looked up when the message is rendered, not when the note is made: a name may change in between. Unknown ids read as "unknown". */
export interface PersonLookups {
  countryName: (id: string) => string | undefined;
  roleName: (id: string) => string | undefined;
}

/** The net change of a person: one subject, the name it was saved under, then each change. */
export function personWords(lookups: PersonLookups): Words<Person> {
  return (from, to) => {
    if (!from) return `${to?.name}: person added`;
    if (!to) return `${from.name}: person removed`;
    const parts: string[] = [];
    if (to.name !== from.name) parts.push(`renamed to ${to.name}`);
    if (to.countryId !== from.countryId) {
      parts.push(`country set to ${lookups.countryName(to.countryId) ?? 'unknown'}`);
    }
    if (to.roleId !== from.roleId) {
      parts.push(`role set to ${lookups.roleName(to.roleId) ?? 'unknown'}`);
    }
    parts.push(...customRoleChanges(from, to, lookups));
    if (to.capacityPct !== from.capacityPct) parts.push(`capacity set to ${to.capacityPct}%`);
    if (to.active !== from.active) parts.push(to.active ? 'reactivated' : 'deactivated');
    return `${from.name}: ${parts.join(', ') || 'updated'}`;
  };
}

function customRoleChanges(current: Person, next: Person, lookups: PersonLookups): string[] {
  const before = current.customRole;
  const after = next.customRole;
  if (!after) return [];
  const parts: string[] = [];
  if (after.active && !before?.active) parts.push(`custom role set to ${after.label.trim() || 'Custom role'}`);
  if (!after.active && before?.active) {
    parts.push(`back to standard role ${lookups.roleName(next.roleId) ?? 'unknown'}`);
  }
  if (before && after.label !== before.label) parts.push(`custom role renamed to ${after.label.trim() || 'Custom role'}`);
  if (before && after.costFactor !== before.costFactor) parts.push(`custom role cost factor set to ${after.costFactor}`);
  const years = new Set([...(before?.dayRatesByYear ?? []), ...after.dayRatesByYear].map((r) => r.year));
  for (const year of [...years].sort()) {
    const was = before?.dayRatesByYear.find((r) => r.year === year)?.dayRate;
    const now = after.dayRatesByYear.find((r) => r.year === year)?.dayRate;
    if (was === now) continue;
    parts.push(now === undefined ? `${year} custom day rate cleared` : `${year} custom day rate set to ${now}`);
  }
  return parts;
}

/** A membership's words; the person and team are named as they are now, since a removal leaves no record to ask. */
export function membershipWords(where: string): Words<Membership> {
  return (f, t) => {
    if (!f) return `added to ${where} at ${t?.teamFtePct}%`;
    if (!t) return `removed from ${where}`;
    const parts: string[] = [];
    const rejoined = !f.active && t.active;
    if (rejoined) parts.push(`rejoined ${where}`);
    if (t.teamFtePct !== f.teamFtePct) parts.push(rejoined ? `Team FTE % set to ${t.teamFtePct}%` : `Team FTE % on ${where} set to ${t.teamFtePct}%`);
    if (f.active && !t.active) parts.push(`deactivated on ${where}`);
    return parts.join(', ') || 'updated';
  };
}

/** What a phase-plan item's words need from the initiative: a person's name and an amount as the deployment writes money. */
export interface ItemLookups {
  personName: (id: string) => string;
  money: (amount: number) => string;
}

/** An allocation's words: the initiative, the person, the phase. */
export function allocationWords({ personName }: ItemLookups) {
  return (from: Allocation | undefined, to: Allocation | undefined, name: string, phase: string): string => {
    const who = personName((from ?? to)?.personId as string);
    if (!from) return `${name}: ${who} added to ${phase} at ${to?.allocationPct}%`;
    if (!to) return `${name}: ${who} removed from ${phase}`;
    return `${name}: ${who} set to ${to.allocationPct}% in ${phase}`;
  };
}

/** A cost item's words: the initiative, the phase, the item as it was saved. */
export function costItemWords({ money }: ItemLookups) {
  return (from: CostItem | undefined, to: CostItem | undefined, name: string, phase: string): string => {
    if (!from) return `${name}: ${to?.label} added to ${phase} at ${money(to?.amount as number)}`;
    if (!to) return `${name}: ${from.label} removed from ${phase}`;
    const parts: string[] = [];
    if (to.label !== from.label) parts.push(`renamed to ${to.label}`);
    if (to.amount !== from.amount) parts.push(`amount set to ${money(to.amount)}`);
    if (to.timing !== from.timing || to.month !== from.month) {
      parts.push(to.timing === 'spread' || !to.month ? 'spread over the phase' : `timed to ${formatMonthEn(to.month)}`);
    }
    return `${name}: ${phase} cost item ${from.label} ${parts.join(', ') || 'updated'}`;
  };
}

/** A note for one field of one entity: what it was before the edit and what it is now (§10.3); `undefined` is "did not exist". */
export function note<T>(kind: EntityKind, id: string, field: string, from: T | undefined, to: T | undefined, words: Words<T>): CommitNote {
  return { entity: { kind, id }, field, from, to, words: words as CommitNote['words'] };
}

/** A person's name as it is now; a commit message about a removal has no record left to ask. */
export const personName = (state: { people: Person[] }, id: string): string => state.people.find((p) => p.id === id)?.name ?? 'Unknown person';

export const teamName = (state: { teams: Team[] }, id: string): string => state.teams.find((t) => t.id === id)?.name ?? 'unknown team';
