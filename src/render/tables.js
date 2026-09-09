/**
 * The named-table registry (SPEC §8). Render functions populate it as they
 * build a table; the copy/CSV actions in app.js's wiring read it back by
 * name.
 */
import { html } from './dom.js';

/** Named tables, so copy and CSV can address one by name (SPEC §8). */
export const TABLES = {};

export function tableActions(key, label) {
  return html`<div class="actions actions--table">
    <button type="button" class="btn btn--small" data-act="copy-table" data-table="${key}">
      Copy ${label}</button>
    <button type="button" class="btn btn--small" data-act="csv-table" data-table="${key}">
      Download CSV</button>
    <span class="copy-note" data-note="${key}" aria-live="polite"></span>
  </div>`;
}
