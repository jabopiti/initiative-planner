import { monthKey, monthOf, parseIso } from './dates';
import { isActiveMember } from './teamMembers';
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

function parseDate(isoDate: string): Date {
  const [y, m, d] = parseIso(isoDate);
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
 * The record for `year`, or, for a year with none, the nearest earlier one (the copy-from-preceding-year
 * rule of §7.2; so beyond the latest takes the latest). Before the earliest takes the earliest. Never a
 * fallback to zero.
 */
export function yearRecord<T extends { year: number }>(records: T[], year: number): T | undefined {
  if (records.length === 0) return undefined;
  const direct = records.find((r) => r.year === year);
  if (direct) return direct;
  const sorted = [...records].sort((a, b) => a.year - b.year);
  const earlier = sorted.filter((r) => r.year < year);
  return earlier.length > 0 ? earlier[earlier.length - 1] : sorted[0];
}

/** The tracked window (§7.2): the current calendar year and the next two. */
export function trackedYears(today: Date = new Date()): number[] {
  const year = today.getFullYear();
  return [year, year + 1, year + 2];
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
 * The single place a person's rate and factor are derived (§7.2). A custom role brings its own day
 * rate and cost factor, replacing the country rate and the standard role's factor. Null when the rate can't be resolved
 * (a country or role that no longer exists), so a caller costs it as zero instead of throwing.
 */
export function resolveRate(person: Person, data: RateData, year: number): { dayRate: number; factor: number } | null {
  if (person.customRole?.active) {
    const record = yearRecord(person.customRole.dayRatesByYear, year);
    return record ? { dayRate: record.dayRate, factor: person.customRole.costFactor } : null;
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

/** A phase's labour cost, month by month: its allocations' monthly figures summed (§7.1). */
export function phaseLabourByMonth(plan: PhasePlan, people: Person[], data: RateData): Record<string, number> {
  const out: Record<string, number> = {};
  for (const allocation of plan.allocations) {
    const person = people.find((p) => p.id === allocation.personId);
    if (!person) continue;
    for (const [key, amount] of Object.entries(allocationFigures(plan, person, allocation.allocationPct, data).byMonth)) {
      out[key] = (out[key] ?? 0) + amount;
    }
  }
  return out;
}

/**
 * A phase's estimated cost, month by month: labour today, plus cost items once slice 007 adds them to the
 * data model (§6, §7.1).
 */
export function phaseEstimateByMonth(plan: PhasePlan, people: Person[], data: RateData): Record<string, number> {
  return phaseLabourByMonth(plan, people, data);
}

/**
 * Every month a phase costs something in: its period, plus any recorded actual that falls outside it (a
 * warning case, not a separate range — §7.3, §6). Cost-item months join this once slice 007 lands.
 */
export function phaseMonths(period: Period, actualMonths?: Record<string, number>): string[] {
  const keys = new Set<string>();
  if (period.startDate && period.endDate) {
    for (const key of monthsInRange(period.startDate, period.endDate)) keys.add(key);
  }
  for (const key of Object.keys(actualMonths ?? {})) keys.add(key);
  return [...keys].sort();
}

/** Recorded actual where there is one, the estimate otherwise, for every month the phase costs something in (§7.3). */
export function phaseBlendedByMonth(plan: PhasePlan, people: Person[], data: RateData): Record<string, number> {
  const estimate = phaseEstimateByMonth(plan, people, data);
  const actuals = plan.actualMonths ?? {};
  const out: Record<string, number> = {};
  for (const key of phaseMonths(plan, plan.actualMonths)) out[key] = actuals[key] ?? estimate[key] ?? 0;
  return out;
}

/** The blended total (§7.3): a phase's grand estimate contribution once actuals are folded in. */
export function phaseBlendedTotal(plan: PhasePlan, people: Person[], data: RateData): number {
  return Object.values(phaseBlendedByMonth(plan, people, data)).reduce((total, amount) => total + amount, 0);
}

/**
 * A month's actual once recorded — or, once that month has closed, the estimate it defaults to until someone
 * records one (§7.3). `undefined` for a month that hasn't closed yet, so a caller can tell "not closed yet"
 * apart from "using the estimate". Unconditional per §7.3: an estimate of exactly 0 still defaults and
 * displays (decided in slice 010 review, engine-audit.md).
 */
export function actualOrEstimate(plan: PhasePlan, month: string, today: string, estimateByMonth: Record<string, number>): number | undefined {
  const recorded = plan.actualMonths?.[month];
  if (recorded !== undefined) return recorded;
  if (month >= monthOf(today)) return undefined;
  return estimateByMonth[month] ?? 0;
}

/** Estimate / Forecast / Actual, by how far recorded actuals cover the phase's months (§4). */
export function phaseCoverage(plan: PhasePlan): 'estimate' | 'forecast' | 'actual' {
  const months = phaseMonths(plan, plan.actualMonths);
  const actuals = plan.actualMonths ?? {};
  const recorded = months.filter((key) => actuals[key] !== undefined).length;
  if (recorded === 0) return 'estimate';
  return recorded === months.length ? 'actual' : 'forecast';
}

/** Recorded actuals minus their estimates, over the months that have one; undefined until at least one is recorded (§4). */
export function phaseDeviation(plan: PhasePlan, people: Person[], data: RateData): number | undefined {
  const actuals = plan.actualMonths;
  if (!actuals || Object.keys(actuals).length === 0) return undefined;
  const estimate = phaseEstimateByMonth(plan, people, data);
  let total = 0;
  for (const [month, amount] of Object.entries(actuals)) total += amount - (estimate[month] ?? 0);
  return total;
}

/** Why a person can't be allocated to this team's initiative, or null when they can (§7.2). */
export function allocationRefusal(person: Person, team: Team, memberships: Membership[]): string | null {
  return isActiveMember(person, team.id, memberships) ? null : `${person.name} isn't a member of ${team.name}. Only team members can be allocated.`;
}
