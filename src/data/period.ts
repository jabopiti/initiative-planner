import { workingDaysForPeriod } from './cost';
import { formatMonthEn, iso, monthOf, parseIso } from './dates';
import { addDays, addMonths } from './defaultPlan';
import { plural } from './plural';
import { activeMembers } from './teamMembers';
import type { Country, Membership, Person } from './types';

/**
 * A period's length for the period picker's footer (§9.11): whole calendar months counted from the start, then the
 * days left over. "2 months" (1 Sep – 31 Oct), "1 month 28 days" (3 Sep – 30 Oct), "19 days" (7 – 25 Sep).
 */
export function periodLength(startIso: string, endIso: string): string {
  let months = 0;
  while (addDays(addMonths(startIso, months + 1), -1) <= endIso) months += 1;
  const restFrom = addMonths(startIso, months);
  const [ry, rm, rd] = parseIso(restFrom);
  const [ey, em, ed] = parseIso(endIso);
  const days = restFrom > endIso ? 0 : Math.round((Date.UTC(ey, em - 1, ed) - Date.UTC(ry, rm - 1, rd)) / 86_400_000) + 1;
  const parts = [months > 0 ? plural(months, 'month', 'months') : null, days > 0 || months === 0 ? plural(days, 'day', 'days') : null];
  return parts.filter(Boolean).join(' ');
}

/** The months a period touches, for its commit message (§10.3): "Sep", "Sep–Oct", "Nov 2026–Feb 2027". */
export function periodMonthsEn(startIso: string, endIso: string): string {
  const [first, last] = [monthOf(startIso), monthOf(endIso)];
  const short = (key: string) => formatMonthEn(key).split(' ')[0];
  if (first === last) return short(first);
  if (first.slice(0, 4) === last.slice(0, 4)) return `${short(first)}–${short(last)}`;
  return `${formatMonthEn(first)}–${formatMonthEn(last)}`;
}

/** The end of a length shortcut (§9.11): `months` whole months ending at a month end, the start's month counting first. */
export function endAfterMonths(startIso: string, months: number): string {
  const [y, m] = parseIso(startIso);
  const index = y * 12 + (m - 1) + months;
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return addDays(iso(year, month, 1), -1);
}

/**
 * The working days a period covers in each country of a team's current members (§7.1, §9.11), prorated, rounded to
 * whole days, ordered by code. A country read without a code is named by its name.
 */
export function workingDaysByCountry(
  startIso: string,
  endIso: string,
  teamId: string,
  data: { memberships: Membership[]; people: Person[]; countries: Country[] },
): { label: string; days: number }[] {
  if (endIso < startIso) return [];
  const ids = new Set(activeMembers(teamId, data.memberships, data.people).map((p) => p.countryId));
  return data.countries
    .filter((c) => ids.has(c.id))
    .map((c) => ({
      label: c.code || c.name,
      days: Math.round(Object.values(workingDaysForPeriod(c, startIso, endIso)).reduce((sum, d) => sum + d, 0)),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}
