import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeGithub, initiative, open, person } from './testing/fakeGithub';

/** Slice 025: Duplicate (§5.11) against an in-memory GitHub. */

afterEach(() => vi.unstubAllGlobals());

const planned = initiative({
  description: 'Redo checkout',
  status: 'Closed',
  phases: { validation: { startDate: '2026-01-01', endDate: '2026-03-31', allocations: [{ id: 'a1', personId: 'p1', allocationPct: 40 }], actualMonths: { '2026-01': 7 } } },
  gates: { discovery: { outcome: 'passed', passedOn: '2025-12-01', checklist: [] } },
});

describe('duplicating an initiative (slice 025)', () => {
  it('writes one new file in one commit "<copy>: created from <name>" and adds the Active copy', async () => {
    const fake = fakeGithub();
    const { repo } = await open(fake, { initiatives: [planned], people: [person('p1', 'Lucía Ramos')] });

    const result = await repo.duplicateInitiative('i1', '2026-10-01');

    const copy = result!.initiative;
    expect(copy).toMatchObject({ name: 'Payments API copy', status: 'Active', teamId: 'team-1', description: 'Redo checkout' });
    expect(copy.gates).toBeUndefined();
    expect(repo.getState().initiatives.map((i) => i.id)).toEqual(['i1', copy.id]);
    expect(fake.commits(`initiatives/${copy.id}.json`).map((p) => p.message)).toEqual(['Payments API copy: created from Payments API']);
    expect(fake.puts).toHaveLength(1);
    expect(result!.skipped.map((p) => p.name)).toEqual(['Lucía Ramos']);
  });

  it('numbers the name when "<name> copy" exists', async () => {
    const { repo } = await open(fakeGithub(), { initiatives: [planned, initiative({ id: 'i2', name: 'Payments API copy' })] });
    expect((await repo.duplicateInitiative('i1'))!.initiative.name).toBe('Payments API copy 2');
  });

  it('throws and leaves no copy when the save fails', async () => {
    const fake = fakeGithub();
    const { repo } = await open(fake, { initiatives: [planned] });
    fake.fail('initiatives/', 500);

    await expect(repo.duplicateInitiative('i1')).rejects.toThrow();
    expect(repo.getState().initiatives.map((i) => i.id)).toEqual(['i1']);
  });

  it('returns null for an initiative that is not there', async () => {
    const { repo } = await open(fakeGithub(), { initiatives: [planned] });
    expect(await repo.duplicateInitiative('nope')).toBeNull();
  });
});
