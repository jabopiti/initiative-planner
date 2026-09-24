import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultBrandPack } from '../brand/defaultBrand';
import type { Initiative } from '../data/types';
import { Repository } from './Repository';

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

  function messagesFor(mock: ReturnType<typeof routingFetchMock>, file: string): string[] {
    return mock.mock.calls
      .filter(([url, init]) => (init as RequestInit)?.method === 'PUT' && (url as string).endsWith(`/contents/${file}`))
      .map(([, init]) => (JSON.parse((init as RequestInit).body as string) as { message: string }).message);
  }

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
      'Ada Lovelace: capacity set to 80%; Ada Lovelace: deactivated',
    ]);
    expect(messagesFor(mock, 'memberships.json')).toEqual([
      'Ada Lovelace: added to Payments at 80%',
      'Ada Lovelace: Team FTE % on Payments set to 60%',
      'Ada Lovelace: removed from Payments',
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
});


describe('Repository — slice 005 phase periods and allocations', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const commits: { message: string; content: Initiative }[] = [];

  async function repoWithInitiative() {
    commits.length = 0;
    vi.stubGlobal(
      'fetch',
      routingFetchMock({
        'PUT /repos/jabopiti/initiative-planner/contents/initiatives': (_url, init) => {
          const body = JSON.parse(init!.body as string) as { message: string; content: string };
          commits.push({ message: body.message, content: JSON.parse(atob(body.content)) });
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
    repo.setPhaseDate(initiative.id, 'validation', 'startDate', '2026-10-01');
    repo.setPhaseDate(initiative.id, 'validation', 'endDate', '2026-11-30');
    const added = repo.addAllocation(initiative.id, 'validation', member.id);
    if (!added.ok) throw new Error('expected the allocation to be added');
    repo.updateAllocation(initiative.id, 'validation', added.allocation.id, 80);
    await repo.flushPending();

    expect(commits).toHaveLength(1);
    expect(commits[0].message).toContain('Payments API: Validation start date set to 1 Oct 2026');
    expect(commits[0].message).toContain('Payments API: Validation end date set to 30 Nov 2026');
    expect(commits[0].message).toContain('Payments API: Validation allocation of Ana Ruiz set to 80%');
    expect(commits[0].content.phases?.validation).toEqual({
      startDate: '2026-10-01',
      endDate: '2026-11-30',
      allocations: [{ id: added.allocation.id, personId: member.id, allocationPct: 80 }],
    });
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

  it('the first edit to a default plan ends the suggestion, and the flag is gone from the committed file', async () => {
    const { repo, initiative } = await repoWithInitiative();
    expect(repo.getState().initiatives[0].defaultPlan).toBe(true);
    repo.setPhaseDate(initiative.id, 'validation', 'endDate', '2026-12-31');
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
    repo.setPhaseDate(initiative.id, 'validation', 'endDate', '2026-11-30');
    repo.setPhaseDate(initiative.id, 'validation', 'endDate', undefined);
    expect(repo.getState().initiatives[0].phases!.validation).toEqual({ startDate: '2026-09-24', allocations: [] });
  });
});
