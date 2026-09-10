/**
 * The icon set: one inline SVG sprite, injected once.
 *
 * `<symbol>` plus `<use>`, coloured through `currentColor`, so a theme change
 * repaints an icon with no second definition and no second file — and so the
 * single-file artifact gains no request and no dependency.
 *
 * Icons are earned, not decorative. A glyph is added here when there is a
 * control that means it and no word would do the job better; it is not added
 * because a button looked bare. That is why there is no `undo` yet: the undo
 * mechanism arrives with the interaction-patterns row, and a symbol with no
 * user is dead weight in a file whose whole promise is that it is small.
 *
 * Drawing rules, so the set stays one set: a 16-unit square, strokes only at
 * 1.5 units, square caps and mitred joins. The square cap is the same decision
 * as the square corner elsewhere — this is a drafting instrument, not a
 * friendly one.
 */
import { html, raw } from './dom.js';

/** Symbol id prefix, so an icon can never collide with a page element's id. */
const PREFIX = 'i-';

/**
 * Path data per icon. Kept as data rather than markup so the drawing rules
 * above are applied in exactly one place, below, instead of per glyph.
 *
 * @type {Record<string, string[]>}
 */
const PATHS = {
  // Actions
  add: ['M8 2.75v10.5', 'M2.75 8h10.5'],
  remove: ['M4 4l8 8', 'M12 4l-8 8'],
  duplicate: ['M5.25 5.25h8.5v8.5h-8.5z', 'M2.25 10.75v-8.5h8.5'],
  copy: ['M6 2.25h4v2.5H6z', 'M10 3.5h3.25v10.25H2.75V3.5H6'],
  export: ['M8 2.25v7.5', 'M4.5 6.5L8 10l3.5-3.5', 'M2.25 13.75h11.5'],
  import: ['M8 10v-7.75', 'M4.5 5.75L8 2.25l3.5 3.5', 'M2.25 13.75h11.5'],
  search: ['M10.75 7a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0z', 'M9.75 9.75L13.75 13.75'],
  filter: ['M2.25 3.25h11.5L9.25 8.5v4.25l-2.5 1.25V8.5z'],
  menu: ['M2.25 4.25h11.5', 'M2.25 8h11.5', 'M2.25 11.75h11.5'],

  // Sorting: three states, because "unsorted" has to be visible too or a
  // sortable column is indistinguishable from a fixed one.
  sort: ['M5 6.5L8 3.5l3 3', 'M5 9.5L8 12.5l3-3'],
  'sort-asc': ['M8 13V3.5', 'M4.5 7L8 3.5 11.5 7'],
  'sort-desc': ['M8 3v9.5', 'M4.5 9L8 12.5 11.5 9'],

  // Direction
  'chevron-left': ['M10.25 2.75L5 8l5.25 5.25'],
  'chevron-right': ['M5.75 2.75L11 8l-5.25 5.25'],
  'chevron-down': ['M2.75 5.75L8 11l5.25-5.25'],

  // Outcome
  check: ['M2.75 8.25l3.75 3.75L13.25 5.25'],
  skip: ['M3.5 3.5L8 8l-4.5 4.5', 'M9 3.5L13.5 8L9 12.5'],
  warning: ['M8 2.25L14.25 13.5H1.75z', 'M8 6.5v3', 'M8 11.4v.1'],

  // Theme: a disc half in shadow says "light or dark" without picking one.
  theme: ['M13.5 8a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0z', 'M8 2.5v11'],
};

/** Icons whose meaning needs a filled area rather than an outline. */
const FILLED = { theme: 'M8 2.5a5.5 5.5 0 0 1 0 11z' };

/**
 * The whole sprite, as markup. Rendered once into the shell; every `icon()`
 * call afterwards is a `<use>` reference costing a few bytes.
 */
export const SPRITE = html`<svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true"
  style="display:none">
  ${raw(Object.entries(PATHS)
    .map(([name, paths]) => html`<symbol id="${PREFIX}${name}" viewBox="0 0 16 16"
      fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="square"
      stroke-linejoin="miter">
      ${raw(paths.map((d) => html`<path d="${d}" />`).join(''))}
      ${raw(FILLED[name] ? html`<path d="${FILLED[name]}" fill="currentColor" stroke="none" />` : '')}
    </symbol>`)
    .join(''))}
</svg>`;

/**
 * One icon, referencing the sprite.
 *
 * Decorative by default: an icon beside a word says nothing the word does not,
 * so it is hidden from assistive tech. An icon-only control carries its name on
 * the button, never on the glyph — see `.btn--icon` in the stylesheet.
 *
 * @param {keyof PATHS | string} name
 * @param {string} [extraClass]
 */
export function icon(name, extraClass = '') {
  return html`<svg class="icon ${extraClass}" aria-hidden="true" focusable="false"
    ><use href="#${PREFIX}${name}" /></svg>`;
}
