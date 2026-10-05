import { describe, expect, it } from 'vitest';
import type { Initiative } from './types';
import { defaultBrandPack } from '../brand/defaultBrand';
import { buildBaselineDataset } from './baseline';
import { changedInitiatives, fingerprint, formatSince, keyFigureSnapshot, hasChangedSince, previousFigures, seenRecord, type KeyFigureSnapshot } from './seen';

const figures: KeyFigureSnapshot = { estimate: 381_600, deviation: 0, phase: 'Development', gate: '2 of 5 complete' };
const initiative = { id: 'a', name: 'Checkout Redesign', status: 'Active', teamId: 't' } as Initiative;

describe('change detection (§9.9)', () => {
  const record = seenRecord(initiative, figures, 0);

  it('is unchanged for the same file and figures, whatever order the file wrote its keys in', () => {
    expect(hasChangedSince(record, { teamId: 't', status: 'Active', name: 'Checkout Redesign', id: 'a' } as Initiative, figures)).toBe(false);
  });

  it('is changed when a key figure differs', () => {
    expect(hasChangedSince(record, initiative, { ...figures, estimate: 394_800 })).toBe(true);
  });

  it('is changed when only the file differs, with the four figures equal', () => {
    expect(hasChangedSince(record, { ...initiative, name: 'Checkout' }, figures)).toBe(true);
    expect(fingerprint({ ...initiative, name: 'Checkout' })).not.toBe(fingerprint(initiative));
  });

  it('names only the figures that differ, with their earlier value', () => {
    expect(previousFigures(record, { ...figures, estimate: 394_800 })).toEqual({ estimate: 381_600 });
    expect(previousFigures(record, figures)).toEqual({});
  });
});

describe('formatSince', () => {
  const now = new Date(2026, 9, 5, 12);
  it('says today and yesterday, otherwise the weekday and date', () => {
    expect(formatSince(new Date(2026, 9, 5, 8).getTime(), now)).toBe('today');
    expect(formatSince(new Date(2026, 9, 4, 23).getTime(), now)).toBe('yesterday');
    expect(formatSince(new Date(2026, 8, 29, 9).getTime(), now)).toBe('Tuesday 29 Sep');
  });
});

describe('changedInitiatives', () => {
  const baseline = buildBaselineDataset(defaultBrandPack);
  const data = { roles: baseline.roles, countries: baseline.countries };
  const { process } = defaultBrandPack;
  const other = { id: 'b', name: 'Fraud Detection', status: 'Active', teamId: 't' } as Initiative;

  it('names only the recorded initiatives that changed, with when they were last looked at and their figures now', () => {
    const records = new Map([
      ['a', seenRecord(initiative, { ...figures, estimate: 1 }, 5)],
      ['b', seenRecord(other, keyFigureSnapshot(other, process, [], data), 9)],
    ]);
    const found = changedInitiatives(records, [initiative, other, { ...initiative, id: 'c' }], process, [], data);
    expect([...found.keys()]).toEqual(['a']);
    expect(found.get('a')).toMatchObject({ since: 5, figures: { estimate: 0 } });
  });
});

describe('fingerprint', () => {
  it('is worked out once per initiative object', () => {
    const entry = { ...initiative };
    const first = fingerprint(entry);
    expect(fingerprint(entry)).toBe(first);
    expect(fingerprint({ ...entry })).toBe(first);
  });
});
