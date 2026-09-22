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
const DB_VERSION = 2;
const FILES_STORE = 'files';
const AUTH_STORE = 'auth';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(FILES_STORE)) db.createObjectStore(FILES_STORE);
        if (!db.objectStoreNames.contains(AUTH_STORE)) db.createObjectStore(AUTH_STORE);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        dbPromise = null;
        reject(request.error);
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

export interface CachedFile {
  content: string;
  sha: string;
}

export const fileCache = {
  get: (path: string) => get<CachedFile>(FILES_STORE, path),
  set: (path: string, value: CachedFile) => set(FILES_STORE, path, value),
};

const TOKEN_KEY = 'github-token';

export const tokenCache = {
  get: () => get<string>(AUTH_STORE, TOKEN_KEY),
  set: (token: string) => set(AUTH_STORE, TOKEN_KEY, token),
  clear: () => del(AUTH_STORE, TOKEN_KEY),
};
