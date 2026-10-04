import { describe, expect, it } from 'vitest';
import { amountRefusal, parseAmountExpression } from './amountExpression';

const value = (text: string, locale = 'en') => {
  const entry = parseAmountExpression(text, locale);
  return entry.ok ? entry.value : entry.reason;
};

describe('parseAmountExpression', () => {
  it.each([
    ['12k', 12_000],
    ['2.5m', 2_500_000],
    ['3 × 4k', 12_000],
    ['3 x 4k', 12_000],
    ['3 X 4k', 12_000],
    ['3 * 4k', 12_000],
    ['18k + 2.4k', 20_400],
    ['1.2m / 12', 100_000],
    ['(2+3)k', 5_000],
    ['((2+3)×2)k', 10_000],
    ['2 - 1', 1],
    ['2 − 1', 1],
    ['12K', 12_000],
    ['0', 0],
    ['820', 820],
    ['0.1 + 0.2', 0.3],
    ['1/3', 0.33],
    ['2/3', 0.67],
    ['€12,000', 12_000],
    ['€ 12k', 12_000],
    ['  7 ', 7],
    ['.5', 0.5],
    ['1,000,000', 1_000_000],
    ['1,5', 1.5],
    ['1.5k', 1_500],
    ['12.50', 12.5],
    ['1,234.56', 1_234.56],
  ])('reads %s as %s in English', (text, expected) => {
    expect(value(text)).toBe(expected);
  });

  it.each([
    ['', 'empty'],
    ['   ', 'empty'],
    ['abc', 'unreadable'],
    ['5-', 'unreadable'],
    ['3 ×', 'unreadable'],
    ['(2+3', 'unreadable'],
    ['2+3)', 'unreadable'],
    ['3(4)', 'unreadable'],
    ['1kk', 'unreadable'],
    ['12 000', 'unreadable'],
    ['1,2,3', 'unreadable'],
    ['1,23,456', 'unreadable'],
    ['1/0', 'divideByZero'],
    ['5 / (3 - 3)', 'divideByZero'],
    ['-3', 'negative'],
    ['2 − 5', 'negative'],
    ['9,999,999,999,999 × 9', 'tooLarge'],
    ['1,000,000,000,001', 'tooLarge'],
    ['9'.repeat(200), 'unreadable'],
  ])('refuses %j as %s', (text, reason) => {
    expect(value(text)).toBe(reason);
  });

  it('accepts exactly the largest amount', () => {
    expect(value('1,000,000,000,000')).toBe(1_000_000_000_000);
  });

  it('computes with exact decimals, not floats', () => {
    expect(value('0.1 + 0.2')).toBe(0.3);
    expect(value('0.7 × 3')).toBe(2.1);
    expect(value('1.15 × 100')).toBe(115);
  });

  it('reports whether the entry is a plain number', () => {
    const plain = (text: string) => {
      const entry = parseAmountExpression(text, 'en');
      return entry.ok && entry.plain;
    };
    expect(plain('820')).toBe(true);
    expect(plain('12,000')).toBe(true);
    expect(plain('€12,000')).toBe(true);
    expect(plain('12k')).toBe(false);
    expect(plain('3 × 4k')).toBe(false);
    expect(plain('(5)')).toBe(false);
  });

  it('reads the decimal comma of a comma-decimal locale', () => {
    expect(value('2,5k', 'de-DE')).toBe(2_500);
    expect(value('1.234,5', 'de-DE')).toBe(1_234.5);
    expect(value('12.000', 'de-DE')).toBe(12_000);
    expect(value('1.5k', 'de-DE')).toBe(1_500);
    expect(value('1.200.000', 'de-DE')).toBe(1_200_000);
    expect(value('3 × 4,5k', 'de-DE')).toBe(13_500);
  });

  it('reads the group mark of locales that group with a space', () => {
    expect(value('12 000', 'fr-FR')).toBe(12_000);
    expect(value('12 000,5', 'fr-FR')).toBe(12_000.5);
    expect(value('3 × 4 000', 'fr-FR')).toBe(12_000);
  });

  it('reads the apostrophe group of Swiss German', () => {
    expect(value('12’000', 'de-CH')).toBe(12_000);
    expect(value("12'000", 'de-CH')).toBe(12_000);
  });
});

describe('amountRefusal', () => {
  it('names the reason, and the field for an empty entry', () => {
    expect(amountRefusal('empty', 'Enter a day rate of 0 or more.')).toBe('Enter a day rate of 0 or more.');
    expect(amountRefusal('unreadable', 'x')).toBe("Can't read that as an amount. Try 12k or 3 × 4k.");
    expect(amountRefusal('divideByZero', 'x')).toBe("Can't divide by 0.");
    expect(amountRefusal('negative', 'x')).toBe("An amount can't be below 0.");
    expect(amountRefusal('tooLarge', 'x')).toBe('That amount is too large.');
  });
});
