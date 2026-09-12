/**
 * The component vocabulary: the handful of shapes every page builds from.
 *
 * `dom.js` holds primitives — escaping, `innerHTML`, a numeric field.
 * This holds components: things with a name in
 * docs/REVAMP-design-direction.md, a documented block in `styles.css`, and
 * one definition here so that a page cannot quietly invent a second version
 * of one.
 */
import { html, raw } from './dom.js';
import { icon } from './icons.js';

/**
 * The head of a page: where it is, what it is for, and the one action that
 * makes the thing it lists. Every page renders one, so the eye lands in the
 * same place each time.
 *
 * `lede` and `actions` are markup, not text: they carry links and buttons, so
 * they are interpolated raw. Build them with the `html` tag — which escapes
 * every value it interpolates — never by concatenating a stored string.
 *
 * @param {{ title: string, lede?: string, actions?: string,
 *   back?: { page: string, label: string } }} spec
 */
export function pageHead({ title, lede = '', actions = '', back }) {
  return html`<div class="page-head">
    ${raw(back
      ? html`<button type="button" class="link link--back" data-act="page"
          data-page="${back.page}">${raw(icon('chevron-left'))}${back.label}</button>`
      : '')}
    <div class="page-head__row">
      <h1>${title}</h1>
      ${raw(actions)}
    </div>
    ${raw(lede ? html`<p class="muted">${raw(lede)}</p>` : '')}
  </div>`;
}

/**
 * A titled block of one page, with an id so something can jump to it.
 *
 * Every panel on a long page needs the same three things and gets them wrong
 * separately otherwise: a heading, an accessible name that matches it, and a
 * stable element id for a jump target. The id is the panel's identity — the
 * page's own panel list, the process rail and the jump menu all address a
 * panel by it — so it is required rather than optional.
 *
 * `title` is text and is escaped. `mark` and `body` are markup: build them
 * with the `html` tag, never by concatenating a stored string. A `mark` sits
 * in the heading and is read as part of the panel's name, which is what a
 * badge saying "approved and frozen" should be.
 *
 * @param {{ id: string, title: string, mark?: string, body: string,
 *   extraClass?: string }} spec
 */
export function panel({ id, title, mark = '', body, extraClass = '' }) {
  return html`<section class="panel ${extraClass}" id="${id}" aria-labelledby="${id}-heading">
    <h2 id="${id}-heading">${title}${raw(mark ? ` ${mark}` : '')}</h2>
    ${raw(body)}
  </section>`;
}

/**
 * The region a wide table lives in.
 *
 * Focusable and named, because a region that scrolls and cannot be focused is
 * unreachable without a mouse — and every table in this app is wide enough to
 * scroll on some viewport. Comparison tables stay tables; they never stack
 * into cards, which would drop the header/cell relationship that is the whole
 * reason they exist.
 *
 * @param {string} label what the table is, for assistive tech
 * @param {string} markup the `<table>`
 * @param {string} [extraClass] e.g. `scroller--tall` when it owns its own
 *   vertical scroll, which is the only case where a sticky header can work
 */
export function scroller(label, markup, extraClass = '') {
  return html`<div class="scroller ${extraClass}" role="group" tabindex="0"
    aria-label="${label}">
      <div class="scroller__hint muted micro" aria-hidden="true">Use arrow keys to navigate within the table</div>
      ${raw(markup)}
    </div>`;
}

/**
 * An empty state: what is not there, and where there is one, the control that
 * fixes it. An invitation to act, never an apology.
 *
 * Two weights, chosen by what you pass rather than by a flag. A whole page or
 * panel with nothing in it gets the block — an icon, and usually the button
 * that fills it. A sub-list inside a panel that happens to be empty gets one
 * quiet line: "no non-labour costs" is not an event worth a bordered box.
 *
 * @param {string} text
 * @param {{ icon?: string, action?: string }} [spec]
 */
export function empty(text, spec = {}) {
  const block = Boolean(spec.icon || spec.action);
  return html`<div class="empty ${block ? '' : 'empty--inline'}">
    ${raw(spec.icon ? icon(spec.icon) : '')}
    <p>${text}</p>
    ${raw(spec.action ?? '')}
  </div>`;
}

/**
 * A short mark on a value.
 *
 * The `kind` is not decoration: one treatment used to carry seven unrelated
 * meanings, which is a large part of why hierarchy was hard to read. Pick the
 * one that says what the mark means.
 *
 * - `neutral` — a name or an abbreviation (an approval track, a phase kind)
 * - `accent` — the current thing (this month)
 * - `info` — a qualification on the value beside it (a custom rate, coverage)
 * - `ok` — settled by the process (approved and frozen)
 * - `warn` — worth a look (skipped, stranded, out of period)
 * - `quiet` — deliberately excluded (not counted, inactive)
 *
 * @param {string} text
 * @param {'neutral'|'accent'|'info'|'ok'|'warn'|'danger'|'quiet'} [kind]
 * @param {string} [iconName]
 */
/** The `badge--<kind>` modifier class, or none for `neutral`. Shared with anything that needs
 * the badge look without the fixed `<span>` shape `badge()` renders — a status menu's trigger
 * button, say. */
export function badgeClass(kind) {
  return kind === 'neutral' ? '' : `badge--${kind}`;
}

export function badge(text, kind = 'neutral', iconName = '') {
  return html`<span class="badge ${badgeClass(kind)}"
    >${raw(iconName ? icon(iconName) : '')}${text}</span>`;
}

/**
 * A column heading that sorts. Three states, because "sortable but unsorted"
 * has to be visible or a sortable column is indistinguishable from a fixed
 * one.
 *
 * The action arrives as an attribute object rather than a bare string, the
 * same way `numberField` takes one: `test/shell.test.mjs` pairs every rendered
 * `data-act` against something that handles it by reading the source, and it
 * can only see an action that is written out literally at its call site.
 *
 * @param {{ key: string, label: string }} column
 * @param {{ key: string, dir: string }} sort
 * @param {Record<string, string>} attrs at least `'data-act'`
 */
export function sortHeader(column, sort, attrs) {
  const on = sort.key === column.key;
  const glyph = on ? (sort.dir === 'asc' ? 'sort-asc' : 'sort-desc') : 'sort';
  const pairs = Object.entries(attrs).map(([key, value]) => html`${key}="${value}"`).join(' ');
  return html`<th aria-sort="${on ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}">
    <button type="button" class="link" ${raw(pairs)} data-key="${column.key}">
      ${column.label}${raw(icon(glyph))}</button></th>`;
}

/**
 * Sort table rows by a `sortHeader` column definition, without mutating the
 * input array.
 *
 * @template T
 * @param {T[]} rows
 * @param {Array<{ key: string, value: (row: T) => unknown }>} columns
 * @param {{ key: string, dir: 'asc'|'desc' }} sort
 * @returns {T[]}
 */
export function sortRows(rows, columns, sort) {
  const column = columns.find((c) => c.key === sort.key) ?? columns[0];
  return [...rows].sort((a, b) => {
    const left = column.value(a);
    const right = column.value(b);
    const cmp = left < right ? -1 : left > right ? 1 : 0;
    return sort.dir === 'desc' ? -cmp : cmp;
  });
}
