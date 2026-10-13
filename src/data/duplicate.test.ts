import { describe, expect, it } from 'vitest';
import { defaultBrandPack } from '@brand';
import { copyName, duplicateInitiative } from './duplicate';
import type { Initiative, Membership, Person, Team } from './types';

const process = defaultBrandPack.process;
const team: Team = { id: 't1', name: 'Platform', active: true };
const person = (id: string, active = true): Person => ({ id, name: id, countryId: 'de', roleId: 'dev', capacityPct: 100, active });
const member = (personId: string): Membership => ({ id: `m-${personId}`, personId, teamId: 't1', teamFtePct: 50, active: true });
const people = [person('ana'), person('bo'), person('off', false)];
const memberships = [member('ana'), member('off')];
const ctx = { process, people, memberships, teams: [team], existingNames: ['Checkout Redesign'], today: '2026-10-01' };

const source: Initiative = {
  id: 'i1',
  name: 'Checkout Redesign',
  description: 'Redo checkout',
  ownerId: 'ana',
  teamId: 't1',
  status: 'Closed',
  phases: {
    validation: { startDate: '2026-01-01', endDate: '2026-03-31', allocations: [{ id: 'a1', personId: 'ana', allocationPct: 40 }, { id: 'a2', personId: 'bo', allocationPct: 20 }, { id: 'a3', personId: 'off', allocationPct: 10 }], actualMonths: { '2026-01': 5 } },
    development: {
      startDate: '2026-04-01',
      endDate: '2026-09-30',
      allocations: [],
      costItems: [
        { id: 'c1', label: 'Licence', amount: 1000, timing: 'month', month: '2026-06' },
        { id: 'c2', label: 'Hosting', amount: 600, timing: 'spread' },
        { id: 'c3', label: 'Early', amount: 50, timing: 'month', month: '2026-03' },
      ],
    },
  },
  gates: { g1: { outcome: 'passed', checklist: [] } as never },
  checklist: { discovery: { x: { status: 'complete', note: '' } } },
};

describe('duplicateInitiative (§5.11)', () => {
  const { initiative, skipped } = duplicateInitiative(source, ctx);

  it('is a new Active initiative with the same team, description and active owner, without history', () => {
    expect(initiative.id).not.toBe('i1');
    expect(initiative).toMatchObject({ name: 'Checkout Redesign copy', description: 'Redo checkout', ownerId: 'ana', teamId: 't1', status: 'Active' });
    expect(initiative.gates).toBeUndefined();
    expect(initiative.checklist).toBeUndefined();
    expect(initiative.defaultPlan).toBeUndefined();
    expect(initiative.phases?.validation.actualMonths).toBeUndefined();
  });

  it('re-chains the same lengths from today', () => {
    expect(initiative.phases?.validation).toMatchObject({ startDate: '2026-10-01', endDate: '2026-12-31' });
    expect(initiative.phases?.development).toMatchObject({ startDate: '2027-01-01', endDate: '2027-06-30' });
  });

  it('copies active members only, with the same Allocation %, and names who was left out', () => {
    expect(initiative.phases?.validation.allocations.map(({ personId, allocationPct }) => ({ personId, allocationPct }))).toEqual([{ personId: 'ana', allocationPct: 40 }]);
    expect(skipped.map((p) => p.id)).toEqual(['bo', 'off']);
  });

  it('keeps a one-month item at its position in the phase, also outside it, and a spread item spread', () => {
    const items = initiative.phases?.development.costItems ?? [];
    expect(items.map(({ label, amount, timing, month }) => ({ label, amount, timing, month }))).toEqual([
      { label: 'Licence', amount: 1000, timing: 'month', month: '2027-03' },
      { label: 'Hosting', amount: 600, timing: 'spread', month: undefined },
      { label: 'Early', amount: 50, timing: 'month', month: '2026-12' },
    ]);
    expect(items.map((i) => i.id)).not.toContain('c1');
  });

  it('copies a passed phase from its frozen snapshot', () => {
    const frozen: Initiative = {
      ...source,
      gates: { validation: { outcome: 'passed', checklist: [], frozenSnapshot: { startDate: '2026-02-01', endDate: '2026-03-31', allocations: [{ id: 'f', personId: 'ana', allocationPct: 70, cost: 99 }], costItems: [], estimateByMonth: {} } } },
    };
    const copy = duplicateInitiative(frozen, ctx).initiative.phases?.validation;
    expect(copy).toMatchObject({ startDate: '2026-10-01', endDate: '2026-11-30' });
    expect(copy?.allocations.map((a) => ({ personId: a.personId, allocationPct: a.allocationPct }))).toEqual([{ personId: 'ana', allocationPct: 70 }]);
    expect(copy?.allocations[0]).not.toHaveProperty('cost');
  });

  it('keeps the day count of a period that is not whole months', () => {
    const odd: Initiative = { ...source, phases: { validation: { startDate: '2026-01-01', endDate: '2026-03-20', allocations: [] , costItems: [{ id: 'z', label: 'x', amount: 1, timing: 'spread' }] } } };
    expect(duplicateInitiative(odd, ctx).initiative.phases?.validation).toMatchObject({ startDate: '2026-10-01', endDate: '2026-12-18' });
  });

  it('copies a phase without a valid period without one, and chains the others past it', () => {
    const partial: Initiative = {
      ...source,
      phases: { validation: { allocations: [{ id: 'a', personId: 'ana', allocationPct: 30 }] }, development: source.phases!.development },
    };
    const copy = duplicateInitiative(partial, ctx).initiative.phases;
    expect(copy?.validation.startDate).toBeUndefined();
    expect(copy?.validation.allocations).toHaveLength(1);
    expect(copy?.development.startDate).toBe('2026-10-01');
  });

  it('leaves out a deactivated owner', () => {
    expect(duplicateInitiative({ ...source, ownerId: 'off' }, ctx).initiative.ownerId).toBeUndefined();
  });
});

describe('copyName', () => {
  it('adds a number while the name is taken, ignoring case and spaces', () => {
    expect(copyName('X', ['X'])).toBe('X copy');
    expect(copyName('X', ['X copy'])).toBe('X copy 2');
    expect(copyName('X', ['X copy', ' x COPY 2 '])).toBe('X copy 3');
    expect(copyName('X copy', ['X copy'])).toBe('X copy copy');
  });
});
