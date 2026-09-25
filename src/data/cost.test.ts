import { describe, expect, it } from 'vitest';
import {
  actualOrEstimate,
  allocationFigures,
  allocationRefusal,
  monthsInRange,
  phaseBlendedTotal,
  phaseCoverage,
  phaseDeviation,
  phaseEstimateByMonth,
  phaseMonths,
  phaseTotal,
  resolveRate,
  weekdaysInMonth,
  workingDaysForPeriod,
  trackedYears,
  yearRecord,
} from './cost';
import type { Country, Membership, PhasePlan, Person, Role, Team } from './types';

const twenty = Array(12).fill(20);

const roles: Role[] = [{ id: 'dev', name: 'Developer', abbreviation: 'Dev', costFactor: 0.8, active: true }];
const countries: Country[] = [
  {
    id: 'de',
    name: 'Germany',
    active: true,
    ratesByYear: [
      { year: 2026, dayRate: 500, workingDaysByMonth: twenty },
      { year: 2027, dayRate: 600, workingDaysByMonth: twenty },
    ],
  },
];
const data = { roles, countries };

const ana: Person = { id: 'ana', name: 'Ana Ruiz', countryId: 'de', roleId: 'dev', capacityPct: 100, active: true };
const cto: Person = {
  ...ana,
  id: 'cto',
  name: 'Cai Wu',
  customRole: { active: true, label: 'Fractional CTO', costFactor: 1, dayRatesByYear: [{ year: 2026, dayRate: 900 }] },
};

describe('working days and proration (§7.1)', () => {
  it('counts weekdays in a month (Oct 2026 has 22)', () => {
    expect(weekdaysInMonth(2026, 9)).toBe(22);
  });

  it('lists every month of a period in order, and none for an inverted one', () => {
    expect(monthsInRange('2026-11-20', '2027-01-05')).toEqual(['2026-11', '2026-12', '2027-01']);
    expect(monthsInRange('2026-11-20', '2026-11-01')).toEqual([]);
  });

  it('gives a fully covered month its full working days', () => {
    expect(workingDaysForPeriod(countries[0], '2026-10-01', '2026-11-30')).toEqual({ '2026-10': 20, '2026-11': 20 });
  });

  it('prorates a partial first month by the share of its weekdays covered', () => {
    // 16 Oct is a Friday: 11 of Oct's 22 weekdays are covered.
    const days = workingDaysForPeriod(countries[0], '2026-10-16', '2026-11-30');
    expect(days['2026-10']).toBeCloseTo(10);
    expect(days['2026-11']).toBe(20);
  });

  it('prorates a period inside one month against its own weekday span', () => {
    // Mon 5 – Fri 9 Oct: 5 of 22 weekdays.
    expect(workingDaysForPeriod(countries[0], '2026-10-05', '2026-10-09')['2026-10']).toBeCloseTo((20 * 5) / 22);
  });

  it('is empty when a date is missing or the period is inverted', () => {
    expect(workingDaysForPeriod(countries[0], undefined, '2026-10-09')).toEqual({});
    expect(workingDaysForPeriod(countries[0], '2026-10-09', '2026-10-05')).toEqual({});
  });
});

describe('year records clamp to the nearest tracked year (§7.2)', () => {
  const records = [{ year: 2026 }, { year: 2027 }];
  it('answers a direct hit, and clamps before the earliest and beyond the latest', () => {
    expect(yearRecord(records, 2027)).toBe(records[1]);
    expect(yearRecord(records, 2020)).toBe(records[0]);
    expect(yearRecord(records, 2030)).toBe(records[1]);
  });
  it('has nothing to answer with when no year is tracked', () => {
    expect(yearRecord([], 2026)).toBeUndefined();
  });
  it('takes the nearest earlier entered year for a gap, never a later one', () => {
    const gappy = [{ year: 2026 }, { year: 2028 }];
    expect(yearRecord(gappy, 2027)).toBe(gappy[0]);
    expect(yearRecord(gappy, 2029)).toBe(gappy[1]);
  });
});

describe('the tracked window (§7.2)', () => {
  it('is the current calendar year and the next two', () => {
    expect(trackedYears(new Date(2026, 8, 24))).toEqual([2026, 2027, 2028]);
  });
});

