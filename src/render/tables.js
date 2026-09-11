/**
 * The named-table registry (SPEC §8). Render functions populate it as they
 * build a table; the copy action in app.js's wiring reads it back by name.
 */
import { html, raw } from './dom.js';
import { icon } from './icons.js';

/** Named tables, so copy can address one by name (SPEC §8). */
export const TABLES = {};

/**
 * The copy control under a table.
 *
 * The confirmation is a toast rather than a note beside the button: this
 * control sits under tables that scroll inside their own box, so a note here
 * could easily be off-screen from the row the reader was looking at.
 */
export function tableActions(key, label) {
  return html`<div class="actions actions--table">
    <button type="button" class="btn btn--small" data-act="copy-table" data-table="${key}">
      ${raw(icon('copy'))}Copy ${label}</button>
  </div>`;
}
