/**
 * IndexedDB cache (§10.4): the GitHub dataset cache, keyed by file path and
 * version (sha), plus the token, kept in a separate object store from the
 * dataset per §3/§10.4's "separately from the dataset."
 */

const DB_NAME = 'initiative-planner';
// 2, not 1: the pre-rebuild prototype (prototype/store.js, since removed from
// the app) also opened an IndexedDB named 'initiative-planner' at version 1,
// for an unrelated single object store. On an origin that ran both builds,
// opening at version 1 again would silently reuse that old database and skip
// onupgradeneeded, leaving this build's stores missing (§10.4 needs them).
// 3 adds the store for what the last full pull saw (slice 005i).
const DB_VERSION = 3;
const FILES_STORE = 'files';
const META_STORE = 'meta';
const AUTH_STORE = 'auth';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      let settled = false;
      request.onupgradeneeded = (event) => {
        const db = request.result;
        for (const store of [FILES_STORE, META_STORE, AUTH_STORE]) {
          if (!db.objectStoreNames.contains(store)) db.createObjectStore(store);
        }
        // Before 3, files were kept by bare path with nothing saying which repository they came from: nothing reads those now.
        if (event.oldVersion > 0 && event.oldVersion < 3) request.transaction?.objectStore(FILES_STORE).clear();
      };
      request.onsuccess = () => {
        const db = request.result;
        // A later build upgrading the database must not wait for this tab to close.
        db.onversionchange = () => {
          db.close();
          dbPromise = null;
        };
        if (settled) return db.close(); // opened after the caller gave up on it (blocked): nothing uses it
        settled = true;
        resolve(db);
      };
      request.onerror = () => {
        dbPromise = null;
        settled = true;
        reject(request.error);
      };
      // An open tab of an older build holds the old version and blocks the upgrade until it closes. The cache is only a
      // convenience (§10.4), so the caller goes on without it rather than wait on a tab it cannot see.
      request.onblocked = () => {
        if (settled) return;
        settled = true;
        dbPromise = null;
        reject(new Error('The browser cache is in use by an older tab.'));
      };
    });
  }
  return dbPromise;
}

async function get<T>(store: string, key: string): Promise<T | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(store, 'readonly').objectStore(store).get(key);
    request.onsuccess = () => resolve((request.result as T | undefined) ?? null);
    request.onerror = () => reject(request.error);
  });
}

async function set<T>(store: string, key: string, value: T): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function del(store: string, key: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Every entry of `store` whose key starts with `prefix`, by key. */
async function entriesWithPrefix<T>(store: string, prefix: string): Promise<Map<string, T>> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const found = new Map<string, T>();
    const request = db
      .transaction(store, 'readonly')
      .objectStore(store)
      .openCursor(IDBKeyRange.bound(prefix, `${prefix}￿`));
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return resolve(found);
      found.set(cursor.key as string, cursor.value as T);
      cursor.continue();
    };
    request.onerror = () => reject(request.error);
  });
}