describe('rate resolution (§7.2)', () => {
  it('uses the country rate for the year and the role factor', () => {
    expect(resolveRate(ana, data, 2027)).toEqual({ dayRate: 600, factor: 0.8 });
  });
  it("uses a custom role's own rate and its own cost factor, not the standard role's", () => {
    expect(resolveRate(cto, data, 2026)).toEqual({ dayRate: 900, factor: 1 });
    const scaled = { ...cto, customRole: { ...cto.customRole!, costFactor: 1.2 } };
    expect(resolveRate(scaled, data, 2026)).toEqual({ dayRate: 900, factor: 1.2 });
  });
  it('costs a person with the standard role while their custom role is switched off, keeping its entries', () => {
    const switchedOff = { ...cto, customRole: { ...cto.customRole!, active: false } };
    expect(resolveRate(switchedOff, data, 2026)).toEqual({ dayRate: 500, factor: 0.8 });
    expect(switchedOff.customRole.dayRatesByYear).toEqual([{ year: 2026, dayRate: 900 }]);
  });
  it('is unresolvable for a custom role with no rate entered, which costs as zero', () => {
    const empty = { ...cto, customRole: { ...cto.customRole!, dayRatesByYear: [] } };
    expect(resolveRate(empty, data, 2026)).toBeNull();
  });
  it('takes the nearest earlier entered year for a later year', () => {
    expect(resolveRate(cto, data, 2028)).toEqual({ dayRate: 900, factor: 1 });
  });
  it('is unresolvable for an unknown country or role', () => {
    expect(resolveRate({ ...ana, countryId: 'zz' }, data, 2026)).toBeNull();
    expect(resolveRate({ ...ana, roleId: 'zz' }, data, 2026)).toBeNull();
  });
});

describe('cost of an allocation (§7.1)', () => {
  const period = { startDate: '2026-10-01', endDate: '2026-11-30' };

  it('is working days × Allocation % × day rate × role factor, per month, summed', () => {
    const figures = allocationFigures(period, ana, 50, data);
    expect(figures.cost).toBeCloseTo(40 * 0.5 * 500 * 0.8); // 8,000
    expect(figures.byMonth['2026-10']).toBeCloseTo(4000);
    expect(figures.personDays).toBeCloseTo(20); // working days × Allocation %; the factor is a cost weight
  });

  it('prorates a mid-month start rather than counting or dropping the month', () => {
    const figures = allocationFigures({ startDate: '2026-10-16', endDate: '2026-11-30' }, ana, 50, data);
    expect(figures.cost).toBeCloseTo(30 * 0.5 * 500 * 0.8); // 6,000
  });

  it("reads each month's own year, so next year's rate never moves this year", () => {
    const figures = allocationFigures({ startDate: '2026-12-01', endDate: '2027-01-31' }, ana, 50, data);
    expect(figures.cost).toBeCloseTo(20 * 0.5 * 500 * 0.8 + 20 * 0.5 * 600 * 0.8); // 8,800
  });

  it("uses the custom day rate × the custom cost factor, not the standard role's, for a custom-role person", () => {
    expect(allocationFigures(period, cto, 50, data).cost).toBeCloseTo(40 * 0.5 * 900); // 18,000
    const scaled = { ...cto, customRole: { ...cto.customRole!, costFactor: 1.5 } };
    expect(allocationFigures(period, scaled, 50, data).cost).toBeCloseTo(40 * 0.5 * 900 * 1.5); // 27,000
  });

  it('is zero, not an error, without a complete period or a resolvable rate', () => {
    expect(allocationFigures({ startDate: '2026-10-01' }, ana, 50, data).cost).toBe(0);
    expect(allocationFigures(period, { ...ana, countryId: 'zz' }, 50, data).cost).toBe(0);
  });

  it('is zero for an end date before the start date', () => {
    expect(allocationFigures({ startDate: '2026-11-30', endDate: '2026-10-01' }, ana, 50, data).cost).toBe(0);
  });

  it('sums a phase from its allocations and skips one whose person is gone', () => {
    const total = phaseTotal(
      {
        ...period,
        allocations: [
          { id: 'a1', personId: 'ana', allocationPct: 50 },
          { id: 'a2', personId: 'cto', allocationPct: 50 },
          { id: 'a3', personId: 'ghost', allocationPct: 100 },
        ],
      },
      [ana, cto],
      data,
    );
    expect(total).toBeCloseTo(8000 + 18000);
  });
});

