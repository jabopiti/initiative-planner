import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultBrandPack } from '../brand/defaultBrand';
import type { Initiative } from '../data/types';
import { lostEditKey, Repository } from './Repository';
import { splitMessage, subjectOf } from './testing/commitMessage';
import { rootListing } from './testing/rootListing';
import { FIXTURE_ROLE } from './testing/fakeGithub';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

function contentsResponse(content: unknown, sha: string): Response {
  return jsonResponse({ content: btoa(JSON.stringify(content)), sha });
}

/**
 * Routes a mocked fetch by method + URL shape, since the baseline bootstrap
 * (blob -> tree -> commit -> ref) fires several requests whose exact
 * sequencing isn't worth hard-coding call-by-call. `datasetExists: false`
 * simulates a brand-new repo: dataset.json 404s until the bootstrap commit's
 * ref-create call succeeds, then it "exists" for the re-read that follows.
 */
function routingFetchMock(
  overrides: Record<string, (url: string, init?: RequestInit) => Response> = {},
  datasetExists = true,
) {
  let blobCount = 0;
  let puts = 0;
  let exists = datasetExists;
  return vi.fn(async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? 'GET';
    const key = `${method} ${new URL(url).pathname}`;

    for (const [pattern, handler] of Object.entries(overrides)) {
      if (key.includes(pattern)) return handler(url, init);
    }

    if (method === 'GET' && url.includes('/git/ref/heads/data')) return jsonResponse({ message: 'Not Found' }, 404);
    if (method === 'POST' && url.endsWith('/git/blobs')) {
      blobCount += 1;
      return jsonResponse({ sha: `blob-${blobCount}` });
    }
    if (method === 'POST' && url.endsWith('/git/trees')) return jsonResponse({ sha: 'tree-1' });
    if (method === 'POST' && url.endsWith('/git/commits')) return jsonResponse({ sha: 'commit-1' });
    if (method === 'POST' && url.endsWith('/git/refs')) {
      exists = true;
      return jsonResponse({ ref: 'refs/heads/data' }, 201);
    }

    if (method === 'GET' && new URL(url).pathname.endsWith('/contents/')) return exists ? rootListing() : jsonResponse({ message: 'Not Found' }, 404);
    if (method === 'GET' && url.includes('/contents/dataset.json')) {
      if (!exists) return jsonResponse({ message: 'Not Found' }, 404);
      return contentsResponse(
        { schemaVersion: 1, processIdentity: defaultBrandPack.processIdentity, ratesReviewed: false },
        'dataset-sha',
      );
    }
    if (method === 'GET' && url.includes('/contents/roles.json')) return contentsResponse([], 'roles-sha');
    if (method === 'GET' && url.includes('/contents/countries.json')) return contentsResponse([], 'countries-sha');
    if (method === 'GET' && url.includes('/contents/teams.json')) return contentsResponse([], 'teams-sha');
    if (method === 'GET' && url.includes('/contents/people.json')) return contentsResponse([], 'people-sha');
    if (method === 'GET' && url.includes('/contents/memberships.json')) return contentsResponse([], 'memberships-sha');
    if (method === 'GET' && url.includes('/contents/initiatives')) return jsonResponse({ message: 'Not Found' }, 404);
    // A master file's save lands: an initiative's save waits on them, since it may name their records (§3).
    if (method === 'PUT') {
      puts += 1;
      return jsonResponse({ content: { sha: `put-${puts}` } });
    }

    throw new Error(`Unhandled request in test: ${key}`);
  });
}

