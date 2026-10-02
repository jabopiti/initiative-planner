import { describe, expect, it } from 'vitest';
import { defaultBrandPack } from '../brand/defaultBrand';
import { initiativeRows } from './initiativeList';
import { costedRows, isDefaultPortfolioFilters, PORTFOLIO_DEFAULTS, liveYear, portfolioRows, portfolioYears, type PortfolioFilters } from './portfolio';
import type { Country, Initiative, Person, Role, Team } from './types';

const { process, approvalTracks } = defaultBrandPack;
const costed = process.find((p) => p.costed)!;
const teams: Team[] = [
  { id: 't1', name: 'Platform', active: true },
  { id: 't2', name: 'Growth', active: true },
];
const roles: Role[] = [{ id: 'dev', name: 'Developer', abbreviation: 'Dev', costFactor: 1, active: true }];
const twenty = Array(12).fill(20);
const countries: Country[] = [{ id: 'de', name: 'Germany', active: true, ratesByYear: [2026, 2027].map((year) => ({ year, dayRate: 100, workingDaysByMonth: twenty })) }];
const data = { roles, countries };
const people: Person[] = [{ id: 'p1', name: 'Mara Voss', roleId: 'dev', countryId: 'de', capacityPct: 100, active: true }];
// 20 days × 100 = 2000 a month.
const planned = (start: string, end: string, actualMonths?: Record<string, number>): Initiative['phases'] => ({
  [costed.id]: { startDate: start, endDate: end, allocations: [{ id: 'a', personId: 'p1', allocationPct: 100 }], actualMonths },
});
const initiative = (id: string, over: Partial<Initiative> = {}): Initiative => ({ id, name: id, teamId: 't1', status: 'Active', ...over });

const list = [
  initiative('spans', { phases: planned('2026-11-01', '2027-02-28', { '2026-12': 2500 }) }),
  initiative('only2027', { teamId: 't2', phases: planned('2027-03-01', '2027-03-31') }),
  initiative('unplanned'),
  initiative('held', { status: 'On Hold', phases: planned('2026-01-01', '2026-01-31') }),
];
const rows = costedRows(initiativeRows(list, teams, people, process, approvalTracks, data, []), process, people, data);
const shown = (f: Partial<PortfolioFilters>) => portfolioRows(rows, { ...PORTFOLIO_DEFAULTS, ...f });
const ids = (f: Partial<PortfolioFilters>) => shown(f).map((r) => r.initiative.id);

describe('portfolioRows (§5.2)', () => {
  it('shows only Active by default, and On Hold once Status is widened', () => {
    expect(ids({})).toEqual(['spans', 'only2027', 'unplanned']);
    expect(ids({ status: ['Active', 'On Hold'] })).toContain('held');
  });

  it('ANDs team, phase, specific initiatives and approval track', () => {
    expect(ids({ team: ['t1'] })).toEqual(['spans', 'unplanned']);
    expect(ids({ initiative: ['spans', 'only2027'], team: ['t2'] })).toEqual(['only2027']);
    // No gate passed: every initiative is still in the first phase.
    expect(ids({ phase: [process[0].id] })).toEqual(['spans', 'only2027', 'unplanned']);
    expect(ids({ phase: [process[1].id] })).toEqual([]);
    expect(ids({ track: [rows[0].trackId] })).toContain('spans');
  });

  it('with a year, hides initiatives with no cost in it and scopes cost and deviation to it', () => {
    const in2026 = shown({ year: 2026 });
    expect(in2026.map((r) => r.initiative.id)).toEqual(['spans']);
    expect(in2026[0].cost).toBe(2000 + 2500);
    expect(in2026[0].deviation).toBe(500);
    const in2027 = shown({ year: 2027 });
    expect(in2027.map((r) => [r.initiative.id, r.cost, r.deviation])).toEqual([
      ['spans', 4000, 0],
      ['only2027', 2000, 0],
    ]);
  });

  it('keeps the approval track on the lifetime grand estimate under a year', () => {
    const [lifetime] = shown({});
    const [in2026] = shown({ year: 2026 });
    expect(lifetime.cost).toBe(2000 + 2500 + 4000);
    expect(in2026.trackId).toBe(lifetime.trackId);
    expect(in2026.total).toBe(lifetime.cost);
  });
});

describe('portfolioYears', () => {
  it('lists every year any initiative of any status has cost in', () => {
    expect(portfolioYears(rows)).toEqual([2026, 2027]);
  });
});

describe('liveYear', () => {
  it('keeps a picked year that still has cost and falls back to All years otherwise', () => {
    expect(liveYear(2026, [2026, 2027])).toBe(2026);
    expect(liveYear(2025, [2026, 2027])).toBeNull();
    expect(liveYear(null, [2026])).toBeNull();
  });
});

describe('isDefaultPortfolioFilters', () => {
  it('is true only for Status: Active alone', () => {
    expect(isDefaultPortfolioFilters(PORTFOLIO_DEFAULTS)).toBe(true);
    expect(isDefaultPortfolioFilters({ ...PORTFOLIO_DEFAULTS, year: 2026 })).toBe(false);
    expect(isDefaultPortfolioFilters({ ...PORTFOLIO_DEFAULTS, status: [] })).toBe(false);
    expect(isDefaultPortfolioFilters({ ...PORTFOLIO_DEFAULTS, status: ['Active', 'On Hold'] })).toBe(false);
  });
});
