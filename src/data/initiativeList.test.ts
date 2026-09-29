import { describe, expect, it } from 'vitest';
import { defaultBrandPack } from '../brand/defaultBrand';
import { activeFilterCount, attentionRank, filterRows, initiativeRows, NO_FILTERS, NONE, ownerLabel } from './initiativeList';
import type { Initiative, Person, Team } from './types';

const { process, approvalTracks } = defaultBrandPack;
const teams: Team[] = [
  { id: 't1', name: 'Platform', active: true },
  { id: 't2', name: 'Growth', active: false },
];
const person = (id: string, name: string, active = true): Person => ({ id, name, roleId: 'r', countryId: 'c', capacityPct: 100, active });
const people = [person('p1', 'Mara Voss'), person('p2', 'Carla Fernández', false)];
const initiative = (id: string, over: Partial<Initiative> = {}): Initiative => ({ id, name: id, teamId: 't1', status: 'Active', ...over });
const rowsOf = (list: Initiative[]) => initiativeRows(list, teams, people, process, approvalTracks, { roles: [], countries: [] }, []);

describe('ownerLabel', () => {
  it('marks inactive, missing and unknown owners', () => {
    expect(ownerLabel('p1', people)).toBe('Mara Voss');
    expect(ownerLabel('p2', people)).toBe('Carla Fernández (inactive)');
    expect(ownerLabel(undefined, people)).toBe('—');
    expect(ownerLabel('gone', people)).toBe('Unknown person');
  });
});

describe('initiativeRows', () => {
  it('lists every status and resolves team, phase and track', () => {
    const rows = rowsOf([initiative('a'), initiative('b', { status: 'On Hold', teamId: 'gone' })]);
    expect(rows.map((r) => r.initiative.status)).toEqual(['Active', 'On Hold']);
    expect(rows[1].teamName).toBe('Unknown team');
    expect(rows[0].phaseId).toBe(process[0].id);
    expect(rows[0].trackName).toBe('Light');
  });
  it('shows a Closed initiative in its final phase', () => {
    const gates = Object.fromEntries(process.map((p) => [p.id, { passedAt: '2026-01-01', checklist: [] }]));
    const [row] = rowsOf([initiative('c', { status: 'Closed', gates: gates as Initiative['gates'] })]);
    expect(row.phaseId).toBe(process[process.length - 1].id);
  });
});

describe('filterRows', () => {
  const rows = rowsOf([
    initiative('a', { ownerId: 'p1' }),
    initiative('b', { status: 'On Hold', teamId: 't2' }),
    initiative('c', { status: 'Cancelled', ownerId: 'p2' }),
  ]);
  const ids = (f: Partial<typeof NO_FILTERS>) => filterRows(rows, { ...NO_FILTERS, ...f }).map((r) => r.initiative.id);
  it('matches everything with no filter', () => expect(ids({})).toEqual(['a', 'b', 'c']));
  it('ORs within a filter', () => expect(ids({ status: ['On Hold', 'Cancelled'] })).toEqual(['b', 'c']));
  it('ANDs across filters', () => expect(ids({ status: ['On Hold', 'Cancelled'], team: ['t2'] })).toEqual(['b']));
  it('offers No owner', () => expect(ids({ owner: [NONE] })).toEqual(['b']));
  it('counts active filters', () => expect(activeFilterCount({ ...NO_FILTERS, status: ['x'], team: ['t1'] })).toBe(2));
});

describe('attentionRank', () => {
  it('ranks no item after every kind', () => {
    const [row] = rowsOf([initiative('a')]);
    expect(attentionRank(row)).toBe(5);
    expect(attentionRank({ ...row, attention: { kind: 'overrun', initiativeId: 'a', initiativeName: 'a', reason: '', phaseId: 'p' } })).toBe(1);
  });
});
