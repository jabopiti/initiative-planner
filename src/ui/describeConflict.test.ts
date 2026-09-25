import { describe, expect, it } from 'vitest';
import { defaultBrandPack } from '../brand/defaultBrand';
import type { Allocation, CostItem, CustomRole, Initiative, Membership, Person, PhasePlan, Team } from '../data/types';
import { getAtPath, type Path } from '../sync/merge';
import { describeConflict, type ConflictContext } from './describeConflict';

// Every field filled: a field added to a type must be added here too, and then needs a banner label.
const allocation: Required<Allocation> = { id: 'a1', personId: 'ana', allocationPct: 50 };
const costItem: Required<CostItem> = { id: 'c1', label: 'Penetration test', amount: 12000, timing: 'month', month: '2026-10' };
const phase: Required<PhasePlan> = {
  startDate: '2026-10-01',
  endDate: '2026-11-30',
  allocations: [allocation],
  costItems: [costItem],
  actualMonths: { '2026-10': 14200 },
};
const initiative: Required<Initiative> = {
  id: 'i1',
  name: 'Payments API',
  description: 'Card payments',
  ownerId: 'ana',
  teamId: 't1',
  status: 'Active',
  phases: { validation: phase },
  defaultPlan: true,
  // Live checklist state (still field-by-field mergeable); a gate record itself is pinned by frozenPaths once
  // written (§10.5, §8.1), so it never surfaces per-field conflicts and its own optional fields stay minimal here.
  checklist: { validation: { 'g2-business-case': { status: 'tentative', note: 'Check later' } } },
  gates: { discovery: { outcome: 'passed', passedOn: '2026-01-01', checklist: [] } },
};
const customRole: Required<CustomRole> = { active: true, label: 'Architect', costFactor: 1.2, dayRatesByYear: [{ year: 2026, dayRate: 900 }] };
const person: Required<Person> = { id: 'ana', name: 'Ana Silva', countryId: 'de', roleId: 'dev', customRole, capacityPct: 100, active: true };
const team: Required<Team> = { id: 't1', name: 'Platform', active: true };
const membership: Required<Membership> = { id: 'm1', personId: 'ana', teamId: 't1', teamFtePct: 50, active: true };

const context: ConflictContext = {
  process: defaultBrandPack.process,
  currencySymbol: '€',
  initiatives: [initiative],
  people: [person],
  teams: [team],
  memberships: [membership],
  roles: [{ id: 'dev', name: 'Developer', abbreviation: 'Dev', costFactor: 1, active: true }],
  countries: [{ id: 'de', name: 'Germany', active: true, ratesByYear: [] }],
};

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isIdList = (v: unknown): v is Record<string, unknown>[] => Array.isArray(v) && v.length > 0 && v.every((x) => isRecord(x) && typeof x.id === 'string');

/** Every path a conflict can name: each value, and each item of a list merged by id. Ids never change. */
function conflictPaths(value: unknown, path: Path = []): Path[] {
  if (isIdList(value)) return value.flatMap((item) => [[...path, { id: item.id as string }], ...conflictPaths(item, [...path, { id: item.id as string }])]);
  if (isRecord(value)) return Object.entries(value).flatMap(([key, v]) => (key === 'id' ? [] : conflictPaths(v, [...path, key])));
  return [path];
}

