import { describe, expect, it } from 'vitest';
import { teamColorClass } from './teamColors';

describe('teamColorClass (§2, §9.8)', () => {
  const ids = ['platform', 'growth', 'data', 'payments', 'search', 'mobile', 'ops'];

  it('gives each team the brand-pack colour at its position in the teams file', () => {
    expect(teamColorClass(ids, 'platform')).toBe('bg-team-1');
    expect(teamColorClass(ids, 'growth')).toBe('bg-team-2');
    expect(teamColorClass(ids, 'mobile')).toBe('bg-team-6');
  });

  it('wraps after six', () => {
    expect(teamColorClass(ids, 'ops')).toBe('bg-team-1');
  });
});
