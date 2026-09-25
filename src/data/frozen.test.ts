import { describe, expect, it } from 'vitest';
import { frozenPaths, isPhaseFrozen } from './frozen';
import type { Initiative } from './types';

const initiative = (gates: Initiative['gates']): Initiative => ({ id: 'i1', name: 'Checkout', teamId: 't1', status: 'Active', gates });

describe('isPhaseFrozen (§8.1)', () => {
  it('is false when the phase has no gate record', () => {
    expect(isPhaseFrozen(initiative(undefined), 'validation')).toBe(false);
  });

  it('is true once the phase’s own exit gate has passed', () => {
    expect(isPhaseFrozen(initiative({ validation: { outcome: 'passed', passedOn: '2026-01-01', checklist: [] } }), 'validation')).toBe(true);
  });

  it('is false for a skipped gate (§8.2): a skip freezes nothing', () => {
    expect(isPhaseFrozen(initiative({ validation: { outcome: 'skipped', skipReason: 'n/a', checklist: [] } }), 'validation')).toBe(false);
  });
});

describe('frozenPaths (§10.5, §8.1)', () => {
  it('pins a frozen phase’s period, allocations and cost items, but not its actuals', () => {
    const doc = initiative({ validation: { outcome: 'passed', passedOn: '2026-01-01', checklist: [] } });
    expect(frozenPaths({ ...doc, phases: { validation: { startDate: '2026-01-01', endDate: '2026-02-01', allocations: [] } } })).toEqual(
      expect.arrayContaining([['phases', 'validation', 'startDate'], ['phases', 'validation', 'endDate'], ['phases', 'validation', 'allocations'], ['phases', 'validation', 'costItems']]),
    );
  });

  it('pins any gate record that exists, passed or skipped, as one atomic value', () => {
    const doc = initiative({ validation: { outcome: 'passed', passedOn: '2026-01-01', checklist: [] }, discovery: { outcome: 'skipped', skipReason: 'n/a', checklist: [] } });
    expect(frozenPaths(doc)).toEqual(expect.arrayContaining([['gates', 'validation'], ['gates', 'discovery']]));
  });

  it('pins nothing for a phase with no gate record', () => {
    const doc: Initiative = { id: 'i1', name: 'Checkout', teamId: 't1', status: 'Active', phases: { validation: { startDate: '2026-01-01', endDate: '2026-02-01', allocations: [] } } };
    expect(frozenPaths(doc)).toEqual([]);
  });
});