describe('actuals default to the estimate once a month closes (§7.3, §4)', () => {
  const period = { startDate: '2026-10-01', endDate: '2026-11-30' };
  const plan = (actualMonths?: Record<string, number>): PhasePlan => ({ ...period, allocations: [{ id: 'a1', personId: 'ana', allocationPct: 50 }], actualMonths });
  // 20 working days × 50% × 500 × 0.8 = 4,000 a month (Oct and Nov alike).

  it('lists every month of the period plus any recorded actual outside it, sorted', () => {
    expect(phaseMonths(period)).toEqual(['2026-10', '2026-11']);
    expect(phaseMonths(period, { '2027-01': 100 })).toEqual(['2026-10', '2026-11', '2027-01']);
    expect(phaseMonths({})).toEqual([]);
  });

  it("estimates a phase's cost month by month from its allocations", () => {
    expect(phaseEstimateByMonth(plan(), [ana], data)).toEqual({ '2026-10': 4000, '2026-11': 4000 });
  });

  it('a recorded actual once closed; the estimate is what it defaults to until then', () => {
    const estimate = phaseEstimateByMonth(plan(), [ana], data);
    // "Today" is mid-November: October has closed, November has not.
    expect(actualOrEstimate(plan(), '2026-10', '2026-11-15', estimate)).toBe(4000);
    expect(actualOrEstimate(plan(), '2026-11', '2026-11-15', estimate)).toBeUndefined();
    expect(actualOrEstimate(plan({ '2026-10': 5250 }), '2026-10', '2026-11-15', estimate)).toBe(5250);
  });

  it('defaults a closed month to the estimate even when it is exactly 0 (decided in slice 010 review)', () => {
    const empty = { ...period, allocations: [] };
    expect(actualOrEstimate(empty, '2026-10', '2026-11-15', phaseEstimateByMonth(empty, [ana], data))).toBe(0);
  });

  it('blends the recorded actual where there is one, the estimate elsewhere', () => {
    expect(phaseBlendedTotal(plan({ '2026-10': 5250 }), [ana], data)).toBe(5250 + 4000);
    expect(phaseBlendedTotal(plan(), [ana], data)).toBe(4000 + 4000); // no actuals: the blended total is the estimate
  });

  it('reads Estimate, Forecast or Actual by how far recorded actuals cover the phase (§4)', () => {
    expect(phaseCoverage(plan())).toBe('estimate');
    expect(phaseCoverage(plan({ '2026-10': 4000 }))).toBe('forecast');
    expect(phaseCoverage(plan({ '2026-10': 4000, '2026-11': 3800 }))).toBe('actual');
  });

  it('is undefined until at least one month is recorded, then the actuals minus their estimates', () => {
    expect(phaseDeviation(plan(), [ana], data)).toBeUndefined();
    expect(phaseDeviation(plan({ '2026-10': 4500 }), [ana], data)).toBe(500); // over the estimate
    expect(phaseDeviation(plan({ '2026-10': 4500, '2026-11': 3800 }), [ana], data)).toBe(300); // 500 - 200
  });
});

describe('only a team’s members may be allocated (§7.2)', () => {
  const team: Team = { id: 't1', name: 'Payments', active: true };
  const member: Membership = { id: 'm1', personId: 'ana', teamId: 't1', teamFtePct: 60, active: true };

  it('accepts an active member', () => {
    expect(allocationRefusal(ana, team, [member])).toBeNull();
  });

  it('refuses a non-member with the reason', () => {
    expect(allocationRefusal(cto, team, [member])).toBe("Cai Wu isn't a member of Payments. Only team members can be allocated.");
  });

  it('refuses a person whose membership was deactivated, and one on another team only', () => {
    expect(allocationRefusal(ana, team, [{ ...member, active: false }])).not.toBeNull();
    expect(allocationRefusal(ana, team, [{ ...member, teamId: 't2' }])).not.toBeNull();
  });
});
