import { describe, expect, it } from 'vitest';
import { countriesRolledForward, daysInMonth, initiativesAffectedByRate, newCountryRates, peopleRolledForward, weekdaysByMonth } from './rates';
import type { Country, Initiative, Person } from './types';

const twenty = Array(12).fill(20);
const germany: Country = {
  id: 'de',
  name: 'Germany',
  active: true,
  ratesByYear: [
    { year: 2026, dayRate: 1000, workingDaysByMonth: twenty },
    { year: 2027, dayRate: 1050, workingDaysByMonth: twenty },
  ],
};

const person = (id: string, countryId = 'de', customRoleActive = false): Person => ({
  id,
  name: id,
  countryId,
  roleId: 'dev',
  capacityPct: 100,
  active: true,
  ...(customRoleActive && { customRole: { active: true, label: 'Fractional', costFactor: 1, dayRatesByYear: [{ year: 2026, dayRate: 900 }] } }),
});
const people = [person('ana'), person('bo', 'es'), person('cy', 'de', true)];

const initiative = (id: string, personId: string, startDate: string, endDate: string, passed = false): Initiative => ({
  id,
  name: id,
  teamId: 't',
  status: 'Active',
  phases: { dev: { startDate, endDate, allocations: [{ id: `${id}-a`, personId, allocationPct: 50 }] } },
  ...(passed && { gates: { dev: { outcome: 'passed' } } }),
} as Initiative);

describe('weekday prefill (§6)', () => {
  it('counts Monday to Friday per month', () => {
    // March 2027 starts on a Monday and has 31 days; April 2027 has 22 weekdays.
    expect(weekdaysByMonth(2027)[2]).toBe(23);
    expect(weekdaysByMonth(2027)[3]).toBe(22);
  });

  it('knows each month’s calendar days, leap years included', () => {
    expect(daysInMonth(2027, 3)).toBe(30);
    expect(daysInMonth(2028, 1)).toBe(29);
  });

  it('gives a new country the one day rate and weekdays for every year of the window (§5.9)', () => {
    const rates = newCountryRates(600, [2026, 2027, 2028]);
    expect(rates.map((r) => r.dayRate)).toEqual([600, 600, 600]);
    expect(rates[1].workingDaysByMonth).toEqual(weekdaysByMonth(2027));
  });
});

describe('rollover (§7.2)', () => {
  it('adds a year entering the window, copying the preceding day rate and prefilling weekdays', () => {
    const next = countriesRolledForward([germany], [2027, 2028, 2029])!;
    const years = next[0].ratesByYear;
    expect(years.map((r) => r.year)).toEqual([2026, 2027, 2028, 2029]);
    expect(years[2]).toEqual({ year: 2028, dayRate: 1050, workingDaysByMonth: weekdaysByMonth(2028) });
    expect(years[3].dayRate).toBe(1050);
    // Years that left the window are kept as they are.
    expect(years[0]).toBe(germany.ratesByYear[0]);
  });

  it('is idempotent: nothing missing is no write', () => {
    const once = countriesRolledForward([germany], [2027, 2028, 2029])!;
    expect(countriesRolledForward(once, [2027, 2028, 2029])).toBeNull();
    expect(countriesRolledForward([germany], [2026, 2027])).toBeNull();
  });

  it('two clients rolling forward the same data write the same thing', () => {
    expect(countriesRolledForward([germany], [2027, 2028, 2029])).toEqual(countriesRolledForward([germany], [2027, 2028, 2029]));
  });

  it('copies custom-role day rates too, active or not, and leaves people without one alone', () => {
    const inactive = { ...person('dee'), customRole: { active: false, label: 'Advisor', costFactor: 1, dayRatesByYear: [{ year: 2026, dayRate: 700 }] } };
    const next = peopleRolledForward([person('ana'), person('cy', 'de', true), inactive], [2026, 2027, 2028])!;
    expect(next[0].customRole).toBeUndefined();
    expect(next[1].customRole!.dayRatesByYear).toEqual([
      { year: 2026, dayRate: 900 },
      { year: 2027, dayRate: 900 },
      { year: 2028, dayRate: 900 },
    ]);
    expect(next[2].customRole!.dayRatesByYear.map((r) => r.dayRate)).toEqual([700, 700, 700]);
    expect(peopleRolledForward(next, [2026, 2027, 2028])).toBeNull();
  });
});

describe('initiativesAffectedByRate (§5.9)', () => {
  it('counts a day-rate edit only for work in a month that resolves to that year', () => {
    const in2026 = initiative('i1', 'ana', '2026-03-01', '2026-05-31');
    const in2027 = initiative('i2', 'ana', '2027-03-01', '2027-05-31');
    expect(initiativesAffectedByRate(germany, { year: 2027, field: 'dayRate' }, [in2026, in2027], people)).toBe(1);
  });

  it('counts clamped years: work after the last entry uses it', () => {
    const in2029 = initiative('i1', 'ana', '2029-03-01', '2029-05-31');
    expect(initiativesAffectedByRate(germany, { year: 2027, field: 'dayRate' }, [in2029], people)).toBe(1);
    expect(initiativesAffectedByRate(germany, { year: 2026, field: 'dayRate' }, [in2029], people)).toBe(0);
  });

  it('leaves out a person whose active custom role replaces the day rate, but not for working days', () => {
    const cy = initiative('i1', 'cy', '2027-04-01', '2027-04-30');
    expect(initiativesAffectedByRate(germany, { year: 2027, field: 'dayRate' }, [cy], people)).toBe(0);
    expect(initiativesAffectedByRate(germany, { year: 2027, field: 'workingDays', month: 3 }, [cy], people)).toBe(1);
  });

  it('counts a working-days edit only for work in that month; a reset counts the whole year', () => {
    const mayOnly = initiative('i1', 'ana', '2027-05-01', '2027-05-31');
    expect(initiativesAffectedByRate(germany, { year: 2027, field: 'workingDays', month: 3 }, [mayOnly], people)).toBe(0);
    expect(initiativesAffectedByRate(germany, { year: 2027, field: 'workingDays', month: 4 }, [mayOnly], people)).toBe(1);
    expect(initiativesAffectedByRate(germany, { year: 2027, field: 'workingDays' }, [mayOnly], people)).toBe(1);
  });

  it('does not count people elsewhere, frozen phases, or phases without a period', () => {
    const spain = initiative('i1', 'bo', '2027-01-01', '2027-12-31');
    const frozen = initiative('i2', 'ana', '2027-01-01', '2027-12-31', true);
    const undated = { ...initiative('i3', 'ana', '2027-01-01', '2027-12-31'), phases: { dev: { allocations: [{ id: 'x', personId: 'ana', allocationPct: 50 }] } } };
    expect(initiativesAffectedByRate(germany, { year: 2027, field: 'dayRate' }, [spain, frozen, undated], people)).toBe(0);
  });
});
