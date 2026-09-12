/**
 * The only module that touches anything outside itself: browser storage and
 * handing the user a file. Everything it decides is delegated to the pure
 * modules, so the rules stay testable without a browser (DESIGN.md §3).
 */

import { SCHEMA_VERSION, createApp } from './lifecycle.js';
import { PROCESS } from './process.js';
import { createMasterData } from './masterData.js';
import { recomputeWindow } from './engine.js';
import { serialize, exportFilename, parseImport, toTsv, toHtmlTable } from './transfer.js';

export const STORAGE_KEY = 'initiative-planner/v1';
const SAVE_DEBOUNCE_MS = 200;

/**
 * Load the dataset. Missing, unparsable, or written by a schema version this
 * build doesn't read all fall back to fresh seed data — there is no migration
 * path, by design (AGENTS.md).
 *
 * A dataset that loads successfully has its rolling four-year window
 * extended forward to cover `now`, if it doesn't already (DESIGN §2, D9) —
 * fresh seed data needs no such recompute, since `createMasterData()` builds
 * its window against `now` already. The extension is written back
 * immediately rather than waiting for the next edit, so it survives a reload
 * even if nothing else changes first.
 *
 * @param {number} [now] current year, injectable for tests
 * @returns {{ app: object, reason: 'stored'|'empty'|'unreadable'|'schema'|'process' }}
 */
export function load(now = new Date().getFullYear()) {
  const fresh = () => createApp(createMasterData(now), PROCESS);

  let raw = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    return { app: fresh(), reason: 'unreadable' };
  }
  if (!raw) return { app: fresh(), reason: 'empty' };

  let stored;
  try {
    stored = JSON.parse(raw);
  } catch {
    return { app: fresh(), reason: 'unreadable' };
  }
  if (!stored || stored.schemaVersion !== SCHEMA_VERSION) {
    return { app: fresh(), reason: 'schema' };
  }
  // A dataset written against a different process would put initiatives in
  // phases this build has never heard of (DESIGN §3).
  if (stored.processId !== PROCESS.id) {
    return { app: fresh(), reason: 'process' };
  }
  if (recomputeWindow(stored, now)) saveNow(stored);
  return { app: stored, reason: 'stored' };
}

/**
 * Whether the last write reached storage. A write is debounced, so by the time
 * one fails the call that caused it has long returned — which is why failure
 * is reported through a handler rather than a return value nobody is left to
 * read.
 */
/**
 * Call `notify` only when a failing/ok flag actually flips — a store or a
 * linked file that has been failing for twenty writes should say so once,
 * and recovering should clear it once, not on every attempt in between.
 */
function reportOnChange(wasFailing, isFailing, notify) {
  if (isFailing !== wasFailing) notify();
}

let writeFailed = false;

/** @type {((persisting: boolean) => void) | null} */
let onPersistenceChange = null;

/**
 * Register the one handler told when persistence stops or starts working.
 * Installed once at boot.
 *
 * A blocked or full store must not take the app down mid-keystroke — but it
 * must not pass unnoticed either. Every edit here lives in one browser until
 * someone exports, so silently dropping writes loses the session's work with
 * nothing on screen to suggest anything happened.
 *
 * @param {(persisting: boolean) => void} handler
 */
export function watchPersistence(handler) {
  onPersistenceChange = handler;
  return writeFailed;
}

/** Write immediately. Prefer `save` — this is for leaving the page. */
export function saveNow(app) {
  // A tab that has seen another tab save more recently must not write its
  // own, now-stale, in-memory state over that — the whole point of the
  // multi-tab warning above. This is a distinct condition from a full or
  // blocked store, so it skips the writeFailed signal entirely rather than
  // reporting itself as one.
  if (externalChangeDetected) return false;

  let ok = true;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(app));
  } catch {
    ok = false;
  }

  // Only transitions are reported: a store that has been failing for twenty
  // keystrokes should say so once, and recovering should clear it.
  const wasFailing = writeFailed;
  writeFailed = !ok;
  reportOnChange(wasFailing, writeFailed, () => onPersistenceChange?.(ok));

  // Fire-and-forget: the linked file is a mirror, not a dependency of the
  // save this function promises (D4), so nothing here awaits it.
  if (ok && linkedHandle) writeToLinkedFile(app);

  return ok;
}

/** Whether writes are currently reaching storage. */
export function isPersisting() {
  return !writeFailed;
}

let pending = null;

