import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultBrandPack } from '../brand/defaultBrand';
import { buildBaselineDataset } from '../data/baseline';
import type { DatasetFlags, Initiative, Person, Role, Team } from '../data/types';
import { Repository } from './Repository';
import { fakeGithub, initiative, person, seedDataset, type Fake } from './testing/fakeGithub';

/** Slice 032: Load example data and Reset (§5.9), each one commit through the Git data API (§10.3), races included. */

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const team: Team = { id: 'team-1', name: 'Payments', active: true };

async function openWith(fake: Fake, seeded: Parameters<typeof seedDataset>[1] = {}, baselineMaster = true) {
  seedDataset(fake, seeded);
  if (baselineMaster) {
    const baseline = buildBaselineDataset(defaultBrandPack);
    fake.seed('roles.json', baseline.roles);
    fake.seed('countries.json', baseline.countries);
  }
  const repo = new Repository(defaultBrandPack, 'token');
  await repo.initialize();
  return repo;
}

describe('Load example data (slice 032)', () => {
  it('writes the example teams, people, memberships and initiatives in one commit and shows them', async () => {
    const fake = fakeGithub();
    const repo = await openWith(fake);

    await expect(repo.loadExampleData(new Date(2026, 9, 15))).resolves.toBe('loaded');

    expect(fake.gitCommits).toHaveLength(1);
    expect(fake.gitCommits[0].message).toBe('Example data loaded');
    expect(fake.gitCommits[0].files).not.toContain('roles.json');
    expect(fake.gitCommits[0].deleted).toEqual([]);
    expect(fake.puts).toEqual([]);
    const state = repo.getState();
    expect(state.teams.map((t) => t.name)).toEqual(['Platform', 'Growth']);
    expect(state.people).toHaveLength(9);
    expect(state.memberships).toHaveLength(9);
    expect(state.initiatives.map((i) => i.name).sort()).toEqual(['Checkout Redesign', 'Fraud Detection Upgrade', 'Onboarding Flow v2']);
    expect(state.initiatives.find((i) => i.name === 'Checkout Redesign')!.phases!.development.startDate).toBe('2026-10-01');
    expect(state.updatedByOthers).toBe(false);
  });

  it('adds the roles and countries it needs to a dataset that lacks them, in the same commit', async () => {
    const fake = fakeGithub();
    const repo = await openWith(fake, {}, false);

    await expect(repo.loadExampleData()).resolves.toBe('loaded');

    expect(fake.gitCommits).toHaveLength(1);
    expect(fake.gitCommits[0].files).toEqual(expect.arrayContaining(['roles.json', 'countries.json']));
    expect(repo.getState().roles.map((r) => r.abbreviation).sort()).toEqual(['Dev', 'PM', 'TL', 'XD']);
  });

  it('never overwrites: stops when someone added data meanwhile, and shows it', async () => {
    const fake = fakeGithub();
    const repo = await openWith(fake);
    fake.seed('teams.json', [team]);

    await expect(repo.loadExampleData()).resolves.toBe('not-empty');

    expect(fake.gitCommits).toEqual([]);
    expect(fake.read<Team[]>('teams.json')).toEqual([team]);
    expect(repo.getState().teams).toEqual([team]);
  });

  it('builds again on the new head when another user commits before the ref moves, and stops if they added data', async () => {
    const fake = fakeGithub();
    const repo = await openWith(fake);
    fake.beforeRefUpdate(() => fake.seed('people.json', [person('p1', 'Ana')]));

    await expect(repo.loadExampleData()).resolves.toBe('not-empty');
    expect(fake.gitCommits).toEqual([]);
    expect(fake.read<Person[]>('people.json')).toEqual([person('p1', 'Ana')]);
  });

  it('saves an edit still waiting before it looks', async () => {
    const fake = fakeGithub();
    const repo = await openWith(fake);
    const role = repo.getState().roles[0];
    repo.updateRole(role.id, { costFactor: 1.2 });

    await expect(repo.loadExampleData()).resolves.toBe('loaded');
    expect(fake.read<Role[]>('roles.json').find((r) => r.id === role.id)!.costFactor).toBe(1.2);
  });

  it('leaves the data branch unchanged when a step fails', async () => {
    const fake = fakeGithub();
    const repo = await openWith(fake);
    fake.failGit('trees', 500);

    const result = await repo.loadExampleData();
    expect(result).toEqual({ failed: expect.objectContaining({ message: expect.any(String) }) });
    expect(fake.gitCommits).toEqual([]);
    expect(fake.read<Team[]>('teams.json')).toEqual([]);
    expect(repo.getState().teams).toEqual([]);
  });
});

