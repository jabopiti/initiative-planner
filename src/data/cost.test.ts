import { describe, expect, it } from 'vitest';
import type { ApprovalTrackDef, PhaseDef } from '../brand/types';
import {
  actualOrEstimate,
  allocationFigures,
  allocationRefusal,
  frozenBlendedTotal,
  frozenPhaseMonths,
  grandDeviation,
  grandEstimate,
  isOutsidePeriod,
  monthsInRange,
  parseAmount,
  periodMonths,
  phaseBlendedTotal,
  phaseByMonth,
  phaseCoverage,
  phaseDeviation,
  phaseMonths,
  phaseTotal,
  resolveApprovalTrack,
  resolveRate,
  weekdaysInMonth,
  workingDaysForPeriod,
  trackedYears,
  yearRecord,
} from './cost';
import type { CostItem, Country, FrozenPhaseSnapshot, Initiative, Membership, PhasePlan, Person, Role, Team } from './types';

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
  const plan = (actualMonths?: Record<string, number>, costItems?: CostItem[]): PhasePlan => ({
    ...period,
    allocations: [{ id: 'a1', personId: 'ana', allocationPct: 50 }],
    costItems,
    actualMonths,
  });
  // 20 working days × 50% × 500 × 0.8 = 4,000 a month (Oct and Nov alike).

  it('lists every month of the period plus any recorded actual or one-month cost item outside it, sorted', () => {
    expect(phaseMonths({ ...period, allocations: [] })).toEqual(['2026-10', '2026-11']);
    expect(phaseMonths(plan({ '2027-01': 100 }))).toEqual(['2026-10', '2026-11', '2027-01']);
    expect(phaseMonths(plan(undefined, [{ id: 'c1', label: 'Audit', amount: 500, timing: 'month', month: '2027-03' }]))).toEqual([
      '2026-10',
      '2026-11',
      '2027-03',
    ]);
    expect(phaseMonths({ allocations: [] })).toEqual([]);
  });

  it("estimates a phase's cost month by month from its allocations", () => {
    expect(phaseByMonth(plan(), [ana], data)).toEqual({ '2026-10': 4000, '2026-11': 4000 });
  });

  it('a recorded actual once closed; the estimate is what it defaults to until then', () => {
    const estimate = phaseByMonth(plan(), [ana], data);
    // "Today" is mid-November: October has closed, November has not.
    expect(actualOrEstimate(plan(), '2026-10', '2026-11-15', estimate)).toBe(4000);
    expect(actualOrEstimate(plan(), '2026-11', '2026-11-15', estimate)).toBeUndefined();
    expect(actualOrEstimate(plan({ '2026-10': 5250 }), '2026-10', '2026-11-15', estimate)).toBe(5250);
  });

  it('defaults a closed month to the estimate even when it is exactly 0 (decided in slice 010 review)', () => {
    const empty = { ...period, allocations: [] };
    expect(actualOrEstimate(empty, '2026-10', '2026-11-15', phaseByMonth(empty, [ana], data))).toBe(0);
  });

  it('blends the recorded actual where there is one, the estimate elsewhere', () => {
    expect(phaseBlendedTotal(plan({ '2026-10': 5250 }), [ana], data)).toBe(5250 + 4000);
    expect(phaseBlendedTotal(plan(), [ana], data)).toBe(4000 + 4000); // no actuals: the blended total is the estimate
  });

  it('folds cost items into the blended total too, not just labour', () => {
    const withItem = plan({ '2026-10': 5250 }, [{ id: 'c1', label: 'Audit', amount: 1000, timing: 'month', month: '2026-11' }]);
    expect(phaseBlendedTotal(withItem, [ana], data)).toBe(5250 + (4000 + 1000)); // Oct recorded, Nov estimate + the item
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

describe('cost items in a phase’s monthly estimate (§7.1)', () => {
  const period = { startDate: '2026-10-16', endDate: '2026-12-10' }; // three calendar months, the first and last partial
  const item = (extra: Partial<CostItem>): CostItem => ({ id: 'c1', label: 'Penetration test', amount: 12000, timing: 'spread', ...extra });
  const byMonth = (p: typeof period | { startDate?: string; endDate?: string }, ...costItems: CostItem[]) => phaseByMonth({ ...p, allocations: [], costItems }, [], data);

  it('puts a one-month item in full into its month and nowhere else', () => {
    expect(byMonth(period, item({ timing: 'month', month: '2026-11' }))).toEqual({ '2026-11': 12000 });
  });

  it('spreads an item equally over every calendar month of the period, partial first and last months included', () => {
    expect(byMonth(period, item({}))).toEqual({ '2026-10': 4000, '2026-11': 4000, '2026-12': 4000 });
  });

  it('keeps the month of a spread item without using it', () => {
    expect(byMonth(period, item({ month: '2027-05' }))).toEqual({ '2026-10': 4000, '2026-11': 4000, '2026-12': 4000 });
  });

  it('still counts a one-month item whose month lies outside the period', () => {
    expect(byMonth(period, item({ timing: 'month', month: '2027-03' }))).toEqual({ '2027-03': 12000 });
  });

  it('counts nothing without a valid period, and nothing for a one-month item that has no month', () => {
    expect(byMonth({ startDate: '2026-10-01' }, item({}))).toEqual({});
    expect(byMonth({ startDate: '2026-11-30', endDate: '2026-10-01' }, item({ timing: 'month', month: '2026-11' }))).toEqual({});
    expect(byMonth(period, item({ timing: 'month' }))).toEqual({});
  });

  it('adds cost items to the allocation cost in the phase total', () => {
    const plan = {
      startDate: '2026-10-01',
      endDate: '2026-11-30',
      allocations: [{ id: 'a1', personId: 'ana', allocationPct: 50 }],
      costItems: [item({ timing: 'month', month: '2026-10' }), item({ id: 'c2', amount: 1000 })],
    };
    expect(phaseTotal(plan, [ana], data)).toBeCloseTo(8000 + 12000 + 1000);
    expect(phaseByMonth(plan, [ana], data)['2026-10']).toBeCloseTo(4000 + 12000 + 500);
    expect(phaseByMonth(plan, [ana], data)['2026-11']).toBeCloseTo(4000 + 500);
  });

  it('knows a one-month item is outside a valid period, and never for a spread item or without a period', () => {
    const months = periodMonths(period);
    expect(isOutsidePeriod(months, item({ timing: 'month', month: '2027-03' }))).toBe(true);
    expect(isOutsidePeriod(months, item({ timing: 'month', month: '2026-12' }))).toBe(false);
    expect(isOutsidePeriod(months, item({ month: '2027-03' }))).toBe(false);
    expect(isOutsidePeriod(periodMonths({ startDate: '2026-10-01' }), item({ timing: 'month', month: '2027-03' }))).toBe(false);
  });
});

describe('shared helpers of the cost rules', () => {
  it('lists the months of a valid period, and none while a date is unset or the period is inverted', () => {
    expect(periodMonths({ startDate: '2026-10-16', endDate: '2026-12-10' })).toEqual(['2026-10', '2026-11', '2026-12']);
    expect(periodMonths({ startDate: '2026-10-16' })).toEqual([]);
    expect(periodMonths({ startDate: '2026-12-10', endDate: '2026-10-16' })).toEqual([]);
  });

  it('reads an amount as a number of 0 or more, and nothing else', () => {
    expect([parseAmount('0'), parseAmount(' 12.5 '), parseAmount('1e3')]).toEqual([0, 12.5, 1000]);
    for (const text of ['', '  ', '-1', 'abc', 'Infinity', '1e999']) expect(parseAmount(text), text).toBeNull();
  });
});

describe('resolveApprovalTrack (§7.4)', () => {
  const tracks: ApprovalTrackDef[] = [
    { id: 'light', name: 'Light', abbreviation: 'L', lowerBound: 0, upperBound: 50_000, severity: 1, requirementText: '' },
    { id: 'standard', name: 'Standard', abbreviation: 'S', lowerBound: 50_000, upperBound: 200_000, severity: 2, requirementText: '' },
    { id: 'elevated', name: 'Elevated', abbreviation: 'E', lowerBound: 200_000, severity: 3, requirementText: '' },
  ];

  it('is lower-inclusive and upper-exclusive', () => {
    expect(resolveApprovalTrack(tracks, 0)?.id).toBe('light');
    expect(resolveApprovalTrack(tracks, 49_999)?.id).toBe('light');
    expect(resolveApprovalTrack(tracks, 50_000)?.id).toBe('standard');
    expect(resolveApprovalTrack(tracks, 200_000)?.id).toBe('elevated');
  });

  it('is null, never rounded, for a total no band covers', () => {
    const gapped: ApprovalTrackDef[] = [
      { id: 'light', name: 'Light', abbreviation: 'L', lowerBound: 0, upperBound: 10_000, severity: 1, requirementText: '' },
      { id: 'elevated', name: 'Elevated', abbreviation: 'E', lowerBound: 20_000, severity: 2, requirementText: '' },
    ];
    expect(resolveApprovalTrack(gapped, 15_000)).toBeNull();
    expect(resolveApprovalTrack(tracks, -1)).toBeNull();
  });
});

describe('frozenBlendedTotal and frozenPhaseMonths (§8.1)', () => {
  const snapshot: FrozenPhaseSnapshot = {
    startDate: '2026-01-01',
    endDate: '2026-02-28',
    allocations: [{ id: 'a1', personId: 'ana', allocationPct: 100, cost: 20_000 }],
    costItems: [],
    estimateByMonth: { '2026-01': 10_000, '2026-02': 10_000 },
  };

  it('uses the frozen estimate for a month with no recorded actual', () => {
    expect(frozenBlendedTotal(snapshot, undefined)).toBe(20_000);
  });

  it('folds a recorded actual in, leaving the frozen estimate for the rest', () => {
    expect(frozenBlendedTotal(snapshot, { '2026-01': 11_500 })).toBe(11_500 + 10_000);
  });

  it('never recalculates from live rates: an actual recorded outside the frozen period still counts, via frozenPhaseMonths', () => {
    expect(frozenPhaseMonths(snapshot, { '2026-03': 500 })).toEqual(['2026-01', '2026-02', '2026-03']);
    expect(frozenBlendedTotal(snapshot, { '2026-03': 500 })).toBe(20_000 + 500);
  });
});

describe('grandEstimate (§4, §8.1)', () => {
  const process: PhaseDef[] = [
    { id: 'discovery', label: 'Discovery', description: '', costed: false, exitGate: { id: 'g0', label: 'G0', description: '', requiresEstimates: false, skippable: true, checklistItems: [] } },
    { id: 'validation', label: 'Validation', description: '', costed: true, exitGate: { id: 'g1', label: 'G1', description: '', requiresEstimates: true, skippable: true, checklistItems: [] } },
    { id: 'development', label: 'Development', description: '', costed: true, exitGate: { id: 'g2', label: 'G2', description: '', requiresEstimates: true, skippable: false, checklistItems: [] } },
  ];

  it('sums the blended total of every costed phase, ignoring non-costed ones and ones never planned', () => {
    const initiative: Initiative = {
      id: 'i1',
      name: 'Checkout',
      teamId: 't1',
      status: 'Active',
      phases: { validation: { startDate: '2026-10-01', endDate: '2026-11-30', allocations: [{ id: 'a1', personId: 'ana', allocationPct: 50 }] } },
    };
    expect(grandEstimate(initiative, process, [ana], data)).toBe(8000);
  });

  it('uses a passed phase’s frozen snapshot, immune to a later rate change, instead of recomputing it live', () => {
    const frozenSnapshot: FrozenPhaseSnapshot = { startDate: '2026-10-01', endDate: '2026-11-30', allocations: [{ id: 'a1', personId: 'ana', allocationPct: 50, cost: 8000 }], costItems: [], estimateByMonth: { '2026-10': 4000, '2026-11': 4000 } };
    const initiative: Initiative = {
      id: 'i1',
      name: 'Checkout',
      teamId: 't1',
      status: 'Active',
      phases: { validation: { startDate: '2026-10-01', endDate: '2026-11-30', allocations: [{ id: 'a1', personId: 'ana', allocationPct: 50 }] }, development: { startDate: '2026-12-01', endDate: '2026-12-31', allocations: [{ id: 'a2', personId: 'ana', allocationPct: 100 }] } },
      gates: { validation: { outcome: 'passed', passedOn: '2026-11-30', frozenSnapshot, checklist: [] } },
    };
    // Development, still live: 20 days × 100% × 500 × 0.8 (this file's fixture rate/factor) = 8000.
    const rateChanged: Country[] = countries.map((c) => ({ ...c, ratesByYear: c.ratesByYear.map((r) => ({ ...r, dayRate: r.dayRate * 10 })) }));
    expect(grandEstimate(initiative, process, [ana], { ...data, countries: rateChanged })).toBe(8000 + 80_000);
  });
});

describe('grandDeviation (§4)', () => {
  const process: PhaseDef[] = [
    { id: 'validation', label: 'Validation', description: '', costed: true, exitGate: { id: 'g1', label: 'G1', description: '', requiresEstimates: true, skippable: true, checklistItems: [] } },
    { id: 'development', label: 'Development', description: '', costed: true, exitGate: { id: 'g2', label: 'G2', description: '', requiresEstimates: true, skippable: false, checklistItems: [] } },
  ];

  it('is zero when nothing has a recorded actual', () => {
    const initiative: Initiative = { id: 'i1', name: 'Checkout', teamId: 't1', status: 'Active', phases: { validation: { startDate: '2026-10-01', endDate: '2026-11-30', allocations: [{ id: 'a1', personId: 'ana', allocationPct: 50 }] } } };
    expect(grandDeviation(initiative, process, [ana], data)).toBe(0);
  });

  it('sums live and frozen phases’ deviation, the frozen one against its own snapshot', () => {
    const frozenSnapshot: FrozenPhaseSnapshot = { startDate: '2026-10-01', endDate: '2026-11-30', allocations: [], costItems: [], estimateByMonth: { '2026-10': 4000, '2026-11': 4000 } };
    const initiative: Initiative = {
      id: 'i1',
      name: 'Checkout',
      teamId: 't1',
      status: 'Active',
      phases: {
        validation: { startDate: '2026-10-01', endDate: '2026-11-30', allocations: [], actualMonths: { '2026-10': 4500 } }, // +500 over the frozen estimate
        development: { startDate: '2026-12-01', endDate: '2026-12-31', allocations: [{ id: 'a2', personId: 'ana', allocationPct: 100 }], actualMonths: { '2026-12': 7500 } }, // 8000 estimate, -500
      },
      gates: { validation: { outcome: 'passed', passedOn: '2026-11-30', frozenSnapshot, checklist: [] } },
    };
    expect(grandDeviation(initiative, process, [ana], data)).toBe(500 - 500);
  });
});
