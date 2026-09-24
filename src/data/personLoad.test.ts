import { describe, expect, it } from 'vitest';
import { defaultBrandPack } from '../brand/defaultBrand';
import { freeCapacityPct, isPhaseConfirmed } from './personLoad';
import type { Initiative, Person } from './types';

const process = defaultBrandPack.process;
const [current, later] = [process[0].id, process[1].id]; // no gate records yet: the first phase is current
const TODAY = '2026-09-24';

const person: Person = { id: 'ana', name: 'Ana', countryId: 'de', roleId: 'dev', capacityPct: 100, active: true };

function initiative(id: string, teamId: string, phaseId: string, pct: number, start: string, end: string, extra: Partial<Initiative> = {}): Initiative {
  return {
    id,
    name: id,
    teamId,
    status: 'Active',
    phases: { [phaseId]: { startDate: start, endDate: end, allocations: [{ id: `${id}-a`, personId: 'ana', allocationPct: pct }] } },
    ...extra,
  };
}

const free = (initiatives: Initiative[], period = { startDate: '2026-10-01', endDate: '2026-11-30' }, teamFtePct = 60) =>
  freeCapacityPct({ person, teamId: 't1', teamFtePct, period, initiatives, process, today: TODAY });

describe('isPhaseConfirmed (§4)', () => {
  it('is true for the current phase whatever its dates', () => {
    expect(isPhaseConfirmed('2027-08-01', true, TODAY)).toBe(true);
    expect(isPhaseConfirmed(undefined, true, TODAY)).toBe(true);
  });

  it('is true when the start falls in the current or the next calendar month, or earlier', () => {
    expect(isPhaseConfirmed('2026-09-01', false, TODAY)).toBe(true);
    expect(isPhaseConfirmed('2026-10-31', false, TODAY)).toBe(true);
    expect(isPhaseConfirmed('2026-06-15', false, TODAY)).toBe(true);
    expect(isPhaseConfirmed('2026-11-01', false, TODAY)).toBe(false);
  });

  it('compares months, so the 31st of a short next month cannot overflow', () => {
    expect(isPhaseConfirmed('2026-02-28', false, '2026-01-31')).toBe(true);
    expect(isPhaseConfirmed('2026-03-01', false, '2026-01-31')).toBe(false);
  });

  it('rolls the next month over the year end', () => {
    expect(isPhaseConfirmed('2027-01-31', false, '2026-12-15')).toBe(true);
    expect(isPhaseConfirmed('2027-02-01', false, '2026-12-15')).toBe(false);
  });

  it('is false for a phase with no start date that is not the current one', () => {
    expect(isPhaseConfirmed(undefined, false, TODAY)).toBe(false);
  });
});

describe('freeCapacityPct (§5.11, §7.2)', () => {
  it('is the Team FTE % when the person has no other commitments', () => {
    expect(free([])).toBe(60);
  });

  it('is the Capacity % left when work on other teams binds first', () => {
    expect(free([initiative('other', 't2', later, 70, '2026-10-01', '2026-10-31')])).toBe(30);
  });

  it('is the Team FTE % left when work on this team binds first', () => {
    expect(free([initiative('mine', 't1', later, 50, '2026-10-01', '2026-10-31')])).toBe(10);
  });

  it('takes the minimum over the months of the phase', () => {
    const inOctober = initiative('oct', 't1', later, 40, '2026-10-01', '2026-10-31');
    expect(free([inOctober], { startDate: '2026-09-15', endDate: '2026-10-31' })).toBe(20);
    expect(free([inOctober], { startDate: '2026-09-15', endDate: '2026-09-30' })).toBe(60);
  });

  it('adds up overlapping commitments in the same month', () => {
    const initiatives = [initiative('a', 't1', later, 20, '2026-10-01', '2026-10-31'), initiative('b', 't2', later, 30, '2026-10-15', '2026-11-15')];
    expect(free(initiatives)).toBe(40); // October: 100 - 50 = 50 capacity, 60 - 20 = 40 team; November: 100 - 30 = 70, 60 - 0
  });

  it('leaves out Provisional phases: a later phase starting more than a month ahead', () => {
    expect(free([initiative('far', 't2', later, 90, '2026-11-01', '2026-12-31')])).toBe(60);
  });

  it('counts the current phase even when it starts far ahead', () => {
    expect(free([initiative('cur', 't2', current, 90, '2027-03-01', '2027-04-30')], { startDate: '2027-03-01', endDate: '2027-03-31' })).toBe(10);
  });

  it('leaves out initiatives that are not Active', () => {
    for (const status of ['On Hold', 'Cancelled', 'Closed'] as const) {
      expect(free([initiative('x', 't2', later, 90, '2026-10-01', '2026-10-31', { status })])).toBe(60);
    }
  });

  it("ignores other people's allocations", () => {
    const other = initiative('x', 't1', later, 90, '2026-10-01', '2026-10-31');
    other.phases![later].allocations[0].personId = 'bo';
    expect(free([other])).toBe(60);
  });

  it('is 0, not negative, when the person is already over a ceiling', () => {
    expect(free([initiative('over', 't2', later, 120, '2026-10-01', '2026-10-31')])).toBe(0);
  });

  it('rounds down to a whole percent so the default can never exceed a ceiling', () => {
    expect(free([initiative('x', 't2', later, 66.6, '2026-10-01', '2026-10-31')], undefined, 100)).toBe(33);
  });

  it('is null when the phase has no months to check', () => {
    expect(free([], { startDate: undefined, endDate: '2026-11-30' } as never)).toBeNull();
    expect(free([], { startDate: '2026-11-30', endDate: '2026-10-01' })).toBeNull();
  });
});
