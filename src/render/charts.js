/**
 * Year navigation and the stacked-bar chart primitive, shared by the
 * Portfolio and team run-rate charts so the two read identically.
 */
import * as E from '../engine.js';
import { app, view } from '../app.js';
import { html, raw, money } from './dom.js';

/**
 * Years a chart may show: the rolling window the data actually covers
 * (DESIGN §2). Navigating past it would only ever show an empty chart.
 */
function trackedYears() {
  const years = new Set();
  for (const country of Object.values(app.COUNTRIES)) {
    for (const year of Object.keys(country.byYear)) years.add(Number(year));
  }
  return [...years].sort((a, b) => a - b);
}

/** The year currently being viewed, clamped to the tracked window. */
export function chartYear() {
  const years = trackedYears();
  const wanted = view.params.year ?? new Date().getFullYear();
  return Math.min(Math.max(wanted, years[0]), years.at(-1));
}

export function monthsOfYear(year) {
  return Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);
}

export function yearNav(label) {
  const year = chartYear();
  const years = trackedYears();
  return html`<div class="toolbar">
    <button type="button" class="btn btn--small" data-act="year-step" data-step="-1"
      ${raw(year <= years[0] ? 'disabled' : '')} aria-label="Previous year">←</button>
    <strong>${year}</strong>
    <button type="button" class="btn btn--small" data-act="year-step" data-step="1"
      ${raw(year >= years.at(-1) ? 'disabled' : '')} aria-label="Next year">→</button>
    <button type="button" class="btn btn--small" data-act="year-today">Today</button>
    <span class="muted">${label}</span>
  </div>`;
}

/**
 * A stacked bar per month, one segment per initiative plus non-initiative
 * work. Hand-rolled: the single-file constraint rules out a chart library.
 */
/**
 * A stacked bar per month. Hand-rolled: the single-file constraint rules out
 * a charting library. Shared by the team run-rate and the Portfolio chart, so
 * the two read identically.
 *
 * @param {Array<{month: string, segments: Array<{name: string, cost: number, kind?: string}>, total: number}>} data
 */
export function stackedBarsMarkup(data) {
  const max = Math.max(...data.map((row) => row.total), 1);
  const now = E.monthKey(new Date());

  // Colours cycle through chart tokens, so any number of segments works.
  // Segments are told apart by `kind`, never by their label — labels are free
  // to change, ids and kinds are not.
  const cycling = [...new Set(
    data.flatMap((row) => row.segments.filter((s) => s.kind !== 'spare').map((s) => s.name)),
  )];
  const tone = (segment) =>
    segment.kind === 'spare'
      ? 'var(--chart-spare)'
      : `var(--chart-${(cycling.indexOf(segment.name) % 6) + 1})`;

  const bars = data
    .map((row) => {
      const stack = row.segments
        .map(
          (segment) => html`<span class="bars__seg"
            style="height:${(segment.cost / max) * 100}%;background:${tone(segment)}"
            title="${segment.name}: ${money(segment.cost)}"></span>`,
        )
        .join('');
      return html`<div class="bars__col ${row.month === now ? 'bars__col--now' : ''}"
        title="${row.month}: ${money(row.total)}">
        <div class="bars__stack">${raw(stack)}</div>
        <span class="bars__label">${row.month.slice(5)}</span>
      </div>`;
    })
    .join('');

  const seen = new Map();
  for (const row of data) for (const s of row.segments) seen.set(s.name, s);
  const legend = [...seen.values()]
    .map(
      (segment) => html`<span class="legend__item">
        <span class="swatch" style="background:${tone(segment)}"></span> ${segment.name}</span>`,
    )
    .join('');

  return html`<div class="bars">${raw(bars)}</div><p class="legend">${raw(legend)}</p>`;
}
