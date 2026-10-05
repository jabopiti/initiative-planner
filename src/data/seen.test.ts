import { describe, expect, it } from 'vitest';
import type { Initiative } from './types';
import { fingerprint, formatSince, hasChangedSince, previousFigures, seenRecord, type KeyFigureSnapshot } from './seen';

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
