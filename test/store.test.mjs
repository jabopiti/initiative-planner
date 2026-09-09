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
