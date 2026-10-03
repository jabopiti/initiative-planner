import { describe, expect, it } from 'vitest';
import { formatAmount, formatCompactAmount } from './formatAmount';

describe('formatCompactAmount (§9.11)', () => {
  it.each([
    [0, '€0'],
    [850, '€850'],
    [41_200, '€41k'],
    [412_000, '€412k'],
    [999_499, '€999k'],
    [999_500, '€1.0M'],
    [4_210_000, '€4.2M'],
  ])('shows %i as %s', (value, expected) => {
    expect(formatCompactAmount(value, '€')).toBe(expected);
  });

  it('leaves the full amount to formatAmount', () => {
    expect(formatAmount(412_000, '€')).toBe('€412,000');
  });
});
