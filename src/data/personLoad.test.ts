import { describe, expect, it } from 'vitest';
import { defaultBrandPack } from '../brand/defaultBrand';
import { freeCapacityByPerson } from './personLoad';
import type { Initiative, Membership, Person } from './types';

const process = defaultBrandPack.process;
const [current, later] = [process[0].id, process[1].id]; // no gate records yet: the first phase is current
const TODAY = '2026-09-24';

const person: Person = { id: 'ana', name: 'Ana', countryId: 'de', roleId: 'dev', capacityPct: 100, active: true };
const membership = (teamFtePct: number): Membership => ({ id: 'm', personId: 'ana', teamId: 't1', teamFtePct, active: true });

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

/** Ana's free capacity for a phase of `t1`, or undefined when the phase has no months. */
const free = (initiatives: Initiative[], period: { startDate?: string; endDate?: string } = { startDate: '2026-10-01', endDate: '2026-11-30' }, teamFtePct = 60) =>
  freeCapacityByPerson({ people: [person], teamId: 't1', memberships: [membership(teamFtePct)], period, initiatives, process, today: TODAY })?.get('ana');

describe('freeCapacityByPerson (§5.11, §7.2)', () => {
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

  it('is undefined when the phase has no months to check', () => {
    expect(free([], { endDate: '2026-11-30' })).toBeUndefined();
    expect(free([], { startDate: '2026-11-30', endDate: '2026-10-01' })).toBeUndefined();
  });

  it('answers for everyone in the list in one call, each against their own load and Team FTE %', () => {
    const bo: Person = { ...person, id: 'bo', name: 'Bo', capacityPct: 80 };
    const result = freeCapacityByPerson({
      people: [person, bo],
      teamId: 't1',
      memberships: [membership(60), { id: 'm2', personId: 'bo', teamId: 't1', teamFtePct: 50, active: true }],
      period: { startDate: '2026-10-01', endDate: '2026-10-31' },
      initiatives: [initiative('other', 't2', later, 40, '2026-10-01', '2026-10-31')],
      process,
      today: TODAY,
    });
    expect(result).toEqual(new Map([['ana', 60], ['bo', 50]])); // Ana carries 40 on another team; Bo carries nothing and is held to his Team FTE %
  });
});

