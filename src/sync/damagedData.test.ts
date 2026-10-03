import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultBrandPack } from '../brand/defaultBrand';
import { encodeBase64Utf8 } from '../github/base64';
import { causeText } from '../github/errors';
import type { Membership } from '../data/types';
import { defaultTiming } from './FileWriter';
import { mergeDocument } from './merge';
import { Repository } from './Repository';
import { fakeGithub, initiative, open, person, seedDataset, type Fake } from './testing/fakeGithub';

/** Slice 044: damaged data is detected, never bootstrapped over, and a refused dataset is never written (§3). */

const RESTORE = 'Ask the repository owner to restore an earlier version from the commit history.';
const damaged = (what: string) => ({ cause: 'damaged', message: `Dataset damaged: ${what}. ${RESTORE}` });
const flags = (overrides: { schemaVersion?: number; id?: string; structureVersion?: number } = {}) => ({
  schemaVersion: overrides.schemaVersion ?? 1,
  processIdentity: { id: overrides.id ?? defaultBrandPack.processIdentity.id, structureVersion: overrides.structureVersion ?? defaultBrandPack.processIdentity.structureVersion },
  ratesReviewed: false,
});

/** A client with no cache, opening the dataset `fake` holds. */
async function openCold() {
  vi.stubGlobal('fetch', fake.fetchMock);
  const repo = new Repository(defaultBrandPack, 'token');
  await repo.initialize();
  return repo;
}

let fake: Fake;
beforeEach(() => {
  fake = fakeGithub();
});
afterEach(() => vi.unstubAllGlobals());

describe('no fallback over existing data (§3 Damaged data)', () => {
  it('with people.json but no dataset.json, commits nothing and says dataset.json is missing', async () => {
    fake.seed('people.json', [person('p1', 'Mara Voss')]);
    const repo = await openCold();

    expect(fake.puts).toEqual([]);
    expect(fake.gitCommits).toEqual([]);
    expect(repo.getState().readOnly).toEqual(damaged('dataset.json: is missing'));
    expect(repo.getState().status).toBe('loading');
  });

  it('with only an initiative file left, commits nothing either', async () => {
    fake.seed('initiatives/i1.json', initiative());
    const repo = await openCold();

    expect(fake.puts).toEqual([]);
    expect(fake.gitCommits).toEqual([]);
    expect(repo.getState().readOnly).toEqual(damaged('dataset.json: is missing'));
  });

  // An empty branch still gets the baseline once: Repository.test.ts, 'bootstraps the fresh-install baseline …'.
});