describe('Repository — slice 003 acceptance flows', () => {
  let fetchMock: ReturnType<typeof routingFetchMock>;

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('bootstraps the fresh-install baseline as one commit when no dataset exists, then loads empty teams/initiatives', async () => {
    fetchMock = routingFetchMock({}, false);
    vi.stubGlobal('fetch', fetchMock);

    const repo = new Repository(defaultBrandPack, 'token');
    await repo.initialize();

    const state = repo.getState();
    expect(state.status).toBe('ready');
    expect(state.readOnly).toBeNull();
    expect(state.teams).toEqual([]);
    expect(state.initiatives).toEqual([]);

    const bootstrapCalls = fetchMock.mock.calls.filter(([url]) => (url as string).endsWith('/git/refs'));
    expect(bootstrapCalls).toHaveLength(1); // one commit, not one per file
  });

  it('creating a team updates state immediately and appears as a real commit on the data branch', async () => {
    fetchMock = routingFetchMock({
      'PUT /repos/jabopiti/initiative-planner/contents/teams.json': (_url, init) => {
        const body = JSON.parse(init!.body as string) as { branch: string; sha?: string };
        expect(body.branch).toBe('data');
        return jsonResponse({ content: { sha: 'teams-sha-2' } });
      },
    });
    vi.stubGlobal('fetch', fetchMock);

    const repo = new Repository(defaultBrandPack, 'token');
    await repo.initialize();

    const team = repo.createTeam('Platform');
    // Optimistic: the team appears in state before the network write settles.
    expect(repo.getState().teams).toEqual([team]);
    expect(repo.getState().syncing).toBe(true);

    await repo.flushPending();

    expect(repo.getState().syncing).toBe(false);
    expect(repo.getState().readOnly).toBeNull();
    expect(repo.getState().teams).toEqual([team]);
  });

  it('a failed initiative create takes the initiative back out, reports read-only, and rejects', async () => {
    fetchMock = routingFetchMock({
      'PUT /repos/jabopiti/initiative-planner/contents/initiatives': () => jsonResponse({ message: 'Server Error' }, 500),
    });
    vi.stubGlobal('fetch', fetchMock);

    const repo = new Repository(defaultBrandPack, 'token');
    await repo.initialize();

    await expect(repo.createInitiative('Checkout Redesign', 'team-1')).rejects.toThrow();
    expect(repo.getState().initiatives).toEqual([]);
    expect(repo.getState().readOnly).not.toBeNull();
    expect(repo.getState().syncing).toBe(false);
  });

  it('a file that saved does not hide another file\'s failed save', async () => {
    fetchMock = routingFetchMock({
      'PUT /repos/jabopiti/initiative-planner/contents/teams.json': () => jsonResponse({ message: 'Forbidden' }, 403),
      'PUT /repos/jabopiti/initiative-planner/contents/people.json': () => jsonResponse({ content: { sha: 'people-sha-2' } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const repo = new Repository(defaultBrandPack, 'token');
    await repo.initialize();

    repo.createTeam('Platform');
    repo.createPerson({ name: 'Cai Wu', countryId: 'c1', roleId: 'r1' });
    await repo.flushPending();

    expect(repo.getState().readOnly).not.toBeNull(); // the teams file is still unsaved
    expect(repo.getState().syncing).toBe(false);
  });

  it('a dataset that cannot be read reports why instead of rejecting unhandled', async () => {
    fetchMock = routingFetchMock({
      'GET /repos/jabopiti/initiative-planner/contents/initiatives': () => jsonResponse({ message: 'Server Error' }, 500),
    });
    vi.stubGlobal('fetch', fetchMock);

    const repo = new Repository(defaultBrandPack, 'token');
    await expect(repo.initialize()).resolves.toBeUndefined();
    expect(repo.getState().status).toBe('loading');
    expect(repo.getState().readOnly).not.toBeNull();
  });

  it('creating an initiative writes its own file and appears in state with the given team', async () => {
    fetchMock = routingFetchMock({
      'PUT /repos/jabopiti/initiative-planner/contents/initiatives': () => jsonResponse({ content: { sha: 'init-sha' } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const repo = new Repository(defaultBrandPack, 'token');
    await repo.initialize();

    const initiative = await repo.createInitiative('Checkout Redesign', 'team-1');

    expect(repo.getState().initiatives).toEqual([initiative]);
    expect(initiative.teamId).toBe('team-1');
    expect(initiative.status).toBe('Active');
    expect(repo.getState().readOnly).toBeNull();

    const putCall = fetchMock.mock.calls.find(
      ([url, init]) => (init as RequestInit)?.method === 'PUT' && (url as string).includes('/initiatives/'),
    );
    expect(putCall).toBeDefined();
    const body = JSON.parse((putCall![1] as RequestInit).body as string) as { branch: string };
    expect(body.branch).toBe('data');
  });

  it('creates the initiative with a default plan chained from the given day, in the one creation commit', async () => {
    fetchMock = routingFetchMock({
      'PUT /repos/jabopiti/initiative-planner/contents/initiatives': () => jsonResponse({ content: { sha: 'init-sha' } }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const repo = new Repository(defaultBrandPack, 'token');
    await repo.initialize();

    const initiative = await repo.createInitiative('Checkout Redesign', 'team-1', '2026-09-24');

    expect(initiative.defaultPlan).toBe(true);
    expect(initiative.phases).toEqual({
      validation: { startDate: '2026-09-24', endDate: '2026-12-23', allocations: [] },
      development: { startDate: '2026-12-24', endDate: '2027-06-23', allocations: [] },
    });
    const puts = fetchMock.mock.calls.filter(([, init]) => (init as RequestInit)?.method === 'PUT');
    expect(puts).toHaveLength(1);
    const saved = JSON.parse(atob(JSON.parse((puts[0][1] as RequestInit).body as string).content)) as typeof initiative;
    expect(saved.phases?.validation.startDate).toBe('2026-09-24');
    expect(saved.defaultPlan).toBe(true);
  });
});

describe('Repository — slice 004 people and memberships', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function readyRepo() {
    vi.stubGlobal('fetch', routingFetchMock());
    const repo = new Repository(defaultBrandPack, 'token');
    await repo.initialize();
    return repo;
  }

  const input = { name: 'Ada Lovelace', countryId: 'c1', roleId: 'r1' };

  it('creates a person with the given country and role, 100% capacity, active', async () => {
    const repo = await readyRepo();
    const person = repo.createPerson(input);
    expect(person).toMatchObject({ name: 'Ada Lovelace', countryId: 'c1', roleId: 'r1', capacityPct: 100, active: true });
    expect(repo.getState().people).toEqual([person]);
  });

  it("defaults a first membership's Team FTE % to the person's full capacity", async () => {
    const repo = await readyRepo();
    const person = repo.createPerson(input);
    const membership = repo.addMembership(person.id, 'team-a');
    expect(membership?.teamFtePct).toBe(100);
  });

  it('caps a second membership at the remaining unclaimed capacity', async () => {
    const repo = await readyRepo();
    const person = repo.createPerson(input);
    const first = repo.addMembership(person.id, 'team-a')!;
    repo.updateMembership(first.id, { teamFtePct: 60 });

    expect(repo.addMembership(person.id, 'team-b')?.teamFtePct).toBe(40);

    const second = repo.getState().memberships.find((m) => m.teamId === 'team-b')!;
    repo.updateMembership(second.id, { teamFtePct: 90 });
    expect(repo.getState().memberships.find((m) => m.id === second.id)?.teamFtePct).toBe(40);
  });

  it('lets the team detail raise a membership past the cap', async () => {
    const repo = await readyRepo();
    const person = repo.createPerson(input);
    const first = repo.addMembership(person.id, 'team-a')!;
    repo.updateMembership(first.id, { teamFtePct: 60 });
    const second = repo.addMembership(person.id, 'team-b')!;
    repo.updateMembership(second.id, { teamFtePct: 90 }, true);
    expect(repo.getState().memberships.find((m) => m.id === second.id)?.teamFtePct).toBe(90);
  });

  it('does not add the same person to the same team twice', async () => {
    const repo = await readyRepo();
    const person = repo.createPerson(input);
    repo.addMembership(person.id, 'team-a');
    repo.addMembership(person.id, 'team-a');
    expect(repo.getState().memberships).toHaveLength(1);
  });

  it('restores a removed membership at its position, refusing once the pair is back (§5.11)', async () => {
    const repo = await readyRepo();
    const a = repo.createPerson(input);
    const b = repo.createPerson(input);
    const teamId = repo.createTeam('Team A').id;
    const first = repo.addMembership(a.id, teamId)!;
    repo.updateMembership(first.id, { teamFtePct: 40 }, true);
    repo.addMembership(b.id, teamId);
    const removed = repo.removeMembership(first.id)!;
    expect(removed.index).toBe(0);
    expect(repo.restoreMembership(removed.membership, removed.index)).toEqual({ ok: true });
    expect(repo.getState().memberships[0]).toMatchObject({ id: first.id, teamFtePct: 40 });
    expect(repo.getState().memberships).toHaveLength(2);

    repo.removeMembership(first.id);
    repo.addMembership(a.id, teamId);
    const refused = repo.restoreMembership(removed.membership, removed.index);
    expect(refused).toMatchObject({ ok: false });
    expect(repo.getState().memberships).toHaveLength(2);
  });

  it('renames a team, refusing an empty or duplicate name case-insensitively (§5.8)', async () => {
    const repo = await readyRepo();
    const team = repo.createTeam('Payments');
    repo.createTeam('Platform');
    expect(repo.teamNameRefusal('  ', team.id)).toBe('Enter a name.');
    expect(repo.teamNameRefusal('platform', team.id)).toBe('A team named Platform already exists.');
    expect(repo.teamNameRefusal('payments', team.id)).toBeNull();
    repo.updateTeam(team.id, { name: 'platform' });
    expect(repo.getState().teams[0].name).toBe('Payments');
    repo.updateTeam(team.id, { name: 'Billing' });
    expect(repo.getState().teams[0].name).toBe('Billing');
    repo.updateTeam(team.id, { name: ' Ledger ' });
    expect(repo.getState().teams[0].name).toBe('Ledger');
  });

  it('createTeam trims the name and refuses an empty or duplicate one', async () => {
    const repo = await readyRepo();
    expect(repo.createTeam('  Platform ').name).toBe('Platform');
    expect(() => repo.createTeam('platform')).toThrow('A team named Platform already exists.');
    expect(() => repo.createTeam('  ')).toThrow('Enter a name.');
    expect(repo.getState().teams).toHaveLength(1);
  });

  it('deactivates and reactivates a person, keeping the record; removes a membership', async () => {
    const repo = await readyRepo();
    const person = repo.createPerson(input);
    const membership = repo.addMembership(person.id, 'team-a')!;
    repo.updatePerson(person.id, { active: false });
    expect(repo.getState().people[0].active).toBe(false);
    repo.updatePerson(person.id, { active: true });
    expect(repo.getState().people[0].active).toBe(true);
    repo.removeMembership(membership.id);
    expect(repo.getState().memberships).toEqual([]);
    expect(repo.getState().people).toHaveLength(1);
  });
});

describe('Repository — commit messages name the entity (§10.3)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function rawMessagesFor(mock: ReturnType<typeof routingFetchMock>, file: string): string[] {
    return mock.mock.calls
      .filter(([url, init]) => (init as RequestInit)?.method === 'PUT' && (url as string).endsWith(`/contents/${file}`))
      .map(([, init]) => (JSON.parse((init as RequestInit).body as string) as { message: string }).message);
  }
  const messagesFor = (mock: ReturnType<typeof routingFetchMock>, file: string) => rawMessagesFor(mock, file).map(subjectOf);
  /** The `Entity:` trailer lines of each commit to the file (§10.3). */
  const trailersFor = (mock: ReturnType<typeof routingFetchMock>, file: string) => rawMessagesFor(mock, file).map((m) => splitMessage(m).trailers);

  it('says which team was renamed to what', async () => {
    const mock = routingFetchMock();
    vi.stubGlobal('fetch', mock);
    const repo = new Repository(defaultBrandPack, 'token');
    await repo.initialize();
    const team = repo.createTeam('Payments');
    await repo.flushPending();
    repo.updateTeam(team.id, { name: 'Billing' });
    await repo.flushPending();
    expect(messagesFor(mock, 'teams.json')).toEqual(['Payments: team created', 'Payments: team renamed to Billing']);
  });

  it('says who was added, changed and added to which team', async () => {
    const mock = routingFetchMock();
    vi.stubGlobal('fetch', mock);
    const repo = new Repository(defaultBrandPack, 'token');
    await repo.initialize();
    const team = repo.createTeam('Payments');
    await repo.flushPending();
    const ada = repo.createPerson({ name: 'Ada Lovelace', countryId: 'c1', roleId: 'r1' });
    await repo.flushPending();
    repo.updatePerson(ada.id, { capacityPct: 80 });
    repo.updatePerson(ada.id, { active: false });
    await repo.flushPending();
    const membership = repo.addMembership(ada.id, team.id)!;
    await repo.flushPending();
    repo.updateMembership(membership.id, { teamFtePct: 60 }, true);
    await repo.flushPending();
    repo.removeMembership(membership.id);
    await repo.flushPending();

    expect(messagesFor(mock, 'teams.json')).toEqual(['Payments: team created']);
    expect(messagesFor(mock, 'people.json')).toEqual([
      'Ada Lovelace: person added',
      'Ada Lovelace: capacity set to 80%, deactivated',
    ]);
    expect(messagesFor(mock, 'memberships.json')).toEqual([
      'Ada Lovelace: added to Payments at 80%',
      'Ada Lovelace: Team FTE % on Payments set to 60%',
      'Ada Lovelace: removed from Payments',
    ]);
    // One trailer per touched entity, ending each commit (§10.3).
    expect(trailersFor(mock, 'teams.json')).toEqual([[`Entity: team/${team.id}`]]);
    expect(trailersFor(mock, 'people.json')).toEqual([[`Entity: person/${ada.id}`], [`Entity: person/${ada.id}`]]);
    expect(trailersFor(mock, 'memberships.json')).toEqual(Array(3).fill([`Entity: membership/${membership.id}`]));
  });

  it('moves Team FTE % between two teams in one commit naming both (§5.6, slice 062)', async () => {
    const mock = routingFetchMock();
    vi.stubGlobal('fetch', mock);
    const repo = new Repository(defaultBrandPack, 'token');
    await repo.initialize();
    const platform = repo.createTeam('Platform');
    const growth = repo.createTeam('Growth');
    const lucia = repo.createPerson({ name: 'Lucía Ramos', countryId: 'c1', roleId: 'r1' });
    const a = repo.addMembership(lucia.id, platform.id, 60)!;
    const b = repo.addMembership(lucia.id, growth.id, 40)!;
    await repo.flushPending();

    repo.updateMemberships([
      { id: a.id, teamFtePct: 70 },
      { id: b.id, teamFtePct: 30 },
    ]);
    await repo.flushPending();
    expect(repo.getState().memberships.map((m) => m.teamFtePct)).toEqual([70, 30]);
    expect(messagesFor(mock, 'memberships.json').at(-1)).toBe('Lucía Ramos: Team FTE % on Platform set to 70%, Team FTE % on Growth set to 30%');
    expect(trailersFor(mock, 'memberships.json').at(-1)).toEqual([`Entity: membership/${a.id}`, `Entity: membership/${b.id}`]);

    // Moved and moved back before the save: no commit.
    const puts = messagesFor(mock, 'memberships.json').length;
    repo.updateMemberships([
      { id: a.id, teamFtePct: 75 },
      { id: b.id, teamFtePct: 25 },
    ]);
    repo.updateMemberships([
      { id: a.id, teamFtePct: 70 },
      { id: b.id, teamFtePct: 30 },
    ]);
    await repo.flushPending();
    expect(messagesFor(mock, 'memberships.json')).toHaveLength(puts);

    // A move, then a typed value on one of its teams before the save: one note per team, the net effect.
    repo.updateMemberships([
      { id: a.id, teamFtePct: 80 },
      { id: b.id, teamFtePct: 20 },
    ]);
    repo.updateMembership(a.id, { teamFtePct: 75 });
    await repo.flushPending();
    expect(messagesFor(mock, 'memberships.json').at(-1)).toBe('Lucía Ramos: Team FTE % on Platform set to 75%, Team FTE % on Growth set to 20%');

    // Each value is capped at what is left of Capacity % once the others' changes are in.
    repo.updateMemberships([
      { id: a.id, teamFtePct: 90 },
      { id: b.id, teamFtePct: 20 },
    ]);
    expect(repo.getState().memberships.map((m) => m.teamFtePct)).toEqual([80, 20]);
  });

  it('rejoins an inactive membership: same id, Team FTE % kept but capped at what is unclaimed, one record', async () => {
    const mock = routingFetchMock();
    vi.stubGlobal('fetch', mock);
    const repo = new Repository(defaultBrandPack, 'token');
    await repo.initialize();
    const team = repo.createTeam('Platform');
    const other = repo.createTeam('Payments');
    const ada = repo.createPerson({ name: 'Ada Lovelace', countryId: 'c1', roleId: 'r1' });
    const first = repo.addMembership(ada.id, team.id)!;
    repo.updateMembership(first.id, { teamFtePct: 70 });
    repo.updateMembership(first.id, { active: false });
    repo.addMembership(ada.id, other.id); // takes the 100% now unclaimed
    await repo.flushPending();

    const rejoined = repo.addMembership(ada.id, team.id)!;
    await repo.flushPending();
    expect(rejoined.id).toBe(first.id);
    expect(rejoined).toMatchObject({ active: true, teamFtePct: 0 });
    expect(repo.getState().memberships.filter((m) => m.teamId === team.id)).toHaveLength(1);
    expect(messagesFor(mock, 'memberships.json').at(-1)).toBe('Ada Lovelace: rejoined Platform, Team FTE % set to 0%');
  });

  it('words every inactive-to-active membership change as a rejoin', async () => {
    const mock = routingFetchMock();
    vi.stubGlobal('fetch', mock);
    const repo = new Repository(defaultBrandPack, 'token');
    await repo.initialize();
    const team = repo.createTeam('Platform');
    const ada = repo.createPerson({ name: 'Ada Lovelace', countryId: 'c1', roleId: 'r1' });
    const m = repo.addMembership(ada.id, team.id)!;
    repo.updateMembership(m.id, { active: false });
    await repo.flushPending();
    repo.updateMembership(m.id, { active: true }, true);
    await repo.flushPending();
    expect(messagesFor(mock, 'memberships.json').at(-1)).toBe('Ada Lovelace: rejoined Platform');
  });

  it('says which team was deactivated and reactivated (§9.3)', async () => {
    const mock = routingFetchMock();
    vi.stubGlobal('fetch', mock);
    const repo = new Repository(defaultBrandPack, 'token');
    await repo.initialize();
    const team = repo.createTeam('Payments');
    await repo.flushPending();
    repo.updateTeam(team.id, { active: false });
    await repo.flushPending();
    repo.updateTeam(team.id, { active: true });
    await repo.flushPending();

    expect(repo.getState().teams[0].active).toBe(true);
    expect(messagesFor(mock, 'teams.json')).toEqual([
      'Payments: team created',
      'Payments: team deactivated',
      'Payments: team reactivated',
    ]);
  });

  it('says what changed about a custom role, one edit at a time (§5.6)', async () => {
    const mock = routingFetchMock();
    vi.stubGlobal('fetch', mock);
    const repo = new Repository(defaultBrandPack, 'token');
    await repo.initialize();
    const cai = repo.createPerson({ name: 'Cai Wu', countryId: 'c1', roleId: 'r1' });
    await repo.flushPending();

    const custom = { active: true, label: 'Fractional CTO', costFactor: 1, dayRatesByYear: [{ year: 2026, dayRate: 900 }] };
    repo.updatePerson(cai.id, { customRole: custom });
    await repo.flushPending();
    repo.updatePerson(cai.id, { customRole: { ...custom, costFactor: 1.2 } });
    await repo.flushPending();
    repo.updatePerson(cai.id, { customRole: { ...custom, costFactor: 1.2, dayRatesByYear: [] } });
    await repo.flushPending();
    repo.updatePerson(cai.id, { customRole: { ...custom, costFactor: 1.2, dayRatesByYear: [], active: false } });
    await repo.flushPending();

    expect(messagesFor(mock, 'people.json').slice(1)).toEqual([
      'Cai Wu: custom role set to Fractional CTO, 2026 custom day rate set to 900',
      'Cai Wu: custom role cost factor set to 1.2',
      'Cai Wu: 2026 custom day rate cleared',
      expect.stringMatching(/^Cai Wu: back to standard role /),
    ]);
    // Switching back keeps the custom entries for later (§6).
    expect(repo.getState().people[0].customRole?.label).toBe('Fractional CTO');
  });

  it('says what changed about a role, prefixed "Roles:" (§5.9)', async () => {
    const mock = routingFetchMock();
    vi.stubGlobal('fetch', mock);
    const repo = new Repository(defaultBrandPack, 'token');
    await repo.initialize();
    const role = repo.createRole({ name: 'Designer', abbreviation: 'Des', costFactor: 1 });
    await repo.flushPending();
    repo.updateRole(role.id, { costFactor: 1.4 });
    await repo.flushPending();
    repo.updateRole(role.id, { active: false });
    await repo.flushPending();
    repo.updateRole(role.id, { active: true });
    await repo.flushPending();

    expect(messagesFor(mock, 'roles.json')).toEqual([
      'Roles: Designer added',
      'Roles: Designer cost factor set to 1.4',
      'Roles: Designer deactivated',
      'Roles: Designer reactivated',
    ]);
    expect(trailersFor(mock, 'roles.json')).toEqual(Array(4).fill([`Entity: role/${role.id}`]));
  });

  it('names every changed field of a role in one commit, and skips a no-op patch', async () => {
    const mock = routingFetchMock();
    vi.stubGlobal('fetch', mock);
    const repo = new Repository(defaultBrandPack, 'token');
    await repo.initialize();
    const role = repo.createRole({ name: 'Designer', abbreviation: 'Des', costFactor: 1 });
    await repo.flushPending();

    repo.updateRole(role.id, { active: role.active });
    await repo.flushPending();
    repo.updateRole(role.id, { name: 'Product Designer', abbreviation: 'PD' });
    await repo.flushPending();

    expect(messagesFor(mock, 'roles.json')).toEqual([
      'Roles: Designer added',
      'Roles: Designer renamed to Product Designer, abbreviation set to PD',
    ]);
  });
});


describe('Repository — countries and rates (§5.9, §7.2)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const bodiesFor = (mock: ReturnType<typeof routingFetchMock>, file: string) =>
    mock.mock.calls
      .filter(([url, init]) => (init as RequestInit)?.method === 'PUT' && (url as string).endsWith(`/contents/${file}`))
      .map(([, init]) => JSON.parse((init as RequestInit).body as string) as { message: string; content: string });
  const messagesFor = (mock: ReturnType<typeof routingFetchMock>, file: string) => bodiesFor(mock, file).map((b) => subjectOf(b.message));
  const trailersFor = (mock: ReturnType<typeof routingFetchMock>, file: string) => bodiesFor(mock, file).map((b) => splitMessage(b.message).trailers);
  const saved = <T,>(body: { content: string }): T => JSON.parse(atob(body.content)) as T;
  const okPut = () => jsonResponse({ content: { sha: 'next-sha' } });

  async function open(overrides: Record<string, (url: string, init?: RequestInit) => Response> = {}) {
    const mock = routingFetchMock({
      'PUT /repos/jabopiti/initiative-planner/contents/countries.json': okPut,
      'PUT /repos/jabopiti/initiative-planner/contents/dataset.json': okPut,
      'PUT /repos/jabopiti/initiative-planner/contents/people.json': okPut,
      ...overrides,
    });
    vi.stubGlobal('fetch', mock);
    const repo = new Repository(defaultBrandPack, 'token');
    await repo.initialize();
    return { mock, repo };
  }

  it('adds a country with its day rate for every tracked year and weekday working days', async () => {
    const { mock, repo } = await open();
    const portugal = repo.createCountry({ name: 'Portugal', code: 'PT', dayRate: 600 }, new Date(2026, 8, 30));
    await repo.flushPending();

    expect(portugal.ratesByYear.map((r) => [r.year, r.dayRate])).toEqual([
      [2026, 600],
      [2027, 600],
      [2028, 600],
    ]);
    expect(portugal.ratesByYear[1].workingDaysByMonth[2]).toBe(23);
    expect(messagesFor(mock, 'countries.json')).toEqual(['Countries: Portugal added']);
    expect(trailersFor(mock, 'countries.json')).toEqual([[`Entity: country/${portugal.id}`]]);
    // Adding a country is not a rate edit: Review rates stays until one is made or confirmed (§5.2).
    expect(messagesFor(mock, 'dataset.json')).toEqual([]);
  });

  it('names each rate edit, and the first one marks the rates reviewed in its own commit', async () => {
    const { mock, repo } = await open();
    const germany = repo.createCountry({ name: 'Germany', code: 'DE', dayRate: 1000 }, new Date(2026, 8, 30));
    await repo.flushPending();
    repo.setCountryDayRate(germany.id, 2027, 740);
    await repo.flushPending();
    repo.setCountryWorkingDays(germany.id, 2027, 3, 19);
    await repo.flushPending();
    repo.resetCountryWorkingDays(germany.id, 2027);
    await repo.flushPending();
    repo.updateCountry(germany.id, { name: 'Deutschland' });
    await repo.flushPending();
    repo.updateCountry(germany.id, { active: false });
    await repo.flushPending();

    expect(messagesFor(mock, 'countries.json')).toEqual([
      'Countries: Germany added',
      'Germany: 2027 day rate set to €740',
      'Germany: working days in Apr 2027 set to 19',
      'Germany: working days in 2027 reset to weekdays',
      'Countries: Germany renamed to Deutschland',
      'Countries: Deutschland deactivated',
    ]);
    expect(messagesFor(mock, 'dataset.json')).toEqual(['Rates marked as reviewed']);
    expect(trailersFor(mock, 'dataset.json')).toEqual([[]]);
    expect(repo.getState().datasetFlags?.ratesReviewed).toBe(true);
    expect(repo.getState().countries[0].ratesByYear[1].workingDaysByMonth[3]).toBe(22);
  });

  it('writes nothing for an edit that changes nothing', async () => {
    const { mock, repo } = await open();
    const germany = repo.createCountry({ name: 'Germany', code: 'DE', dayRate: 1000 }, new Date(2026, 8, 30));
    await repo.flushPending();
    repo.setCountryDayRate(germany.id, 2027, 1000);
    repo.resetCountryWorkingDays(germany.id, 2027);
    await repo.flushPending();

    expect(messagesFor(mock, 'countries.json')).toEqual(['Countries: Germany added']);
    expect(messagesFor(mock, 'dataset.json')).toEqual([]);
  });

  it('confirms the rates without editing them, once', async () => {
    const { mock, repo } = await open();
    repo.confirmRates();
    await repo.flushPending();
    repo.confirmRates();
    await repo.flushPending();

    expect(messagesFor(mock, 'dataset.json')).toEqual(['Rates confirmed as correct']);
    expect(saved<{ ratesReviewed: boolean }>(bodiesFor(mock, 'dataset.json')[0]).ratesReviewed).toBe(true);
  });

  it('rolls a year entering the window forward once, for countries and custom roles', async () => {
    const germany = [{ id: 'de', name: 'Germany', active: true, ratesByYear: [2026, 2027, 2028].map((year) => ({ year, dayRate: 1000, workingDaysByMonth: Array(12).fill(20) })) }];
    const cai = [
      { id: 'cai', name: 'Cai Wu', countryId: 'de', roleId: 'r1', capacityPct: 100, active: true, customRole: { active: true, label: 'Fractional CTO', costFactor: 1, dayRatesByYear: [{ year: 2028, dayRate: 900 }] } },
    ];
    const { mock, repo } = await open({
      'GET /repos/jabopiti/initiative-planner/contents/countries.json': () => contentsResponse(germany, 'countries-sha'),
      'GET /repos/jabopiti/initiative-planner/contents/people.json': () => contentsResponse(cai, 'people-sha'),
      'GET /repos/jabopiti/initiative-planner/contents/roles.json': () => contentsResponse([FIXTURE_ROLE], 'roles-sha'),
    });

    const stop = repo.keepTrackedYears(() => new Date(2027, 0, 2));
    await repo.flushPending();
    stop();

    const rates = repo.getState().countries[0].ratesByYear;
    expect(rates.map((r) => r.year)).toEqual([2026, 2027, 2028, 2029]);
    expect(rates[3].dayRate).toBe(1000);
    expect(rates[3].workingDaysByMonth[0]).toBe(23);
    expect(repo.getState().people[0].customRole?.dayRatesByYear.map((r) => r.year)).toEqual([2027, 2028, 2029]);
    expect(messagesFor(mock, 'countries.json')).toEqual(['Rates copied into 2029']);
    expect(trailersFor(mock, 'countries.json')).toEqual([[]]); // a dataset-level commit names no entity
    expect(messagesFor(mock, 'people.json')).toEqual(['Rates copied into 2029']);
    // A system write, not a rate edit: it does not mark the rates reviewed.
    expect(messagesFor(mock, 'dataset.json')).toEqual([]);

    repo.keepTrackedYears(() => new Date(2027, 0, 2))();
    await repo.flushPending();
    expect(messagesFor(mock, 'countries.json')).toHaveLength(1);
  });
});

describe('Repository — slice 005 phase periods and allocations', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const commits: { message: string; trailers: string[]; content: Initiative }[] = [];

  async function repoWithInitiative() {
    commits.length = 0;
    vi.stubGlobal(
      'fetch',
      routingFetchMock({
        'PUT /repos/jabopiti/initiative-planner/contents/initiatives': (_url, init) => {
          const body = JSON.parse(init!.body as string) as { message: string; content: string };
          commits.push({ message: subjectOf(body.message), trailers: splitMessage(body.message).trailers, content: JSON.parse(atob(body.content)) });
          return jsonResponse({ content: { sha: `sha-${commits.length}` } });
        },
      }),
    );
    const repo = new Repository(defaultBrandPack, 'token');
    await repo.initialize();
    const team = repo.createTeam('Payments');
    const member = repo.createPerson({ name: 'Ana Ruiz', countryId: 'c1', roleId: 'r1' });
    const outsider = repo.createPerson({ name: 'Cai Wu', countryId: 'c1', roleId: 'r1' });
    const membership = repo.addMembership(member.id, team.id)!;
    repo.updateMembership(membership.id, { teamFtePct: 60 });
    const initiative = await repo.createInitiative('Payments API', team.id, '2026-09-24');
    commits.length = 0; // the creation commit isn't under test
    return { repo, initiative, member, outsider };
  }

  it('refuses a non-member with the reason and changes nothing', async () => {
    const { repo, initiative, outsider } = await repoWithInitiative();
    const result = repo.addAllocation(initiative.id, 'validation', outsider.id);
    expect(result).toEqual({ ok: false, reason: "Cai Wu isn't a member of Payments. Only team members can be allocated." });
    expect(repo.getState().initiatives[0].phases?.validation.allocations).toEqual([]);
  });

  it("prefills a new allocation with the member's Team FTE % and refuses a second row for the same person", async () => {
    const { repo, initiative, member } = await repoWithInitiative();
    const result = repo.addAllocation(initiative.id, 'validation', member.id);
    expect(result.ok && result.allocation.allocationPct).toBe(60);
    expect(repo.addAllocation(initiative.id, 'validation', member.id)).toMatchObject({ ok: false });
  });

  it("commits the period and allocations to the initiative's file with plain-words messages, once edits settle", async () => {
    const { repo, initiative, member } = await repoWithInitiative();
    repo.setPhasePeriod(initiative.id, 'validation', { startDate: '2026-10-01', endDate: '2026-11-30' });
    const added = repo.addAllocation(initiative.id, 'validation', member.id);
    if (!added.ok) throw new Error('expected the allocation to be added');
    repo.updateAllocation(initiative.id, 'validation', added.allocation.id, 80);
    await repo.flushPending();

    expect(commits).toHaveLength(1);
    expect(commits[0].message).toContain('Payments API: Validation period set to Oct–Nov');
    expect(commits[0].message).toContain('Payments API: Ana Ruiz added to Validation at 80%');
    expect(commits[0].content.phases?.validation).toEqual({
      startDate: '2026-10-01',
      endDate: '2026-11-30',
      allocations: [{ id: added.allocation.id, personId: member.id, allocationPct: 80 }],
    });
  });

  it('saves a whole period as one write and one commit, and writes nothing when it is unchanged (§9.11)', async () => {
    const { repo, initiative } = await repoWithInitiative();
    repo.setPhasePeriod(initiative.id, 'validation', { startDate: '2026-09-01', endDate: '2026-10-31' });
    await repo.flushPending();
    expect(commits.map((c) => c.message.split('\n')[0])).toEqual(['Payments API: Validation period set to Sep–Oct']);
    expect(commits[0].content.phases?.validation).toMatchObject({ startDate: '2026-09-01', endDate: '2026-10-31' });

    commits.length = 0;
    repo.setPhasePeriod(initiative.id, 'validation', { startDate: '2026-09-01', endDate: '2026-10-31' });
    await repo.flushPending();
    expect(commits).toEqual([]);

    repo.setPhasePeriod(initiative.id, 'validation', {});
    await repo.flushPending();
    expect(commits.map((c) => c.message.split('\n')[0])).toEqual(['Payments API: Validation period cleared']);
    expect(commits[0].content.phases?.validation.startDate).toBeUndefined();
    expect(commits[0].content.phases?.validation.endDate).toBeUndefined();
  });

  it('copies the previous costed phase into an empty one as a single commit, skipping someone who left, and refuses a non-empty phase', async () => {
    const { repo, initiative, member } = await repoWithInitiative();
    const leaver = repo.createPerson({ name: 'Lucía Ramos', countryId: 'c1', roleId: 'r1' });
    const leaverMembership = repo.addMembership(leaver.id, initiative.teamId)!;
    repo.addAllocation(initiative.id, 'validation', member.id, 40);
    repo.addAllocation(initiative.id, 'validation', leaver.id, 30);
    repo.updateMembership(leaverMembership.id, { active: false });
    await repo.flushPending();
    commits.length = 0;

    const result = repo.copyAllocations(initiative.id, 'development', 'validation');
    expect(result?.copied).toBe(1);
    expect(result?.skipped.map((p) => p.name)).toEqual(['Lucía Ramos']);
    await repo.flushPending();
    expect(commits.map((c) => c.message)).toEqual(['Payments API: 1 person copied to Development from Validation']);
    expect(commits[0].content.phases?.development.allocations).toEqual([expect.objectContaining({ personId: member.id, allocationPct: 40 })]);

    expect(repo.copyAllocations(initiative.id, 'development', 'validation')).toBeNull();
  });

  it('writes nothing when everyone was skipped', async () => {
    const { repo, initiative, member } = await repoWithInitiative();
    const membership = repo.getState().memberships.find((m) => m.personId === member.id)!;
    repo.addAllocation(initiative.id, 'validation', member.id, 40);
    repo.updateMembership(membership.id, { active: false });
    await repo.flushPending();
    commits.length = 0;
    const result = repo.copyAllocations(initiative.id, 'development', 'validation');
    expect(result).toMatchObject({ copied: 0 });
    await repo.flushPending();
    expect(commits).toEqual([]);
  });

  it('describes an allocation added then changed as one add, and an added-then-removed one as no commit (§10.3)', async () => {
    const { repo, initiative, member } = await repoWithInitiative();
    const added = repo.addAllocation(initiative.id, 'validation', member.id);
    if (!added.ok) throw new Error('expected the allocation to be added');
    repo.updateAllocation(initiative.id, 'validation', added.allocation.id, 40);
    await repo.flushPending();
    expect(commits.map((c) => c.message)).toEqual(['Payments API: Ana Ruiz added to Validation at 40%']);

    commits.length = 0;
    repo.updateAllocation(initiative.id, 'validation', added.allocation.id, 30);
    repo.updateAllocation(initiative.id, 'validation', added.allocation.id, 40);
    const removed = repo.removeAllocation(initiative.id, 'validation', added.allocation.id);
    repo.restoreAllocation(initiative.id, 'validation', removed!.allocation, removed!.index);
    await repo.flushPending();
    expect(commits).toEqual([]);

    repo.removeAllocation(initiative.id, 'validation', added.allocation.id);
    await repo.flushPending();
    expect(commits.map((c) => c.message)).toEqual(['Payments API: Ana Ruiz removed from Validation']);
  });

  it('reads a double rename from the saved name to the last one', async () => {
    const { repo, initiative } = await repoWithInitiative();
    repo.renameInitiative(initiative.id, 'B');
    repo.renameInitiative(initiative.id, 'C');
    await repo.flushPending();
    expect(commits.map((c) => c.message)).toEqual(['Payments API: renamed to C']);
  });

  it('renames an initiative in place with a commit naming the old and new name, and refuses an empty name', async () => {
    const { repo, initiative } = await repoWithInitiative();
    expect(repo.renameInitiative(initiative.id, '   ')).toBe(false);
    expect(repo.getState().initiatives[0].name).toBe('Payments API');

    expect(repo.renameInitiative(initiative.id, ' Payments API 2 ')).toBe(true);
    await repo.flushPending();

    expect(repo.getState().initiatives[0].name).toBe('Payments API 2');
    expect(commits).toHaveLength(1);
    expect(commits[0].message).toBe('Payments API: renamed to Payments API 2');
    expect(commits[0].trailers).toEqual([`Entity: initiative/${initiative.id}`]);
    expect(commits[0].content.name).toBe('Payments API 2');
  });

  it('puts an undone removal back in its place', async () => {
    const { repo, initiative, member } = await repoWithInitiative();
    const added = repo.addAllocation(initiative.id, 'validation', member.id);
    if (!added.ok) throw new Error('expected the allocation to be added');
    const removed = repo.removeAllocation(initiative.id, 'validation', added.allocation.id)!;
    expect(repo.getState().initiatives[0].phases!.validation.allocations).toEqual([]);
    repo.restoreAllocation(initiative.id, 'validation', removed.allocation, removed.index);
    expect(repo.getState().initiatives[0].phases!.validation.allocations).toEqual([added.allocation]);
  });

  it('adds, edits, removes and restores cost items as commits naming the phase, and restores each only once', async () => {
    const { repo, initiative } = await repoWithInitiative();
    const item = repo.addCostItem(initiative.id, 'validation', { label: 'Penetration test', amount: 12000, timing: 'month', month: '2026-10' })!;
    repo.updateCostItem(initiative.id, 'validation', item.id, { amount: 9000 });
    repo.updateCostItem(initiative.id, 'validation', item.id, { timing: 'spread' });
    const items = () => repo.getState().initiatives[0].phases!.validation.costItems;
    expect(items()).toEqual([{ ...item, amount: 9000, timing: 'spread' }]);

    const removed = repo.removeCostItem(initiative.id, 'validation', item.id)!;
    expect(items()).toEqual([]);
    repo.restoreCostItem(initiative.id, 'validation', removed.item, removed.index);
    repo.restoreCostItem(initiative.id, 'validation', removed.item, removed.index); // a second Undo, or one after a pull brought it back
    expect(items()).toEqual([{ ...item, amount: 9000, timing: 'spread' }]);
    expect(repo.removeCostItem(initiative.id, 'validation', 'nope')).toBeNull();
  });

  describe('changing the team (§7.2)', () => {
    async function withTwoTeams() {
      const ctx = await repoWithInitiative();
      const growth = ctx.repo.createTeam('Growth');
      ctx.repo.addMembership(ctx.member.id, growth.id); // Ana is on both teams
      const bo = ctx.repo.createPerson({ name: 'Bo Lin', countryId: 'c1', roleId: 'r1' });
      const boMembership = ctx.repo.addMembership(bo.id, ctx.initiative.teamId)!;
      ctx.repo.updateMembership(boMembership.id, { teamFtePct: 40 });
      const ana = ctx.repo.addAllocation(ctx.initiative.id, 'validation', ctx.member.id);
      const boAlloc = ctx.repo.addAllocation(ctx.initiative.id, 'validation', bo.id);
      const boDev = ctx.repo.addAllocation(ctx.initiative.id, 'development', bo.id);
      if (!ana.ok || !boAlloc.ok || !boDev.ok) throw new Error('expected the allocations to be added');
      await ctx.repo.flushPending();
      commits.length = 0;
      return { ...ctx, growth, bo, ana: ana.allocation, boAlloc: boAlloc.allocation, boDev: boDev.allocation };
    }

    it('moves the initiative and removes only the non-members from the open phases, in one commit naming both teams and the count', async () => {
      const { repo, initiative, growth, ana } = await withTwoTeams();
      const result = repo.changeTeam(initiative.id, growth.id)!;
      expect(result.removed).toHaveLength(2);
      const changed = repo.getState().initiatives[0];
      expect(changed.teamId).toBe(growth.id);
      expect(changed.phases!.validation.allocations).toEqual([ana]);
      expect(changed.phases!.development.allocations).toEqual([]);

      await repo.flushPending();
      expect(commits).toHaveLength(1);
      expect(commits[0].message).toBe('Payments API: team changed from Payments to Growth, 2 allocations removed');
      expect(commits[0].content.teamId).toBe(growth.id);
    });

    it('changes the team with a plain message when no allocation goes', async () => {
      const { repo, initiative, growth } = await repoWithInitiative().then(async (ctx) => ({ ...ctx, growth: ctx.repo.createTeam('Growth') }));
      const result = repo.changeTeam(initiative.id, growth.id)!;
      expect(result.removed).toEqual([]);
      await repo.flushPending();
      expect(commits.map((c) => c.message)).toEqual(['Payments API: team changed from Payments to Growth']);
    });

    it('reads two moves in one window as one, keeping the allocations lost on the first', async () => {
      const { repo, initiative, growth } = await withTwoTeams();
      const third = repo.createTeam('Platform');
      await repo.flushPending();
      commits.length = 0;
      repo.changeTeam(initiative.id, growth.id);
      repo.changeTeam(initiative.id, third.id);
      await repo.flushPending();
      expect(commits.map((c) => c.message)).toEqual(['Payments API: team changed from Payments to Platform, 3 allocations removed']);
    });

    it('says "1 allocation" for one', async () => {
      const { repo, initiative, growth, boAlloc } = await withTwoTeams();
      repo.removeAllocation(initiative.id, 'validation', boAlloc.id);
      await repo.flushPending();
      commits.length = 0;
      repo.changeTeam(initiative.id, growth.id);
      await repo.flushPending();
      expect(commits[0].message).toBe('Payments API: team changed from Payments to Growth, 1 allocation removed');
    });

    it('leaves a locked phase untouched', async () => {
      const { repo, initiative, growth, boAlloc } = await withTwoTeams();
      const result = repo.changeTeam(initiative.id, growth.id, (phaseId) => phaseId === 'validation')!;
      expect(result.removed.map((r) => r.phaseId)).toEqual(['development']);
      const phases = repo.getState().initiatives[0].phases!;
      expect(phases.validation.allocations).toContainEqual(boAlloc);
      expect(phases.validation.allocations).toHaveLength(2);
    });

    it('is refused for the current team and for a team that does not exist', async () => {
      const { repo, initiative } = await withTwoTeams();
      expect(repo.changeTeam(initiative.id, initiative.teamId)).toBeNull();
      expect(repo.changeTeam(initiative.id, 'no-such-team')).toBeNull();
      expect(repo.getState().initiatives[0].teamId).toBe(initiative.teamId);
    });

    it('undo puts back the team and the removed allocations in their places, as a normal edit', async () => {
      const { repo, initiative, growth, member, boAlloc, boDev } = await withTwoTeams();
      const before = repo.getState().initiatives[0].phases;
      const result = repo.changeTeam(initiative.id, growth.id)!;
      await repo.flushPending();
      commits.length = 0;

      repo.restoreTeam(initiative.id, result);
      const restored = repo.getState().initiatives[0];
      expect(restored.teamId).toBe(initiative.teamId);
      expect(restored.phases).toEqual(before);
      expect(restored.phases!.validation.allocations.map((a) => a.personId)).toEqual([member.id, boAlloc.personId]);
      expect(restored.phases!.development.allocations).toEqual([boDev]);

      await repo.flushPending();
      expect(commits[0].message).toBe('Payments API: team changed back from Growth to Payments, 2 allocations restored');
    });

    it('undo skips a phase that has been locked since, but still restores the team', async () => {
      const { repo, initiative, growth } = await withTwoTeams();
      const result = repo.changeTeam(initiative.id, growth.id)!;
      repo.restoreTeam(initiative.id, result, (phaseId) => phaseId === 'validation');
      const restored = repo.getState().initiatives[0];
      expect(restored.teamId).toBe(initiative.teamId);
      expect(restored.phases!.validation.allocations).toHaveLength(1);
      expect(restored.phases!.development.allocations).toHaveLength(1);
    });
  });

  it('the first edit to a default plan ends the suggestion, and the flag is gone from the committed file', async () => {
    const { repo, initiative } = await repoWithInitiative();
    expect(repo.getState().initiatives[0].defaultPlan).toBe(true);
    repo.setPhasePeriod(initiative.id, 'validation', { startDate: '2026-09-24', endDate: '2026-12-31' });
    expect(repo.getState().initiatives[0].defaultPlan).toBeUndefined();
    await repo.flushPending();
    expect(commits[0].content.defaultPlan).toBeUndefined();
    expect(commits[0].content.phases?.development.startDate).toBe('2026-12-24'); // no other phase moved
  });

  it('adding an allocation also ends the suggestion', async () => {
    const { repo, initiative, member } = await repoWithInitiative();
    repo.addAllocation(initiative.id, 'validation', member.id);
    expect(repo.getState().initiatives[0].defaultPlan).toBeUndefined();
  });

  it('clears a date', async () => {
    const { repo, initiative } = await repoWithInitiative();
    repo.setPhasePeriod(initiative.id, 'validation', { startDate: '2026-09-24', endDate: '2026-11-30' });
    repo.setPhasePeriod(initiative.id, 'validation', { startDate: '2026-09-24' });
    expect(repo.getState().initiatives[0].phases!.validation).toEqual({ startDate: '2026-09-24', allocations: [] });
  });
});

describe('Repository — Cancel, Reopen and the freeze (§8.4)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const commits: { message: string; trailers: string[]; content: Initiative }[] = [];

  /** Fraud Detection Upgrade with a period, an allocation and a cost item in Validation, every commit so far flushed and forgotten. */
  async function repoWithPlannedInitiative() {
    commits.length = 0;
    vi.stubGlobal(
      'fetch',
      routingFetchMock({
        'PUT /repos/jabopiti/initiative-planner/contents/initiatives': (_url, init) => {
          const body = JSON.parse(init!.body as string) as { message: string; content: string };
          commits.push({ message: subjectOf(body.message), trailers: splitMessage(body.message).trailers, content: JSON.parse(atob(body.content)) });
          return jsonResponse({ content: { sha: `sha-${commits.length}` } });
        },
      }),
    );
    const repo = new Repository(defaultBrandPack, 'token');
    await repo.initialize();
    const team = repo.createTeam('Platform');
    const other = repo.createTeam('Growth');
    const member = repo.createPerson({ name: 'Mara Voss', countryId: 'c1', roleId: 'r1' });
    repo.addMembership(member.id, team.id);
    const initiative = await repo.createInitiative('Fraud Detection Upgrade', team.id, '2026-09-24');
    repo.setPhasePeriod(initiative.id, 'validation', { startDate: '2026-01-01', endDate: '2026-03-31' });
    const added = repo.addAllocation(initiative.id, 'validation', member.id);
    if (!added.ok) throw new Error('expected the allocation to be added');
    const item = repo.addCostItem(initiative.id, 'validation', { label: 'Licences', amount: 1000, timing: 'spread' })!;
    repo.setChecklistItem(initiative.id, 'discovery', 'g1-problem-statement', 'tentative', 'Waiting on Risk');
    await repo.flushPending();
    commits.length = 0;
    const current = () => repo.getState().initiatives.find((i) => i.id === initiative.id)!;
    return { repo, id: initiative.id, member, team, other, allocationId: added.allocation.id, itemId: item.id, current };
  }

  /** Put the initiative straight into `status`, as a pulled change would, without a commit of its own. */
  function forceStatus(repo: Repository, initiative: Initiative, status: Initiative['status']) {
    (repo as unknown as { replaceInitiative(next: Initiative): void }).replaceInitiative({ ...initiative, status });
  }

  it('cancels an Active initiative in one commit, and an On Hold one too', async () => {
    const { repo, id, current } = await repoWithPlannedInitiative();
    repo.cancel(id);
    await repo.flushPending();
    expect(commits.map((c) => c.message)).toEqual(['Fraud Detection Upgrade: cancelled']);
    expect(current().status).toBe('Cancelled');

    const { repo: held, id: heldId, current: heldNow } = await repoWithPlannedInitiative();
    held.putOnHold(heldId);
    held.cancel(heldId);
    await held.flushPending();
    expect(heldNow().status).toBe('Cancelled');
  });

  it('reopens a Cancelled initiative to Active, also when it was On Hold before', async () => {
    const { repo, id, current } = await repoWithPlannedInitiative();
    repo.putOnHold(id);
    repo.cancel(id);
    await repo.flushPending();
    commits.length = 0;
    repo.reopen(id);
    await repo.flushPending();
    expect(current().status).toBe('Active');
    expect(commits.map((c) => c.message)).toEqual(['Fraud Detection Upgrade: reopened']);
  });

  it('does not cancel a Closed initiative, nor reopen one that is not Cancelled', async () => {
    const { repo, id, current } = await repoWithPlannedInitiative();
    forceStatus(repo, current(), 'Closed');
    repo.cancel(id);
    repo.reopen(id);
    await repo.flushPending();
    expect(current().status).toBe('Closed');
    expect(commits).toEqual([]);
  });

  describe.each(['Cancelled', 'Closed'] as const)('a %s initiative refuses every edit but notes and actuals', (status) => {
    const refusals: [string, (r: Awaited<ReturnType<typeof repoWithPlannedInitiative>>) => void][] = [
      ['renameInitiative', ({ repo, id }) => repo.renameInitiative(id, 'Fraud Detection v2')],
      ['setDescription', ({ repo, id }) => repo.setDescription(id, 'Stopped')],
      ['setOwner', ({ repo, id, member }) => repo.setOwner(id, member.id)],
      ['changeTeam', ({ repo, id, other }) => repo.changeTeam(id, other.id)],
      ['restoreTeam', ({ repo, id, team, other }) => repo.restoreTeam(id, { fromTeamId: other.id, toTeamId: team.id, removed: [] })],
      ['setPhasePeriod', ({ repo, id }) => repo.setPhasePeriod(id, 'validation', { startDate: '2026-01-01', endDate: '2026-04-30' })],
      ['extendPhase', ({ repo, id }) => repo.extendPhase(id, 'validation')],
      ['addAllocation', ({ repo, id, member }) => repo.addAllocation(id, 'development', member.id)],
      ['updateAllocation', ({ repo, id, allocationId }) => repo.updateAllocation(id, 'validation', allocationId, 10)],
      ['removeAllocation', ({ repo, id, allocationId }) => repo.removeAllocation(id, 'validation', allocationId)],
      ['restoreAllocation', ({ repo, id, member }) => repo.restoreAllocation(id, 'validation', { id: 'gone', personId: member.id, allocationPct: 5 }, 0)],
      ['addCostItem', ({ repo, id }) => repo.addCostItem(id, 'validation', { label: 'Travel', amount: 5, timing: 'spread' })],
      ['updateCostItem', ({ repo, id, itemId }) => repo.updateCostItem(id, 'validation', itemId, { amount: 2000 })],
      ['removeCostItem', ({ repo, id, itemId }) => repo.removeCostItem(id, 'validation', itemId)],
      ['restoreCostItem', ({ repo, id }) => repo.restoreCostItem(id, 'validation', { id: 'gone', label: 'Old', amount: 1, timing: 'spread' }, 0)],
      ['setChecklistItem', ({ repo, id }) => repo.setChecklistItem(id, 'discovery', 'g1-problem-statement', 'complete', 'Waiting on Risk')],
      ['passGate', ({ repo, id }) => repo.passGate(id, '2026-09-24')],
      ['skipGate', ({ repo, id }) => repo.skipGate(id, 'Not applicable')],
      ['putOnHold', ({ repo, id }) => repo.putOnHold(id)],
      ['resume', ({ repo, id }) => repo.resume(id)],
    ];

    it.each(refusals)('%s is refused and commits nothing', async (_name, attempt) => {
      const setup = await repoWithPlannedInitiative();
      forceStatus(setup.repo, setup.current(), status);
      const before = setup.current();
      attempt(setup);
      await setup.repo.flushPending();
      expect(setup.current()).toEqual(before);
      expect(commits).toEqual([]);
    });

    it('records a month’s actual', async () => {
      const { repo, id, current } = await repoWithPlannedInitiative();
      forceStatus(repo, current(), status);
      repo.setActual(id, 'validation', '2026-01', 900);
      await repo.flushPending();
      expect(current().phases?.validation.actualMonths).toEqual({ '2026-01': 900 });
      expect(commits).toHaveLength(1);
    });

    it('records a checklist note and keeps the status', async () => {
      const { repo, id, current } = await repoWithPlannedInitiative();
      forceStatus(repo, current(), status);
      expect(repo.setChecklistNote(id, 'discovery', 'g1-problem-statement', 'Risk withdrew sign-off')).toBe(true);
      await repo.flushPending();
      expect(current().checklist?.discovery?.['g1-problem-statement']).toEqual({ status: 'tentative', note: 'Risk withdrew sign-off' });
      expect(commits.map((c) => c.message)).toEqual(['Fraud Detection Upgrade: note on "Problem statement validated" changed']);
    });

    it('refuses to clear a Tentative item’s note', async () => {
      const { repo, id, current } = await repoWithPlannedInitiative();
      forceStatus(repo, current(), status);
      expect(repo.setChecklistNote(id, 'discovery', 'g1-problem-statement', '  ')).toBe(false);
      await repo.flushPending();
      expect(commits).toEqual([]);
    });
  });

  describe('a phase behind a passed gate refuses every edit but actuals (§8.1)', () => {
    /** Pass Validation's gate as a pulled change would: the gate record arrives, with no commit of this client's. */
    function freezeValidation(repo: Repository, initiative: Initiative) {
      const plan = initiative.phases!.validation;
      const frozenSnapshot = { startDate: plan.startDate!, endDate: plan.endDate!, allocations: [], costItems: plan.costItems ?? [], estimateByMonth: {} };
      const gates = { ...initiative.gates, validation: { outcome: 'passed' as const, passedOn: '2026-04-01', checklist: [], frozenSnapshot } };
      (repo as unknown as { replaceInitiative(next: Initiative): void }).replaceInitiative({ ...initiative, gates });
    }

    const refusals: [string, (r: Awaited<ReturnType<typeof repoWithPlannedInitiative>>) => void][] = [
      ['setPhasePeriod', ({ repo, id }) => repo.setPhasePeriod(id, 'validation', { startDate: '2026-01-01', endDate: '2026-04-30' })],
      ['extendPhase', ({ repo, id }) => repo.extendPhase(id, 'validation')],
      ['addAllocation', ({ repo, id, member }) => repo.addAllocation(id, 'validation', member.id)],
      ['updateAllocation', ({ repo, id, allocationId }) => repo.updateAllocation(id, 'validation', allocationId, 10)],
      ['removeAllocation', ({ repo, id, allocationId }) => repo.removeAllocation(id, 'validation', allocationId)],
      ['addCostItem', ({ repo, id }) => repo.addCostItem(id, 'validation', { label: 'Travel', amount: 5, timing: 'spread' })],
      ['updateCostItem', ({ repo, id, itemId }) => repo.updateCostItem(id, 'validation', itemId, { amount: 2000 })],
      ['removeCostItem', ({ repo, id, itemId }) => repo.removeCostItem(id, 'validation', itemId)],
    ];

    it.each(refusals)('%s is refused, commits nothing, and the phase says the change was not saved', async (_name, attempt) => {
      const setup = await repoWithPlannedInitiative();
      freezeValidation(setup.repo, setup.current());
      const before = setup.current();
      attempt(setup);
      await setup.repo.flushPending();
      expect(setup.current()).toEqual(before);
      expect(commits).toEqual([]);
      expect(setup.repo.getState().frozenWithLostEdit).toEqual(new Set([lostEditKey(setup.id, 'validation')]));
    });

    it.each([
      ['restoreAllocation', ({ repo, id, member }: Awaited<ReturnType<typeof repoWithPlannedInitiative>>) => repo.restoreAllocation(id, 'validation', { id: 'gone', personId: member.id, allocationPct: 5 }, 0)],
      ['restoreCostItem', ({ repo, id }: Awaited<ReturnType<typeof repoWithPlannedInitiative>>) => repo.restoreCostItem(id, 'validation', { id: 'gone', label: 'Old', amount: 1, timing: 'spread' }, 0)],
    ])('a late Undo (%s) is refused silently', async (_name, attempt) => {
      const setup = await repoWithPlannedInitiative();
      freezeValidation(setup.repo, setup.current());
      const before = setup.current();
      attempt(setup);
      await setup.repo.flushPending();
      expect(setup.current()).toEqual(before);
      expect(commits).toEqual([]);
      expect(setup.repo.getState().frozenWithLostEdit.size).toBe(0);
    });

    it('an Undo clicked after the phase froze leaves the removed allocation out', async () => {
      const { repo, id, allocationId, current } = await repoWithPlannedInitiative();
      const removed = repo.removeAllocation(id, 'validation', allocationId)!;
      freezeValidation(repo, current());
      repo.restoreAllocation(id, 'validation', removed.allocation, removed.index);
      expect(current().phases?.validation.allocations).toEqual([]);
    });

    it('records a month’s actual', async () => {
      const { repo, id, current } = await repoWithPlannedInitiative();
      freezeValidation(repo, current());
      repo.setActual(id, 'validation', '2026-01', 900);
      await repo.flushPending();
      expect(current().phases?.validation.actualMonths).toEqual({ '2026-01': 900 });
      expect(commits).toHaveLength(1);
    });

    it('leaves the other phases editable, and the message is dismissed by the user', async () => {
      const { repo, id, current } = await repoWithPlannedInitiative();
      freezeValidation(repo, current());
      repo.setPhasePeriod(id, 'development', { startDate: current().phases?.development.startDate, endDate: '2027-06-30' });
      repo.setPhasePeriod(id, 'validation', { startDate: '2026-01-01', endDate: '2026-04-30' });
      await repo.flushPending();
      expect(current().phases?.development.endDate).toBe('2027-06-30');
      repo.dismissLostEdit(id, 'validation');
      expect(repo.getState().frozenWithLostEdit.size).toBe(0);
    });

    it('drops the message when the gate is reopened, so passing it again does not bring it back', async () => {
      const { repo, id, current } = await repoWithPlannedInitiative();
      freezeValidation(repo, current());
      repo.setPhasePeriod(id, 'validation', { startDate: '2026-01-01', endDate: '2026-04-30' });
      expect(repo.getState().frozenWithLostEdit.size).toBe(1);
      // Reopened elsewhere, as a pull brings it: the gate record is gone.
      const gates = { ...current().gates };
      delete gates.validation;
      (repo as unknown as { replaceInitiative(next: Initiative): void }).replaceInitiative({ ...current(), gates });
      expect(repo.getState().frozenWithLostEdit.size).toBe(0);
      freezeValidation(repo, current());
      expect(repo.getState().frozenWithLostEdit.size).toBe(0);
    });
  });

  it('starts an untouched initiative at Development in one commit, and refuses a touched one (§8.2)', async () => {
    const { repo, id, team } = await repoWithPlannedInitiative();
    expect(repo.startAtPhase(id, 'development', 'Under way').ok).toBe(false);

    const fresh = await repo.createInitiative('Checkout Redesign', team.id, '2026-09-24');
    await repo.flushPending();
    commits.length = 0;
    expect(repo.startAtPhase(fresh.id, 'development', 'In development since May, before the tool.', '2026-10-01')).toEqual({ ok: true });
    await repo.flushPending();
    expect(commits.map((c) => c.message)).toEqual(['Checkout Redesign: starts at Development']);
    const saved = commits[0].content;
    expect(Object.keys(saved.gates ?? {})).toEqual(['discovery', 'validation']);
    expect(saved.gates?.validation).toMatchObject({ outcome: 'skipped', skipReason: 'In development since May, before the tool.', startingPhase: true });
    expect(saved.phases).toEqual({ development: { startDate: '2026-10-01', endDate: '2027-03-31', allocations: [] } });
  });

  it('names a start changed back to the first phase in one save, as its periods now start today (§8.2, §10.3)', async () => {
    const { repo, team } = await repoWithPlannedInitiative();
    const fresh = await repo.createInitiative('Checkout Redesign', team.id, '2026-09-24');
    await repo.flushPending();
    commits.length = 0;
    repo.startAtPhase(fresh.id, 'development', 'Under way', '2026-10-01');
    repo.startAtPhase(fresh.id, 'discovery', '', '2026-10-01');
    await repo.flushPending();
    expect(commits.map((c) => c.message)).toEqual(['Checkout Redesign: starts at Discovery']);
  });

  it('reopens the final gate of a Closed initiative, but no gate of a Cancelled one', async () => {
    const { repo, id, current } = await repoWithPlannedInitiative();
    const passed = { outcome: 'passed' as const, passedOn: '2026-01-01', checklist: [] };
    const gates = Object.fromEntries(defaultBrandPack.process.map((p) => [p.id, passed]));
    forceStatus(repo, { ...current(), gates }, 'Cancelled');
    repo.reopenGate(id);
    await repo.flushPending();
    expect(commits).toEqual([]);

    forceStatus(repo, current(), 'Closed');
    repo.reopenGate(id);
    await repo.flushPending();
    expect(current().status).toBe('Active');
    expect(commits).toHaveLength(1);
  });
});