describe('conflict rows name every field in words (§3, §9.9)', () => {
  const files: [string, unknown][] = [
    ['initiatives/i1.json', initiative],
    ['people.json', [person]],
    ['teams.json', [team]],
    ['memberships.json', [membership]],
  ];

  for (const [file, doc] of files) {
    it(`labels every field of ${file}, and shows no value as raw data`, () => {
      for (const path of conflictPaths(doc)) {
        const value = getAtPath(doc, path);
        const row = describeConflict({ file, path, base: value, mine: value, theirs: undefined }, context);
        expect({ path, labelled: row.labelled }).toEqual({ path, labelled: true });
        expect(row.mine).not.toMatch(/[{}"]|\[object/);
      }
    });
  }

  const row = (file: string, path: Path, mine: unknown, theirs: unknown) => describeConflict({ file, path, base: undefined, mine, theirs }, context);

  it('reads a phase date as the date field shows it', () => {
    expect(row('initiatives/i1.json', ['phases', 'validation', 'endDate'], '2026-11-30', '2026-12-15')).toEqual({
      entity: 'Payments API',
      field: 'Validation end date',
      mine: '30.11.2026',
      theirs: '15.12.2026',
      labelled: true,
    });
  });

  it('reads a phase actual by its month, and a removed one as not recorded', () => {
    const r = row('initiatives/i1.json', ['phases', 'validation', 'actualMonths', '2026-10'], undefined, 14200);
    expect([r.field, r.mine, r.theirs]).toEqual(['Validation actual for Oct 2026', 'not recorded', '€14,200']);
  });

  it('names an allocation by its phase and person, and a removed one as removed', () => {
    const r = row('initiatives/i1.json', ['phases', 'validation', 'allocations', { id: 'a1' }], undefined, allocation);
    expect([r.field, r.mine, r.theirs]).toEqual(['Validation · Ana Silva allocation', 'removed', '50%']);
  });

  it('names a cost item by its label, its values as the table shows them, and a removed one as removed', () => {
    const at = (leaf: string, mine: unknown, theirs: unknown) => row('initiatives/i1.json', ['phases', 'validation', 'costItems', { id: 'c1' }, leaf], mine, theirs);
    expect([at('amount', 12000, 15000).field, at('amount', 12000, 15000).mine, at('amount', 12000, 15000).theirs]).toEqual(['Validation · Penetration test amount', '€12,000', '€15,000']);
    expect([at('timing', 'month', 'spread').mine, at('timing', 'month', 'spread').theirs]).toEqual(['One month', 'Spread over the phase']);
    expect([at('month', '2026-10', '2026-12').field, at('month', '2026-10', '2026-12').theirs]).toEqual(['Validation · Penetration test month', 'Dec 2026']);
    const removed = row('initiatives/i1.json', ['phases', 'validation', 'costItems', { id: 'c1' }], undefined, costItem);
    expect([removed.field, removed.mine, removed.theirs]).toEqual(['Validation · cost item', 'removed', 'Penetration test €12,000']);
  });

  it('reads an unset value as not set, and references by name', () => {
    const r = row('initiatives/i1.json', ['ownerId'], undefined, 'ana');
    expect([r.field, r.mine, r.theirs]).toEqual(['Owner', 'not set', 'Ana Silva']);
  });

  it('names a person, and a membership by person and team', () => {
    expect(row('people.json', [{ id: 'ana' }, 'capacityPct'], 80, 100)).toMatchObject({ entity: 'Ana Silva', field: 'Capacity %', mine: '80%', theirs: '100%' });
    expect(row('memberships.json', [{ id: 'm1' }, 'teamFtePct'], 50, 70)).toMatchObject({ entity: 'Ana Silva in Platform', field: 'Team FTE %' });
    expect(row('memberships.json', [{ id: 'gone' }, 'teamFtePct'], 50, 70).entity).toBe('A membership');
    expect(row('teams.json', [{ id: 't1' }, 'active'], false, true)).toMatchObject({ entity: 'Platform', field: 'Status', mine: 'Inactive', theirs: 'Active' });
  });

  it('names a field without a label by its key, as plain values', () => {
    expect(row('initiatives/i1.json', ['phases', 'validation', 'riskScore'], 3, 5)).toEqual({
      entity: 'Payments API',
      field: 'Validation · riskScore',
      mine: '3',
      theirs: '5',
      labelled: false,
    });
    expect(row('initiatives/i1.json', ['phases', 'validation', 'actuals'], { '2026-10': 5 }, undefined)).toMatchObject({ mine: 'set', theirs: 'not set' });
  });
});
