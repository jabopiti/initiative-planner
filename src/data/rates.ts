import { periodMonths, weekdaysInMonth, yearRecord } from './cost';
import { isPhaseFrozen } from './frozen';
import type { Country, CountryYearRateRecord, Initiative, Person } from './types';

/** The weekdays (Monday to Friday) of each month of `year`: working days before anyone adjusts them (§6). */
export function weekdaysByMonth(year: number): number[] {
  return Array.from({ length: 12 }, (_, month) => weekdaysInMonth(year, month));
}

/** A new country's entry for each year of the window (§5.9): one day rate for all, working days as weekdays. */
export function newCountryRates(dayRate: number, years: number[]): CountryYearRateRecord[] {
  return years.map((year) => ({ year, dayRate, workingDaysByMonth: weekdaysByMonth(year) }));
}

/**
 * `records` with an entry for each tracked year it lacks (§7.2), made by `make` from the preceding year's entry
 * (the nearest earlier one, or the earliest when none is earlier). Null when nothing is missing — or nothing
 * exists to copy from — so the rollover is idempotent.
 */
function rolledForward<R extends { year: number }>(records: R[], tracked: number[], make: (year: number, previous: R) => R): R[] | null {
  const missing = records.length === 0 ? [] : tracked.filter((year) => !records.some((r) => r.year === year));
  if (missing.length === 0) return null;
  const next = [...records];
  for (const year of missing) next.push(make(year, yearRecord(next, year - 1)!));
  return next.sort((a, b) => a.year - b.year);
}

/** Each list item `roll` changes, or null when it changes none. */
function mapChanged<T>(items: T[], roll: (item: T) => T | null): T[] | null {
  let changed = false;
  const next = items.map((item) => {
    const rolled = roll(item);
    if (rolled) changed = true;
    return rolled ?? item;
  });
  return changed ? next : null;
}

/** The §7.2 rollover for countries: a new year's day rate copied from the preceding year, working days prefilled with weekdays. */
export function countriesRolledForward(countries: Country[], tracked: number[]): Country[] | null {
  return mapChanged(countries, (country) => {
    const ratesByYear = rolledForward(country.ratesByYear, tracked, (year, previous) => ({
      year,
      dayRate: previous.dayRate,
      workingDaysByMonth: weekdaysByMonth(year),
    }));
    return ratesByYear && { ...country, ratesByYear };
  });
}

/** The same rollover for custom roles' day rates (§6, §7.2), active or not, so they are there when switched back on. */
export function peopleRolledForward(people: Person[], tracked: number[]): Person[] | null {
  return mapChanged(people, (person) => {
    const custom = person.customRole;
    const dayRatesByYear = custom && rolledForward(custom.dayRatesByYear, tracked, (year, previous) => ({ year, dayRate: previous.dayRate }));
    return custom && dayRatesByYear ? { ...person, customRole: { ...custom, dayRatesByYear } } : null;
  });
}

/** Which of a country's entries an edit touched: a year's day rate, a year's working days, or one month's. */
export type RateEdit = { year: number; field: 'dayRate' } | { year: number; field: 'workingDays'; month?: number };

/**
 * How many initiatives a country rate edit changes the estimate of (§5.9): those with an unfrozen allocation
 * (§8.1) of a person in that country in a month whose figures come from the edited entry — the same year entry
 * the cost engine resolves the month to (§7.2, clamping included), and for working days that month only. A day
 * rate leaves out a person whose active custom role replaces it; working days count for everyone in the country.
 */
export function initiativesAffectedByRate(country: Country, edit: RateEdit, initiatives: Initiative[], people: Person[]): number {
  const affected = new Set(
    people.filter((p) => p.countryId === country.id && (edit.field === 'workingDays' || !p.customRole?.active)).map((p) => p.id),
  );
  if (affected.size === 0) return 0;

  const monthHit = (key: string) => {
    const [year, month1] = key.split('-').map(Number);
    if (yearRecord(country.ratesByYear, year)?.year !== edit.year) return false;
    return edit.field === 'dayRate' || edit.month === undefined || edit.month === month1 - 1;
  };

  let count = 0;
  for (const initiative of initiatives) {
    const hit = Object.entries(initiative.phases ?? {}).some(([phaseId, plan]) => {
      if (isPhaseFrozen(initiative, phaseId) || !plan.allocations.some((a) => affected.has(a.personId))) return false;
      return periodMonths(plan).some(monthHit);
    });
    if (hit) count += 1;
  }
  return count;
}
