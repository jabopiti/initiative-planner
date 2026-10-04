import { describe, expect, it } from 'vitest';
import { defaultBrandPack } from '../brand/defaultBrand';
import { nextStepPhase, overlapWithPrevious, phaseSummary, planningGap } from './phaseSummary';
import type { Country, Initiative, PhasePlan, Person, Role } from './types';

const process = defaultBrandPack.process;
const costed = process.filter((p) => p.costed);
const [first, second] = [costed[0].id, costed[1].id];

const roles: Role[] = [{ id: 'dev', name: 'Developer', abbreviation: 'Dev', costFactor: 1, active: true }];
const countries: Country[] = [{ id: 'de', name: 'Germany', code: 'DE', active: true, ratesByYear: [{ year: 2026, dayRate: 800, workingDaysByMonth: Array(12).fill(20) }] }];
const ana: Person = { id: 'ana', name: 'Ana', countryId: 'de', roleId: 'dev', capacityPct: 100, active: true };
const data = { roles, countries };

const initiative = (extra: Partial<Initiative> = {}): Initiative => ({ id: 'i1', name: 'Checkout', teamId: 't1', status: 'Active', ...extra });
const plan = (extra: Partial<PhasePlan> = {}): PhasePlan => ({ allocations: [], ...extra });
const withAlloc = { allocations: [{ id: 'a1', personId: 'ana', allocationPct: 50 }] };

describe('phaseSummary (§5.4, §7.3)', () => {
  it('is uncosted and empty for an unplanned phase', () => {
    const s = phaseSummary(initiative(), first, plan(), [ana], data);
    expect(s).toMatchObject({ hasPeriod: false, inverted: false, costed: false, frozen: false, hasCost: false, coverage: 'estimate', total: 0, months: [] });
  });

  it('has cost with an allocation, a cost item or a recorded actual, alone', () => {
    const period = { startDate: '2026-10-01', endDate: '2026-10-31' };
    expect(phaseSummary(initiative(), first, plan({ ...period, ...withAlloc }), [ana], data).hasCost).toBe(true);
    expect(phaseSummary(initiative(), first, plan({ costItems: [{ id: 'c', label: 'Licence', amount: 10, timing: 'month', month: '2026-10' } as never] }), [ana], data).hasCost).toBe(true);
    expect(phaseSummary(initiative(), first, plan({ actualMonths: { '2026-10': 5 } }), [ana], data).hasCost).toBe(true);
  });

  it('flags an inverted period: it has a period but is not costed and has no months', () => {
    const s = phaseSummary(initiative(), first, plan({ startDate: '2026-11-01', endDate: '2026-10-01', ...withAlloc }), [ana], data);
    expect(s).toMatchObject({ hasPeriod: true, inverted: true, costed: false, months: [] });
  });

  it('lists the months of a valid period and reports coverage from the recorded actuals', () => {
    const period = { startDate: '2026-10-01', endDate: '2026-11-30', ...withAlloc };
    expect(phaseSummary(initiative(), first, plan(period), [ana], data)).toMatchObject({ costed: true, months: ['2026-10', '2026-11'], coverage: 'estimate' });
    expect(phaseSummary(initiative(), first, plan({ ...period, actualMonths: { '2026-10': 5 } }), [ana], data).coverage).toBe('forecast');
    expect(phaseSummary(initiative(), first, plan({ ...period, actualMonths: { '2026-10': 5, '2026-11': 6 } }), [ana], data).coverage).toBe('actual');
  });

  it('shows the frozen snapshot, not the live rates, once the phase’s gate passed', () => {
    const snapshot = { startDate: '2026-10-01', endDate: '2026-10-31', allocations: [], costItems: [], estimateByMonth: { '2026-10': 1234 } };
    const doc = initiative({ gates: { [first]: { outcome: 'passed', passedOn: '2026-11-01', checklist: [], frozenSnapshot: snapshot } as never } });
    const s = phaseSummary(doc, first, plan({ startDate: '2026-10-01', endDate: '2026-10-31', ...withAlloc }), [ana], data);
    expect(s).toMatchObject({ frozen: true, coverage: 'frozen', estimateByMonth: { '2026-10': 1234 }, total: 1234 });
    expect(s.snapshot).toBe(snapshot);
  });

  it('is frozen without a snapshot too: the live estimate is then used', () => {
    const doc = initiative({ gates: { [first]: { outcome: 'passed', passedOn: '2026-11-01', checklist: [] } as never } });
    const s = phaseSummary(doc, first, plan({ startDate: '2026-10-01', endDate: '2026-10-31', ...withAlloc }), [ana], data);
    expect(s).toMatchObject({ frozen: true, coverage: 'frozen', snapshot: undefined });
    expect(s.estimateByMonth['2026-10']).toBeGreaterThan(0);
  });
});

describe('overlapWithPrevious (§5.4)', () => {
  it('returns the previous end when this phase starts on or before it', () => {
    expect(overlapWithPrevious(plan({ endDate: '2026-10-31' }), plan({ startDate: '2026-10-31' }))).toBe('2026-10-31');
    expect(overlapWithPrevious(plan({ endDate: '2026-10-31' }), plan({ startDate: '2026-10-15' }))).toBe('2026-10-31');
  });

  it('is null when the phase starts after it, or either date is missing', () => {
    expect(overlapWithPrevious(plan({ endDate: '2026-10-31' }), plan({ startDate: '2026-11-01' }))).toBeNull();
    expect(overlapWithPrevious(undefined, plan({ startDate: '2026-11-01' }))).toBeNull();
    expect(overlapWithPrevious(plan({ endDate: '2026-10-31' }), plan())).toBeNull();
  });
});

describe('planningGap and nextStepPhase (§5.4)', () => {
  it('lacks the period first, then the people, then nothing', () => {
    expect(planningGap(plan())).toBe('period');
    expect(planningGap(plan({ startDate: '2026-10-01' }))).toBe('period');
    expect(planningGap(plan({ startDate: '2026-10-01', endDate: '2026-10-31' }))).toBe('people');
    expect(planningGap(plan({ startDate: '2026-10-01', endDate: '2026-10-31', ...withAlloc }))).toBeNull();
  });

  it('is the first costed phase without a valid period and someone allocated', () => {
    expect(nextStepPhase(initiative(), process)?.id).toBe(first);
    const planned = plan({ startDate: '2026-10-01', endDate: '2026-10-31', ...withAlloc });
    expect(nextStepPhase(initiative({ phases: { [first]: planned } }), process)?.id).toBe(second);
  });

  it('counts an inverted period or a phase with nobody allocated as not planned', () => {
    expect(nextStepPhase(initiative({ phases: { [first]: plan({ startDate: '2026-11-01', endDate: '2026-10-01', ...withAlloc }) } }), process)?.id).toBe(first);
    expect(nextStepPhase(initiative({ phases: { [first]: plan({ startDate: '2026-10-01', endDate: '2026-10-31' }) } }), process)?.id).toBe(first);
  });

  it('is undefined once every costed phase is planned', () => {
    const planned = plan({ startDate: '2026-10-01', endDate: '2026-10-31', ...withAlloc });
    const phases = Object.fromEntries(costed.map((p) => [p.id, planned]));
    expect(nextStepPhase(initiative({ phases }), process)).toBeUndefined();
  });
});
