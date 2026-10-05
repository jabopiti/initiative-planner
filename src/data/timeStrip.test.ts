import { describe, expect, it } from 'vitest';
import { defaultBrandPack } from '../brand/defaultBrand';
import { stripMonthLabel, timeStrip } from './timeStrip';
import type { Country, GateRecord, Initiative, Person, Role } from './types';

const process = defaultBrandPack.process;
const [discovery, validation, development, rollout] = process.map((p) => p.id);

const roles: Role[] = [{ id: 'dev', name: 'Developer', abbreviation: 'Dev', costFactor: 1, active: true }];
const countries: Country[] = [{ id: 'de', name: 'Germany', code: 'DE', active: true, ratesByYear: [2026, 2027].map((year) => ({ year, dayRate: 800, workingDaysByMonth: Array(12).fill(20) })) }];
const ana: Person = { id: 'ana', name: 'Ana', countryId: 'de', roleId: 'dev', capacityPct: 100, active: true };
const data = { roles, countries };

const passed: GateRecord = { outcome: 'passed', passedOn: '2026-07-01', checklist: [] };
const initiative = (extra: Partial<Initiative> = {}): Initiative => ({ id: 'i1', name: 'Checkout Redesign', teamId: 't1', status: 'Active', ...extra });
const ids = (phases: { phase: { id: string } }[]) => phases.map((p) => p.phase.id);

/** Checkout Redesign: Discovery and Validation passed, Development current — Validation May–Jul 2026, Development Aug 2026 – Jan 2027. */
const checkout = initiative({
  gates: { [discovery]: passed, [validation]: passed },
  phases: {
    [validation]: { startDate: '2026-05-01', endDate: '2026-07-31', allocations: [{ id: 'a1', personId: 'ana', allocationPct: 50 }] },
    [development]: { startDate: '2026-08-01', endDate: '2027-01-31', allocations: [{ id: 'a2', personId: 'ana', allocationPct: 100 }] },
  },
});

describe('timeStrip (§5.4)', () => {
  it('puts dated phases on one month axis, and phases without a period as blocks at their place in phase order', () => {
    const strip = timeStrip(checkout, process, [ana], data, '2026-10-04');
    expect(ids(strip.before)).toEqual([discovery]);
    expect(ids(strip.axis)).toEqual([validation, development]);
    expect(ids(strip.after)).toEqual([rollout]);
    expect(strip.before[0].placement).toEqual({ kind: 'not-costed' });
    expect(strip.months.map((m) => m.key)).toEqual(['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12', '2027-01']);
    expect(strip.months[0].left).toBe(0);
  });

  it('sizes each dated phase by its period, by day', () => {
    const [v, d] = timeStrip(checkout, process, [ana], data, '2026-10-04').axis.map((p) => p.placement);
    // 92 days of 276 for Validation, the remaining 184 for Development: the two meet without a gap.
    expect(v).toMatchObject({ kind: 'axis', left: 0, start: '2026-05-01', end: '2026-07-31' });
    if (v.kind !== 'axis' || d.kind !== 'axis') throw new Error('expected axis placements');
    expect(v.width).toBeCloseTo(92 / 276);
    expect(d.left).toBeCloseTo(92 / 276);
    expect(d.left + d.width).toBeCloseTo(1);
  });

  it('marks done, current and ahead, with each costed phase\'s cost and none for a phase the process doesn\'t cost', () => {
    const strip = timeStrip(checkout, process, [ana], data, '2026-10-04');
    expect([...strip.before, ...strip.axis, ...strip.after].map((p) => p.state)).toEqual(['done', 'done', 'current', 'ahead']);
    expect(strip.before[0].cost).toBeUndefined();
    expect(strip.axis[1].cost).toBeGreaterThan(0);
  });

  it('marks Today on the axis', () => {
    const { today } = timeStrip(checkout, process, [ana], data, '2026-10-04');
    expect(today.at).toBe('axis');
    if (today.at === 'axis') expect(today.position).toBeCloseTo((92 + 31 + 30 + 3) / 276);
  });

  it('shows every phase as a block when none has a period, Today on the current one', () => {
    const strip = timeStrip(initiative(), process, [ana], data, '2026-10-04');
    expect(ids(strip.before)).toEqual(process.map((p) => p.id));
    expect(strip.before.map((p) => p.placement.kind)).toEqual(['not-costed', 'no-period', 'no-period', 'not-costed']);
    expect(strip.axis).toEqual([]);
    expect(strip.today).toEqual({ at: 'block', phaseId: discovery });
  });

  it('puts Today on the current phase\'s block when that phase has no period and today is off the axis', () => {
    const later = initiative({ phases: { [validation]: { startDate: '2027-01-01', endDate: '2027-03-31', allocations: [] } } });
    expect(timeStrip(later, process, [ana], data, '2026-10-04').today).toEqual({ at: 'block', phaseId: discovery });
  });

  it('puts Today past the axis end once every period has passed, and before its start when the plan lies ahead', () => {
    expect(timeStrip(checkout, process, [ana], data, '2027-03-01').today).toEqual({ at: 'after' });
    const ahead = initiative({ gates: { [discovery]: passed }, phases: { [validation]: { startDate: '2027-01-01', endDate: '2027-03-31', allocations: [] } } });
    expect(timeStrip(ahead, process, [ana], data, '2026-10-04').today).toEqual({ at: 'before' });
  });

  it('shows a costed phase with an inverted period as a block without a period', () => {
    const inverted = initiative({ phases: { [validation]: { startDate: '2026-11-01', endDate: '2026-10-01', allocations: [] } } });
    expect(timeStrip(inverted, process, [ana], data, '2026-10-04').before.find((p) => p.phase.id === validation)?.placement).toEqual({ kind: 'no-period' });
  });

  it('shows a frozen phase at its snapshot\'s period', () => {
    const frozen = initiative({
      gates: { [discovery]: passed, [validation]: { ...passed, frozenSnapshot: { startDate: '2026-04-01', endDate: '2026-06-30', allocations: [], costItems: [], estimateByMonth: {} } } },
      phases: { [validation]: { startDate: '2026-05-01', endDate: '2026-07-31', allocations: [] } },
    });
    expect(timeStrip(frozen, process, [ana], data, '2026-10-04').axis[0].placement).toMatchObject({ start: '2026-04-01', end: '2026-06-30' });
  });

  it('shows every phase as done once the initiative is Closed', () => {
    const closed = { ...checkout, status: 'Closed' as const, gates: Object.fromEntries(process.map((p) => [p.id, passed])) };
    const strip = timeStrip(closed, process, [ana], data, '2026-10-04');
    expect([...strip.before, ...strip.axis, ...strip.after].every((p) => p.state === 'done')).toBe(true);
  });
});

describe('stripMonthLabel', () => {
  it('names the month, with the year when asked', () => {
    expect(stripMonthLabel('2026-05', true)).toBe('May 2026');
    expect(stripMonthLabel('2026-06', false)).toBe('Jun');
  });
});
