import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultBrandPack } from '../brand/defaultBrand';
import type { Initiative, Person, Team } from '../data/types';
import { Repository } from './Repository';
import { fakeGithub, initiative, person, seedDataset, type Fake } from './testing/fakeGithub';

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

const isContentCreating = (request: string) => !request.startsWith('GET ');

/** What `act` sent: every request, the content-creating ones, blob uploads, and files downloaded. */
async function measure(fake: Fake, act: () => Promise<unknown>) {
  const requestsBefore = fake.requests().length;
  const readsBefore = fake.reads.length;
  await act();
  const sent = fake.requests().slice(requestsBefore);
  return {
    requests: sent.length,
    contentCreating: sent.filter(isContentCreating).length,
    blobs: sent.filter((r) => r === 'POST /repos/jabopiti/initiative-planner/git/blobs').length,
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
  it('cold first load: 1 head, 2 listings, 206 files, nothing content-creating', async () => {
    const { cold } = await openAtCeiling();
    expect(cold.requests).toBe(209);
    expect(cold.downloads).toHaveLength(206);
    expect(cold.contentCreating).toBe(0);
  });

  it('poll with nothing changed: one conditional head check', async () => {
    const { fake, repo } = await openAtCeiling();
    const poll = await measure(fake, () => repo.pull());
    expect(poll.requests).toBe(1);
    expect(poll.contentCreating).toBe(0);
  });

  it('poll after another user changed one initiative: head, 2 listings, the one file', async () => {
    const { fake, repo } = await openAtCeiling();
    fake.seed('initiatives/i7.json', { ...INITIATIVES[7], name: 'Renamed elsewhere' });
    const poll = await measure(fake, () => repo.pull());
    expect(poll.requests).toBe(4);
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

  it('poll after only this client’s own commits: head and 2 listings, no download', async () => {
    const { fake, repo } = await openAtCeiling();
    await edited(repo, () => repo.renameInitiative('i1', 'Mine'));
    const poll = await measure(fake, () => repo.pull());
    expect(poll.requests).toBe(3);
    expect(poll.downloads).toEqual([]);
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

  it('a new person and their membership: two PUTs, the person first', async () => {
    const { fake, repo } = await openAtCeiling();
    const added = await measure(fake, () =>
      edited(repo, () => {
        const created = repo.createPerson({ name: 'Cai Wu', countryId: 'c1', roleId: 'r1' });
        repo.addMembership(created.id, 'team-1');
      }),
    );
    expect(added.sent).toEqual([
      'PUT /repos/jabopiti/initiative-planner/contents/people.json',
      'PUT /repos/jabopiti/initiative-planner/contents/memberships.json',
    ]);
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
    expect({ requests: reset.requests, contentCreating: reset.contentCreating, blobs: reset.blobs, downloads: reset.downloads.length }).toEqual({
      // Slice 064: one GraphQL commit; the files it wrote are not downloaded again (was 21, 9 content-creating, 6 blobs, 6 downloads).
      requests: 6,
      contentCreating: 1,
      blobs: 0,
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
    expect({ requests: loaded.requests, contentCreating: loaded.contentCreating, blobs: loaded.blobs, downloads: loaded.downloads.length }).toEqual({
      // Slice 064: one GraphQL commit; only the 5 reads that check the branch is empty (was 26, 9 content-creating, 6 blobs, 11 downloads).
      requests: 11,
      contentCreating: 1,
      blobs: 0,
      downloads: 5,
    });
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

  it('reopening after 40 initiatives changed: head, 2 listings, the 40 files', async () => {
    const { fake } = await openAtCeiling();
    for (const changed of INITIATIVES.slice(0, 40)) fake.seed(`initiatives/${changed.id}.json`, { ...changed, description: 'Changed elsewhere' });
    const reopened = await measure(fake, async () => {
      const repo = new Repository(defaultBrandPack, 'token');
      await repo.initialize();
      await repo.whenPulled();
    });
    expect(reopened.requests).toBe(43);
    expect(reopened.downloads).toHaveLength(40);
  });
});

describe('the bootstrap onto a missing data branch (slice 064)', () => {
  it('is a tree with the contents inline, a commit and the ref: 3 content-creating requests, no blob, no download', async () => {
    const fake = fakeGithub();
    vi.stubGlobal('fetch', fake.fetchMock);
    const repo = new Repository(defaultBrandPack, 'token');
    const boot = await measure(fake, async () => {
      await repo.initialize();
      await repo.whenPulled();
    });
    expect(boot.sent.filter(isContentCreating)).toEqual([
      'POST /repos/jabopiti/initiative-planner/git/trees',
      'POST /repos/jabopiti/initiative-planner/git/commits',
      'POST /repos/jabopiti/initiative-planner/git/refs',
    ]);
    expect(boot.downloads).toEqual([]);
    expect(repo.getState().roles.length).toBeGreaterThan(0);
  });
});