/** Debounced write: the whole APP is the unit of persistence (DESIGN.md §3). */
export function save(app) {
  if (pending) clearTimeout(pending);
  pending = setTimeout(() => {
    pending = null;
    saveNow(app);
  }, SAVE_DEBOUNCE_MS);
}

/** Flush a pending write, e.g. before an export or a page unload. */
export function flush(app) {
  if (!pending) return;
  clearTimeout(pending);
  pending = null;
  saveNow(app);
}

const DRAFT_KEY = 'initiative-planner/wizard-draft';

/**
 * The creation wizard's first step, before an initiative exists to hold it.
 * Kept apart from the dataset because it is not data yet — it is an unfinished
 * intention, and it must not travel in an export.
 */
export function loadDraft() {
  try {
    return JSON.parse(localStorage.getItem(DRAFT_KEY) ?? 'null') ?? {};
  } catch {
    return {};
  }
}

export function saveDraft(draft) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // Losing an unfinished draft is survivable; taking the app down is not.
  }
}

export function clearDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    // Nothing useful to do.
  }
}

/** Clear local storage entirely — the Settings danger zone. */
export function reset() {
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    // Nothing useful to do; the caller reloads either way.
  }
}

/**
 * Hand the user the whole dataset as a dated JSON file.
 * @returns {boolean} whether the file actually reached the user
 */
export function downloadExport(app, now = new Date()) {
  flush(app);
  return downloadBlob(new Blob([serialize(app)], { type: 'application/json' }), exportFilename(now));
}

/**
 * Hand the browser a blob to save. The only place an anchor is synthesised.
 * @returns {boolean} whether the download was actually started
 */
function downloadBlob(blob, filename) {
  let url = null;
  try {
    url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    return true;
  } catch {
    // A sandboxed frame or a download policy can refuse this outright.
    return false;
  } finally {
    if (url) URL.revokeObjectURL(url);
  }
}

/** Read a file the user picked and validate it before anything else happens. */
export async function readImportFile(file) {
  return parseImport(await file.text());
}

/* ------------------------------------------------------------------ *
 * File System Access binding (D4) — an optional mirror, never a
 * replacement for localStorage, which stays the one thing `load()` reads.
 *
 * Linking a file does not change where data is *read* from: reconciling a
 * file edited elsewhere is still Import's job (D5), exactly as it already
 * is for a manually-taken export. All this adds is writing the same bytes
 * to a chosen file automatically, on top of every localStorage write,
 * so a background sync folder (Dropbox, iCloud Drive) can carry them
 * without a manual export first. Chromium-only, so every entry point
 * feature-detects and the rest of the app never assumes it exists.
 * ------------------------------------------------------------------ */

/** Whether this browser can bind persistence to a real file. */
export function fileSystemAccessSupported() {
  return typeof window !== 'undefined' && 'showSaveFilePicker' in window;
}

const HANDLE_DB = 'initiative-planner';
const HANDLE_STORE = 'file-handles';
const HANDLE_KEY = 'linked';

/** One object store, one record — this is not a general-purpose database. */
function openHandleDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(HANDLE_DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(HANDLE_STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function idbGet(key) {
  const db = await openHandleDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(HANDLE_STORE, 'readonly').objectStore(HANDLE_STORE).get(key);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error);
  });
}

