import { describe, expect, it } from 'vitest';
import { claimedFtePct, unclaimedCapacityPct } from './capacity';
import type { Membership, Person } from './types';

const person: Person = { id: 'p1', name: 'Ada', countryId: 'c', roleId: 'r', capacityPct: 100, active: true };

function membership(id: string, teamFtePct: number, extra: Partial<Membership> = {}): Membership {
  return { id, personId: 'p1', teamId: `t-${id}`, teamFtePct, active: true, ...extra };
}

describe('unclaimedCapacityPct (§5.6, §7.2)', () => {
  it('is the full capacity when the person holds no memberships', () => {
    expect(unclaimedCapacityPct(person, [])).toBe(100);
  });

  it('subtracts the Team FTE % already held', () => {
    expect(unclaimedCapacityPct(person, [membership('a', 60)])).toBe(40);
  });

  it('can exclude one membership, for editing it', () => {
    expect(unclaimedCapacityPct(person, [membership('a', 60), membership('b', 30)], 'a')).toBe(70);
  });

  it('ignores other people, and inactive memberships', () => {
    const others = [membership('a', 50, { personId: 'p2' }), membership('b', 20, { active: false })];
    expect(unclaimedCapacityPct(person, others)).toBe(100);
  });

  it('never goes below zero when the person is already over capacity', () => {
    expect(unclaimedCapacityPct(person, [membership('a', 80), membership('b', 50)])).toBe(0);
  });

  it('follows a reduced capacity %', () => {
    expect(unclaimedCapacityPct({ ...person, capacityPct: 80 }, [membership('a', 60)])).toBe(20);
  });
});

describe('claimedFtePct', () => {
  it('sums active memberships of the person', () => {
    expect(claimedFtePct('p1', [membership('a', 60), membership('b', 30), membership('c', 5, { active: false })])).toBe(90);
  });
});
