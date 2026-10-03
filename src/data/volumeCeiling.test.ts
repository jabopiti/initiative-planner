import { describe, expect, it } from 'vitest';
import { defaultBrandPack } from '../brand/defaultBrand';
import { buildBaselineDataset } from './baseline';
import { addMonths } from './defaultPlan';
import { passGate } from './gate';
import { FILE_PATHS, type Allocation, type CostItem, type Initiative, type Membership, type Person, type PhasePlan, type Team } from './types';

// §1 sets the ceiling (200 initiatives, 200 people, 25 teams); §3 Storage limits caps the dataset at half the
// smallest supported browser's quota. 10 MiB is the smallest per-origin quota assumed (Firefox's), so the budget is
// 5 MiB. The Contents API returns a file's content inline up to 1 MB, so no single file may pass that either.
const SMALLEST_QUOTA_BYTES = 10 * 1024 * 1024;
const BUDGET_BYTES = SMALLEST_QUOTA_BYTES / 2;
const CONTENTS_API_INLINE_LIMIT_BYTES = 1_000_000;

const PEOPLE = 200;
const TEAMS = 25;
const INITIATIVES = 200;
const brand = defaultBrandPack;
const process = brand.process;

const baseline = buildBaselineDataset(brand);
const rateData = { roles: baseline.roles, countries: baseline.countries };

const teams: Team[] = Array.from({ length: TEAMS }, (_, i) => ({ id: `team-${i}-${'t'.repeat(30)}`, name: `Team number ${i} with a fairly long name`, active: true }));
const people: Person[] = Array.from({ length: PEOPLE }, (_, i) => ({
  id: `person-${i}-${'p'.repeat(28)}`,
  name: `Person Number ${i} With A Long Name`,
  countryId: baseline.countries[i % baseline.countries.length].id,
  roleId: baseline.roles[i % baseline.roles.length].id,
  capacityPct: 100,
  active: true,
}));
// Everyone in two teams: the heaviest realistic membership file.
const memberships: Membership[] = people.flatMap((person, i) =>
  [0, 1].map((n) => ({ id: `membership-${i}-${n}-${'m'.repeat(24)}`, personId: person.id, teamId: teams[(i + n) % TEAMS].id, teamFtePct: 50, active: true })),
);

/** A heavy but realistic initiative (settled in review): 12-month costed phases of 8 allocations and 4 cost items, a 200-character note on every checklist item and a 500-character description. */
function fullInitiative(index: number): Initiative {
  const phases: Record<string, PhasePlan> = {};
  let start = '2026-01-01';
  for (const phase of process.filter((p) => p.costed)) {
    const end = addMonths(start, 12).replace(/-\d\d$/, '-01');
    const allocations: Allocation[] = Array.from({ length: 8 }, (_, n) => ({
      id: `allocation-${index}-${phase.id}-${n}-${'a'.repeat(12)}`,
      personId: people[(index + n) % PEOPLE].id,
      allocationPct: 10 + n,
    }));
    const costItems: CostItem[] = Array.from({ length: 4 }, (_, n) => ({ id: `cost-${index}-${phase.id}-${n}-${'c'.repeat(14)}`, label: `Licence or vendor cost item ${n}`, amount: 1000 * (n + 1), timing: 'spread' }));
    const actualMonths: Record<string, number> = {};
    for (let m = 0; m < 12; m += 1) actualMonths[addMonths(start, m).slice(0, 7)] = 10_000 + m;
    phases[phase.id] = { startDate: start, endDate: addMonths(start, 12), allocations, costItems, actualMonths };
    start = end;
  }
  const checklist = Object.fromEntries(
    process.map((phase) => [phase.id, Object.fromEntries(phase.exitGate.checklistItems.map((item) => [item.id, { status: 'complete' as const, note: 'n'.repeat(200) }]))]),
  );
  return {
    id: `initiative-${index}-${'i'.repeat(24)}`,
    name: `Initiative number ${index} with a descriptive name`,
    description: 'd'.repeat(500),
    ownerId: people[index % PEOPLE].id,
    teamId: teams[index % TEAMS].id,
    status: 'Active',
    phases,
    checklist,
  };
}

/** Passes every gate but the last, so the frozen snapshots (the bulkiest part of a file) are the app's own. */
function withPassedGates(initiative: Initiative): Initiative {
  let current = initiative;
  for (let n = 0; n < process.length - 1; n += 1) {
    const result = passGate(process, current, people, rateData, brand.approvalTracks, '2026-10-01');
    if (!result.ok) throw new Error(`Could not pass a gate while building the test dataset: ${result.blockers.join(' ')}`);
    current = result.initiative;
  }
  return current;
}

const bytes = (value: unknown): number => new TextEncoder().encode(JSON.stringify(value)).length;

describe('the dataset at the volume ceiling (§1, §3 Storage limits)', () => {
  const initiatives = Array.from({ length: INITIATIVES }, (_, i) => withPassedGates(fullInitiative(i)));
  const files: Record<string, unknown> = {
    [FILE_PATHS.datasetFlags]: baseline.datasetFlags,
    [FILE_PATHS.roles]: baseline.roles,
    [FILE_PATHS.countries]: baseline.countries,
    [FILE_PATHS.teams]: teams,
    [FILE_PATHS.people]: people,
    [FILE_PATHS.memberships]: memberships,
    ...Object.fromEntries(initiatives.map((i) => [FILE_PATHS.initiative(i.id), i])),
  };

  it('is a full-size dataset: 200 initiatives, 200 people, 25 teams, every gate before the last passed and frozen', () => {
    expect(initiatives).toHaveLength(200);
    expect(people).toHaveLength(200);
    expect(teams).toHaveLength(25);
    expect(Object.keys(initiatives[0].gates ?? {})).toHaveLength(process.length - 1);
    expect(initiatives[0].gates!.development.frozenSnapshot!.allocations).toHaveLength(8);
  });

  it('uses at most half of the smallest supported browser quota', () => {
    const total = Object.values(files).reduce<number>((sum, file) => sum + bytes(file), 0);
    expect(total).toBeLessThanOrEqual(BUDGET_BYTES);
  });

  it('keeps every file within what the Contents API returns inline', () => {
    const largest = Math.max(...Object.values(files).map(bytes));
    expect(largest).toBeLessThanOrEqual(CONTENTS_API_INLINE_LIMIT_BYTES);
  });
});
