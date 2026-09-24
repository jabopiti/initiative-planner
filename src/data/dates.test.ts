import { describe, expect, it } from 'vitest';
import { formatDate, parseDateText } from './dates';

describe('date text (§9.11 date input)', () => {
  it('formats an ISO date the way the field shows it', () => {
    expect(formatDate('2026-09-03')).toBe('3 Sep 2026');
    expect(formatDate('2026-12-31')).toBe('31 Dec 2026');
  });

  it('reads "3 Sep 2026" in a few spellings, and ISO', () => {
    for (const text of ['3 Sep 2026', '03 sep 2026', ' 3 September 2026 ', '2026-09-03', '3 Sept 2026']) {
      expect(parseDateText(text)).toBe('2026-09-03');
    }
  });

  it('rejects text that is not a real date', () => {
    for (const text of ['', 'soon', '31 Feb 2026', '3 Foo 2026', '2026-13-01', '3 Sep']) {
      expect(parseDateText(text)).toBeNull();
    }
  });
});