async function idbSet(key, value) {
  const db = await openHandleDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(HANDLE_STORE, 'readwrite');
    tx.objectStore(HANDLE_STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbDelete(key) {
  const db = await openHandleDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(HANDLE_STORE, 'readwrite');
    tx.objectStore(HANDLE_STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** @type {FileSystemFileHandle | null} */
let linkedHandle = null;
/** @type {'granted'|'prompt'|'denied'|'none'} */
let linkedPermission = 'none';
let fileWriteFailed = false;
/** @type {((status: { name: string|null, permission: string, failed: boolean }) => void) | null} */
let onFileBindingChange = null;

/** The linked file's name and permission, for rendering — never prompts. */
export function linkedFileStatus() {
  return { name: linkedHandle?.name ?? null, permission: linkedPermission, failed: fileWriteFailed };
}

function notifyFileBinding() {
  onFileBindingChange?.(linkedFileStatus());
}

/** Told whenever the linked file's status changes — name, permission, or a write failing. */
export function watchFileBinding(handler) {
  onFileBindingChange = handler;
  return linkedFileStatus();
}

/**
 * Restore a previously linked handle at boot, if this browser still has one
 * and still trusts it enough to say so without prompting. Call once; the
 * result reaches the UI through `watchFileBinding`, since this resolves
 * after the first render.
 */
export async function restoreFileHandle() {
  if (!fileSystemAccessSupported()) return;
  try {
    const handle = await idbGet(HANDLE_KEY);
    if (!handle) return;
    linkedHandle = handle;
    linkedPermission = await handle.queryPermission({ mode: 'readwrite' });
  } catch {
    // A handle that no longer resolves (the browser forgot it) is the same
    // as never having linked one.
    linkedHandle = null;
    linkedPermission = 'none';
  }
  notifyFileBinding();
}

/**
 * Let the user pick or create the file every save mirrors to from now on.
 * The picker itself is the permission grant, so this starts at 'granted'.
 */
export async function linkFile(app) {
  if (!fileSystemAccessSupported()) return false;

  let handle;
  try {
    handle = await window.showSaveFilePicker({
      suggestedName: exportFilename(new Date()),
      types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }],
    });
  } catch {
    // The user cancelled the picker, or the browser refused it outright —
    // nothing was touched, so there is nothing to roll back.
    return false;
  }

  linkedHandle = handle;
  linkedPermission = 'granted';
  try {
    await idbSet(HANDLE_KEY, handle);
    await writeToLinkedFile(app);
  } catch {
    // A file was picked but never actually became the link — IndexedDB
    // refused it, most likely. Roll the in-memory state back to unlinked
    // rather than leaving it saying "linked" while nothing was persisted
    // and no caller was told either happened.
    linkedHandle = null;
    linkedPermission = 'none';
    return false;
  }

  notifyFileBinding();
  return true;
}

/** Forget the link. Never deletes the file itself — only the association. */
export async function unlinkFile() {
  linkedHandle = null;
  linkedPermission = 'none';
  fileWriteFailed = false;
  try {
    await idbDelete(HANDLE_KEY);
  } catch {
    // Nothing useful to do.
  }
  notifyFileBinding();
}

/**
 * Re-request permission on the already-linked file. Must run from a user
 * gesture (a click), which is exactly what the "Reconnect" button is.
 */
export async function reconnectFile() {
  if (!linkedHandle) return false;
  try {
    linkedPermission = await linkedHandle.requestPermission({ mode: 'readwrite' });
  } catch {
    linkedPermission = 'denied';
  }
  notifyFileBinding();
  return linkedPermission === 'granted';
}

/**
 * Mirror the dataset to the linked file. Fire-and-forget from `saveNow` —
 * never blocks a caller, never throws outward, and never touches the
 * localStorage failure signal, which is a different concern reported a
 * different way.
 */
async function writeToLinkedFile(app) {
  if (!linkedHandle) return;
  let ok = true;
  try {
    if (linkedPermission !== 'granted') throw new Error('permission not granted');
    const writable = await linkedHandle.createWritable();
    await writable.write(serialize(app));
    await writable.close();
  } catch {
    ok = false;
  }
  const wasFailing = fileWriteFailed;
  fileWriteFailed = !ok;
  reportOnChange(wasFailing, fileWriteFailed, notifyFileBinding);
}

/* ------------------------------------------------------------------ *
 * Multi-tab awareness (§4.7) — a courtesy warning, not a lock. Real-time
 * sync between tabs would reopen SPEC §1 (D5); this only stops the tab that
 * is now behind from silently clobbering the one that saved more recently.
 * ------------------------------------------------------------------ */

let externalChangeDetected = false;

/** Whether this tab has seen the dataset change in another tab since load. */
export function externalChangePending() {
  return externalChangeDetected;
}

/** Told once, the first time another tab saves over this tab's dataset. */
export function watchExternalChange(handler) {
  if (typeof window === 'undefined') return;
  window.addEventListener('storage', (event) => {
    if (externalChangeDetected || event.key !== STORAGE_KEY || event.newValue === event.oldValue) {
      return;
    }
    externalChangeDetected = true;
    handler();
  });
}

/**
 * Copy a table to the clipboard as both plain text and rich HTML, so it lands
 * as cells in a spreadsheet and as a table in a document (SPEC §8).
 *
 * Falls back to plain text where the rich clipboard API is unavailable, since
 * losing the formatting is better than losing the copy.
 */
export async function copyTable(headers, rows) {
  const text = toTsv(headers, rows);
  try {
    const item = new ClipboardItem({
      'text/plain': new Blob([text], { type: 'text/plain' }),
      'text/html': new Blob([toHtmlTable(headers, rows)], { type: 'text/html' }),
    });
    await navigator.clipboard.write([item]);
    return 'rich';
  } catch {
    try {
      await navigator.clipboard.writeText(text);
      return 'text';
    } catch {
      return 'failed';
    }
  }
}
