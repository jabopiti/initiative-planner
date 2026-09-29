import type { PhaseDef } from '../brand/types';
import { iso, parseIso } from './dates';
import type { PhasePlan } from './types';

/** The number of days `year`-`month` has. */
function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** `year`-`month`, shifted by `months`, with that target month's own last day. */
function shiftMonth(year: number, month: number, months: number): { year: number; month: number; lastDay: number } {
  const index = year * 12 + (month - 1) + months;
  const nextYear = Math.floor(index / 12);
  const nextMonth = (index % 12) + 1;
  return { year: nextYear, month: nextMonth, lastDay: lastDayOfMonth(nextYear, nextMonth) };
}

/** The same day of the month, `months` later; a day the target month lacks becomes its last day. */
export function addMonths(isoDate: string, months: number): string {
  const [y, m, d] = parseIso(isoDate);
  const { year, month, lastDay } = shiftMonth(y, m, months);
  return iso(year, month, Math.min(d, lastDay));
}

/**
 * A month later (§5.11 Extend on overrun): the same day next month, a day the month lacks becoming
 * its last day; a date that is itself the last day of its month moves to the next month's last day
 * too (30 Sep → 31 Oct), since periods are day-precise and prorated (§7.1) — "30 Oct" would leave
 * 31 Oct uncovered.
 */
export function extendByOneMonth(isoDate: string): string {
  const [y, m, d] = parseIso(isoDate);
  const { year, month, lastDay } = shiftMonth(y, m, 1);
  return iso(year, month, d === lastDayOfMonth(y, m) ? lastDay : Math.min(d, lastDay));
}

function addDays(isoDate: string, days: number): string {
  const [y, m, d] = parseIso(isoDate);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return iso(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

/**
 * Chained periods (§5.11 default plan): the first starts on `startDate`; each ends the day before
 * the same day of the month `durations[i]` months later, and the next starts the day after.
 */
export function chainPeriods(startDate: string, durations: number[]): { startDate: string; endDate: string }[] {
  const periods: { startDate: string; endDate: string }[] = [];
  let start = startDate;
  for (const months of durations) {
    const end = addDays(addMonths(start, months), -1);
    periods.push({ startDate: start, endDate: end });
    start = addDays(end, 1);
  }
  return periods;
}

/** A period for every costed phase that has a default duration, chained from `today`; other phases get none. */
export function buildDefaultPlan(process: PhaseDef[], today: string): Record<string, PhasePlan> {
  const costed = process.filter((p) => p.costed && p.defaultDurationMonths);
  const periods = chainPeriods(today, costed.map((p) => p.defaultDurationMonths!));
  return Object.fromEntries(costed.map((phase, i) => [phase.id, { ...periods[i], allocations: [] }]));
}