describe('a damaged repository dataset is reported, never shown (§3, §10.8)', () => {
  const cases: [string, (fake: Fake) => void, string][] = [
    ['{} where a list is expected', (f) => f.seed('people.json', {}), 'people.json: should be a list'],
    [
      'a membership of a team that does not exist',
      (f) => {
        f.seed('people.json', [person('p1', 'Mara Voss')]);
        f.seed('memberships.json', [{ id: 'm1', personId: 'p1', teamId: 'gone', teamFtePct: 100, active: true }]);
      },
      "memberships.json: membership m1 refers to team gone, which doesn't exist",
    ],
    ['duplicate ids', (f) => f.seed('people.json', [person('p1', 'Mara Voss'), person('p1', 'Lucía Ramos')]), 'people.json: id p1 appears twice'],
    ['a __proto__ key', (f) => f.seed('teams.json', JSON.parse('[{"id":"t1","name":"Platform","active":true,"__proto__":{"polluted":true}}]')), 'teams.json: contains the forbidden key "__proto__"'],
    ['an allocation of a person who does not exist', (f) => f.seed('initiatives/i1.json', initiative({ phases: { dev: { allocations: [{ id: 'a1', personId: 'nobody', allocationPct: 50 }] } } })), "initiatives/i1.json: allocation a1 refers to person nobody, which doesn't exist"],
    ['an initiative file holding another id', (f) => f.seed('initiatives/i1.json', initiative({ id: 'i9' })), 'initiatives/i1.json: initiative file holds id i9'],
  ];

  it.each(cases)('cold: %s', async (_, damage, what) => {
    seedDataset(fake, { initiatives: [initiative()] });
    damage(fake);
    const repo = await openCold();

    expect(repo.getState().readOnly).toEqual(damaged(what));
    expect(repo.getState().status).toBe('loading');
    expect(fake.puts).toEqual([]);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it.each(cases)('warm: %s arrives in a pull and is not applied', async (_, damage, what) => {
    const { repo } = await open(fake, { initiatives: [initiative()], people: [person('p0', 'Felix Brandt')] });
    const before = repo.getState();
    damage(fake);

    await repo.pull();

    expect(repo.getState().readOnly).toEqual(damaged(what));
    expect(repo.getState().people).toBe(before.people);
    expect(repo.getState().teams).toBe(before.teams);
    expect(repo.getState().initiatives).toBe(before.initiatives);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('a file that is not JSON is named', async () => {
    seedDataset(fake);
    const repo = new Repository(defaultBrandPack, 'token');
    vi.stubGlobal('fetch', (url: string, init?: RequestInit) =>
      url.includes('/contents/people.json') ? Promise.resolve(new Response(JSON.stringify({ content: encodeBase64Utf8('[{'), sha: 'broken' }))) : fake.fetchMock(url, init),
    );
    await repo.initialize();

    expect(repo.getState().readOnly).toEqual(damaged("people.json: isn't valid JSON"));
  });

  it('a merge never assigns a forbidden key, so Object.prototype stays unchanged', () => {
    const theirs = JSON.parse('{"name":"Theirs","__proto__":{"polluted":true}}') as Record<string, unknown>;

    expect(() => mergeDocument({ name: 'Base' }, { name: 'Mine' }, theirs)).toThrow();
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe('a refused dataset is never written (§3 Data integrity)', () => {
  const refusals: [string, Record<string, unknown>, string, string][] = [
    ['a newer schema', flags({ schemaVersion: 2 }), 'dataset-newer', 'Dataset newer than this build'],
    ['a newer structure', flags({ structureVersion: 99 }), 'dataset-newer', 'Dataset newer than this build'],
    ['an older schema', flags({ schemaVersion: 0 }), 'dataset-older', 'Dataset older than this build'],
    ['an older structure', flags({ structureVersion: 0 }), 'dataset-older', 'Dataset older than this build'],
    ['another process', flags({ id: 'another-process' }), 'process-mismatch', 'Different process build'],
    ['damaged', { schemaVersion: 1 }, 'damaged', 'Dataset damaged'],
  ];

  it.each(refusals)('%s: an edit sends nothing, keeps the typed value and says why', async (_, dataset, cause, short) => {
    const { repo } = await open(fake, { initiatives: [initiative()] });
    fake.seed('dataset.json', dataset);
    await repo.pull();
    expect(repo.getState().readOnly?.cause).toBe(cause);
    const sent = fake.puts.length;

    repo.renameInitiative('i1', 'Payments API v2');
    await repo.flushPending();

    expect(fake.puts).toHaveLength(sent);
    expect(repo.getState().initiatives[0].name).toBe('Payments API v2');
    const failure = repo.getState().fileFailures.get('initiatives/i1.json');
    expect(failure?.cause).toBe(cause);
    expect(`Not saved: ${causeText(failure!)}.`).toBe(`Not saved: ${short}.`);
  });

  it('a pull that fails for another reason keeps refusing writes', async () => {
    const { repo } = await open(fake, { initiatives: [initiative()] });
    fake.seed('dataset.json', flags({ schemaVersion: 2 }));
    await repo.pull();
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('Failed to fetch')));
    await repo.pull();
    vi.stubGlobal('fetch', fake.fetchMock);
    const sent = fake.puts.length;

    repo.renameInitiative('i1', 'Payments API v2');
    await repo.flushPending();

    expect(fake.puts).toHaveLength(sent);
  });

  it('delete, Reset and Load example data refuse too', async () => {
    const { repo } = await open(fake, { initiatives: [initiative()] });
    fake.seed('dataset.json', flags({ id: 'another-process' }));
    await repo.pull();
    const refused = { failed: expect.objectContaining({ cause: 'process-mismatch' }) };

    await expect(repo.deleteInitiative('i1')).resolves.toEqual(refused);
    await expect(repo.resetDataset()).resolves.toEqual(refused);
    await expect(repo.loadExampleData()).resolves.toEqual(refused);
    expect(fake.deletes).toEqual([]);
    expect(fake.gitCommits).toHaveLength(0);
    expect(fake.has('initiatives/i1.json')).toBe(true);
  });

  it('once the owner restores the dataset, the next pull recovers and sends the refused edit', async () => {
    const { repo } = await open(fake, { initiatives: [initiative()] });
    const good = fake.read('people.json');
    fake.seed('people.json', {});
    await repo.pull();
    repo.renameInitiative('i1', 'Payments API v2');
    await repo.flushPending();
    expect(fake.commits('initiatives/i1.json')).toHaveLength(0);

    fake.seed('people.json', good);
    await repo.pull();
    await repo.flushPending();

    expect(repo.getState().readOnly).toBeNull();
    expect(fake.read('initiatives/i1.json')).toMatchObject({ name: 'Payments API v2' });
  });

  it('a restore that moves the branch back to the head on screen recovers too', async () => {
    const { repo } = await open(fake, { initiatives: [initiative()] });
    await repo.whenPulled();
    // The head this client last applied, answered again once the owner force-pushes the branch back to it.
    const headPath = `/git/ref/heads/${defaultBrandPack.github.dataBranch}`;
    const goodHead = await fake.fetchMock(`https://api.github.com/repos/o/r${headPath}`);
    const pinned = { body: await goodHead.text(), etag: goodHead.headers.get('etag')! };
    const good = fake.read('people.json');
    fake.seed('people.json', {});
    await repo.pull();
    expect(repo.getState().readOnly?.cause).toBe('damaged');

    fake.seed('people.json', good);
    vi.stubGlobal('fetch', (url: string, init: RequestInit = {}) => {
      if (!new URL(url).pathname.endsWith(headPath)) return fake.fetchMock(url, init);
      if (new Headers(init.headers).get('If-None-Match') === pinned.etag) return Promise.resolve(new Response(null, { status: 304 }));
      return Promise.resolve(new Response(pinned.body, { status: 200, headers: { etag: pinned.etag } }));
    });
    await repo.pull();
    repo.renameInitiative('i1', 'Payments API v2');
    await repo.flushPending();

    expect(repo.getState().readOnly).toBeNull();
    expect(fake.read('initiatives/i1.json')).toMatchObject({ name: 'Payments API v2' });
  });

  it('a save retrying after a conflict is not sent once a pull has refused the dataset meanwhile', async () => {
    const { repo } = await open(fake, { teams: [{ id: 't1', name: 'Payments', active: true }] });
    fake.seed('teams.json', [{ id: 't1', name: 'Payments EU', active: true }]); // so the save meets a conflict
    const delay = vi.spyOn(defaultTiming, 'delay').mockImplementation(async () => {
      fake.seed('dataset.json', flags({ schemaVersion: 2 }));
      await repo.pull();
    });
    const sent = fake.commits('teams.json').length;

    repo.createTeam('Platform');
    await repo.flushPending();
    delay.mockRestore();

    expect(fake.commits('teams.json')).toHaveLength(sent);
    expect(repo.getState().fileFailures.get('teams.json')?.cause).toBe('dataset-newer');
  });
});

describe('a record is written before what refers to it (§3 Damaged data)', () => {
  const team = { id: 't1', name: 'Payments', active: true };
  const joined = (personId: string) => fake.read<Membership[]>('memberships.json').some((m) => m.personId === personId);

  it('a new member is sent only once their person has landed, also when that save meets a conflict first', async () => {
    const { repo } = await open(fake, { teams: [team] });
    fake.seed('people.json', [person('p9', 'Lena Park')]); // so the person's save is retried after a conflict
    const delay = vi.spyOn(defaultTiming, 'delay').mockResolvedValue(undefined);

    const ana = repo.createPerson({ name: 'Ana Ruiz', countryId: 'c1', roleId: 'r1' });
    repo.addMembership(ana.id, 't1');
    await repo.flushPending();
    delay.mockRestore();

    const landed = fake.puts.filter((p) => p.status === 200).map((p) => p.path);
    expect(landed.indexOf('people.json')).toBeLessThan(landed.indexOf('memberships.json'));
    expect(joined(ana.id)).toBe(true);
    expect(repo.getState().readOnly).toBeNull();
  });

  it('when the person fails to save, the membership fails the same way and is sent once the person is', async () => {
    const { repo } = await open(fake, { teams: [team] });
    fake.fail('people.json', 403);

    const ana = repo.createPerson({ name: 'Ana Ruiz', countryId: 'c1', roleId: 'r1' });
    repo.addMembership(ana.id, 't1');
    await repo.flushPending();

    expect(joined(ana.id)).toBe(false);
    const failures = repo.getState().fileFailures;
    expect(failures.get('memberships.json')).toEqual(failures.get('people.json'));

    repo.retryFile('people.json');
    await vi.waitFor(() => expect(joined(ana.id)).toBe(true));
    await repo.flushPending();
    expect(repo.getState().readOnly).toBeNull();
  });
});
