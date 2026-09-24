import type { PhaseDef } from '../brand/types';
import { iso, parseIso } from './dates';
import type { PhasePlan } from './types';

/** The same day of the month, `months` later; a day the target month lacks becomes its last day. */
function addMonths(isoDate: string, months: number): string {
  const [y, m, d] = parseIso(isoDate);
  const index = y * 12 + (m - 1) + months;
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return iso(year, month, Math.min(d, lastDay));
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
