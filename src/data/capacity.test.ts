import { describe, expect, it } from 'vitest';
import { defaultBrandPack } from '../brand/defaultBrand';
import {
  allocationWarnings,
  claimedFtePct,
  formatMonth,
  formatMonthRanges,
  formatMonthShort,
  isPhaseConfirmed,
  loadsIn,
  teamCapacity,
  teamHasCapacityWarning,
  unclaimedCapacityPct,
} from './capacity';
import type { Initiative, Membership, Person } from './types';

const person: Person = { id: 'p1', name: 'Ada', countryId: 'c', roleId: 'r', capacityPct: 100, active: true };

function membership(id: string, teamFtePct: number, extra: Partial<Membership> = {}): Membership {
  return { id, personId: 'p1', teamId: `t-${id}`, teamFtePct, active: true, ...extra };
}

describe('unclaimedCapacityPct (§5.6, §7.2)', () => {
  it('is the full capacity when the person holds no memberships', () => {
    expect(unclaimedCapacityPct(person, [])).toBe(100);
  });

  it('subtracts the Team FTE % already held', () => {
    expect(unclaimedCapacityPct(person, [membership('a', 60)])).toBe(40);
  });

  it('can exclude one membership, for editing it', () => {
    expect(unclaimedCapacityPct(person, [membership('a', 60), membership('b', 30)], 'a')).toBe(70);
  });

  it('ignores other people, and inactive memberships', () => {
    const others = [membership('a', 50, { personId: 'p2' }), membership('b', 20, { active: false })];
    expect(unclaimedCapacityPct(person, others)).toBe(100);
  });

  it('never goes below zero when the person is already over capacity', () => {
    expect(unclaimedCapacityPct(person, [membership('a', 80), membership('b', 50)])).toBe(0);
  });

  it('follows a reduced capacity %', () => {
    expect(unclaimedCapacityPct({ ...person, capacityPct: 80 }, [membership('a', 60)])).toBe(20);
  });
});

describe('claimedFtePct', () => {
  it('sums active memberships of the person', () => {
    expect(claimedFtePct('p1', [membership('a', 60), membership('b', 30), membership('c', 5, { active: false })])).toBe(90);
  });
});

// ---- Month-by-month capacity (§5.8, §7.2) ----

const process = defaultBrandPack.process;
const today = '2026-09-24';
const initiative = (id: string, teamId: string, phases: Initiative['phases'], extra: Partial<Initiative> = {}): Initiative => ({
  id,
  name: id.toUpperCase(),
  teamId,
  status: 'Active',
  phases,
  ...extra,
});
const plan = (startDate: string, endDate: string, ...allocations: [string, number][]) => ({
  startDate,
  endDate,
  allocations: allocations.map(([personId, allocationPct], i) => ({ id: `a${i}-${personId}`, personId, allocationPct })),
});
const ana: Person = { ...person, id: 'ana', name: 'Ana', capacityPct: 100 };
const bo: Person = { ...person, id: 'bo', name: 'Bo', capacityPct: 100 };
const mem = (personId: string, teamId: string, teamFtePct: number, active = true): Membership => ({ id: `m-${personId}-${teamId}`, personId, teamId, teamFtePct, active });
const data = (initiatives: Initiative[], memberships: Membership[], people: Person[] = [ana, bo]) => ({ initiatives, people, memberships, process, today });

describe('isPhaseConfirmed (§4)', () => {
  const at = (start: string) => initiative('i', 't1', { validation: plan(start, '2027-12-31', ['ana', 10]) });
  it('is Confirmed when the start month is the current or the next month', () => {
    expect(isPhaseConfirmed(at('2026-09-01'), 'validation', process, today)).toBe(true);
    expect(isPhaseConfirmed(at('2026-10-31'), 'validation', process, today)).toBe(true);
  });
  it('is Provisional from two months out', () => {
    expect(isPhaseConfirmed(at('2026-11-01'), 'validation', process, today)).toBe(false);
  });
  it('rolls over the year end by month key, not date arithmetic', () => {
    expect(isPhaseConfirmed(at('2027-01-15'), 'validation', process, '2026-12-31')).toBe(true);
    expect(isPhaseConfirmed(at('2027-03-01'), 'validation', process, '2026-01-31')).toBe(false);
    expect(isPhaseConfirmed(at('2026-03-01'), 'validation', process, '2026-01-31')).toBe(false);
  });
  it('is Provisional without a start date', () => {
    expect(isPhaseConfirmed(initiative('i', 't1', { validation: { allocations: [] } }), 'validation', process, today)).toBe(false);
  });
});

