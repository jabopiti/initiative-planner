import type { Person, Role } from './types';

/** The role a person is shown with in tables and pickers: their custom label while it is in use (§6), else the standard role's name. */
export function roleLabel(person: Person, roles: Role[]): string {
  if (person.customRole?.active) return person.customRole.label.trim() || 'Custom role';
  return roles.find((r) => r.id === person.roleId)?.name ?? '—';
}
