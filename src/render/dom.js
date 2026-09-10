/**
 * Presentation primitives shared by every render module: safe HTML
 * templating, the one place `innerHTML` is assigned, and the numeric-field
 * pattern AGENTS.md requires (a text input, never `type="number"`).
 */
import * as E from '../engine.js';


/**
 * Tagged template that escapes every interpolation. Using this rather than
 * raw `innerHTML` is what makes the escaping invariant structural: there is
 * no way to interpolate a value and forget to escape it.
 *
 * Wrap a value in `raw()` to opt out — only ever for markup this file built.
 */
export function html(strings, ...values) {
  return strings.reduce((out, chunk, i) => {
    if (i === 0) return chunk;
    const value = values[i - 1];
    const rendered = Array.isArray(value)
      ? value.map((v) => (v?.__raw ? v.value : E.escapeHtml(v))).join('')
      : value?.__raw
        ? value.value
        : E.escapeHtml(value);
    return out + rendered + chunk;
  }, '');
}

/** Mark already-safe markup so `html` leaves it alone. */
export function raw(value) {
  return { __raw: true, value };
}

/** Replace a region's contents. The only place innerHTML is assigned. */
export function fill(target, markup) {
  const node = typeof target === 'string' ? document.getElementById(target) : target;
  if (node) node.innerHTML = markup;
  return node;
}

/**
 * A numeric field is a text input with `inputmode="numeric"`, never
 * `type="number"` — caret handling depends on it (AGENTS.md).
 */
export function numberField(attrs) {
  const { value, extraClass = '', ...rest } = attrs;
  const pairs = Object.entries(rest)
    .map(([key, val]) => html`${key}="${val}"`)
    .join(' ');
  return html`<input type="text" inputmode="numeric"
    class="field field--num ${extraClass}"
    value="${value ?? ''}" ${raw(pairs)} />`;
}
