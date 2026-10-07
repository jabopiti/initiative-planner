import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultBrandPack } from '../brand/defaultBrand';
import type { Initiative, Person, Team } from '../data/types';
import { Repository } from './Repository';
import { fakeGithub, initiative, person, seedDataset, type Fake } from './testing/fakeGithub';
import { isFilesQuery } from './testing/graphqlRead';

/**
 * Slice 064's measured baseline: the requests each scenario sends to GitHub at the volume ceiling (§1: 200
 * initiatives, 200 people, 25 teams), pinned so a change to the sync layer that costs requests shows up here.
 * "Content-creating" is what GitHub's 80-a-minute / 500-an-hour limit counts (§10.3): every write, refused or not.
 */

const TEAMS: Team[] = Array.from({ length: 25 }, (_, i) => ({ id: `team-${i}`, name: `Team ${i}`, active: true }));
const PEOPLE: Person[] = Array.from({ length: 200 }, (_, i) => person(`p${i}`, `Person ${i}`));
const INITIATIVES: Initiative[] = Array.from({ length: 200 }, (_, i) => initiative({ id: `i${i}`, name: `Initiative ${i}`, teamId: `team-${i % 25}` }));
const CEILING = { teams: TEAMS, people: PEOPLE, initiatives: INITIATIVES };

/** Longer than any commit window (§10.3), so every scheduled edit has been sent. */
const PAST_ANY_WINDOW_MS = 25_000;

/** Every request but a GET or a GraphQL read (slice 065): what the write budget counts. */
const isContentCreating = ([, init]: unknown[]) => {
  const { method = 'GET', body } = (init ?? {}) as RequestInit;
  return method !== 'GET' && !(typeof body === 'string' && body.includes('"query"') && isFilesQuery(body));
};

/** What `act` sent: every request, the content-creating ones, and files downloaded. */
async function measure(fake: Fake, act: () => Promise<unknown>) {
  const requestsBefore = fake.requests().length;
  const readsBefore = fake.reads.length;
  await act();
  const sent = fake.requests().slice(requestsBefore);
  const calls = fake.fetchMock.mock.calls.slice(requestsBefore);
  const creating = sent.filter((_, i) => isContentCreating(calls[i]));
  return {
    requests: sent.length,
    contentCreating: creating.length,
    creating,
    downloads: fake.reads.slice(readsBefore),
    sent,
  };
}

async function openAtCeiling() {
  const fake = fakeGithub();
  seedDataset(fake, CEILING);
  const repo = new Repository(defaultBrandPack, 'token');
  const cold = await measure(fake, async () => {
    await repo.initialize();
    await repo.whenPulled();
  });
  return { fake, repo, cold };
}

