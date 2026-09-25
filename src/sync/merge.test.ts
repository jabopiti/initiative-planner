import { describe, expect, it } from 'vitest';
import { frozenPaths } from '../data/frozen';
import type { Allocation, Initiative, PhasePlan, Team } from '../data/types';
import { changedPaths, getAtPath, mergeDocument, pathKey, setAtPath, type MergeConflict } from './merge';

const keys = (conflicts: MergeConflict[]) => conflicts.map((c) => pathKey(c.path));

describe('§10.5 step 3: each field', () => {
  const base: Team = { id: 't1', name: 'Platform', active: true };

  it('keeps the user value when only the user changed a field', () => {
    const { merged, conflicts } = mergeDocument(base, { ...base, name: 'Platform Squad' }, { ...base });
    expect(merged.name).toBe('Platform Squad');
    expect(conflicts).toHaveLength(0);
  });

  it('keeps the repository value when only the repository changed a field', () => {
    const { merged, conflicts } = mergeDocument(base, { ...base }, { ...base, name: 'Platform (renamed)' });
    expect(merged.name).toBe('Platform (renamed)');
    expect(conflicts).toHaveLength(0);
  });

  it('keeps the value when both sides changed it to the same thing', () => {
    const { merged, conflicts } = mergeDocument(base, { ...base, name: 'Growth' }, { ...base, name: 'Growth' });
    expect(merged.name).toBe('Growth');
    expect(conflicts).toHaveLength(0);
  });

  it('flags a conflict when both sides changed the same field differently, keeping theirs as the placeholder', () => {
    const { merged, conflicts } = mergeDocument(base, { ...base, name: 'Platform Squad' }, { ...base, name: 'Core Platform' });
    expect(conflicts).toEqual([{ path: ['name'], base: 'Platform', mine: 'Platform Squad', theirs: 'Core Platform' }]);
    expect(merged.name).toBe('Core Platform');
  });

  it("keeps an optional field that only the repository's version has", () => {
    const plain = { id: 't1', name: 'Platform' };
    const { merged, conflicts } = mergeDocument<Record<string, unknown>>(plain, { ...plain, name: 'Renamed' }, { ...plain, note: 'added elsewhere' });
    expect(conflicts).toEqual([]);
    expect(merged).toEqual({ id: 't1', name: 'Renamed', note: 'added elsewhere' });
  });

  it('merges independent fields cleanly even when a different field conflicts', () => {
    const { merged, conflicts } = mergeDocument(base, { ...base, name: 'Platform Squad', active: false }, { ...base, name: 'Core Platform' });
    expect(keys(conflicts)).toEqual(['name']);
    expect(merged.active).toBe(false);
  });

  it('treats a field cleared on one side as a change like any other', () => {
    const plain: Record<string, unknown> = { ...base };
    const withNote = { ...plain, note: 'x' };
    expect(mergeDocument(withNote, plain, withNote).merged).toEqual(base);
    const { conflicts } = mergeDocument(withNote, plain, { ...withNote, note: 'y' });
    expect(conflicts).toEqual([{ path: ['note'], base: 'x', mine: undefined, theirs: 'y' }]);
  });

  it('merges a list without ids as one value', () => {
    const rates = (r: number[]) => ({ id: 'p1', rates: r });
    expect(mergeDocument(rates([1, 2]), rates([1, 3]), rates([1, 2])).merged.rates).toEqual([1, 3]);
    expect(keys(mergeDocument(rates([1, 2]), rates([1, 3]), rates([4, 2])).conflicts)).toEqual(['rates']);
  });
});

const alloc = (id: string, allocationPct = 50, personId = 'p1'): Allocation => ({ id, personId, allocationPct });

