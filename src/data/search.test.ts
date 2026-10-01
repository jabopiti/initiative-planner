import { describe, expect, it } from 'vitest';
import { findMatch, searchAll } from './search';
import type { Initiative, Person, Team } from './types';

const initiative = (id: string, name: string, description?: string): Initiative =>
  ({ id, name, description, teamId: 't1', status: 'Active', phases: {} }) as unknown as Initiative;
const person = (id: string, name: string, active = true): Person => ({ id, name, roleId: 'r', countryId: 'c', capacityPct: 100, active });
const team = (id: string, name: string, active = true): Team => ({ id, name, active });

const data = {
  initiatives: [
    initiative('i1', 'Checkout Redesign', 'Adds fraud checks to the payment step'),
    initiative('i2', 'Fraud Detection Upgrade'),
    initiative('i3', 'Onboarding Flow v2'),
  ],
  people: [person('p1', 'Sofia Molina'), person('p2', 'Lucía Ramos', false)],
  teams: [team('t1', 'Platform'), team('t2', 'Platform Ops', false)],
};

describe('findMatch', () => {
  it('ignores case and accents and reports the range in the original text', () => {
    expect(findMatch('Lucía Ramos', 'lucia')).toEqual([0, 5]);
    expect(findMatch('Lucía Ramos', 'ÍA R')).toEqual([3, 7]);
  });
  it('finds nothing for a blank query or a missing text', () => {
    expect(findMatch('Lucía', '  ')).toBeNull();
    expect(findMatch('Lucía', 'xyz')).toBeNull();
  });
});

describe('searchAll', () => {
  it('finds nothing until something is typed', () => {
    expect(searchAll('  ', data).initiatives.total).toBe(0);
  });
  it('lists name matches before description matches', () => {
    const { hits } = searchAll('fraud', data).initiatives;
    expect(hits.map((h) => [h.initiative.name, h.field])).toEqual([
      ['Fraud Detection Upgrade', 'name'],
      ['Checkout Redesign', 'description'],
    ]);
  });
  it('finds people and teams by name, inactive ones included', () => {
    const found = searchAll('lucia', data);
    expect(found.people.hits.map((h) => h.item.name)).toEqual(['Lucía Ramos']);
    expect(searchAll('plat', data).teams.hits.map((h) => h.item.name)).toEqual(['Platform', 'Platform Ops']);
  });
  it('shows 5 per group and counts them all', () => {
    const many = Array.from({ length: 12 }, (_, i) => initiative(`x${i}`, `Alpha ${String(i).padStart(2, '0')}`));
    const { hits, total } = searchAll('alpha', { ...data, initiatives: many }).initiatives;
    expect(hits).toHaveLength(5);
    expect(total).toBe(12);
  });
});
