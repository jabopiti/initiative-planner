import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultBrandPack } from '../brand/defaultBrand';
import { cacheScope, FileCache } from '../cache/db';
import { CHANGE_TINT_MS, changeCovers, changeKey, FOCUS_PULL_MIN_GAP_MS, PULL_INTERVAL_MS, PULL_RETRY_MS, Repository } from './Repository';
import { fakeGithub, holdNetwork, initiative, open, type Fake } from './testing/fakeGithub';

const setVisibility = (state: 'visible' | 'hidden') =>
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });

/** A second visit: a new client over the same browser cache. */
async function reopen({ settled = true } = {}) {
  const repo = new Repository(defaultBrandPack, 'token');
  await repo.initialize();
  if (settled) await repo.whenPulled();
  return repo;
}

describe('slice 005i: opening from the cache and pulling others’ changes (§3, §9.9)', () => {
  let fake: Fake;

  beforeEach(async () => {
    fake = fakeGithub();
    setVisibility('visible');
    await open(fake, { initiatives: [initiative()] }).then(({ repo }) => repo.whenPulled());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  describe('cache first', () => {
    it('shows the cached dataset before any network response, syncing until the pull finishes', async () => {
      const release = holdNetwork(fake);
      const repo = await reopen({ settled: false });

      expect(repo.getState().status).toBe('ready');
      expect(repo.getState().initiatives.map((i) => i.name)).toEqual(['Payments API']);
      expect(repo.getState().syncing).toBe(true);

      release();
      await repo.whenPulled();
      expect(repo.getState().syncing).toBe(false);
    });

    it('with nothing in the repository changed, a second open downloads no file and lists none', async () => {
      const before = fake.requests().length;
      const repo = await reopen();
      await repo.whenPulled();

      expect(fake.requests().slice(before)).toEqual([`GET /repos/jabopiti/initiative-planner/git/ref/heads/data`]);
    });

    it('asks about an unchanged branch with its ETag, which GitHub answers without counting a request', async () => {
      const repo = await reopen();
      await repo.pull();
      const calls = fake.fetchMock.mock.calls.filter(([url]) => String(url).includes('/git/ref/heads/'));
      const conditional = calls.map(([, init]) => new Headers((init as RequestInit).headers).get('If-None-Match'));

      expect(conditional.at(-1)).toMatch(/^"head-\d+"$/);
    });

    it('a first visit, with no cache, waits for the pull', async () => {
      await FileCache.prototype.clear.call(new FileCache(cacheScope(defaultBrandPack.github)));
      const repo = await reopen();

      expect(repo.getState().status).toBe('ready');
      expect(repo.getState().initiatives).toHaveLength(1);
    });

    it('discards a cache that cannot be read and loads from the repository', async () => {
      const cache = new FileCache(cacheScope(defaultBrandPack.github));
      await cache.set('teams.json', { content: '{not json', sha: 'x' });
      const repo = await reopen();

      expect(repo.getState().status).toBe('ready');
      expect(repo.getState().readOnly).toBeNull();
    });

    it('discards a cache of another process', async () => {
      const cache = new FileCache(cacheScope(defaultBrandPack.github));
      await cache.set('dataset.json', { content: JSON.stringify({ schemaVersion: 1, processIdentity: { id: 'other' } }), sha: 'x' });
      const repo = await reopen();

      expect(repo.getState().status).toBe('ready');
      expect(repo.getState().datasetFlags?.processIdentity.id).toBe(defaultBrandPack.processIdentity.id);
    });
  });

  describe('pulling by version', () => {
    it('downloads only the file another user changed, and shows the change without a reload', async () => {
      const repo = await reopen();
      await repo.whenPulled();
      fake.seed('initiatives/i1.json', initiative({ name: 'Payments API v2' }));
      fake.seed('initiatives/i2.json', initiative({ id: 'i2', name: 'Data lake' }));
      fake.reads.length = 0;

      await repo.pull();

      expect(fake.reads).toEqual(['initiatives/i1.json', 'initiatives/i2.json']);
      expect(repo.getState().initiatives.map((i) => i.name).sort()).toEqual(['Data lake', 'Payments API v2']);
    });

    it('reads a few files at a time, however many changed', async () => {
      const repo = await reopen();
      for (let n = 2; n < 30; n += 1) fake.seed(`initiatives/i${n}.json`, initiative({ id: `i${n}`, name: `Initiative ${n}` }));
      let inFlight = 0;
      let peak = 0;
      vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
        const read = /contents\/initiatives\/i\d+\.json/.test(url) && (init?.method ?? 'GET') === 'GET';
        if (read) {
          inFlight += 1;
          peak = Math.max(peak, inFlight);
          await new Promise((resolve) => setTimeout(resolve, 2));
        }
        try {
          return await fake.fetchMock(url, init);
        } finally {
          if (read) inFlight -= 1;
        }
      });

      await repo.pull();

      expect(repo.getState().initiatives).toHaveLength(29);
      expect(peak).toBeGreaterThan(1);
      expect(peak).toBeLessThanOrEqual(8);
    });

    it('leaves the master files alone when only an initiative changed', async () => {
      const repo = await reopen();
      fake.seed('initiatives/i1.json', initiative({ name: 'Renamed' }));
      fake.reads.length = 0;

      await repo.pull();

      expect(fake.reads).toEqual(['initiatives/i1.json']);
    });

    it('a file removed by another user disappears', async () => {
      const repo = await reopen();
      fake.remove('initiatives/i1.json');

      await repo.pull();

      expect(repo.getState().initiatives).toEqual([]);
    });

    it('keeps an initiative created here whose file the last listing did not have yet', async () => {
      const repo = await reopen();
      const created = repo.createInitiative('New one', 'team-1');
      fake.seed('teams.json', []); // the other writer commits something else meanwhile
      await created;

      await repo.pull();

      expect(repo.getState().initiatives.map((i) => i.name).sort()).toEqual(['New one', 'Payments API']);
    });

    it('a pull that read a file before a save of it landed does not undo the save', async () => {
      const repo = await reopen();
      fake.seed('teams.json', []); // moves the head, so the pull lists and compares
      fake.seed('initiatives/i1.json', initiative({ ownerId: 'someone' }));
      // The pull's read of the file is answered now but delivered late: what it holds is already out of date.
      let held = false;
      let release!: () => void;
      const late = new Promise<void>((resolve) => (release = resolve));
      vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
        const response = await fake.fetchMock(url, init);
        if (init?.method === 'GET' && url.includes('/contents/initiatives/i1.json') && !held) {
          held = true;
          await late;
        }
        return response;
      });
      const pulling = repo.pull();
      await vi.waitFor(() => expect(held).toBe(true));

      repo.renameInitiative('i1', 'Saved here');
      await repo.flushPending();
      release();
      await pulling;

      expect(repo.getState().initiatives[0]).toMatchObject({ name: 'Saved here', ownerId: 'someone' });
    });
  });

  describe('tinting what others changed (§9.9)', () => {
    it('marks the changed value and says "updated by others" for a few seconds', async () => {
      const repo = await reopen();
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
      fake.seed('initiatives/i1.json', initiative({ name: 'Renamed elsewhere' }));

      await repo.pull();
      expect(repo.getState().updatedByOthers).toBe(true);
      expect([...repo.getState().changed]).toEqual([changeKey('initiatives/i1.json', ['name'])]);

      vi.advanceTimersByTime(CHANGE_TINT_MS);
      expect(repo.getState().updatedByOthers).toBe(false);
      expect(repo.getState().changed.size).toBe(0);
    });

    it('marks a new initiative as a whole, and nothing when nothing changed', async () => {
      const repo = await reopen();
      await repo.pull();
      expect(repo.getState().updatedByOthers).toBe(false);

      fake.seed('initiatives/i2.json', initiative({ id: 'i2', name: 'Data lake' }));
      await repo.pull();
      expect([...repo.getState().changed]).toEqual([changeKey('initiatives/i2.json', [])]);
    });
  });

  describe('the schedule (§3)', () => {
    beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] }));

    const heads = () => fake.requests().filter((r) => r.includes('/git/ref/heads/')).length;

    it('pulls every 5 minutes while the tab is visible, and not while it is hidden', async () => {
      const repo = await reopen();
      const stop = repo.startPulling();
      const before = heads();

      await vi.advanceTimersByTimeAsync(PULL_INTERVAL_MS);
      expect(heads()).toBe(before + 1);

      setVisibility('hidden');
      await vi.advanceTimersByTimeAsync(PULL_INTERVAL_MS * 2);
      expect(heads()).toBe(before + 1);
      stop();
    });

    it('pulls when the tab regains focus, at most once in a short while', async () => {
      const repo = await reopen();
      const stop = repo.startPulling();
      const before = heads();

      await vi.advanceTimersByTimeAsync(FOCUS_PULL_MIN_GAP_MS);
      window.dispatchEvent(new Event('focus'));
      await vi.advanceTimersByTimeAsync(0);
      window.dispatchEvent(new Event('focus'));
      await vi.advanceTimersByTimeAsync(0);

      expect(heads()).toBe(before + 1);
      stop();
    });
  });

  describe('a field being edited is never overwritten (§3)', () => {
    it('holds a change from elsewhere until the field is left, then merges it', async () => {
      const repo = await reopen();
      const release = repo.holdWhileEditing();
      fake.seed('initiatives/i1.json', initiative({ name: 'Payments API', ownerId: 'someone' }));

      await repo.pull();
      expect(repo.getState().initiatives[0].ownerId).toBeUndefined();

      release();
      expect(repo.getState().initiatives[0].ownerId).toBe('someone');
    });

    it('applies the typed edit first: the same field changed on both sides is a conflict, not a silent overwrite', async () => {
      const repo = await reopen();
      const release = repo.holdWhileEditing();
      fake.seed('initiatives/i1.json', initiative({ name: 'Theirs' }));
      await repo.pull();

      repo.renameInitiative('i1', 'Mine');
      release();

      expect(repo.getState().conflicts.map((c) => c.path)).toEqual([['name']]);
    });

    it('saves the typed edit and the change from elsewhere together when they touch different fields', async () => {
      const repo = await reopen();
      const release = repo.holdWhileEditing();
      fake.seed('initiatives/i1.json', initiative({ ownerId: 'someone' }));
      await repo.pull();

      repo.renameInitiative('i1', 'Mine');
      release();
      await repo.flushPending();

      expect(fake.read('initiatives/i1.json')).toMatchObject({ name: 'Mine', ownerId: 'someone' });
    });
  });

  describe('what the pull leaves alone', () => {
    it('does not retry every 30 seconds for a file whose writer has a choice open: the writer merges it when it saves', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
      const repo = await reopen();
      const release = repo.holdWhileEditing();
      fake.seed('initiatives/i1.json', initiative({ name: 'Theirs' }));
      await repo.pull();
      repo.renameInitiative('i1', 'Mine');
      release();
      expect(repo.getState().conflicts).toHaveLength(1);

      fake.seed('initiatives/i1.json', initiative({ name: 'Theirs', ownerId: 'someone' }));
      await repo.pull();
      const heads = () => fake.requests().filter((r) => r.includes('/git/ref/heads/')).length;
      const before = heads();
      await vi.advanceTimersByTimeAsync(PULL_RETRY_MS * 3);

      expect(heads()).toBe(before);
    });

    it('a file that cannot be read, arriving while the user types, is the read-only state when the field is left, not an exception', async () => {
      const repo = await reopen();
      const release = repo.holdWhileEditing();
      fake.seed('initiatives/i2.json', null);
      await repo.pull();

      expect(release).not.toThrow();
      expect(repo.getState().readOnly).not.toBeNull();
      expect(repo.getState().initiatives.map((i) => i.id)).toEqual(['i1']);
    });
  });

  describe('a cache over its budget', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('is not marked complete, so the next open loads what it dropped instead of trusting it', async () => {
      const scope = cacheScope(defaultBrandPack.github);
      await new FileCache(scope).clear();
      for (let n = 2; n < 6; n += 1) fake.seed(`initiatives/i${n}.json`, initiative({ id: `i${n}`, name: `Initiative ${n}` }));
      vi.stubGlobal('navigator', { storage: { estimate: async () => ({ quota: 400 }) } });
      await reopen();
      vi.unstubAllGlobals();
      vi.stubGlobal('fetch', fake.fetchMock);

      expect(await new FileCache(scope).getMeta()).toBeNull();
      const again = await reopen();
      expect(again.getState().initiatives).toHaveLength(5);
    });
  });

  describe('an edit made before the first pull finishes', () => {
    it('waits for it and is saved against the pulled data, losing nothing the pull returned', async () => {
      const first = await reopen();
      await first.whenPulled();
      fake.seed('initiatives/i1.json', initiative({ ownerId: 'someone' }));
      const release = holdNetwork(fake);
      const repo = await reopen({ settled: false });

      repo.renameInitiative('i1', 'Mine');
      const flushed = repo.flushPending();
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(fake.arrived('initiatives/i1.json')).toBe(0);

      release();
      await flushed;
      expect(fake.read('initiatives/i1.json')).toMatchObject({ name: 'Mine', ownerId: 'someone' });
      expect(fake.commits('initiatives/i1.json')).toHaveLength(1);
    });
  });

  describe('a failed pull (§3 Sync failures)', () => {
    it('shows the read-only state with its cause and keeps showing the cached data', async () => {
      vi.stubGlobal('fetch', () => Promise.reject(new TypeError('offline')));
      const repo = await reopen();

      expect(repo.getState().readOnly?.cause).toBe('unreachable');
      expect(repo.getState().initiatives).toHaveLength(1);
      expect(repo.getState().syncing).toBe(false);
    });

    it('recovers by itself once a pull works, without a reload', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
      vi.stubGlobal('fetch', () => Promise.reject(new TypeError('offline')));
      const repo = await reopen();
      await repo.whenPulled();
      expect(repo.getState().readOnly).not.toBeNull();

      vi.stubGlobal('fetch', fake.fetchMock);
      await vi.advanceTimersByTimeAsync(PULL_RETRY_MS);
      await repo.whenPulled();

      expect(repo.getState().readOnly).toBeNull();
    });

    it('is not hidden by a later save that succeeds', async () => {
      vi.stubGlobal('fetch', (url: string, init?: RequestInit) => (init?.method === 'PUT' ? fake.fetchMock(url, init) : Promise.reject(new TypeError('offline'))));
      const repo = await reopen();
      await repo.whenPulled();

      repo.renameInitiative('i1', 'Renamed');
      await repo.flushPending();

      expect(repo.getState().readOnly?.cause).toBe('unreachable');
    });
  });
});

describe('changeCovers', () => {
  it('compares whole path segments, so a name that starts another does not cover it', () => {
    const at = (path: Parameters<typeof changeKey>[1]) => changeKey('initiatives/i1.json', path);

    expect(changeCovers(at(['phases', 'development']), at(['phases', 'development', 'startDate']))).toBe(true);
    expect(changeCovers(at(['phases', 'dev']), at(['phases', 'development']))).toBe(false);
    expect(changeCovers(at(['allocation']), at(['allocationPct']))).toBe(false);
    expect(changeCovers(at([]), at(['name']))).toBe(true);
    expect(changeCovers(at(['items', { id: 'a' }]), at(['items', { id: 'a' }, 'pct']))).toBe(true);
    expect(changeCovers(at(['name']), at(['name']))).toBe(true);
  });
});
