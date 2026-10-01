import { describe, expect, it } from 'vitest';
import { copySource, planCopy, skippedNote } from './copyAllocations';
import type { Initiative, Membership, Person, Team } from './types';

const person = (id: string, active = true): Person => ({ id, name: id, countryId: 'de', roleId: 'dev', capacityPct: 100, active });
const member = (personId: string, active = true): Membership => ({ id: `m-${personId}`, personId, teamId: 't1', teamFtePct: 50, active });
const team: Team = { id: 't1', name: 'Platform' } as Team;
const people = [person('ana'), person('bo'), person('cy', false), person('di')];
const memberships = [member('ana'), member('bo', false), member('cy'), member('di')];
const source = [
  { personId: 'ana', allocationPct: 40 },
  { personId: 'bo', allocationPct: 50 },
  { personId: 'cy', allocationPct: 60 },
  { personId: 'di', allocationPct: 30 },
];

describe('planning a copy of the previous phase (§5.11)', () => {
  it('copies active members in order with the same Allocation %, and skips a left or deactivated person', () => {
    const plan = planCopy(source, team, people, memberships);
    expect(plan.copy).toEqual([
      { personId: 'ana', allocationPct: 40 },
      { personId: 'di', allocationPct: 30 },
    ]);
    expect(plan.skipped.map((p) => p.name)).toEqual(['bo', 'cy']);
  });

  it('reads the frozen snapshot of a passed phase, not the later live edits', () => {
    const initiative = {
      phases: { validation: { allocations: [{ id: 'a', personId: 'ana', allocationPct: 90 }] } },
      gates: { validation: { frozenSnapshot: { allocations: [{ id: 'a', personId: 'ana', allocationPct: 40, cost: 1 }] } } },
    } as unknown as Initiative;
    expect(copySource(initiative, 'validation')).toEqual([{ id: 'a', personId: 'ana', allocationPct: 40, cost: 1 }]);
  });

  it('reads the live plan when the gate has no snapshot', () => {
    const initiative = { phases: { validation: { allocations: [{ id: 'a', personId: 'ana', allocationPct: 90 }] } } } as unknown as Initiative;
    expect(copySource(initiative, 'validation')).toHaveLength(1);
  });

  it('words the skipped note, with several names comma-separated and a lead when nothing was copied', () => {
    expect(skippedNote([people[1], people[2]], 2, team)).toBe('Not copied: bo, cy, no longer on Platform.');
    expect(skippedNote([people[1]], 0, team)).toBe('Nothing copied. Not copied: bo, no longer on Platform.');
  });
});
