import { describe, expect, it } from 'vitest';
import type { Initiative } from '../data/types';
import { mergeInitiative } from './mergeInitiative';

const base: Initiative = {
  id: 'i1',
  name: 'Payments API',
  teamId: 't1',
  status: 'Active',
  phases: {
    validation: {
      startDate: '2026-10-01',
      endDate: '2026-11-30',
      allocations: [{ id: 'a1', personId: 'ana', allocationPct: 50 }],
    },
  },
};

describe('merging an initiative file (§10.5)', () => {
  it('keeps an allocation added on each side and a date changed on only one', () => {
    const mine: Initiative = {
      ...base,
      phases: {
        validation: {
          ...base.phases!.validation,
          allocations: [...base.phases!.validation.allocations, { id: 'a2', personId: 'ben', allocationPct: 40 }],
        },
      },
    };
    const theirs: Initiative = {
      ...base,
      phases: {
        validation: {
          ...base.phases!.validation,
          endDate: '2026-12-15',
          allocations: [...base.phases!.validation.allocations, { id: 'a3', personId: 'cai', allocationPct: 20 }],
        },
      },
    };
    const { merged, conflicts } = mergeInitiative(base, mine, theirs);
    expect(conflicts).toEqual([]);
    expect(merged.phases!.validation.endDate).toBe('2026-12-15');
    expect(merged.phases!.validation.allocations.map((a) => a.id).sort()).toEqual(['a1', 'a2', 'a3']);
  });

  it('merges phases that only one side has planned', () => {
    const theirs: Initiative = { ...base, phases: { ...base.phases, development: { startDate: '2027-01-04', allocations: [] } } };
    const { merged } = mergeInitiative(base, base, theirs);
    expect(merged.phases!.development.startDate).toBe('2027-01-04');
  });

  it('surfaces the same date changed to different values, defaulting to theirs until resolved', () => {
    const mine = { ...base, phases: { validation: { ...base.phases!.validation, endDate: '2026-12-01' } } };
    const theirs = { ...base, phases: { validation: { ...base.phases!.validation, endDate: '2026-12-15' } } };
    const { merged, conflicts } = mergeInitiative(base, mine, theirs);
    expect(merged.phases!.validation.endDate).toBe('2026-12-15');
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].mine).toBe('2026-12-01');
    expect(conflicts[0].theirs).toBe('2026-12-15');
    expect(conflicts[0].apply(merged, conflicts[0].mine).phases!.validation.endDate).toBe('2026-12-01');
  });

  it('surfaces the same allocation changed to different percentages', () => {
    const edit = (pct: number): Initiative => ({
      ...base,
      phases: { validation: { ...base.phases!.validation, allocations: [{ id: 'a1', personId: 'ana', allocationPct: pct }] } },
    });
    const { merged, conflicts } = mergeInitiative(base, edit(60), edit(70));
    expect(conflicts).toHaveLength(1);
    expect(merged.phases!.validation.allocations[0].allocationPct).toBe(70);
    const mineWins = conflicts[0].apply(merged, conflicts[0].mine);
    expect(mineWins.phases!.validation.allocations[0].allocationPct).toBe(60);
  });
});