describe('§10.5 step 4: lists of items with an id', () => {
  it('keeps an item added only by the user', () => {
    expect(mergeDocument([], [alloc('a1')], []).merged).toEqual([alloc('a1')]);
  });

  it('keeps an item added only by the repository', () => {
    expect(mergeDocument([], [], [alloc('a1')]).merged).toEqual([alloc('a1')]);
  });

  it('keeps both when two different items are added concurrently', () => {
    const { merged, conflicts } = mergeDocument([], [alloc('a1')], [alloc('a2', 30, 'p2')]);
    expect(merged.map((a) => a.id).sort()).toEqual(['a1', 'a2']);
    expect(conflicts).toEqual([]);
  });

  it('removes an item removed on one side and unchanged on the other', () => {
    expect(mergeDocument([alloc('a1')], [], [alloc('a1')]).merged).toEqual([]);
    expect(mergeDocument([alloc('a1')], [alloc('a1')], []).merged).toEqual([]);
  });

  it('removes an item removed on both sides', () => {
    expect(mergeDocument([alloc('a1'), alloc('a2')], [alloc('a2')], [alloc('a2')]).merged).toEqual([alloc('a2')]);
  });

  it('merges a shared item field by field, flagging a same-field conflict by its path', () => {
    const { merged, conflicts } = mergeDocument([alloc('a1', 50)], [alloc('a1', 60)], [alloc('a1', 70)]);
    expect(merged).toEqual([alloc('a1', 70)]);
    expect(conflicts).toEqual([{ path: [{ id: 'a1' }, 'allocationPct'], base: 50, mine: 60, theirs: 70 }]);
  });

  it('merges different fields of a shared item without a conflict', () => {
    const { merged, conflicts } = mergeDocument([alloc('a1', 50, 'p1')], [alloc('a1', 60, 'p1')], [alloc('a1', 50, 'p2')]);
    expect(merged).toEqual([alloc('a1', 60, 'p2')]);
    expect(conflicts).toEqual([]);
  });

  it('surfaces an item edited locally and removed remotely, holding theirs (removed) until the user chooses', () => {
    const { merged, conflicts } = mergeDocument([alloc('a1', 50)], [alloc('a1', 60)], []);
    expect(merged).toEqual([]);
    expect(conflicts).toEqual([{ path: [{ id: 'a1' }], base: alloc('a1', 50), mine: alloc('a1', 60), theirs: undefined }]);
  });

  it('surfaces an item removed locally and edited remotely, holding theirs until the user chooses', () => {
    const { merged, conflicts } = mergeDocument([alloc('a1', 50)], [], [alloc('a1', 70)]);
    expect(merged).toEqual([alloc('a1', 70)]);
    expect(conflicts).toEqual([{ path: [{ id: 'a1' }], base: alloc('a1', 50), mine: undefined, theirs: alloc('a1', 70) }]);
  });
});

const base: Initiative = {
  id: 'i1',
  name: 'Payments API',
  teamId: 't1',
  status: 'Active',
  phases: {
    validation: { startDate: '2026-10-01', endDate: '2026-11-30', allocations: [alloc('a1', 50, 'ana')] },
  },
};

const withValidation = (doc: Initiative, change: Partial<PhasePlan> & Record<string, unknown>): Initiative => ({
  ...doc,
  phases: { ...doc.phases, validation: { ...doc.phases!.validation, ...change } },
});

