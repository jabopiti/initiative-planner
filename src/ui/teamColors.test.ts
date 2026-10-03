import { describe, expect, it } from 'vitest';
import { teamColorClasses } from './teamColors';

describe('teamColorClasses (§2, §9.8)', () => {
  const colorOf = teamColorClasses(['platform', 'growth', 'data', 'payments', 'search', 'mobile', 'ops']);

  it('gives each team the brand-pack colour at its position in the teams file', () => {
    expect(colorOf('platform')).toBe('bg-team-1');
    expect(colorOf('growth')).toBe('bg-team-2');
    expect(colorOf('mobile')).toBe('bg-team-6');
  });

  it('wraps after six', () => {
    expect(colorOf('ops')).toBe('bg-team-1');
  });
});
