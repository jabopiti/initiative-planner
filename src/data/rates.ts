import { monthsInRange, weekdaysInMonth, yearRecord } from './cost';
import { isPhaseFrozen } from './frozen';
import type { Country, CountryYearRateRecord, Initiative, Person } from './types';

/** The weekdays (Monday to Friday) of each month of `year`: working days before anyone adjusts them (§6). */
export function weekdaysByMonth(year: number): number[] {
  return Array.from({ length: 12 }, (_, month) => weekdaysInMonth(year, month));
}

/** Calendar days in a month (`month` 0-based): the most working days it can have. */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

/** A new country's entry for each year of the window (§5.9): one day rate for all, working days as weekdays. */
export function newCountryRates(dayRate: number, years: number[]): CountryYearRateRecord[] {
  return years.map((year) => ({ year, dayRate, workingDaysByMonth: weekdaysByMonth(year) }));
}

/** The window's years missing from `records`, in order: what the rollover adds (§7.2). None while nothing exists to copy from. */
function missingYears(records: { year: number }[], tracked: number[]): number[] {
  if (records.length === 0) return [];
  return tracked.filter((year) => !records.some((r) => r.year === year));
}

/**
 * The §7.2 rollover for countries: each tracked year a country has no entry for gets one, its day rate copied
 * from the preceding year (the nearest earlier entry, or the earliest when none is earlier) and its working days
 * prefilled with weekdays. Null when nothing is missing, so the system write is idempotent.
 */
export function countriesRolledForward(countries: Country[], tracked: number[]): Country[] | null {
  let changed = false;
  const next = countries.map((country) => {
    const years = missingYears(country.ratesByYear, tracked);
    if (years.length === 0) return country;
    changed = true;
    const ratesByYear = [...country.ratesByYear];
    for (const year of years) {
      ratesByYear.push({ year, dayRate: yearRecord(ratesByYear, year - 1)!.dayRate, workingDaysByMonth: weekdaysByMonth(year) });
    }
    return { ...country, ratesByYear: ratesByYear.sort((a, b) => a.year - b.year) };
  });
  return changed ? next : null;
}

/** The same rollover for custom roles' day rates (§6, §7.2), active or not, so they are there when switched back on. */
export function peopleRolledForward(people: Person[], tracked: number[]): Person[] | null {
  let changed = false;
  const next = people.map((person) => {
    const custom = person.customRole;
    if (!custom) return person;
    const years = missingYears(custom.dayRatesByYear, tracked);
    if (years.length === 0) return person;
    changed = true;
    const dayRatesByYear = [...custom.dayRatesByYear];
    for (const year of years) dayRatesByYear.push({ year, dayRate: yearRecord(dayRatesByYear, year - 1)!.dayRate });
    return { ...person, customRole: { ...custom, dayRatesByYear: dayRatesByYear.sort((a, b) => a.year - b.year) } };
  });
  return changed ? next : null;
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
      if (isPhaseFrozen(initiative, phaseId) || !plan.startDate || !plan.endDate) return false;
      if (!plan.allocations.some((a) => affected.has(a.personId))) return false;
      return monthsInRange(plan.startDate, plan.endDate).some(monthHit);
    });
    if (hit) count += 1;
  }
  return count;
}
