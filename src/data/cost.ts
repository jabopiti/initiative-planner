import type { ApprovalTrackDef, PhaseDef } from '../brand/types';
import { monthKey, monthOf, parseIso } from './dates';
import { isPhaseFrozen } from './frozen';
import { isActiveMember } from './teamMembers';
import type { CostItem, Country, FrozenPhaseSnapshot, Initiative, Membership, PhasePlan, Person, Role, Team } from './types';

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

/** Whether a period has both dates set and isn't inverted (§7.1) — the period-validity rule every "is this phase costed/estimated/planned" check starts from. */
export function hasValidPeriod(period: Period): boolean {
  return Boolean(period.startDate && period.endDate && period.startDate <= period.endDate);
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

/** The calendar months of a period, or none while a date is unset or the period is inverted: a phase without months is not costed yet (§7.1). */
export function periodMonths(period: Period): string[] {
  return period.startDate && period.endDate ? monthsInRange(period.startDate, period.endDate) : [];
}

/**
 * A cost item's amount by month over a period's `months` (§7.1): the full amount in its one month, or an equal share
 * of every calendar month the period touches (the partial first and last months are not prorated). Empty without a
 * valid period, so an item counts only once its phase is costed; a one-month item outside the period still counts.
 */
function spreadItem(months: string[], item: CostItem): Record<string, number> {
  if (months.length === 0) return {};
  if (item.timing === 'month') return item.month ? { [item.month]: item.amount } : {};
  return Object.fromEntries(months.map((key) => [key, item.amount / months.length]));
}

/** Whether a one-month item lies outside a valid period's `months` (§6): it stays and counts, and the phase warns. */
export function isOutsidePeriod(months: string[], item: CostItem): boolean {
  return item.timing === 'month' && Boolean(item.month) && months.length > 0 && !months.includes(item.month!);
}

/** A phase's monthly estimate (§7.1): its allocations' cost and its cost items, month by month. An allocation whose person no longer exists adds nothing. */
export function phaseByMonth(plan: PhasePlan, people: Person[], data: RateData): Record<string, number> {
  const byMonth: Record<string, number> = {};
  const add = (amounts: Record<string, number>) => {
    for (const [key, amount] of Object.entries(amounts)) byMonth[key] = (byMonth[key] ?? 0) + amount;
  };
  for (const allocation of plan.allocations) {
    const person = people.find((p) => p.id === allocation.personId);
    if (person) add(allocationFigures(plan, person, allocation.allocationPct, data).byMonth);
  }
  const months = periodMonths(plan);
  for (const item of plan.costItems ?? []) add(spreadItem(months, item));
  return byMonth;
}

/** A phase's cost: its monthly estimate summed. */
export function phaseTotal(plan: PhasePlan, people: Person[], data: RateData): number {
  return Object.values(phaseByMonth(plan, people, data)).reduce((sum, amount) => sum + amount, 0);
}

/**
 * Every month a phase costs something in: its period, any recorded actual that falls outside it, and any
 * one-month cost item's month (each a warning case, not a separate range — §7.3, §6).
 */
export function phaseMonths(plan: PhasePlan): string[] {
  const keys = new Set<string>(periodMonths(plan));
  for (const key of Object.keys(plan.actualMonths ?? {})) keys.add(key);
  for (const item of plan.costItems ?? []) if (item.timing === 'month' && item.month) keys.add(item.month);
  return [...keys].sort();
}

/**
 * Recorded actual where there is one, the estimate otherwise, for every month the phase costs something in
 * (§7.3). Pass `estimateByMonth` when the caller already has it (from {@link phaseByMonth}), so it isn't
 * walked twice.
 */
export function phaseBlendedByMonth(plan: PhasePlan, people: Person[], data: RateData, estimateByMonth: Record<string, number> = phaseByMonth(plan, people, data)): Record<string, number> {
  const actuals = plan.actualMonths ?? {};
  const out: Record<string, number> = {};
  for (const key of phaseMonths(plan)) out[key] = actuals[key] ?? estimateByMonth[key] ?? 0;
  return out;
}

/** The blended total (§7.3): a phase's grand estimate contribution once actuals are folded in. */
export function phaseBlendedTotal(plan: PhasePlan, people: Person[], data: RateData, estimateByMonth?: Record<string, number>): number {
  return Object.values(phaseBlendedByMonth(plan, people, data, estimateByMonth)).reduce((total, amount) => total + amount, 0);
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
  const months = phaseMonths(plan);
  const actuals = plan.actualMonths ?? {};
  const recorded = months.filter((key) => actuals[key] !== undefined).length;
  if (recorded === 0) return 'estimate';
  return recorded === months.length ? 'actual' : 'forecast';
}

/** Recorded actuals minus their estimates, over the months that have one; undefined until at least one is recorded (§4). */
export function phaseDeviation(plan: PhasePlan, people: Person[], data: RateData): number | undefined {
  const actuals = plan.actualMonths;
  if (!actuals || Object.keys(actuals).length === 0) return undefined;
  const estimate = phaseByMonth(plan, people, data);
  let total = 0;
  for (const [month, amount] of Object.entries(actuals)) total += amount - (estimate[month] ?? 0);
  return total;
}

/** Why a person can't be allocated to this team's initiative, or null when they can (§7.2). */
export function allocationRefusal(person: Person, team: Team, memberships: Membership[]): string | null {
  return isActiveMember(person, team.id, memberships) ? null : `${person.name} isn't a member of ${team.name}. Only team members can be allocated.`;
}

/** The parse every amount and rate field shares: blank, not a number or negative is rejected. */
export function parseAmount(text: string): number | null {
  if (text.trim() === '') return null;
  const value = Number(text);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

/** A frozen phase's months, for the same reasons {@link phaseMonths} gives a live one's: its period, and any recorded actual or one-month item outside it. */
export function frozenPhaseMonths(snapshot: FrozenPhaseSnapshot, actualMonths: Record<string, number> | undefined): string[] {
  return phaseMonths({ startDate: snapshot.startDate, endDate: snapshot.endDate, allocations: [], costItems: snapshot.costItems, actualMonths });
}

/**
 * A frozen phase's blended total (§7.3, §8.1): the snapshot's monthly estimate, with any actuals recorded since
 * folded in, never recalculated from live people or rate data — the whole point of freezing.
 */
export function frozenBlendedTotal(snapshot: FrozenPhaseSnapshot, actualMonths: Record<string, number> | undefined): number {
  const actuals = actualMonths ?? {};
  return frozenPhaseMonths(snapshot, actualMonths).reduce((total, month) => total + (actuals[month] ?? snapshot.estimateByMonth[month] ?? 0), 0);
}

/**
 * A costed phase's blended total (§7.3, §8.1): its frozen snapshot's once its own gate has passed — so a later
 * master-data change can never move it — and its live plan's otherwise. Zero for a phase never planned yet, or
 * for a non-costed phase's passed gate (which has no snapshot to freeze). Pass `estimateByMonth` when the
 * caller already has the live phase's monthly estimate, so it isn't walked twice.
 */
export function phaseEffectiveTotal(initiative: Initiative, phaseId: string, people: Person[], data: RateData, estimateByMonth?: Record<string, number>): number {
  const plan = initiative.phases?.[phaseId];
  const snapshot = isPhaseFrozen(initiative, phaseId) ? initiative.gates![phaseId].frozenSnapshot : undefined;
  if (snapshot) return frozenBlendedTotal(snapshot, plan?.actualMonths);
  return plan ? phaseBlendedTotal(plan, people, data, estimateByMonth) : 0;
}

/**
 * An initiative's grand estimate (§4): the blended total of every costed phase (see {@link phaseEffectiveTotal}).
 */
export function grandEstimate(initiative: Initiative, process: PhaseDef[], people: Person[], data: RateData): number {
  let total = 0;
  for (const phase of process) {
    if (phase.costed) total += phaseEffectiveTotal(initiative, phase.id, people, data);
  }
  return total;
}

/**
 * An initiative's deviation (§4): recorded actuals minus their estimates, summed over every costed phase and
 * every month that has one. A frozen phase compares against its own frozen estimate, never a live recompute,
 * for the same reason {@link grandEstimate} does. Zero, not undefined, when nothing has been recorded yet.
 */
export function grandDeviation(initiative: Initiative, process: PhaseDef[], people: Person[], data: RateData): number {
  let total = 0;
  for (const phase of process) {
    if (!phase.costed) continue;
    const plan = initiative.phases?.[phase.id];
    if (!plan) continue;
    if (isPhaseFrozen(initiative, phase.id)) {
      const snapshot = initiative.gates![phase.id].frozenSnapshot!;
      for (const [month, amount] of Object.entries(plan.actualMonths ?? {})) total += amount - (snapshot.estimateByMonth[month] ?? 0);
      continue;
    }
    total += phaseDeviation(plan, people, data) ?? 0;
  }
  return total;
}

/** The approval track a total resolves to (§7.4): bounds lower-inclusive, upper-exclusive; `null` when no band covers it. */
export function resolveApprovalTrack(tracks: ApprovalTrackDef[], total: number): ApprovalTrackDef | null {
  for (const track of tracks) {
    const aboveLower = total >= track.lowerBound;
    const belowUpper = track.upperBound === undefined || total < track.upperBound;
    if (aboveLower && belowUpper) return track;
  }
  return null;
}