describe('Reset (slice 032)', () => {
  const flags = (fake: Fake) => fake.read<DatasetFlags>('dataset.json');

  it('returns the dataset to the fresh-install baseline in one commit and forgets every initiative here', async () => {
    const fake = fakeGithub();
    const repo = await openWith(fake, { teams: [team], people: [person('p1', 'Ana')], initiatives: [initiative(), initiative({ id: 'i2', name: 'Ledger' })], ratesReviewed: true });

    await expect(repo.resetDataset()).resolves.toBe('reset');

    expect(fake.gitCommits).toEqual([
      expect.objectContaining({ message: 'Dataset reset', deleted: expect.arrayContaining(['initiatives/i1.json', 'initiatives/i2.json']) }),
    ]);
    expect(fake.has('initiatives/i1.json')).toBe(false);
    expect(flags(fake).ratesReviewed).toBe(false);
    expect(fake.read<Team[]>('teams.json')).toEqual([]);
    expect(fake.read<Person[]>('people.json')).toEqual([]);
    expect(fake.read<Role[]>('roles.json').map((r) => r.abbreviation)).toEqual(['PM', 'XD', 'TL', 'Dev']);
    const state = repo.getState();
    expect(state.initiatives).toEqual([]);
    expect(state.teams).toEqual([]);
    expect(state.people).toEqual([]);
    expect(state.datasetFlags!.ratesReviewed).toBe(false);
  });

  it('drops edits not saved yet and never pushes them afterwards', async () => {
    const fake = fakeGithub();
    const repo = await openWith(fake, { teams: [team], initiatives: [initiative()] });
    repo.renameInitiative('i1', 'Payments API v2');
    repo.updateTeam('team-1', { active: false });

    await expect(repo.resetDataset()).resolves.toBe('reset');
    await new Promise((resolve) => setTimeout(resolve, 1100)); // past the debounce

    expect(fake.puts).toEqual([]);
    expect(fake.has('initiatives/i1.json')).toBe(false);
    expect(fake.read<Team[]>('teams.json')).toEqual([]);
    expect(repo.getState().syncing).toBe(false);
  });

  it('builds again on the new head when another user commits first, removing their new initiative too, in one commit', async () => {
    const fake = fakeGithub();
    const repo = await openWith(fake, { initiatives: [initiative()] });
    const theirs: Initiative = initiative({ id: 'i9', name: 'Theirs' });
    fake.beforeRefUpdate(() => fake.seed('initiatives/i9.json', theirs));

    await expect(repo.resetDataset()).resolves.toBe('reset');

    expect(fake.gitCommits).toHaveLength(1);
    expect(fake.gitCommits[0].deleted).toEqual(expect.arrayContaining(['initiatives/i1.json', 'initiatives/i9.json']));
    expect(fake.has('initiatives/i9.json')).toBe(false);
    expect(repo.getState().initiatives).toEqual([]);
  });

  it('leaves the data branch unchanged when the ref update fails', async () => {
    const fake = fakeGithub();
    const repo = await openWith(fake, { teams: [team], initiatives: [initiative()] });
    fake.failGit('refs', 500);

    const result = await repo.resetDataset();
    expect(result).toEqual({ failed: expect.anything() });
    expect(fake.gitCommits).toEqual([]);
    expect(fake.has('initiatives/i1.json')).toBe(true);
    expect(fake.read<Team[]>('teams.json')).toEqual([team]);
  });

  it('another client’s next pull empties its lists', async () => {
    const fake = fakeGithub();
    const repo = await openWith(fake, { teams: [team], initiatives: [initiative()] });
    const other = new Repository(defaultBrandPack, 'token');
    await other.initialize();
    expect(other.getState().initiatives).toHaveLength(1);

    await repo.resetDataset();
    await other.pull();

    expect(other.getState().initiatives).toEqual([]);
    expect(other.getState().teams).toEqual([]);
  });
});
