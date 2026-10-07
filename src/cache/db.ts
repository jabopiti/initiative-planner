/**
 * IndexedDB cache (§10.4): the GitHub dataset cache, keyed by file path and
 * version (sha), plus the token, kept in a separate object store from the
 * dataset per §3/§10.4's "separately from the dataset."
 */

import type { SeenRecord } from '../data/seen';
import { HOUR_MS, MINUTE_MS } from '../data/dates';

const DB_NAME = 'initiative-planner';
// 2, not 1: the pre-rebuild prototype (docs/history/prototype/store.js, since removed from
// the app) also opened an IndexedDB named 'initiative-planner' at version 1,
// for an unrelated single object store. On an origin that ran both builds,
// opening at version 1 again would silently reuse that old database and skip
// onupgradeneeded, leaving this build's stores missing (§10.4 needs them).
// 3 adds the store for what the last full pull saw (slice 005i). 4 adds the store for what the user last looked at (slice 063).
// 5 adds the write budget's count (slice 064).
const DB_VERSION = 5;
const FILES_STORE = 'files';
const META_STORE = 'meta';
const AUTH_STORE = 'auth';
const SEEN_STORE = 'seen';
const BUDGET_STORE = 'budget';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      let settled = false;
      request.onupgradeneeded = (event) => {
        const db = request.result;
        for (const store of [FILES_STORE, META_STORE, AUTH_STORE, SEEN_STORE, BUDGET_STORE]) {
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

const encoder = new TextEncoder();

/** A file's size in the cache: its UTF-8 encoded length in bytes, not UTF-16 units (§3 Storage limits, §10.4). */
const byteLength = (content: string): number => encoder.encode(content).length;

/** A write the browser refused because storage is full (§3 Storage limits). */
export const isQuotaError = (error: unknown): boolean => (error as { name?: unknown } | null)?.name === 'QuotaExceededError';

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
    const tail = done.then(() => {}, () => {});
    this.writes = tail;
    writesInFlight.add(tail);
    void tail.then(() => writesInFlight.delete(tail));
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
    this.total = before - (previous ? byteLength(previous.content) : 0) + byteLength(value.content);
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
    if (this.total !== null && previous) this.total -= byteLength(previous.content);
  }

  private async size(): Promise<number> {
    return [...(await this.all()).values()].reduce((sum, file) => sum + byteLength(file.content), 0);
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
      this.total = (this.total ?? 0) - byteLength(file.content);
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

/**
 * What the user last looked at (§9.9, §10.4): per initiative opened in one repository and branch, when and its key
 * figures then. Never synced and outside the cache's budget; the token and the dataset cache are not touched.
 */
export class SeenCache {
  private readonly prefix: string;

  constructor(scope: string) {
    this.prefix = `${scope}|`;
  }

  async all(): Promise<Map<string, SeenRecord>> {
    const found = await entriesWithPrefix<SeenRecord>(SEEN_STORE, this.prefix);
    return new Map([...found].map(([key, record]) => [key.slice(this.prefix.length), record]));
  }

  put(initiativeId: string, record: SeenRecord): Promise<void> {
    return set(SEEN_STORE, `${this.prefix}${initiativeId}`, record);
  }

  async putMany(records: Iterable<[string, SeenRecord]>): Promise<void> {
    await Promise.all([...records].map(([id, record]) => this.put(id, record)));
  }

  async clear(): Promise<void> {
    await Promise.all([...(await this.all()).keys()].map((id) => del(SEEN_STORE, `${this.prefix}${id}`)));
  }
}

/** Closes the connection, so a test can delete or upgrade the database. The next call opens it again. */
export async function closeDatabase(): Promise<void> {
  (await dbPromise?.catch(() => null))?.close();
  dbPromise = null;
}

/** Every cache's writes not finished yet, so clearing for the next test waits for them rather than racing them. */
const writesInFlight = new Set<Promise<unknown>>();

/** Forgets every cached file of every repository, and the write budget's count, for tests. The token is not touched. */
export async function clearAllFileCaches(): Promise<void> {
  await Promise.all(writesInFlight);
  await clearStore(FILES_STORE);
  await clearStore(META_STORE);
  await clearStore(BUDGET_STORE);
}

/** The most content-creating requests allowed in a rolling minute and hour (§10.3). */
export interface BudgetLines {
  perMinute: number;
  perHour: number;
}

/**
 * The write budget's count (§10.3, §10.4): when this browser sent each content-creating request in the last hour,
 * kept outside the cache budget and shared by its tabs. A reservation reads and records in one transaction, which
 * IndexedDB runs one at a time across tabs, so two tabs never both take the last place under a line.
 */
export const budgetStore = {
  /** Records a request at `now` when that keeps under both lines, and says so; otherwise when the next place frees up. */
  async reserve(key: string, now: number, lines: BudgetLines): Promise<{ sent: number[] } | { waitUntil: number }> {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(BUDGET_STORE, 'readwrite');
      const store = tx.objectStore(BUDGET_STORE);
      let outcome!: { sent: number[] } | { waitUntil: number };
      const request = store.get(key);
      request.onsuccess = () => {
        const sent = ((request.result as number[] | undefined) ?? []).filter((at) => at > now - HOUR_MS);
        outcome = budgetOutcome(sent, now, lines);
        store.put('sent' in outcome ? outcome.sent : sent, key);
      };
      tx.oncomplete = () => resolve(outcome);
      tx.onerror = () => reject(tx.error);
    });
  },

  /** The times of the requests recorded in the hour before `now`. */
  async sentSince(key: string, now: number): Promise<number[]> {
    return ((await get<number[]>(BUDGET_STORE, key)) ?? []).filter((at) => at > now - HOUR_MS);
  },
};

/** Whether one more request at `now` stays under both lines given those `sent` in the last hour, and if not, when it can go. */
export function budgetOutcome(sent: number[], now: number, lines: BudgetLines): { sent: number[] } | { waitUntil: number } {
  const lastMinute = sent.filter((at) => at > now - MINUTE_MS);
  if (lastMinute.length >= lines.perMinute) return { waitUntil: lastMinute[lastMinute.length - lines.perMinute] + MINUTE_MS };
  if (sent.length >= lines.perHour) return { waitUntil: sent[sent.length - lines.perHour] + HOUR_MS };
  return { sent: [...sent, now] };
}

const TOKEN_KEY = 'github-token';

export const tokenCache = {
  get: () => get<string>(AUTH_STORE, TOKEN_KEY),
  set: (token: string) => set(AUTH_STORE, TOKEN_KEY, token),
  clear: () => del(AUTH_STORE, TOKEN_KEY),
};

/** The GitHub login the remembered token belongs to, kept and cleared with it so Settings can name the user (§5.9). */
const LOGIN_KEY = 'github-login';

export const loginCache = {
  get: () => get<string>(AUTH_STORE, LOGIN_KEY),
  set: (login: string) => set(AUTH_STORE, LOGIN_KEY, login),
  clear: () => del(AUTH_STORE, LOGIN_KEY),
};

/** Set while the remembered token is a classic one and its warning has not been dismissed (§5.10); kept and cleared with the token. */
const CLASSIC_KEY = 'github-classic-warning';

export const classicWarningCache = {
  get: () => get<boolean>(AUTH_STORE, CLASSIC_KEY),
  set: () => set(AUTH_STORE, CLASSIC_KEY, true),
  clear: () => del(AUTH_STORE, CLASSIC_KEY),
};
