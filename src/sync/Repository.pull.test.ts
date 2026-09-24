import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultBrandPack } from '../brand/defaultBrand';
import { FileCache } from '../cache/db';
import { CHANGE_TINT_MS, changeKey, FOCUS_PULL_MIN_GAP_MS, PULL_INTERVAL_MS, PULL_RETRY_MS, Repository } from './Repository';
import { fakeGithub, initiative, open, type Fake } from './testing/fakeGithub';

const setVisibility = (state: 'visible' | 'hidden') =>
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });

/** A second visit: a new client over the same browser cache. */
async function reopen({ settled = true } = {}) {
  const repo = new Repository(defaultBrandPack, 'token');
  await repo.initialize();
  if (settled) await repo.whenPulled();
  return repo;
}

/** Every request waits for `release()`, so what shows before the network answers can be told from what shows after. */
function holdNetwork(fake: Fake, only: (url: string, init?: RequestInit) => boolean = () => true) {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  vi.stubGlobal('fetch', (url: string, init?: RequestInit) => (only(url, init) ? gate.then(() => fake.fetchMock(url, init)) : fake.fetchMock(url, init)));
  return release;
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
      await FileCache.prototype.clear.call(new FileCache('jabopiti/initiative-planner@data'));
      const repo = await reopen();

      expect(repo.getState().status).toBe('ready');
      expect(repo.getState().initiatives).toHaveLength(1);
    });

    it('discards a cache that cannot be read and loads from the repository', async () => {
      const cache = new FileCache('jabopiti/initiative-planner@data');
      await cache.set('teams.json', { content: '{not json', sha: 'x' });
      const repo = await reopen();

      expect(repo.getState().status).toBe('ready');
      expect(repo.getState().readOnly).toBeNull();
    });

    it('discards a cache of another process', async () => {
      const cache = new FileCache('jabopiti/initiative-planner@data');
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
