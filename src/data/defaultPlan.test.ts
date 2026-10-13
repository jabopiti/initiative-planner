import { describe, expect, it } from 'vitest';
import { defaultBrandPack } from '@brand';
import { localToday } from './dates';
import { buildDefaultPlan, chainPeriods, extendByOneMonth } from './defaultPlan';

describe('chainPeriods (§5.11 default plan)', () => {
  it('starts on the given day and ends the day before the same day N months later', () => {
    expect(chainPeriods('2026-09-24', [3, 6])).toEqual([
      { startDate: '2026-09-24', endDate: '2026-12-23' },
      { startDate: '2026-12-24', endDate: '2027-06-23' },
    ]);
  });

  it('ends on the last day of a month when the start is the 1st', () => {
    expect(chainPeriods('2026-10-01', [3])).toEqual([{ startDate: '2026-10-01', endDate: '2026-12-31' }]);
  });

  it('crosses a year end into the right month', () => {
    expect(chainPeriods('2026-11-15', [3])).toEqual([{ startDate: '2026-11-15', endDate: '2027-02-14' }]);
  });

  it('counts a day the later month lacks as its last day, then steps back one day', () => {
    expect(chainPeriods('2026-08-31', [3])).toEqual([{ startDate: '2026-08-31', endDate: '2026-11-29' }]);
    expect(chainPeriods('2027-01-31', [1])).toEqual([{ startDate: '2027-01-31', endDate: '2027-02-27' }]);
    expect(chainPeriods('2028-01-31', [1])).toEqual([{ startDate: '2028-01-31', endDate: '2028-02-28' }]); // leap year
  });

  it('returns nothing for no durations', () => {
    expect(chainPeriods('2026-09-24', [])).toEqual([]);
  });
});

describe('extendByOneMonth (§5.11 Extend on overrun)', () => {
  it('moves to the same day next month', () => {
    expect(extendByOneMonth('2027-01-15')).toBe('2027-02-15');
  });

  it('counts a day the next month lacks as its last day', () => {
    expect(extendByOneMonth('2027-01-31')).toBe('2027-02-28');
    expect(extendByOneMonth('2028-01-31')).toBe('2028-02-29'); // leap year
  });

  it("moves a month's own last day to the next month's last day, even when the next month has more days", () => {
    expect(extendByOneMonth('2026-09-30')).toBe('2026-10-31');
    expect(extendByOneMonth('2027-02-28')).toBe('2027-03-31');
    expect(extendByOneMonth('2028-02-29')).toBe('2028-03-31'); // leap year's own last day
  });
});

describe('buildDefaultPlan', () => {
  it('gives every costed phase of the default brand pack a chained period and no other phase one', () => {
    const plan = buildDefaultPlan(defaultBrandPack.process, '2026-09-24');
    expect(Object.keys(plan)).toEqual(['validation', 'development']);
    expect(plan.validation).toEqual({ startDate: '2026-09-24', endDate: '2026-12-23', allocations: [] });
    expect(plan.development).toEqual({ startDate: '2026-12-24', endDate: '2027-06-23', allocations: [] });
  });

  it('gives each costed phase of the default brand pack a positive default duration', () => {
    for (const phase of defaultBrandPack.process.filter((p) => p.costed)) {
      expect(phase.defaultDurationMonths).toBeGreaterThan(0);
    }
  });
});

describe('localToday', () => {
  it("reads the local calendar date, not the UTC one", () => {
    expect(localToday(new Date(2026, 8, 24, 23, 59))).toBe('2026-09-24');
    expect(localToday(new Date(2026, 0, 1, 0, 1))).toBe('2026-01-01');
  });
});