describe('teamCapacity (§5.8, §7.2)', () => {
  it('runs from the current month to the last month with an allocation', () => {
    const cap = teamCapacity('t1', data([initiative('i1', 't1', { validation: plan('2026-07-01', '2026-12-15', ['ana', 50]) })], [mem('ana', 't1', 60)]));
    expect(cap.months).toEqual(['2026-09', '2026-10', '2026-11', '2026-12']);
  });

  it('has no months when nothing is allocated from the current month on', () => {
    const cap = teamCapacity('t1', data([initiative('i1', 't1', { validation: plan('2026-01-01', '2026-06-30', ['ana', 50]) })], [mem('ana', 't1', 60)]));
    expect(cap.months).toEqual([]);
  });

  it('flags a month above the Team FTE %, and not one exactly at it', () => {
    const inits = [initiative('i1', 't1', { validation: plan('2026-09-01', '2026-09-30', ['ana', 60]), development: plan('2026-10-01', '2026-10-31', ['ana', 70]) })];
    const [row] = teamCapacity('t1', data(inits, [mem('ana', 't1', 60)])).rows;
    expect(row.cells.map((c) => [c.month, c.teamPct, c.overTeamFte, c.overCapacity])).toEqual([
      ['2026-09', 60, false, false],
      ['2026-10', 70, true, false],
    ]);
  });

  it('flags the Capacity % across all teams, counting the other team too', () => {
    const inits = [
      initiative('i1', 't1', { validation: plan('2026-09-01', '2026-09-30', ['ana', 50]) }),
      initiative('i2', 't2', { validation: plan('2026-09-01', '2026-09-30', ['ana', 60]) }),
    ];
    const [row] = teamCapacity('t1', data(inits, [mem('ana', 't1', 50), mem('ana', 't2', 50)])).rows;
    expect(row.cells[0]).toMatchObject({ teamPct: 50, totalPct: 110, overTeamFte: false, overCapacity: true });
  });

  it('counts only Active initiatives', () => {
    const phases = { validation: plan('2026-09-01', '2026-09-30', ['ana', 90]) };
    const inits = [initiative('i1', 't1', phases, { status: 'On Hold' }), initiative('i2', 't1', phases, { status: 'Closed' }), initiative('i3', 't1', phases, { status: 'Cancelled' })];
    expect(teamCapacity('t1', data(inits, [mem('ana', 't1', 60)])).months).toEqual([]);
  });

  it('keeps Provisional allocations out of the ceilings and reports them apart', () => {
    const inits = [initiative('i1', 't1', { validation: plan('2026-09-01', '2026-09-30', ['ana', 40]), development: plan('2026-12-01', '2026-12-31', ['ana', 90]) })];
    const [row] = teamCapacity('t1', data(inits, [mem('ana', 't1', 60)])).rows;
    expect(row.cells.find((c) => c.month === '2026-12')).toMatchObject({ teamPct: 0, provisionalPct: 90, totalPct: 0, overTeamFte: false });
  });

  it('counts a month a phase touches in full, and both of two overlapping phases', () => {
    const inits = [initiative('i1', 't1', { validation: plan('2026-09-20', '2026-10-05', ['ana', 30]), development: plan('2026-10-01', '2026-10-31', ['ana', 40]) })];
    const [row] = teamCapacity('t1', data(inits, [mem('ana', 't1', 100)])).rows;
    expect(row.cells.map((c) => c.teamPct)).toEqual([30, 70]);
  });

  it('ignores a phase without both dates or with an inverted period', () => {
    const inits = [initiative('i1', 't1', { validation: { startDate: '2026-09-01', allocations: [{ id: 'a', personId: 'ana', allocationPct: 50 }] }, development: plan('2026-10-31', '2026-10-01', ['ana', 50]) })];
    expect(teamCapacity('t1', data(inits, [mem('ana', 't1', 60)])).months).toEqual([]);
  });

  it('does not trip on float sums', () => {
    const inits = [initiative('i1', 't1', { validation: plan('2026-09-01', '2026-09-30', ['ana', 0.1]), development: plan('2026-09-01', '2026-09-30', ['ana', 0.2]) })];
    const [row] = teamCapacity('t1', data(inits, [mem('ana', 't1', 0.3)])).rows;
    expect(row.cells[0].overTeamFte).toBe(false);
  });

  it('lists the contributions to a month, other teams included', () => {
    const inits = [
      initiative('i1', 't1', { validation: plan('2026-09-01', '2026-09-30', ['ana', 50]) }),
      initiative('i2', 't2', { development: plan('2026-09-01', '2026-09-30', ['ana', 20]) }),
    ];
    const cap = teamCapacity('t1', data(inits, [mem('ana', 't1', 60), mem('ana', 't2', 40)]));
    expect(loadsIn(cap.loads, 'ana', '2026-09').map((l) => [l.initiativeId, l.teamId, l.phaseLabel, l.allocationPct, l.confirmed])).toEqual([
      ['i1', 't1', 'Validation', 50, true],
      ['i2', 't2', 'Development', 20, true],
    ]);
  });

  it('sorts rows by name and gives a member with no allocations an empty row', () => {
    const inits = [initiative('i1', 't1', { validation: plan('2026-09-01', '2026-09-30', ['bo', 20]) })];
    const cap = teamCapacity('t1', data(inits, [mem('bo', 't1', 50), mem('ana', 't1', 50)]));
    expect(cap.rows.map((r) => r.person.name)).toEqual(['Ana', 'Bo']);
    expect(cap.rows[0].cells.map((c) => c.teamPct)).toEqual([0]);
  });

  it('gives an allocated person who left the team a row of their own, with no Team FTE %', () => {
    const inits = [initiative('i1', 't1', { validation: plan('2026-09-01', '2026-09-30', ['ana', 30], ['bo', 20]) })];
    const cap = teamCapacity('t1', data(inits, [mem('ana', 't1', 60)]));
    expect(cap.rows.map((r) => [r.person.name, r.member, r.teamFtePct])).toEqual([
      ['Ana', true, 60],
      ['Bo', false, null],
    ]);
    expect(cap.rows[1].stranded).toHaveLength(1);
    expect(cap.rows[1].cells[0]).toMatchObject({ teamPct: 20, overTeamFte: false });
  });

  it('treats a deactivated person as no longer a member', () => {
    const inits = [initiative('i1', 't1', { validation: plan('2026-09-01', '2026-09-30', ['ana', 30]) })];
    const cap = teamCapacity('t1', data(inits, [mem('ana', 't1', 60)], [{ ...ana, active: false }]));
    expect(cap.rows[0]).toMatchObject({ member: false });
  });

  it('notes when the Team FTE %s add up to more than the Capacity %', () => {
    const inits = [initiative('i1', 't1', { validation: plan('2026-09-01', '2026-09-30', ['ana', 10]) })];
    const [row] = teamCapacity('t1', data(inits, [mem('ana', 't1', 70), mem('ana', 't2', 50)])).rows;
    expect(row.fteSumOverCapacity).toEqual({ claimedPct: 120, capacityPct: 100 });
    const [fine] = teamCapacity('t1', data(inits, [mem('ana', 't1', 70), mem('ana', 't2', 30)])).rows;
    expect(fine.fteSumOverCapacity).toBeNull();
  });
});

