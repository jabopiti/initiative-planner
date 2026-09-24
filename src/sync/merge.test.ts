import { describe, expect, it } from 'vitest';
import { mergeListField, mergeRecordFields } from './merge';

interface Team {
  id: string;
  name: string;
  active: boolean;
}

describe('mergeRecordFields (§10.5 step 3)', () => {
  const base: Team = { id: 't1', name: 'Platform', active: true };

  it('keeps the user value when only the user changed a field', () => {
    const mine: Team = { ...base, name: 'Platform Squad' };
    const theirs: Team = { ...base };
    const { merged, conflicts } = mergeRecordFields(base, mine, theirs);
    expect(merged.name).toBe('Platform Squad');
    expect(conflicts).toHaveLength(0);
  });

  it('keeps the repository value when only the repository changed a field', () => {
    const mine: Team = { ...base };
    const theirs: Team = { ...base, name: 'Platform (renamed)' };
    const { merged, conflicts } = mergeRecordFields(base, mine, theirs);
    expect(merged.name).toBe('Platform (renamed)');
    expect(conflicts).toHaveLength(0);
  });

  it('keeps the value when both sides changed it to the same thing', () => {
    const mine: Team = { ...base, name: 'Growth' };
    const theirs: Team = { ...base, name: 'Growth' };
    const { merged, conflicts } = mergeRecordFields(base, mine, theirs);
    expect(merged.name).toBe('Growth');
    expect(conflicts).toHaveLength(0);
  });

  it('flags a conflict when both sides changed the same field differently, keeping theirs as the placeholder', () => {
    const mine: Team = { ...base, name: 'Platform Squad' };
    const theirs: Team = { ...base, name: 'Core Platform' };
    const { merged, conflicts } = mergeRecordFields(base, mine, theirs);
    expect(conflicts).toEqual([{ field: 'name', base: 'Platform', mine: 'Platform Squad', theirs: 'Core Platform' }]);
    expect(merged.name).toBe('Core Platform');
  });

  it('keeps an optional field that only the repository\'s version has', () => {
    const base = { id: 't1', name: 'Platform' };
    const mine = { id: 't1', name: 'Platform', note: undefined as string | undefined };
    delete (mine as { note?: string }).note;
    const theirs = { id: 't1', name: 'Platform', note: 'added elsewhere' };
    const { merged, conflicts } = mergeRecordFields<Record<string, unknown>>(base, { ...mine, name: 'Renamed' }, theirs);
    expect(conflicts).toEqual([]);
    expect(merged).toEqual({ id: 't1', name: 'Renamed', note: 'added elsewhere' });
  });

  it('merges independent fields cleanly even when a different field conflicts', () => {
    const mine: Team = { ...base, name: 'Platform Squad', active: false };
    const theirs: Team = { ...base, name: 'Core Platform' };
    const { merged, conflicts } = mergeRecordFields(base, mine, theirs);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].field).toBe('name');
    expect(merged.active).toBe(false);
  });
});

interface Allocation {
  id: string;
  personId: string;
  allocationPct: number;
}

describe('mergeListField (§10.5 step 4)', () => {
  it('keeps an item added only by the user', () => {
    const base: Allocation[] = [];
    const mine: Allocation[] = [{ id: 'a1', personId: 'p1', allocationPct: 50 }];
    const theirs: Allocation[] = [];
    const { merged } = mergeListField(base, mine, theirs);
    expect(merged).toEqual(mine);
  });

  it('keeps an item added only by the repository', () => {
    const base: Allocation[] = [];
    const mine: Allocation[] = [];
    const theirs: Allocation[] = [{ id: 'a1', personId: 'p1', allocationPct: 50 }];
    const { merged } = mergeListField(base, mine, theirs);
    expect(merged).toEqual(theirs);
  });

  it('keeps both when two different items are added concurrently', () => {
    const base: Allocation[] = [];
    const mine: Allocation[] = [{ id: 'a1', personId: 'p1', allocationPct: 50 }];
    const theirs: Allocation[] = [{ id: 'a2', personId: 'p2', allocationPct: 30 }];
    const { merged } = mergeListField(base, mine, theirs);
    expect(merged).toHaveLength(2);
    expect(merged.map((a) => a.id).sort()).toEqual(['a1', 'a2']);
  });

  it('removes an item removed on one side and unchanged on the other', () => {
    const base: Allocation[] = [{ id: 'a1', personId: 'p1', allocationPct: 50 }];
    const mine: Allocation[] = [];
    const theirs: Allocation[] = [{ id: 'a1', personId: 'p1', allocationPct: 50 }];
    const { merged } = mergeListField(base, mine, theirs);
    expect(merged).toHaveLength(0);
  });

  it('merges a shared item field by field, flagging a same-field conflict', () => {
    const base: Allocation[] = [{ id: 'a1', personId: 'p1', allocationPct: 50 }];
    const mine: Allocation[] = [{ id: 'a1', personId: 'p1', allocationPct: 60 }];
    const theirs: Allocation[] = [{ id: 'a1', personId: 'p1', allocationPct: 70 }];
    const { merged, conflicts } = mergeListField(base, mine, theirs);
    expect(merged).toHaveLength(1);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].fields).toEqual(['allocationPct']);
  });

  it('keeps a locally-edited item instead of silently honouring its remote deletion', () => {
    const base: Allocation[] = [{ id: 'a1', personId: 'p1', allocationPct: 50 }];
    const mine: Allocation[] = [{ id: 'a1', personId: 'p1', allocationPct: 60 }]; // edited locally
    const theirs: Allocation[] = []; // deleted remotely
    const { merged } = mergeListField(base, mine, theirs);
    expect(merged).toEqual(mine);
  });

  it('keeps a remotely-edited item instead of silently honouring its local deletion', () => {
    const base: Allocation[] = [{ id: 'a1', personId: 'p1', allocationPct: 50 }];
    const mine: Allocation[] = []; // deleted locally
    const theirs: Allocation[] = [{ id: 'a1', personId: 'p1', allocationPct: 70 }]; // edited remotely
    const { merged } = mergeListField(base, mine, theirs);
    expect(merged).toEqual(theirs);
  });

  it('still removes an item deleted on one side and genuinely unchanged on the other', () => {
    const base: Allocation[] = [{ id: 'a1', personId: 'p1', allocationPct: 50 }];
    const mine: Allocation[] = []; // deleted locally
    const theirs: Allocation[] = [{ id: 'a1', personId: 'p1', allocationPct: 50 }]; // unchanged remotely
    const { merged } = mergeListField(base, mine, theirs);
    expect(merged).toHaveLength(0);
  });
});
