/**
 * The only module that touches anything outside itself: browser storage and
 * handing the user a file. Everything it decides is delegated to the pure
 * modules, so the rules stay testable without a browser (DESIGN.md §3).
 */

import { SCHEMA_VERSION, createApp } from './lifecycle.js';
import { PROCESS } from './process.js';
import { createMasterData } from './masterData.js';
import { serialize, exportFilename, parseImport, toTsv, toHtmlTable } from './transfer.js';

export const STORAGE_KEY = 'initiative-planner/v1';
const SAVE_DEBOUNCE_MS = 200;

/**
 * Load the dataset. Missing, unparsable, or written by a schema version this
 * build doesn't read all fall back to fresh seed data — there is no migration
 * path, by design (AGENTS.md).
 *
 * @returns {{ app: object, reason: 'stored'|'empty'|'unreadable'|'schema'|'process' }}
 */
export function load() {
  const fresh = () => createApp(createMasterData(), PROCESS);

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
  return { app: stored, reason: 'stored' };
}

/**
 * Whether the last write reached storage. A write is debounced, so by the time
 * one fails the call that caused it has long returned — which is why failure
 * is reported through a handler rather than a return value nobody is left to
 * read.
 */
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
  if (writeFailed !== wasFailing) onPersistenceChange?.(ok);

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