describe('teamHasCapacityWarning (§5.7)', () => {
  const inits = [initiative('i1', 't1', { validation: plan('2026-09-01', '2026-09-30', ['ana', 80]) })];
  it('is true when a member is over a ceiling', () => {
    expect(teamHasCapacityWarning(teamCapacity('t1', data(inits, [mem('ana', 't1', 60)])))).toBe(true);
  });
  it('is true for an allocation that outlived its membership', () => {
    expect(teamHasCapacityWarning(teamCapacity('t1', data(inits, [])))).toBe(true);
  });
  it('is true when the Team FTE %s add up to more than the Capacity %, even with nothing allocated', () => {
    expect(teamHasCapacityWarning(teamCapacity('t1', data([], [mem('ana', 't1', 70), mem('ana', 't2', 50)])))).toBe(true);
  });
  it('is false when nothing is over', () => {
    expect(teamHasCapacityWarning(teamCapacity('t1', data(inits, [mem('ana', 't1', 90)])))).toBe(false);
  });
});

describe('allocationWarnings (§5.4)', () => {
  const inits = [
    initiative('i1', 't1', { validation: plan('2026-09-01', '2026-11-30', ['ana', 50]) }),
    initiative('i2', 't2', { validation: plan('2026-10-01', '2026-10-31', ['ana', 60]) }),
  ];
  const memberships = [mem('ana', 't1', 40), mem('ana', 't2', 60)];
  it('names the months over each ceiling within the phase', () => {
    expect(allocationWarnings(inits[0], 'validation', 'ana', data(inits, memberships))).toEqual({
      notMember: false,
      overTeamFteMonths: ['2026-09', '2026-10', '2026-11'],
      overCapacityMonths: ['2026-10'],
    });
  });
  it('is silent for a Provisional phase, whose allocation is not counted', () => {
    const late = [initiative('i1', 't1', { validation: plan('2027-03-01', '2027-04-30', ['ana', 90]) })];
    expect(allocationWarnings(late[0], 'validation', 'ana', data(late, memberships))).toEqual({ notMember: false, overTeamFteMonths: [], overCapacityMonths: [] });
  });
  it('flags a person who is no longer a member, without a Team FTE % check', () => {
    expect(allocationWarnings(inits[0], 'validation', 'ana', data(inits, [mem('ana', 't2', 60)]))).toMatchObject({ notMember: true, overTeamFteMonths: [] });
  });
  it('is silent for an initiative that is not Active, except for membership', () => {
    const held = [{ ...inits[0], status: 'On Hold' as const }];
    expect(allocationWarnings(held[0], 'validation', 'ana', data(held, [mem('ana', 't1', 10)]))).toEqual({ notMember: false, overTeamFteMonths: [], overCapacityMonths: [] });
    expect(allocationWarnings(held[0], 'validation', 'ana', data(held, []))).toMatchObject({ notMember: true });
  });
});

describe('month helpers', () => {
  it('formats a month key', () => {
    expect(formatMonth('2026-09')).toBe('Sep 2026');
    expect(formatMonthShort('2026-09')).toBe('Sep 26');
  });
  it('merges consecutive months into ranges', () => {
    expect(formatMonthRanges(['2026-11', '2026-12', '2027-01'])).toBe('Nov 2026 – Jan 2027');
    expect(formatMonthRanges(['2026-09', '2026-11', '2026-12'])).toBe('Sep 2026, Nov – Dec 2026');
    expect(formatMonthRanges(['2026-09'])).toBe('Sep 2026');
  });
});
