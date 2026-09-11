import * as F from '../format.js';
/**
 * Year navigation and the stacked-bar chart primitive, shared by the
 * Portfolio and team run-rate charts so the two read identically and a fix
 * or a future chart type only has to happen once (§4.5). Built following the
 * `dataviz` skill: an axis with a real scale, gridlines, rounded data-ends
 * with a surface gap between segments, and a table view as the accessible,
 * exact-figures twin of the picture.
 */
import * as E from '../engine.js';
import { app, view } from '../app.js';
import { html, raw } from './dom.js';
import { icon } from './icons.js';
import { TABLES, tableActions } from './tables.js';

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
  // Icon-only, so each carries its name as an aria-label and a tooltip.
  // Stepping a year destroys nothing, which is what lets them lose the word.
  return html`<div class="toolbar">
    <button type="button" class="btn btn--small btn--icon" data-act="year-step" data-step="-1"
      ${raw(year <= years[0] ? 'disabled' : '')} aria-label="Previous year"
      title="Previous year">${raw(icon('chevron-left'))}</button>
    <strong class="num">${year}</strong>
    <button type="button" class="btn btn--small btn--icon" data-act="year-step" data-step="1"
      ${raw(year >= years.at(-1) ? 'disabled' : '')} aria-label="Next year"
      title="Next year">${raw(icon('chevron-right'))}</button>
    <button type="button" class="btn btn--small" data-act="year-today">Today</button>
    <span class="muted">${label}</span>
  </div>`;
}

/**
 * A "nice" round number at or above `value` — 1, 2, 5 or 10 times a power of
 * ten — so an axis reads 0 / 25,000 / 50,000 rather than a scale jagged to
 * whatever the data happened to total.
 */
function niceMax(value) {
  if (value <= 0) return 1;
  const exponent = Math.floor(Math.log10(value));
  const base = 10 ** exponent;
  const fraction = value / base;
  const step = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  return step * base;
}

/** An SVG path: rounded top corners, square at the baseline (mark spec: a
 * bar's data-end is rounded, its foot never is). Doubles as a full segment
 * outline when there is only one, which is exactly what that case needs. */
function roundedTopRect(x, y, w, h, r) {
  const radius = Math.max(0, Math.min(r, w / 2, h));
  return `M${x},${y + h} L${x},${y + radius} Q${x},${y} ${x + radius},${y} `
    + `L${x + w - radius},${y} Q${x + w},${y} ${x + w},${y + radius} `
    + `L${x + w},${y + h} Z`;
}

const CHART_W = 700;
const CHART_H = 200;
const CHART_MARGIN = { top: 12, right: 8, bottom: 24, left: 68 };
const CHART_TICKS = 4;
const CHART_GAP = 2;

/**
 * A stacked bar chart as SVG: an axis with a real scale, gridlines, and
 * rounded data-ends with a surface gap between segments, in place of the
 * old bars, which carried no axis, no gridlines, no scale and no value
 * except on hover (§4.5). Shared by the Portfolio chart and every team's
 * run rate, so the two still read identically and a future chart type
 * starts from the same primitive.
 *
 * `key` and `label` name the chart for its "view as table" toggle and the
 * copy action on that table — every value the picture shows is also reachable
 * there, which is what lets the chart itself skip a per-segment keyboard
 * story (dataviz: "a table view exists").
 *
 * @param {Array<{month: string, segments: Array<{name: string, cost: number, kind?: string}>, total: number}>} data
 * @param {string} key a stable, DOM-id-safe name for this chart instance
 * @param {string} label what the chart is, for its table's name and caption
 */
