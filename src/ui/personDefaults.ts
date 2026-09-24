import type { Country, Role } from '../data/types';

const LAST_COUNTRY_KEY = 'initiative-planner/last-used-country';
const LAST_ROLE_KEY = 'initiative-planner/last-used-role';

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null; // Convenience only; falling back to the first active entry is fine.
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Non-essential: losing it just reverts the default next time.
  }
}

/** Country and role default to the last values used (§5.5), else the first active entry. */
export function defaultCountryId(countries: Country[]): string {
  const active = countries.filter((c) => c.active);
  const last = read(LAST_COUNTRY_KEY);
  return (active.find((c) => c.id === last) ?? active[0])?.id ?? '';
}

export function defaultRoleId(roles: Role[]): string {
  const active = roles.filter((r) => r.active);
  const last = read(LAST_ROLE_KEY);
  return (active.find((r) => r.id === last) ?? active[0])?.id ?? '';
}

export function rememberPersonDefaults(countryId: string, roleId: string): void {
  write(LAST_COUNTRY_KEY, countryId);
  write(LAST_ROLE_KEY, roleId);
}
