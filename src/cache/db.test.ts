import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearAllFileCaches, closeDatabase, defaultBudget, FileCache, tokenCache } from './db';

const file = (size: number, sha = 'sha') => ({ content: 'x'.repeat(size), sha });

describe('FileCache (§10.4)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
  });

  afterEach(async () => {
    vi.useRealTimers();
    await tokenCache.clear();
    await clearAllFileCaches();
  });

  it('keeps each file with its version, apart from other repositories', async () => {
    const cache = new FileCache('a/b@data');
    await cache.set('teams.json', file(3, 'v1'));

    expect((await cache.get('teams.json'))?.sha).toBe('v1');
    expect(await new FileCache('c/d@data').get('teams.json')).toBeNull();
    expect([...(await cache.all()).keys()]).toEqual(['teams.json']);
  });

  it('holds at most half the storage quota: the oldest files are dropped first when one is added', async () => {
    const cache = new FileCache('a/b@data', async () => 100);
    for (const name of ['a', 'b', 'c']) {
      await cache.set(`initiatives/${name}.json`, file(40));
      vi.advanceTimersByTime(1000);
    }

    // a (oldest) was dropped when c arrived: 3 x 40 > 100.
    expect([...(await cache.all()).keys()].sort()).toEqual(['initiatives/b.json', 'initiatives/c.json']);
  });

  it('drops initiative files before master files, and never the file just written', async () => {
    const cache = new FileCache('a/b@data', async () => 100);
    await cache.set('teams.json', file(40));
    vi.advanceTimersByTime(1000);
    await cache.set('initiatives/new.json', file(40));
    vi.advanceTimersByTime(1000);
    await cache.set('initiatives/newer.json', file(40));

    expect([...(await cache.all()).keys()].sort()).toEqual(['initiatives/newer.json', 'teams.json']);
  });

  it('keeps the token when it drops files, and forgets that the cache was complete', async () => {
    await tokenCache.set('a-token');
    const cache = new FileCache('a/b@data', async () => 50);
    await cache.setMeta({ head: 'h1', etag: null });
    await cache.set('initiatives/a.json', file(40));
    await cache.set('initiatives/b.json', file(40));

    expect(await tokenCache.get()).toBe('a-token');
    expect(await cache.getMeta()).toBeNull();
  });

  it('a rewrite of a file counts its new size, not both', async () => {
    const cache = new FileCache('a/b@data', async () => 100);
    await cache.set('initiatives/a.json', file(60));
    await cache.set('initiatives/a.json', file(70));
    await cache.set('initiatives/b.json', file(20));

    expect([...(await cache.all()).keys()].sort()).toEqual(['initiatives/a.json', 'initiatives/b.json']);
  });

  it('budgets half of what the browser reports as its quota', async () => {
    vi.stubGlobal('navigator', { storage: { estimate: async () => ({ quota: 1000, usage: 10 }) } });
    expect(await defaultBudget()).toBe(500);
    vi.unstubAllGlobals();
  });

  it('drops the files an earlier build kept by bare path when the database is upgraded', async () => {
    await closeDatabase();
    await new Promise((resolve) => (indexedDB.deleteDatabase('initiative-planner').onsuccess = resolve));
    const old = await new Promise<IDBDatabase>((resolve) => {
      const request = indexedDB.open('initiative-planner', 2);
      request.onupgradeneeded = () => {
        request.result.createObjectStore('files');
        request.result.createObjectStore('auth');
      };
      request.onsuccess = () => resolve(request.result);
    });
    await new Promise<void>((resolve) => {
      const tx = old.transaction('files', 'readwrite');
      tx.objectStore('files').put({ content: '[]', sha: 'old' }, 'teams.json');
      tx.oncomplete = () => resolve();
    });
    old.close();

    // Opened by this build for the first time: version 2 becomes 3, and the bare-path file is gone.
    expect(await new FileCache('a/b@data').all()).toEqual(new Map());
    await closeDatabase();
    const db = await new Promise<IDBDatabase>((resolve) => {
      const request = indexedDB.open('initiative-planner');
      request.onsuccess = () => resolve(request.result);
    });
    const left = await new Promise((resolve) => {
      const request = db.transaction('files').objectStore('files').count();
      request.onsuccess = () => resolve(request.result);
    });
    expect(left).toBe(0);
    db.close();
  });
});
