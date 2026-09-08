/**
 * The only module that touches anything outside itself: browser storage and
 * handing the user a file. Everything it decides is delegated to the pure
 * modules, so the rules stay testable without a browser (DESIGN.md §3).
 */

import { SCHEMA_VERSION, createApp } from './lifecycle.js';
import { PROCESS } from './process.js';
import { createMasterData } from './masterData.js';
import { serialize, exportFilename, parseImport, toCsv, toTsv, toHtmlTable } from './transfer.js';

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

/** Write immediately. Prefer `save` — this is for leaving the page. */
export function saveNow(app) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(app));
    return true;
  } catch {
    // A full or blocked store must not take the app down mid-keystroke.
    return false;
  }
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

/** Clear local storage entirely — the Settings danger zone (SPEC §7.7). */
export function reset() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing useful to do; the caller reloads either way.
  }
}

/** Hand the user the whole dataset as a dated JSON file. */
export function downloadExport(app, now = new Date()) {
  flush(app);
  const blob = new Blob([serialize(app)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = exportFilename(now);
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
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

/** Download a named table as CSV. */
export function downloadCsv(filename, headers, rows) {
  const blob = new Blob([toCsv(headers, rows)], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
