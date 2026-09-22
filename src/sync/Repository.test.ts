import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultBrandPack } from '../brand/defaultBrand';
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
});