describe('merging an initiative file (§10.5)', () => {
  it('keeps an allocation added on each side and a date changed on only one', () => {
    const mine = withValidation(base, { allocations: [alloc('a1', 50, 'ana'), alloc('a2', 40, 'ben')] });
    const theirs = withValidation(base, { endDate: '2026-12-15', allocations: [alloc('a1', 50, 'ana'), alloc('a3', 20, 'cai')] });
    const { merged, conflicts } = mergeDocument(base, mine, theirs);
    expect(conflicts).toEqual([]);
    expect(merged.phases!.validation.endDate).toBe('2026-12-15');
    expect(merged.phases!.validation.allocations.map((a) => a.id).sort()).toEqual(['a1', 'a2', 'a3']);
  });

  it('keeps a changed end date and an allocation added to the same phase, with no conflict', () => {
    const mine = withValidation(base, { endDate: '2026-12-15' });
    const theirs = withValidation(base, { allocations: [alloc('a1', 50, 'ana'), alloc('a2', 40, 'ben')] });
    const { merged, conflicts } = mergeDocument(base, mine, theirs);
    expect(conflicts).toEqual([]);
    expect(merged.phases!.validation).toEqual({ startDate: '2026-10-01', endDate: '2026-12-15', allocations: [alloc('a1', 50, 'ana'), alloc('a2', 40, 'ben')] });
  });

  it('merges phases that only one side has planned', () => {
    const theirs: Initiative = { ...base, phases: { ...base.phases, development: { startDate: '2027-01-04', allocations: [] } } };
    expect(mergeDocument(base, base, theirs).merged.phases!.development.startDate).toBe('2027-01-04');
  });

  it('merges a phase both sides planned for the first time, field by field', () => {
    const planned = (plan: PhasePlan): Initiative => ({ ...base, phases: { ...base.phases, development: plan } });
    const { merged, conflicts } = mergeDocument(base, planned({ startDate: '2027-01-04', allocations: [] }), planned({ endDate: '2027-06-30', allocations: [] }));
    expect(conflicts).toEqual([]);
    expect(merged.phases!.development).toEqual({ startDate: '2027-01-04', endDate: '2027-06-30', allocations: [] });
  });

  it('surfaces the same date changed to different values, defaulting to theirs until resolved', () => {
    const { merged, conflicts } = mergeDocument(base, withValidation(base, { endDate: '2026-12-01' }), withValidation(base, { endDate: '2026-12-15' }));
    expect(merged.phases!.validation.endDate).toBe('2026-12-15');
    expect(conflicts).toEqual([{ path: ['phases', 'validation', 'endDate'], base: '2026-11-30', mine: '2026-12-01', theirs: '2026-12-15' }]);
  });

  it('surfaces the same allocation changed to different percentages', () => {
    const edit = (pct: number) => withValidation(base, { allocations: [alloc('a1', pct, 'ana')] });
    const { merged, conflicts } = mergeDocument(base, edit(60), edit(70));
    expect(keys(conflicts)).toEqual(['phases.validation.allocations[a1].allocationPct']);
    expect(merged.phases!.validation.allocations[0].allocationPct).toBe(70);
  });

  it('merges a field no code has heard of: kept from one side, a conflict naming its path when both change it', () => {
    const extra = (doc: Initiative, fields: Record<string, unknown>, phase: Record<string, unknown>) =>
      withValidation({ ...doc, ...fields } as Initiative, phase);
    const b = extra(base, { riskScore: 1 }, { costItems: [{ id: 'c1', amount: 100 }] });

    const clean = mergeDocument(b, extra(base, { riskScore: 2 }, { costItems: [{ id: 'c1', amount: 100 }] }), extra(base, { riskScore: 1 }, { costItems: [{ id: 'c1', amount: 100 }, { id: 'c2', amount: 5 }] }));
    expect(clean.conflicts).toEqual([]);
    expect(getAtPath(clean.merged, ['riskScore'])).toBe(2);
    expect(getAtPath(clean.merged, ['phases', 'validation', 'costItems'])).toEqual([{ id: 'c1', amount: 100 }, { id: 'c2', amount: 5 }]);

    const both = mergeDocument(b, extra(base, { riskScore: 2 }, { costItems: [{ id: 'c1', amount: 200 }] }), extra(base, { riskScore: 3 }, { costItems: [{ id: 'c1', amount: 300 }] }));
    expect(keys(both.conflicts).sort()).toEqual(['phases.validation.costItems[c1].amount', 'riskScore']);
  });
});

describe('resolving a conflict sets the chosen value at its path, and only there', () => {
  it('Use mine on a date leaves the clean part of the merge as it was', () => {
    const mine = withValidation({ ...base, name: 'Payments' }, { endDate: '2026-12-01' });
    const theirs = withValidation(base, { endDate: '2026-12-15', allocations: [alloc('a1', 50, 'ana'), alloc('a2', 40, 'ben')] });
    const { merged, conflicts } = mergeDocument(base, mine, theirs);
    const resolved = setAtPath(merged, conflicts[0].path, conflicts[0].mine);
    expect(resolved).toEqual({ ...merged, phases: { validation: { ...merged.phases!.validation, endDate: '2026-12-01' } } });
    expect(resolved.name).toBe('Payments');
    expect(resolved.phases!.validation.allocations).toHaveLength(2);
  });

  it('Use mine brings back an item the other side removed; Keep theirs leaves it removed', () => {
    const { merged, conflicts } = mergeDocument([alloc('a1', 50), alloc('a2')], [alloc('a1', 60), alloc('a2')], [alloc('a2')]);
    expect(setAtPath(merged, conflicts[0].path, conflicts[0].mine)).toEqual([alloc('a2'), alloc('a1', 60)]);
    expect(setAtPath(merged, conflicts[0].path, conflicts[0].theirs)).toEqual([alloc('a2')]);
  });

  it('Use mine removes an item the user removed and the other side edited', () => {
    const { merged, conflicts } = mergeDocument([alloc('a1', 50)], [], [alloc('a1', 70)]);
    expect(setAtPath(merged, conflicts[0].path, conflicts[0].mine)).toEqual([]);
  });

  it('a field of an item that is gone by then is left alone', () => {
    expect(setAtPath([alloc('a2')], [{ id: 'a1' }, 'allocationPct'], 60)).toEqual([alloc('a2')]);
  });
});

