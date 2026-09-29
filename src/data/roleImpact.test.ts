import { describe, expect, it } from 'vitest';
import { initiativesAffectedByRole } from './roleImpact';
import type { Initiative, Person } from './types';

const person = (id: string, roleId: string, customRoleActive = false): Person => ({
  id,
  name: id,
  countryId: 'de',
  roleId,
  capacityPct: 100,
  active: true,
  ...(customRoleActive && { customRole: { active: true, label: 'Fractional', costFactor: 1, dayRatesByYear: [] } }),
});

const people: Person[] = [person('ana', 'tl'), person('bo', 'dev'), person('cy', 'tl', true)];

function withAllocations(id: string, phases: Initiative['phases']): Initiative {
  return { id, name: id, teamId: 't', status: 'Active', phases };
}

describe('initiativesAffectedByRole (§5.9, §8.1)', () => {
  it('counts an initiative with an unfrozen allocation of a person with the role', () => {
    const initiative = withAllocations('i1', {
      dev: { startDate: '2026-01-01', endDate: '2026-01-31', allocations: [{ id: 'a1', personId: 'ana', allocationPct: 50 }] },
    });
    expect(initiativesAffectedByRole('tl', [initiative], people)).toBe(1);
  });

  it('does not count a person with a different role', () => {
    const initiative = withAllocations('i1', {
      dev: { startDate: '2026-01-01', endDate: '2026-01-31', allocations: [{ id: 'a1', personId: 'bo', allocationPct: 50 }] },
    });
    expect(initiativesAffectedByRole('tl', [initiative], people)).toBe(0);
  });

  it('does not count a person whose active custom role currently replaces this role', () => {
    const initiative = withAllocations('i1', {
      dev: { startDate: '2026-01-01', endDate: '2026-01-31', allocations: [{ id: 'a1', personId: 'cy', allocationPct: 50 }] },
    });
    expect(initiativesAffectedByRole('tl', [initiative], people)).toBe(0);
  });

  it('does not count a frozen phase', () => {
    const initiative: Initiative = {
      ...withAllocations('i1', {
        dev: { startDate: '2026-01-01', endDate: '2026-01-31', allocations: [{ id: 'a1', personId: 'ana', allocationPct: 50 }] },
      }),
      gates: { dev: { outcome: 'passed', checklist: [] } },
    };
    expect(initiativesAffectedByRole('tl', [initiative], people)).toBe(0);
  });

  it('counts an initiative once even with two matching allocations across phases', () => {
    const initiative = withAllocations('i1', {
      design: { startDate: '2026-01-01', endDate: '2026-01-31', allocations: [{ id: 'a1', personId: 'ana', allocationPct: 50 }] },
      dev: { startDate: '2026-02-01', endDate: '2026-02-28', allocations: [{ id: 'a2', personId: 'ana', allocationPct: 50 }] },
    });
    expect(initiativesAffectedByRole('tl', [initiative], people)).toBe(1);
  });

  it('is 0 for no initiatives and no matching people', () => {
    expect(initiativesAffectedByRole('tl', [], people)).toBe(0);
    expect(initiativesAffectedByRole('ghost', [withAllocations('i1', {})], people)).toBe(0);
  });
});
