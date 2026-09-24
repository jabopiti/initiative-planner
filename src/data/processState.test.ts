import { describe, expect, it } from 'vitest';
import { isPhaseConfirmed } from './processState';

const TODAY = '2026-09-24';

describe('isPhaseConfirmed (§4)', () => {
  it('is true for the current phase whatever its dates', () => {
    expect(isPhaseConfirmed('2027-08-01', true, TODAY)).toBe(true);
    expect(isPhaseConfirmed(undefined, true, TODAY)).toBe(true);
  });

  it('is true when the start falls in the current or the next calendar month, or earlier', () => {
    expect(isPhaseConfirmed('2026-09-01', false, TODAY)).toBe(true);
    expect(isPhaseConfirmed('2026-10-31', false, TODAY)).toBe(true);
    expect(isPhaseConfirmed('2026-06-15', false, TODAY)).toBe(true);
    expect(isPhaseConfirmed('2026-11-01', false, TODAY)).toBe(false);
  });

  it('compares months, so the 31st of a short next month cannot overflow', () => {
    expect(isPhaseConfirmed('2026-02-28', false, '2026-01-31')).toBe(true);
    expect(isPhaseConfirmed('2026-03-01', false, '2026-01-31')).toBe(false);
  });

  it('rolls the next month over the year end', () => {
    expect(isPhaseConfirmed('2027-01-31', false, '2026-12-15')).toBe(true);
    expect(isPhaseConfirmed('2027-02-01', false, '2026-12-15')).toBe(false);
  });

  it('is false for a phase with no start date that is not the current one', () => {
    expect(isPhaseConfirmed(undefined, false, TODAY)).toBe(false);
  });
});