describe('frozen phases never merge (§8.1)', () => {
  /** Test marker until slice 008 gives gates a real one: a phase carrying `frozen: true`. */
  const merge = (b: Initiative, m: Initiative, t: Initiative) =>
    mergeDocument(b, m, t, { frozen: (doc) => frozenPaths(doc, (i, id) => (i.phases?.[id] as { frozen?: boolean } | undefined)?.frozen === true) });
  const frozenBase = withValidation(base, { frozen: true });

  it('keeps the snapshot whatever either side changed in it, with no conflict', () => {
    const mine = withValidation(frozenBase, { endDate: '2027-01-31', allocations: [alloc('a1', 80, 'ana')] });
    const theirs = withValidation(frozenBase, { startDate: '2026-09-01', allocations: [alloc('a1', 50, 'ana'), alloc('a2', 10, 'ben')] });
    const { merged, conflicts } = merge(frozenBase, mine, theirs);
    expect(conflicts).toEqual([]);
    expect(merged.phases!.validation).toEqual(frozenBase.phases!.validation);
  });

  it('keeps the snapshot when only one side changed it', () => {
    const mine = withValidation(frozenBase, { endDate: '2027-01-31' });
    expect(merge(frozenBase, mine, frozenBase).merged.phases!.validation.endDate).toBe('2026-11-30');
    expect(merge(frozenBase, frozenBase, mine).merged.phases!.validation.endDate).toBe('2026-11-30');
  });

  it('still merges what freezing leaves open, such as actuals', () => {
    const mine = withValidation(frozenBase, { actuals: { '2026-10': 500 } });
    const theirs = withValidation({ ...frozenBase, name: 'Payments' }, {});
    const { merged } = merge(frozenBase, mine, theirs);
    expect(getAtPath(merged, ['phases', 'validation', 'actuals'])).toEqual({ '2026-10': 500 });
    expect(merged.name).toBe('Payments');
  });

  it('a phase frozen by one side (a gate passed meanwhile) keeps that side’s values over the other’s edit', () => {
    const passed = withValidation(base, { frozen: true });
    const edited = withValidation(base, { endDate: '2027-01-31' });
    expect(merge(base, edited, passed).merged.phases!.validation.endDate).toBe('2026-11-30');
    expect(merge(base, passed, edited).merged.phases!.validation.endDate).toBe('2026-11-30');
  });
});

describe('master files merge by the same function', () => {
  it('merges a person edited on both sides, per field, naming the person by id in the path', () => {
    const person = { id: 'p1', name: 'Ana', capacityPct: 100, active: true };
    const { merged, conflicts } = mergeDocument(
      [person],
      [{ ...person, name: 'Ana Silva', capacityPct: 80 }],
      [{ ...person, capacityPct: 90, active: false }],
    );
    expect(merged).toEqual([{ id: 'p1', name: 'Ana Silva', capacityPct: 90, active: false }]);
    expect(conflicts).toEqual([{ path: [{ id: 'p1' }, 'capacityPct'], base: 100, mine: 80, theirs: 90 }]);
  });
});

describe('changedPaths', () => {
  it('names the changed value, and an added list item at the item', () => {
    const before = { name: 'A', phases: [{ id: 'p1', end: '2027-03-31', allocations: [] }] };
    const after = { name: 'A', phases: [{ id: 'p1', end: '2027-04-30', allocations: [{ id: 'a1', pct: 50 }] }] };

    expect(changedPaths(before, after).map(pathKey)).toEqual(['phases[p1].end', 'phases[p1].allocations[a1]']);
  });

  it('lists nothing for what was removed, or for equal documents', () => {
    expect(changedPaths({ a: 1, b: 2 }, { a: 1 })).toEqual([]);
    expect(changedPaths([{ id: 'x' }], [])).toEqual([]);
    expect(changedPaths({ a: [1, 2] }, { a: [1, 2] })).toEqual([]);
  });

  it('treats a list that is not made of identified items as one value', () => {
    expect(changedPaths({ tags: ['a'] }, { tags: ['a', 'b'] }).map(pathKey)).toEqual(['tags']);
  });
});
