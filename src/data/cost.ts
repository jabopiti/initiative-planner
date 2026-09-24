import type { Country, Membership, PhasePlan, Person, Role, Team } from './types';

/**
 * The cost of an allocation (§7.1), ported from the audited prototype engine
 * (engine-audit.md: every function here is "Reuse as-is"), adapted to the
 * dataset's array-shaped per-year records. Amounts are unrounded; rounding is
 * a display concern.
 */

export interface RateData {
  roles: Role[];
  countries: Country[];
}

/** The part of a phase that determines its months: two dates, either of which may still be unset. */
export interface Period {
  startDate?: string;
  endDate?: string;
}

/** `YYYY-MM` (§6 Month encoding). `month` is 0-based. */
function monthKey(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

function parseDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** Every month key from the start date's month to the end date's month, inclusive; empty when inverted. */
export function monthsInRange(startIso: string, endIso: string): string[] {
  const start = parseDate(startIso);
  const end = parseDate(endIso);
  if (end < start) return [];

  const keys: string[] = [];
  let year = start.getUTCFullYear();
  let month = start.getUTCMonth();
  const lastYear = end.getUTCFullYear();
  const lastMonth = end.getUTCMonth();
  while (year < lastYear || (year === lastYear && month <= lastMonth)) {
    keys.push(monthKey(year, month));
    month += 1;
    if (month === 12) {
      month = 0;
      year += 1;
    }
  }
  return keys;
}

/**
 * The record for `year`, or, outside the tracked years, the nearest one: before the earliest
 * takes the earliest, beyond the latest takes the latest (§7.2), never a fallback to zero.
 */
export function yearRecord<T extends { year: number }>(records: T[], year: number): T | undefined {
  if (records.length === 0) return undefined;
  const direct = records.find((r) => r.year === year);
  if (direct) return direct;
  const sorted = [...records].sort((a, b) => a.year - b.year);
  return year < sorted[0].year ? sorted[0] : sorted[sorted.length - 1];
}

/** Weekdays (Monday to Friday) in a calendar month. `month` is 0-based. */
export function weekdaysInMonth(year: number, month: number): number {
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  let count = 0;
  for (let day = 1; day <= days; day += 1) {
    const weekday = new Date(Date.UTC(year, month, day)).getUTCDay();
    if (weekday !== 0 && weekday !== 6) count += 1;
  }
  return count;
}

function weekdaysBetween(from: Date, to: Date): number {
  let count = 0;
  for (const cursor = new Date(from.getTime()); cursor <= to; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const weekday = cursor.getUTCDay();
    if (weekday !== 0 && weekday !== 6) count += 1;
  }
  return count;
}

/**
 * The country's working days per month across a period (§7.1). A month wholly inside the period
 * counts in full; the first and last months are prorated by the share of that month's weekdays
 * the period covers. Empty when either date is unset or the period is inverted.
 */
export function workingDaysForPeriod(country: Country, startIso?: string, endIso?: string): Record<string, number> {
  if (!startIso || !endIso) return {};
  const start = parseDate(startIso);
  const end = parseDate(endIso);

  const out: Record<string, number> = {};
  for (const key of monthsInRange(startIso, endIso)) {
    const [year, month1] = key.split('-').map(Number);
    const month = month1 - 1;
    const monthStart = new Date(Date.UTC(year, month, 1));
    const monthEnd = new Date(Date.UTC(year, month + 1, 0));

    const totalWeekdays = weekdaysInMonth(year, month);
    const whole = Math.max(0, yearRecord(country.ratesByYear, year)?.workingDaysByMonth[month] ?? 0);
    const covered = weekdaysBetween(start > monthStart ? start : monthStart, end < monthEnd ? end : monthEnd);
    out[key] = totalWeekdays === 0 ? 0 : whole * (covered / totalWeekdays);
  }
  return out;
}

/**
 * The single place a person's rate and factor are derived (§7.2). A custom rate is absolute: it
 * replaces the country rate and bypasses the role factor. Null when the rate can't be resolved
 * (a country or role that no longer exists), so a caller costs it as zero instead of throwing.
 */
export function resolveRate(person: Person, data: RateData, year: number): { dayRate: number; factor: number } | null {
  if (person.customRole) {
    const record = yearRecord(person.customRole.dayRatesByYear, year);
    return record ? { dayRate: record.dayRate, factor: 1 } : null;
  }
  const country = data.countries.find((c) => c.id === person.countryId);
  const role = data.roles.find((r) => r.id === person.roleId);
  const record = country && yearRecord(country.ratesByYear, year);
  if (!role || !record) return null;
  return { dayRate: record.dayRate, factor: role.costFactor };
}

export interface AllocationFigures {
  byMonth: Record<string, number>;
  /** Working days × Allocation % over the period. The role factor is a cost weight, not time. */
  personDays: number;
  cost: number;
}

/** What one allocation costs across a period, month by month (§7.1). */
export function allocationFigures(period: Period, person: Person, allocationPct: number, data: RateData): AllocationFigures {
  const none: AllocationFigures = { byMonth: {}, personDays: 0, cost: 0 };
  const country = data.countries.find((c) => c.id === person.countryId);
  if (!country) return none;

  const byMonth: Record<string, number> = {};
  let personDays = 0;
  let cost = 0;
  for (const [key, workingDays] of Object.entries(workingDaysForPeriod(country, period.startDate, period.endDate))) {
    const rate = resolveRate(person, data, Number(key.slice(0, 4)));
    if (!rate) continue;
    const days = workingDays * (allocationPct / 100);
    personDays += days;
    byMonth[key] = days * rate.factor * rate.dayRate;
    cost += byMonth[key];
  }
  return { byMonth, personDays, cost };
}

/** A phase's labour cost: its allocations summed. An allocation whose person no longer exists adds nothing. */
export function phaseTotal(plan: PhasePlan, people: Person[], data: RateData): number {
  let total = 0;
  for (const allocation of plan.allocations) {
    const person = people.find((p) => p.id === allocation.personId);
    if (person) total += allocationFigures(plan, person, allocation.allocationPct, data).cost;
  }
  return total;
}

/** Why a person can't be allocated to this team's initiative, or null when they can (§7.2). */
export function allocationRefusal(person: Person, team: Team, memberships: Membership[]): string | null {
  const isMember = memberships.some((m) => m.personId === person.id && m.teamId === team.id && m.active);
  return isMember ? null : `${person.name} isn't a member of ${team.name}. Only team members can be allocated.`;
}
