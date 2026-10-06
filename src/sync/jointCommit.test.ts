import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultBrandPack } from '../brand/defaultBrand';
import type { Country, Membership, Person } from '../data/types';
import { Repository } from './Repository';
import { FIXTURE_COUNTRY, fakeGithub, open, person, seedDataset, type Fake } from './testing/fakeGithub';

/** Slice 064 item 5 (§10.3): a user action that writes several files is one GraphQL commit, or none. */

const team = { id: 'team-1', name: 'Platform', active: true };
const puts = (fake: Fake) => fake.requests().filter((r) => r.startsWith('PUT '));

/** Waits for the joint commit, which runs once the first pull is done and the write queue is free. */
async function landed(fake: Fake, repo: Repository) {
  await vi.waitFor(() => expect(fake.graphqlCommits.length + puts(fake).length).toBeGreaterThan(0));
  await repo.flushPending();
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('a new person with their membership (slice 064)', () => {
  it('is one commit holding both files, naming both entities, with no PUT', async () => {
    const fake = fakeGithub();
    const { repo } = await open(fake, { teams: [team] });

    const created = repo.createPersonInTeam({ name: 'Cai Wu', countryId: 'c1', roleId: 'r1' }, 'team-1');
    await landed(fake, repo);

    expect(puts(fake)).toEqual([]);
    expect(fake.graphqlCommits).toHaveLength(1);
    const [commit] = fake.graphqlCommits;
    expect(commit.files.sort()).toEqual(['memberships.json', 'people.json']);
    expect(commit.message).toContain(`Entity: person/${created.id}`);
    expect(commit.message).toMatch(/Entity: membership\//);
    expect(fake.read<Person[]>('people.json').map((p) => p.name)).toEqual(['Cai Wu']);
    expect(fake.read<Membership[]>('memberships.json')).toEqual([expect.objectContaining({ personId: created.id, teamId: 'team-1' })]);
    expect(repo.getState().syncing).toBe(false);
  });

  it('a commit to a file it does not touch landing first: made again on the new head, still one commit', async () => {
    const fake = fakeGithub();
    const { repo } = await open(fake, { teams: [team] });
    fake.beforeCommit(() => fake.seed('teams.json', [team, { id: 'team-2', name: 'Growth', active: true }]));

    repo.createPersonInTeam({ name: 'Cai Wu', countryId: 'c1', roleId: 'r1' }, 'team-1');
    await landed(fake, repo);

    expect(puts(fake)).toEqual([]);
    expect(fake.graphqlCommits).toHaveLength(1);
    expect(fake.read<unknown[]>('teams.json')).toHaveLength(2);
  });

  it('a commit to memberships.json landing first: each file saves on its own and the memberships merge (§10.5)', async () => {
    const fake = fakeGithub();
    const { repo } = await open(fake, { teams: [team], people: [person('p0', 'Ana Ruiz')] });
    const theirs: Membership = { id: 'm0', personId: 'p0', teamId: 'team-1', teamFtePct: 50, active: true };
    fake.beforeCommit(() => fake.seed('memberships.json', [theirs]));

    const created = repo.createPersonInTeam({ name: 'Cai Wu', countryId: 'c1', roleId: 'r1' }, 'team-1');
    await landed(fake, repo);
    await vi.waitFor(() => expect(fake.commits('memberships.json').length).toBeGreaterThan(0));
    await repo.flushPending();

    expect(fake.graphqlCommits).toHaveLength(0);
    expect(fake.read<Membership[]>('memberships.json').map((m) => m.personId).sort()).toEqual(['p0', created.id].sort());
    expect(fake.read<Person[]>('people.json').map((p) => p.name)).toContain('Cai Wu');
    expect(repo.getState().conflicts).toEqual([]);
  });
});

describe('rates (slice 064)', () => {
  const germany: Country = { ...FIXTURE_COUNTRY, ratesByYear: [2026, 2027, 2028].map((year) => ({ year, dayRate: 1000, workingDaysByMonth: Array(12).fill(20) })) };

  async function openWithRates(people: Person[] = []) {
    const fake = fakeGithub();
    seedDataset(fake, { people });
    fake.seed('countries.json', [germany]);
    const repo = new Repository(defaultBrandPack, 'token');
    await repo.initialize();
    await repo.whenPulled();
    return { fake, repo };
  }

  it('a rate edit that also marks the rates reviewed is one commit of countries.json and dataset.json', async () => {
    const { fake, repo } = await openWithRates();

    repo.setCountryDayRate(germany.id, 2026, 1100);
    await landed(fake, repo);

    expect(puts(fake)).toEqual([]);
    expect(fake.graphqlCommits.map((c) => c.files.sort())).toEqual([['countries.json', 'dataset.json']]);
    expect(fake.read<{ ratesReviewed: boolean }>('dataset.json').ratesReviewed).toBe(true);
  });

  it('a later rate edit, with the rates already reviewed, is an ordinary single-file save', async () => {
    const { fake, repo } = await openWithRates();
    repo.setCountryDayRate(germany.id, 2026, 1100);
    await landed(fake, repo);

    repo.setCountryDayRate(germany.id, 2026, 1200);
    await repo.flushPending();

    expect(fake.graphqlCommits).toHaveLength(1);
    expect(puts(fake)).toEqual(['PUT /repos/jabopiti/initiative-planner/contents/countries.json']);
  });

  it('the roll-forward into a new year of countries and custom roles is one commit', async () => {
    const cai: Person = { ...person('cai', 'Cai Wu'), customRole: { active: true, label: 'Fractional CTO', costFactor: 1, dayRatesByYear: [{ year: 2028, dayRate: 900 }] } };
    const { fake, repo } = await openWithRates([cai]);

    const stop = repo.keepTrackedYears(() => new Date(2027, 0, 2));
    await landed(fake, repo);
    stop();

    expect(puts(fake)).toEqual([]);
    expect(fake.graphqlCommits).toEqual([{ message: 'Rates copied into 2029', files: ['countries.json', 'people.json'], deleted: [] }]);
  });
});