/** Runs `edit` with fake timers and lets every window it opens close. */
async function edited(repo: Repository, edit: () => void) {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  try {
    edit();
    await vi.advanceTimersByTimeAsync(PAST_ANY_WINDOW_MS);
    await repo.flushPending();
  } finally {
    vi.useRealTimers();
  }
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('request budget at the volume ceiling (slice 064 baseline)', () => {
  it('cold first load: 1 head, 1 listing, 206 files in 3 GraphQL reads, nothing content-creating (was 209, slice 065)', async () => {
    const { cold } = await openAtCeiling();
    expect(cold.requests).toBe(5);
    expect(cold.downloads).toHaveLength(206);
    expect(cold.contentCreating).toBe(0);
  });

  it('poll with nothing changed: one conditional head check', async () => {
    const { fake, repo } = await openAtCeiling();
    const poll = await measure(fake, () => repo.pull());
    expect(poll.requests).toBe(1);
    expect(poll.contentCreating).toBe(0);
  });

  it('poll after another user changed one initiative: head, 1 listing, the one file (was 4, slice 065)', async () => {
    const { fake, repo } = await openAtCeiling();
    fake.seed('initiatives/i7.json', { ...INITIATIVES[7], name: 'Renamed elsewhere' });
    const poll = await measure(fake, () => repo.pull());
    expect(poll.requests).toBe(3);
    expect(poll.downloads).toEqual(['initiatives/i7.json']);
  });

  it('three edits to one initiative within a second: one PUT', async () => {
    const { fake, repo } = await openAtCeiling();
    const edits = await measure(fake, () =>
      edited(repo, () => {
        repo.renameInitiative('i1', 'A');
        repo.renameInitiative('i1', 'B');
        repo.renameInitiative('i1', 'C');
      }),
    );
    expect(edits.sent).toEqual(['PUT /repos/jabopiti/initiative-planner/contents/initiatives/i1.json']);
  });

  it('poll after only this client’s own commits: the head check alone, no download (was 3, slice 065)', async () => {
    const { fake, repo } = await openAtCeiling();
    await edited(repo, () => repo.renameInitiative('i1', 'Mine'));
    await edited(repo, () => repo.renameInitiative('i2', 'Mine too'));
    const poll = await measure(fake, async () => {
      await repo.pull();
      await repo.whenPulled();
    });
    expect(poll.sent).toEqual(['GET /repos/jabopiti/initiative-planner/git/ref/heads/data']);
    expect(poll.downloads).toEqual([]);
    // The head and its ETag moved with the saves: the poll after it is answered 304 (not modified).
    const next = await measure(fake, () => repo.pull());
    expect(next.requests).toBe(1);
    expect(await fake.fetchMock.mock.results.at(-1)!.value).toMatchObject({ status: 304 });
  });

  it('poll after a joint commit of this client’s own (a new person and their membership): the head check alone', async () => {
    const { fake, repo } = await openAtCeiling();
    repo.createPersonInTeam({ name: 'Cai Wu', countryId: 'c1', roleId: 'r1' }, 'team-1');
    await vi.waitFor(() => expect(fake.graphqlCommits).toHaveLength(1));
    await repo.flushPending();
    const poll = await measure(fake, () => repo.pull());
    expect(poll.requests).toBe(1);
    expect(poll.downloads).toEqual([]);
  });

  it('poll after another user’s commit between this client’s own: head, 1 listing, the other user’s file', async () => {
    const { fake, repo } = await openAtCeiling();
    await edited(repo, () => repo.renameInitiative('i1', 'Mine'));
    fake.seed('initiatives/i9.json', { ...INITIATIVES[9], name: 'Renamed elsewhere' });
    await edited(repo, () => repo.renameInitiative('i2', 'Mine too'));
    const poll = await measure(fake, () => repo.pull());
    expect(poll.requests).toBe(3);
    expect(poll.downloads).toEqual(['initiatives/i9.json']);
    expect(repo.getState().initiatives.find((i) => i.id === 'i9')?.name).toBe('Renamed elsewhere');
  });

  it('the same field on five initiatives in one burst: five PUTs', async () => {
    const { fake, repo } = await openAtCeiling();
    const burst = await measure(fake, () =>
      edited(repo, () => {
        for (const id of ['i1', 'i2', 'i3', 'i4', 'i5']) repo.setDescription(id, 'Shared description');
      }),
    );
    expect(burst.requests).toBe(5);
    expect(burst.contentCreating).toBe(5);
  });

  it('a new person and their membership: one GraphQL commit after reading the head and the root (was two PUTs, slice 064)', async () => {
    const { fake, repo } = await openAtCeiling();
    const added = await measure(fake, async () => {
      repo.createPersonInTeam({ name: 'Cai Wu', countryId: 'c1', roleId: 'r1' }, 'team-1');
      await vi.waitFor(() => expect(fake.graphqlCommits).toHaveLength(1));
      await repo.flushPending();
    });
    expect(added.sent).toEqual([
      'GET /repos/jabopiti/initiative-planner/git/ref/heads/data',
      'GET /repos/jabopiti/initiative-planner/contents/',
      'POST /graphql',
    ]);
    expect(added.contentCreating).toBe(1);
  });

  it('an edit on a stale version: PUT refused (409), re-read, PUT', async () => {
    const { fake, repo } = await openAtCeiling();
    fake.seed('initiatives/i2.json', { ...INITIATIVES[2], description: 'Changed elsewhere' });
    const stale = await measure(fake, () => edited(repo, () => repo.renameInitiative('i2', 'Mine')));
    expect(stale.sent).toEqual([
      'PUT /repos/jabopiti/initiative-planner/contents/initiatives/i2.json',
      'GET /repos/jabopiti/initiative-planner/contents/initiatives/i2.json',
      'PUT /repos/jabopiti/initiative-planner/contents/initiatives/i2.json',
    ]);
    expect(stale.contentCreating).toBe(2);
  });

  it('Reset at the ceiling', async () => {
    const { fake, repo } = await openAtCeiling();
    const reset = await measure(fake, async () => {
      await repo.resetDataset();
      await repo.whenPulled();
    });
    expect({ requests: reset.requests, contentCreating: reset.contentCreating, downloads: reset.downloads.length }).toEqual({
      // Slice 064: one GraphQL commit; the files it wrote are not downloaded again (was 21, 9 content-creating, 6 blobs, 6 downloads).
      // Slice 065: its pull lists the branch in one request (was 6).
      // Own-commit record: its pull reaches the commit from the head check alone, nothing listed (was 5).
      requests: 4,
      contentCreating: 1,
      downloads: 0,
    });
  });

  it('Load example data after a Reset', async () => {
    const { fake, repo } = await openAtCeiling();
    await repo.resetDataset();
    await repo.whenPulled();
    const loaded = await measure(fake, async () => {
      await repo.loadExampleData(new Date(2026, 9, 6));
      await repo.whenPulled();
    });
    expect({ requests: loaded.requests, contentCreating: loaded.contentCreating, downloads: loaded.downloads.length }).toEqual({
      // Slice 064: one GraphQL commit; only the 5 reads that check the branch is empty (was 26, 9 content-creating, 6 blobs, 11 downloads).
      // Slice 065: its pull lists the branch in one request (was 11).
      // Own-commit record: its pull reaches the commit from the head check alone, nothing listed (was 10).
      requests: 9,
      contentCreating: 1,
      downloads: 5,
    });
  });

  it('a cold load stores the whole pull in one cache transaction, and the next open makes one request (slice 065)', async () => {
    const transaction = vi.spyOn(IDBDatabase.prototype, 'transaction');
    const { fake } = await openAtCeiling();
    const fileWrites = transaction.mock.calls.filter(([stores, mode]) => mode === 'readwrite' && [stores].flat().includes('files'));
    transaction.mockRestore();
    expect(fileWrites).toHaveLength(1);

    const reopened = await measure(fake, async () => {
      const repo = new Repository(defaultBrandPack, 'token');
      await repo.initialize();
      await repo.whenPulled();
    });
    expect(reopened.requests).toBe(1);
  });

  it('reopening with a warm cache and nothing changed: one head check', async () => {
    const { fake } = await openAtCeiling();
    const reopened = await measure(fake, async () => {
      const repo = new Repository(defaultBrandPack, 'token');
      await repo.initialize();
      await repo.whenPulled();
    });
    expect(reopened.requests).toBe(1);
  });

  it('reopening after 40 initiatives changed: head, 1 listing, the 40 files in one GraphQL read (was 43, slice 065)', async () => {
    const { fake } = await openAtCeiling();
    for (const changed of INITIATIVES.slice(0, 40)) fake.seed(`initiatives/${changed.id}.json`, { ...changed, description: 'Changed elsewhere' });
    const reopened = await measure(fake, async () => {
      const repo = new Repository(defaultBrandPack, 'token');
      await repo.initialize();
      await repo.whenPulled();
    });
    expect(reopened.requests).toBe(3);
    expect(reopened.downloads).toHaveLength(40);
  });
});

describe('the bootstrap onto a missing data branch (slice 064)', () => {
  it('is a tree with the contents inline, a commit and the ref: 3 content-creating requests, no download', async () => {
    const fake = fakeGithub();
    vi.stubGlobal('fetch', fake.fetchMock);
    const repo = new Repository(defaultBrandPack, 'token');
    const boot = await measure(fake, async () => {
      await repo.initialize();
      await repo.whenPulled();
    });
    expect(boot.creating).toEqual([
      'POST /repos/jabopiti/initiative-planner/git/trees',
      'POST /repos/jabopiti/initiative-planner/git/commits',
      'POST /repos/jabopiti/initiative-planner/git/refs',
    ]);
    expect(boot.downloads).toEqual([]);
    expect(repo.getState().roles.length).toBeGreaterThan(0);
  });
});