async function clearStore(store: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export interface CachedFile {
  content: string;
  sha: string;
  /** When it was written (ms since the epoch): the oldest go first when the cache is over its budget (§10.4). */
  at: number;
}

/** What the last complete pull saw: the branch head it read, and the ETag to ask about it again. */
export interface CacheMeta {
  head: string;
  etag: string | null;
}

/** The smaller of what a browser reports as its storage quota and this, in bytes, when it reports none. */
const FALLBACK_QUOTA_BYTES = 50 * 1024 * 1024;

/** Half the storage quota (§3 Storage limits, §10.4): the most the cache may hold. */
export async function defaultBudget(): Promise<number> {
  const quota = (await navigator.storage?.estimate?.().catch(() => undefined))?.quota ?? FALLBACK_QUOTA_BYTES;
  return quota / 2;
}

/** The key of one repository's and branch's files in the cache. */
export const cacheScope = ({ owner, repo, dataBranch }: { owner: string; repo: string; dataBranch: string }): string =>
  `${owner}/${repo}@${dataBranch}`;

const isInitiativeFile = (path: string) => path.startsWith('initiatives/');

/**
 * The dataset cache (§10.4) of one repository and branch: each file by path with its version. It
 * holds at most `budget()` bytes; over that, the oldest files are dropped first, initiative files
 * before master files, and never the file just written. The token is in another store and is never touched.
 */
export class FileCache {
  private readonly prefix: string;
  private total: number | null = null;
  /** Writes run one after another: each works from the total the one before left, so concurrent writes cannot lose each other's bytes. */
  private writes: Promise<unknown> = Promise.resolve();
  /** Set when files are dropped for the budget: the cache no longer holds the whole dataset, so it is not marked complete again until cleared. */
  private incomplete = false;

  constructor(
    scope: string,
    private readonly budget: () => Promise<number> = defaultBudget,
  ) {
    this.prefix = `${scope}|`;
  }

  private key(path: string): string {
    return `${this.prefix}${path}`;
  }

  get(path: string): Promise<CachedFile | null> {
    return get<CachedFile>(FILES_STORE, this.key(path));
  }

  async all(): Promise<Map<string, CachedFile>> {
    const found = await entriesWithPrefix<CachedFile>(FILES_STORE, this.prefix);
    return new Map([...found].map(([key, file]) => [key.slice(this.prefix.length), file]));
  }

  private serially<T>(write: () => Promise<T>): Promise<T> {
    const done = this.writes.then(write, write);
    this.writes = done.catch(() => {});
    return done;
  }

  set(path: string, value: { content: string; sha: string }): Promise<void> {
    return this.serially(() => this.put(path, value));
  }

  private async put(path: string, value: { content: string; sha: string }): Promise<void> {
    // Counted before the write, so a first write is not counted twice.
    const before = this.total ?? (await this.size());
    const previous = await this.get(path);
    await set<CachedFile>(FILES_STORE, this.key(path), { ...value, at: Date.now() });
    this.total = before - (previous?.content.length ?? 0) + value.content.length;
    const budget = await this.budget();
    if (this.total > budget) await this.evict(path, budget);
  }

  /**
   * Keeps the files of a pull and, with them, what the pull saw (§10.4), as one step: `meta` is recorded only when it
   * is given and the cache holds the whole dataset, that is, nothing was ever dropped for the budget. Resolves to
   * whether it was recorded. A cache without it is loaded from scratch on the next open.
   */
  commitPull(files: Iterable<[string, { content: string; sha: string }]>, meta: CacheMeta | null): Promise<boolean> {
    return this.serially(async () => {
      for (const [path, file] of files) await this.put(path, file);
      if (!meta || this.incomplete) {
        await del(META_STORE, this.prefix);
        return false;
      }
      await set(META_STORE, this.prefix, meta);
      return true;
    });
  }

  /** Resolves when the writes asked for so far are done. */
  idle(): Promise<void> {
    return this.writes.then(() => {});
  }

  delete(path: string): Promise<void> {
    return this.serially(() => this.remove(path));
  }

  private async remove(path: string): Promise<void> {
    const previous = await this.get(path);
    await del(FILES_STORE, this.key(path));
    if (this.total !== null && previous) this.total -= previous.content.length;
  }

  private async size(): Promise<number> {
    return [...(await this.all()).values()].reduce((sum, file) => sum + file.content.length, 0);
  }

  /** Drops the oldest files until the cache fits `budget`, and forgets that the cache is complete. */
  private async evict(keep: string, budget: number): Promise<void> {
    const files = [...(await this.all())].filter(([path]) => path !== keep);
    files.sort(([pathA, a], [pathB, b]) => Number(!isInitiativeFile(pathA)) - Number(!isInitiativeFile(pathB)) || a.at - b.at);
    for (const [path, file] of files) {
      if ((this.total ?? 0) <= budget) break;
      if (!this.incomplete) {
        this.incomplete = true;
        await del(META_STORE, this.prefix);
      }
      await del(FILES_STORE, this.key(path));
      this.total = (this.total ?? 0) - file.content.length;
    }
  }

  getMeta(): Promise<CacheMeta | null> {
    return get<CacheMeta>(META_STORE, this.prefix);
  }

  /** Forgets every file of this repository and branch, for a cache that cannot be trusted (§3 Damaged data). */
  clear(): Promise<void> {
    return this.serially(async () => {
      for (const path of (await this.all()).keys()) await del(FILES_STORE, this.key(path));
      await del(META_STORE, this.prefix);
      this.total = 0;
      this.incomplete = false;
    });
  }
}

/** Closes the connection, so a test can delete or upgrade the database. The next call opens it again. */
export async function closeDatabase(): Promise<void> {
  (await dbPromise?.catch(() => null))?.close();
  dbPromise = null;
}

/** Forgets every cached file of every repository, for tests. The token is not touched. */
export async function clearAllFileCaches(): Promise<void> {
  await clearStore(FILES_STORE);
  await clearStore(META_STORE);
}

const TOKEN_KEY = 'github-token';

export const tokenCache = {
  get: () => get<string>(AUTH_STORE, TOKEN_KEY),
  set: (token: string) => set(AUTH_STORE, TOKEN_KEY, token),
  clear: () => del(AUTH_STORE, TOKEN_KEY),
};
