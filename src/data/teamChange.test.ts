import { describe, expect, it } from 'vitest';
import { defaultBrandPack } from '../brand/defaultBrand';
import { isPhaseLocked } from './processState';
import { planTeamChange } from './teamChange';
import type { Country, Initiative, Membership, Person, Role } from './types';

// €500/day, 20 working days every month of 2026, role factor 0.8: 100% for a month costs 8,000.
const roles: Role[] = [{ id: 'dev', name: 'Developer', abbreviation: 'Dev', costFactor: 0.8, active: true }];
const countries: Country[] = [{ id: 'de', name: 'Germany', active: true, ratesByYear: [{ year: 2026, dayRate: 500, workingDaysByMonth: Array(12).fill(20) }] }];
const rateData = { roles, countries };

const person = (id: string, active = true): Person => ({ id, name: id, countryId: 'de', roleId: 'dev', capacityPct: 100, active });
const membership = (personId: string, teamId: string, active = true): Membership => ({ id: `${personId}-${teamId}`, personId, teamId, teamFtePct: 50, active });

const people = [person('ana'), person('bo'), person('cy'), person('di'), person('ed', false)];
const memberships = [
  membership('ana', 'old'),
  membership('bo', 'old'),
  membership('cy', 'old'),
  membership('di', 'old'),
  membership('ed', 'old'),
  membership('ana', 'new'), // on both teams
  membership('cy', 'new', false), // inactive membership of the new team
  membership('ed', 'new'), // active membership, but a deactivated person
];

const initiative: Initiative = {
  id: 'i1',
  name: 'Payments API',
  teamId: 'old',
  status: 'Active',
  phases: {
    validation: {
      startDate: '2026-10-01',
      endDate: '2026-10-31',
      allocations: [
        { id: 'a1', personId: 'ana', allocationPct: 50 },
        { id: 'a2', personId: 'bo', allocationPct: 50 },
        { id: 'a3', personId: 'cy', allocationPct: 25 },
      ],
    },
    development: {
      startDate: '2026-12-01',
      endDate: '2026-12-31',
      allocations: [
        { id: 'a4', personId: 'bo', allocationPct: 100 },
        { id: 'a5', personId: 'ed', allocationPct: 10 },
      ],
    },
  },
};

const plan = (overrides: Partial<Parameters<typeof planTeamChange>[0]> = {}) =>
  planTeamChange({ initiative, newTeamId: 'new', process: defaultBrandPack.process, people, memberships, rateData, isLocked: () => false, ...overrides });

describe('planTeamChange: who a change of team removes (§7.2)', () => {
  it('removes people who are not active members of the new team, keeps those on both, and totals the cost', () => {
    const result = plan();
    expect(result.removed.map((r) => [r.phaseId, r.allocation.id, r.index])).toEqual([
      ['validation', 'a2', 1],
      ['validation', 'a3', 2],
      ['development', 'a4', 0],
      ['development', 'a5', 1],
    ]);
    expect(result.removedPeople.map((p) => p.id)).toEqual(['bo', 'cy', 'ed']);
    expect(result.stayingPeople.map((p) => p.id)).toEqual(['ana']);
    expect(result.phaseLabels).toEqual(['Validation', 'Development']);
    // bo 50% + cy 25% in Oct, bo 100% + ed 10% in Dec: (0.75 + 1.1) × 8,000
    expect(result.cost).toBeCloseTo(14_800);
  });

  it('counts an inactive membership, and a deactivated person, as not on the team', () => {
    const removed = plan().removedPeople.map((p) => p.id);
    expect(removed).toContain('cy');
    expect(removed).toContain('ed');
  });

  it('leaves a locked phase alone: nothing removed, named or costed from it', () => {
    const result = plan({ isLocked: (phaseId) => phaseId === 'validation' });
    expect(result.removed.map((r) => r.phaseId)).toEqual(['development', 'development']);
    expect(result.removedPeople.map((p) => p.id)).toEqual(['bo', 'ed']);
    expect(result.stayingPeople).toEqual([]);
    expect(result.phaseLabels).toEqual(['Development']);
    expect(result.cost).toBeCloseTo(8_800);
  });

  it('removes nothing when everyone allocated is on the new team', () => {
    const everyone = [...memberships, membership('bo', 'new'), membership('cy', 'new'), membership('ed', 'new')];
    const result = plan({ memberships: everyone, people: people.map((p) => ({ ...p, active: true })) });
    expect(result.removed).toEqual([]);
    expect(result.stayingPeople).toHaveLength(4);
  });

  it('removes nothing from an initiative with no allocations', () => {
    expect(plan({ initiative: { ...initiative, phases: undefined } }).removed).toEqual([]);
  });

  it('adds no cost for a phase without a valid period, but still removes its allocations', () => {
    const noDates = { ...initiative, phases: { validation: { allocations: initiative.phases!.validation.allocations } } };
    const result = plan({ initiative: noDates });
    expect(result.removed).toHaveLength(2);
    expect(result.cost).toBe(0);
    const inverted = { ...initiative, phases: { validation: { ...initiative.phases!.validation, startDate: '2026-11-01' } } };
    expect(plan({ initiative: inverted }).cost).toBe(0);
  });
});

describe('isPhaseLocked', () => {
  it('reports no phase as locked until gates exist (slice 008)', () => {
    expect(isPhaseLocked(initiative, 'validation')).toBe(false);
  });
});