export function stackedBarsMarkup(data, key, label) {
  const max = Math.max(...data.map((row) => row.total), 0);
  const scaleMax = niceMax(max);
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

  const plotW = CHART_W - CHART_MARGIN.left - CHART_MARGIN.right;
  const plotH = CHART_H - CHART_MARGIN.top - CHART_MARGIN.bottom;
  const bandW = plotW / data.length;
  const barW = Math.min(24, bandW * 0.6);
  const yFor = (cost) => CHART_MARGIN.top + plotH * (1 - cost / scaleMax);
  const baseline = CHART_MARGIN.top + plotH;

  const gridlines = Array.from({ length: CHART_TICKS + 1 }, (_, i) => {
    const value = (scaleMax * i) / CHART_TICKS;
    const y = yFor(value);
    return html`<line class="chart-grid" x1="${CHART_MARGIN.left}" x2="${CHART_W - CHART_MARGIN.right}"
        y1="${y}" y2="${y}" />
      <text class="chart-axis-label" x="${CHART_MARGIN.left - 8}" y="${y}" text-anchor="end"
        dominant-baseline="middle">${F.money(value)}</text>`;
  }).join('');

  const bars = data
    .map((row, i) => {
      const x = CHART_MARGIN.left + bandW * i + (bandW - barW) / 2;
      const withCost = row.segments.filter((s) => s.cost > 0);
      let cumulative = 0;
      const segs = withCost
        .map((segment, segIndex) => {
          const isTop = segIndex === withCost.length - 1;
          const isBottom = segIndex === 0;
          const naturalTop = yFor(cumulative + segment.cost);
          const naturalBottom = cumulative === 0 ? baseline : yFor(cumulative);
          cumulative += segment.cost;
          const top = naturalTop + (isTop ? 0 : CHART_GAP / 2);
          const bottom = naturalBottom - (isBottom ? 0 : CHART_GAP / 2);
          const height = Math.max(0, bottom - top);
          const title = `${segment.name}: ${F.money(segment.cost)}`;
          // Only the topmost segment needs the rounded-top path (a bar with
          // one segment is its own topmost, which is exactly what should be
          // rounded top / square bottom).
          return isTop
            ? html`<path class="chart-seg" style="fill:${tone(segment)}"
                d="${roundedTopRect(x, top, barW, height, 4)}"><title>${title}</title></path>`
            : html`<rect class="chart-seg" style="fill:${tone(segment)}"
                x="${x}" y="${top}" width="${barW}" height="${height}"><title>${title}</title></rect>`;
        })
        .join('');
      const monthLabel = row.month.slice(5);
      return html`<g>
        ${raw(segs)}
        <text class="chart-month-label ${row.month === now ? 'chart-month-label--now' : ''}"
          x="${x + barW / 2}" y="${CHART_H - 6}" text-anchor="middle">${monthLabel}</text>
      </g>`;
    })
    .join('');

  const svg = html`<svg class="chart-svg" viewBox="0 0 ${CHART_W} ${CHART_H}" role="img"
      aria-label="${label}: ${F.money(data.reduce((t, r) => t + r.total, 0))} shown">
    ${raw(gridlines)}
    ${raw(bars)}
  </svg>`;

  const seen = new Map();
  for (const row of data) for (const s of row.segments) seen.set(s.name, s);
  const legend = [...seen.values()]
    .map(
      (segment) => html`<span class="legend__item">
        <span class="swatch" style="background:${tone(segment)}"></span> ${segment.name}</span>`,
    )
    .join('');

  const seriesNames = [...seen.keys()];
  const tableHeaders = ['Month', ...seriesNames, 'Total'];
  TABLES[key] = {
    name: key,
    headers: tableHeaders,
    rows: data.map((row) => {
      const byName = Object.fromEntries(row.segments.map((s) => [s.name, s.cost]));
      return [
        F.month(row.month),
        ...seriesNames.map((name) => Math.round(byName[name] ?? 0)),
        Math.round(row.total),
      ];
    }),
  };
  const table = html`<table class="grid">
    <thead><tr>${raw(tableHeaders.map((h) => html`<th>${h}</th>`).join(''))}</tr></thead>
    <tbody>${raw(TABLES[key].rows
      .map((cells) => html`<tr>${raw(cells.map((c, i) => html`<td${raw(i > 0 ? ' class="num"' : '')}
        >${typeof c === 'number' ? F.money(c) : c}</td>`).join(''))}</tr>`)
      .join(''))}</tbody>
  </table>`;

  return html`<div class="chart-block" data-chart="${key}">
    <div class="chart-block__visual">${raw(svg)}<p class="legend">${raw(legend)}</p></div>
    <div class="chart-block__table" hidden>${raw(table)}${raw(tableActions(key, label))}</div>
    <button type="button" class="btn btn--small" data-act="chart-table-toggle">
      View as table</button>
  </div>`;
}
