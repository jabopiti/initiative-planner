import { describe, expect, it } from 'vitest';
import { endAfterMonths, periodLength, periodMonthsEn, teamCountries, workingDaysByCountry } from './period';
import type { Country, Membership, Person } from './types';

describe('periodLength (§9.11)', () => {
  it('reads whole months as months', () => {
    expect(periodLength('2026-09-01', '2026-10-31')).toBe('2 months');
    expect(periodLength('2026-09-01', '2026-09-30')).toBe('1 month');
    expect(periodLength('2026-09-24', '2026-12-23')).toBe('3 months');
  });

  it('adds the days left over after whole months', () => {
    expect(periodLength('2026-09-03', '2026-10-30')).toBe('1 month 28 days');
  });

  it('reads a period under a month as days', () => {
    expect(periodLength('2026-09-07', '2026-09-25')).toBe('19 days');
    expect(periodLength('2026-09-07', '2026-09-07')).toBe('1 day');
  });
});

describe('periodMonthsEn (§10.3)', () => {
  it('names the months, with years only when they differ', () => {
    expect(periodMonthsEn('2026-09-01', '2026-10-31')).toBe('Sep–Oct');
    expect(periodMonthsEn('2026-09-03', '2026-09-20')).toBe('Sep');
    expect(periodMonthsEn('2026-11-01', '2027-02-28')).toBe('Nov 2026–Feb 2027');
  });
});

describe('endAfterMonths (§9.11 shortcuts)', () => {
  it('ends at a month end, the start month counting first', () => {
    expect(endAfterMonths('2026-09-01', 3)).toBe('2026-11-30');
    expect(endAfterMonths('2026-09-03', 1)).toBe('2026-09-30');
    expect(endAfterMonths('2026-11-15', 6)).toBe('2027-04-30');
  });
});

describe('teamCountries and workingDaysByCountry (§7.1, §9.11)', () => {
  // The example data's 2026 working days (backlog/example-data.md).
  const de: Country = { id: 'de', name: 'Germany', code: 'DE', active: true, ratesByYear: [{ year: 2026, dayRate: 1000, workingDaysByMonth: [21, 20, 22, 20, 18, 22, 23, 21, 22, 22, 21, 22] }] };
  const es: Country = { id: 'es', name: 'Spain', code: 'ES', active: true, ratesByYear: [{ year: 2026, dayRate: 800, workingDaysByMonth: [20, 20, 21, 20, 19, 22, 23, 21, 22, 21, 19, 20] }] };
  const fr: Country = { id: 'fr', name: 'France', code: 'FR', active: true, ratesByYear: [] };
  const person = (id: string, countryId: string, active = true): Person => ({ id, name: id, countryId, roleId: 'r', capacityPct: 100, active });
  const membership = (personId: string, active = true): Membership => ({ id: `m-${personId}`, personId, teamId: 'growth', teamFtePct: 100, active });
  const people = [person('carla', 'es'), person('tobias', 'de'), person('paul', 'de'), person('gone', 'fr', false)];
  const memberships = people.map((p) => membership(p.id));

  it("names each current member's country once, ordered by code", () => {
    expect(teamCountries('growth', { memberships, people, countries: [es, fr, de] })).toEqual([de, es]);
    expect(teamCountries('other', { memberships, people, countries: [es, fr, de] })).toEqual([]);
  });

  it('counts the working days in each country', () => {
    expect(workingDaysByCountry('2026-09-01', '2026-10-31', [de, es])).toEqual([
      { label: 'DE', days: 44 },
      { label: 'ES', days: 43 },
    ]);
  });

  it('prorates partial months and rounds to whole days', () => {
    // 3 Sep: 20 of September's 22 weekdays.
    expect(workingDaysByCountry('2026-09-03', '2026-09-30', [de])).toEqual([{ label: 'DE', days: 20 }]);
  });

  it('is empty for an inverted period', () => {
    expect(workingDaysByCountry('2026-10-31', '2026-09-01', [de, es])).toEqual([]);
  });
});
