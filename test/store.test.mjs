// store.js is the one module that reaches outside itself, so it gets a stub
// rather than a real browser. What matters here is the schema gate and that a
// blocked or full store never takes the app down.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import * as L from '../src/lifecycle.js';

/** Minimal localStorage, with hooks for the failure modes that matter. */
function stubStorage({ throwOnGet = false, throwOnSet = false } = {}) {
  const map = new Map();
  globalThis.localStorage = {
    getItem: (key) => {
      if (throwOnGet) throw new Error('blocked');
      return map.has(key) ? map.get(key) : null;
    },
    setItem: (key, value) => {
      if (throwOnSet) throw new Error('quota exceeded');
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
    clear: () => map.clear(),
    key: (index) => [...map.keys()][index] ?? null,
    get length() {
      return map.size;
    },
  };
  return map;
}

let store;
beforeEach(async () => {
  stubStorage();
  // Node supplies Blob and URL; only the DOM half needs standing in for.
  globalThis.document ??= /** @type {any} */ ({
    createElement: () => ({ click() {}, remove() {} }),
    body: { append() {} },
  });
  store = await import('../src/store.js');
});

test('an empty store seeds fresh data rather than failing', async () => {
  const { app, reason } = store.load();
  assert.equal(reason, 'empty');
  assert.equal(app.schemaVersion, L.SCHEMA_VERSION);
  assert.ok(Object.keys(app.PEOPLE).length > 0, 'seed data, not an empty shell');
  assert.deepEqual(app.INITIATIVES, []);
});

test('a stored dataset comes back as it went in', () => {
  const { app } = store.load();
  app.INITIATIVES.push({ id: 'init_x', name: 'Kept' });
  assert.equal(store.saveNow(app), true);

  const reloaded = store.load();
  assert.equal(reloaded.reason, 'stored');
  assert.equal(reloaded.app.INITIATIVES[0].name, 'Kept');
});

test('a stored dataset behind the window is extended forward and the extension persists (D9)', () => {
  const NOW = 2026;
  const { app } = store.load(NOW);
  store.saveNow(app);

  const country = Object.values(app.COUNTRIES)[0];
  const lastTrackedYear = Math.max(...Object.keys(country.byYear).map(Number));
  assert.equal(country.byYear[lastTrackedYear + 1], undefined, 'not tracked yet');

  const { app: rolled } = store.load(NOW + 1);
  const rolledCountry = rolled.COUNTRIES[country.id];
  assert.deepEqual(
    rolledCountry.byYear[lastTrackedYear + 1],
    rolledCountry.byYear[lastTrackedYear],
    'the new year is seeded from the one nearest to it',
  );

  // The extension must have been written back, not just held in memory.
  const reloaded = store.load(NOW + 1);
  assert.ok(reloaded.app.COUNTRIES[country.id].byYear[lastTrackedYear + 1], 'survives without a further edit');
});

test('an unknown schema version falls back to seed data, never a migration', () => {
  const map = stubStorage();
  map.set(store.STORAGE_KEY, JSON.stringify({ schemaVersion: 999, PEOPLE: {} }));

  const { app, reason } = store.load();
  assert.equal(reason, 'schema');
  assert.equal(app.schemaVersion, L.SCHEMA_VERSION);
  assert.ok(Object.keys(app.PEOPLE).length > 0);
});

test('unparsable storage falls back rather than throwing', () => {
  const map = stubStorage();
  map.set(store.STORAGE_KEY, '{ broken');
  assert.equal(store.load().reason, 'unreadable');
});

test('a store that refuses to be read still boots the app', () => {
  stubStorage({ throwOnGet: true });
  const { app, reason } = store.load();
  assert.equal(reason, 'unreadable');
  assert.ok(app.schemaVersion);
});

test('a full store reports failure instead of taking the app down', () => {
  const { app } = store.load();
  stubStorage({ throwOnSet: true });
  assert.equal(store.saveNow(app), false, 'a failed write must be survivable mid-keystroke');
});

test('a store that stops accepting writes says so, once, and says when it recovers', () => {
  const { app } = store.load();
  // The module is a singleton across tests, so start from a known-good write
  // rather than inheriting whatever the last one left behind.
  store.saveNow(app);

  /** @type {boolean[]} */
  const seen = [];
  store.watchPersistence((persisting) => seen.push(persisting));
  assert.equal(store.isPersisting(), true);

  stubStorage({ throwOnSet: true });
  store.saveNow(app);
  store.saveNow(app);
  store.saveNow(app);
  assert.deepEqual(seen, [false], 'a store failing for three keystrokes reports once');
  assert.equal(store.isPersisting(), false, 'and stays reported until it recovers');

  stubStorage();
  store.saveNow(app);
  store.saveNow(app);
  assert.deepEqual(seen, [false, true], 'recovery is reported once too');
  assert.equal(store.isPersisting(), true);
});

test('a debounced write that fails still reports, though its caller is long gone', () => {
  const { app } = store.load();
  store.saveNow(app);

  /** @type {boolean[]} */
  const seen = [];
  store.watchPersistence((persisting) => seen.push(persisting));

  stubStorage({ throwOnSet: true });
  store.save(app);
  assert.deepEqual(seen, [], 'nothing has been attempted yet');

  store.flush(app);
  assert.deepEqual(seen, [false], 'the failure surfaces when the write actually happens');
});

test('saving is debounced, and flush forces it out', () => {
  const { app } = store.load();
  app.GENERAL.currency = '$';

  store.save(app);
  assert.equal(globalThis.localStorage.getItem(store.STORAGE_KEY), null, 'not written yet');

  store.flush(app);
  assert.equal(JSON.parse(globalThis.localStorage.getItem(store.STORAGE_KEY)).GENERAL.currency, '$');
});

test('reset clears the dataset so the next load seeds fresh', () => {
  const { app } = store.load();
  store.saveNow(app);
  store.reset();
  assert.equal(store.load().reason, 'empty');
});

test('a dataset from another process falls back rather than loading', async () => {
  const { PROCESS } = await import('../src/process.js');
  const map = stubStorage();
  const { app } = store.load();
  map.set(
    store.STORAGE_KEY,
    JSON.stringify({ ...app, processId: 'someone-elses-process', INITIATIVES: [{ id: 'x' }] }),
  );

  const loaded = store.load();
  assert.equal(loaded.reason, 'process');
  assert.equal(loaded.app.processId, PROCESS.id);
  assert.deepEqual(loaded.app.INITIATIVES, [], 'initiatives in unknown phases are not loaded');
});

test('the wizard draft survives leaving the page, and is not part of the dataset', () => {
  store.saveDraft({ name: 'Half typed', teamId: 't1' });
  assert.deepEqual(store.loadDraft(), { name: 'Half typed', teamId: 't1' });

  // It must not ride along in the dataset, or an unfinished intention would
  // travel in an export.
  const { app } = store.load();
  assert.equal(JSON.stringify(app).includes('Half typed'), false);

  store.clearDraft();
  assert.deepEqual(store.loadDraft(), {});
});

test('a reset clears the draft too', () => {
  store.saveDraft({ name: 'Leftover' });
  store.reset();
  assert.deepEqual(store.loadDraft(), {});
});

test('an unreadable draft comes back empty rather than throwing', () => {
  const map = stubStorage();
  map.set('initiative-planner/wizard-draft', '{ broken');
  assert.deepEqual(store.loadDraft(), {});
});

test('a refused download is reported, so the export reminder is not cleared', () => {
  const { app } = store.load();
  // A sandboxed frame or a download policy refuses this outright.
  const realCreate = globalThis.URL.createObjectURL;
  globalThis.URL.createObjectURL = () => { throw new Error('blocked'); };
  try {
    assert.equal(store.downloadExport(app), false, 'a blocked download must say so');
  } finally {
    globalThis.URL.createObjectURL = realCreate;
  }
});

/* -------------------------------------------------- File System Access (D4) */

test('the File System Access API does not exist here, and every entry point says so safely', async () => {
  assert.equal(store.fileSystemAccessSupported(), false);
  assert.equal(await store.linkFile({}), false);
  assert.deepEqual(store.linkedFileStatus(), { name: null, permission: 'none', failed: false });

  // A no-op, not a throw: a browser that once supported this and no longer
  // does must still boot cleanly.
  await store.restoreFileHandle();
  assert.equal(store.linkedFileStatus().name, null);
});

/**
 * A fake IndexedDB backed by a plain Map, so a mock FileSystemFileHandle
 * (a plain object with methods) can round-trip through it — a real
 * browser's IndexedDB enforces the structured-clone algorithm and would
 * refuse exactly that, since only a native handle can survive it. What
 * matters here is store.js's own logic around the handle, not the browser's
 * guarantee that a real handle clones — that half is Chromium's contract,
 * not this codebase's.
 */
function stubIndexedDb() {
  const data = new Map();
  const objectStore = {
    get: (key) => {
      const request = { onsuccess: null, onerror: null, result: data.get(key) };
      queueMicrotask(() => request.onsuccess?.());
      return request;
    },
    put: (value, key) => data.set(key, value),
    delete: (key) => data.delete(key),
  };
  const db = {
    createObjectStore: () => {},
    transaction: () => {
      const tx = { onerror: null, oncomplete: null, objectStore: () => objectStore };
      queueMicrotask(() => tx.oncomplete?.());
      return tx;
    },
  };
  globalThis.indexedDB = /** @type {any} */ ({
    open: () => {
      const request = { onupgradeneeded: null, onsuccess: null, onerror: null, result: db };
      queueMicrotask(() => {
        request.onupgradeneeded?.();
        request.onsuccess?.();
      });
      return request;
    },
  });
  return data;
}

/** A mock FileSystemFileHandle, recording what's written to it. */
function mockFileHandle(name = 'my-plan.json') {
  const writes = [];
  return {
    name,
    permission: 'granted',
    writes,
    async queryPermission() {
      return this.permission;
    },
    async requestPermission() {
      this.permission = 'granted';
      return this.permission;
    },
    async createWritable() {
      const handle = this;
      let pending = '';
      return {
        write: async (data) => {
          pending = data;
        },
        close: async () => {
          handle.writes.push(pending);
        },
      };
    },
  };
}

test('linking a file persists the handle, writes the current dataset, and reports it', async () => {
  stubIndexedDb();
  const handle = mockFileHandle();
  globalThis.window = /** @type {any} */ ({
    addEventListener: () => {},
    showSaveFilePicker: async () => handle,
  });

  const seen = [];
  store.watchFileBinding((status) => seen.push(status));

  const { app } = store.load();
  assert.equal(await store.linkFile(app), true);
  assert.deepEqual(store.linkedFileStatus(), { name: 'my-plan.json', permission: 'granted', failed: false });
  assert.equal(handle.writes.length, 1, 'linking writes the current dataset immediately');
  assert.deepEqual(seen.at(-1), { name: 'my-plan.json', permission: 'granted', failed: false });

  // Every subsequent save mirrors to it too — never blocking, never
  // changing saveNow's own return value. The mirror is fire-and-forget, so
  // saveNow returning does not mean the file write has landed yet.
  assert.equal(store.saveNow(app), true);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(handle.writes.length, 2);

  await store.unlinkFile();
  assert.deepEqual(store.linkedFileStatus(), { name: null, permission: 'none', failed: false });
  assert.equal(store.saveNow(app), true, 'unlinking does not touch localStorage saving at all');
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(handle.writes.length, 2, 'nothing mirrors anywhere once unlinked');
});

test('cancelling the file picker links nothing and reports nothing', async () => {
  stubIndexedDb();
  globalThis.window = /** @type {any} */ ({
    addEventListener: () => {},
    showSaveFilePicker: async () => {
      throw new DOMException('The user aborted a request.', 'AbortError');
    },
  });

  let notified = false;
  store.watchFileBinding(() => {
    notified = true;
  });

  assert.equal(await store.linkFile({}), false);
  assert.deepEqual(store.linkedFileStatus(), { name: null, permission: 'none', failed: false });
  assert.equal(notified, false, 'nothing changed, so nothing should announce a change');
});

test('a file picked but never actually linked (IndexedDB refuses it) rolls back rather than lying', async () => {
  globalThis.window = /** @type {any} */ ({
    addEventListener: () => {},
    showSaveFilePicker: async () => mockFileHandle(),
  });
  // A "supported" IndexedDB that fails every open — standing in for a
  // browser that blocks or has corrupted its own storage for this origin.
  globalThis.indexedDB = /** @type {any} */ ({
    open: () => {
      const request = { onupgradeneeded: null, onsuccess: null, onerror: null };
      queueMicrotask(() => request.onerror?.());
      return request;
    },
  });

  assert.equal(await store.linkFile({}), false);
  assert.deepEqual(
    store.linkedFileStatus(),
    { name: null, permission: 'none', failed: false },
    'a handle picked but never persisted must not be reported as linked',
  );
});

test('restoring at boot re-reads a previously linked handle and its permission', async () => {
  const data = stubIndexedDb();
  const handle = mockFileHandle();
  handle.permission = 'prompt'; // the common case: granted last session, not yet re-asked
  data.set('linked', handle);
  // showSaveFilePicker is never called in this test, but its mere presence
  // is what fileSystemAccessSupported() feature-detects — restoreFileHandle()
  // no-ops without it, same as it should in a browser without the API.
  globalThis.window = /** @type {any} */ ({ addEventListener: () => {}, showSaveFilePicker: () => {} });

  await store.restoreFileHandle();
  assert.deepEqual(store.linkedFileStatus(), { name: 'my-plan.json', permission: 'prompt', failed: false });

  await store.unlinkFile();
});

test('reconnecting re-asks permission from this click\'s own gesture', async () => {
  const data = stubIndexedDb();
  const handle = mockFileHandle();
  handle.permission = 'prompt'; // restored from a session where it was never re-confirmed
  data.set('linked', handle);
  // showSaveFilePicker is never called in this test, but its mere presence
  // is what fileSystemAccessSupported() feature-detects — restoreFileHandle()
  // no-ops without it, same as it should in a browser without the API.
  globalThis.window = /** @type {any} */ ({ addEventListener: () => {}, showSaveFilePicker: () => {} });

  await store.restoreFileHandle();
  assert.equal(store.linkedFileStatus().permission, 'prompt');

  handle.permission = 'granted'; // what the browser's own prompt will now report
  assert.equal(await store.reconnectFile(), true);
  assert.equal(store.linkedFileStatus().permission, 'granted');

  await store.unlinkFile();
});

/* -------------------------------------------------- multi-tab awareness (§4.7)
 *
 * externalChangeDetected has no reset once tripped (there is nothing to
 * reset it to — the whole point is that this tab stays stopped until a
 * reload gives it a fresh module), so this must be the last test in the
 * file: every test after it would otherwise find saveNow refusing to write.
 */

/** A minimal `window`, just enough to capture the one listener store.js adds. */
function stubWindow() {
  const listeners = {};
  globalThis.window = /** @type {any} */ ({
    addEventListener: (type, handler) => {
      listeners[type] = handler;
    },
  });
  return listeners;
}

test('another tab saving over this dataset stops this tab writing over it back', () => {
  const listeners = stubWindow();
  const { app } = store.load();
  store.saveNow(app);

  const seen = [];
  store.watchExternalChange(() => seen.push('changed'));
  assert.equal(store.externalChangePending(), false);

  // A change to some other key, or no real change, is not what this warns
  // about.
  listeners.storage({ key: 'unrelated-key', oldValue: 'a', newValue: 'b' });
  listeners.storage({ key: store.STORAGE_KEY, oldValue: 'same', newValue: 'same' });
  assert.equal(store.externalChangePending(), false);
  assert.deepEqual(seen, []);

  listeners.storage({ key: store.STORAGE_KEY, oldValue: 'a', newValue: 'b' });
  assert.equal(store.externalChangePending(), true);
  assert.deepEqual(seen, ['changed'], 'told once, not once per subsequent event');

  // The critical behaviour: this tab must not clobber the newer version
  // sitting in storage with its own, now-stale, in-memory state.
  assert.equal(store.saveNow(app), false, 'must refuse to write once behind');

  listeners.storage({ key: store.STORAGE_KEY, oldValue: 'b', newValue: 'c' });
  assert.deepEqual(seen, ['changed'], 'a second external change is not reported again');
});
