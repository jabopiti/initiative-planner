// stackedBarsMarkup() is shared by the Portfolio cost chart and every team's
// run-rate chart. Both can carry more distinct series than the chart has
// colors for — a team or portfolio scope with 7+ concurrently active
// initiatives in one month — so the fold that keeps the picture's series
// distinguishable is tested here directly against the render function,
// independent of the engine and of any particular brand pack.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { stackedBarsMarkup } from '../src/render/charts.js';
import { TABLES } from '../src/render/tables.js';
import * as F from '../src/format.js';

/** One month's segments for `count` concurrently active initiatives. */
function initiativeSegments(count) {
  return Array.from({ length: count }, (_, i) => ({
    id: `init_${i + 1}`,
    name: `Initiative ${i + 1}`,
    // Descending cost: Initiative 1 is the most expensive, so the fold's
    // "keep the top 5" rule has an unambiguous ranking to assert against.
    cost: (count - i) * 100,
    kind: 'initiative',
  }));
}

const spareSegment = (cost) =>
  ({ id: 'non-initiative', name: 'Non-initiative work', cost, kind: 'spare' });

const swatchColors = (markup) => [...markup.matchAll(/swatch" style="background:([^"]+)"/g)]
  .map((m) => m[1]);
const legendNames = (markup) => [...markup.matchAll(/legend__item">\s*<span[^>]*><\/span> ([^<]+)/g)]
  .map((m) => m[1]);
const segColors = (markup) => [...markup.matchAll(/fill:([^"]+)"[\s\S]*?<title>([^:]+):/g)]
  .map((m) => ({ name: m[2], color: m[1] }));

test('a chart with 6 or fewer series keeps each its own color, unfolded', () => {
  const segments = initiativeSegments(6);
  const total = segments.reduce((t, s) => t + s.cost, 0);
  const markup = stackedBarsMarkup([{ month: '2026-01', segments, total }], 'test6', 'Test');

  assert.deepEqual(legendNames(markup), segments.map((s) => s.name));
  assert.equal(new Set(swatchColors(markup)).size, 6);
  assert.ok(!markup.includes('Other'));
  // The table stays the accessible, exact-figures twin regardless of fold.
  assert.deepEqual(TABLES.test6.headers, ['Month', ...segments.map((s) => s.name), 'Total']);
});

test('7+ concurrently active initiatives in one month fold the picture into Other', () => {
  const segments = initiativeSegments(7);
  const total = segments.reduce((t, s) => t + s.cost, 0);
  const markup = stackedBarsMarkup([{ month: '2026-01', segments, total }], 'test7', 'Test');

  // Top 5 (700..300) keep their names in the picture; the bottom two fold away.
  assert.deepEqual(
    legendNames(markup),
    ['Initiative 1', 'Initiative 2', 'Initiative 3', 'Initiative 4', 'Initiative 5', 'Other'],
  );
  assert.deepEqual(
    segColors(markup).map((s) => s.name),
    ['Initiative 1', 'Initiative 2', 'Initiative 3', 'Initiative 4', 'Initiative 5', 'Other'],
  );

  // No more than 6 distinct colors in the picture — that's the whole point.
  assert.equal(new Set(swatchColors(markup)).size, 6);

  // Other carries exactly the folded cost (200 + 100).
  assert.ok(markup.includes(`<title>Other: ${F.money(300)}</title>`));
  // Folding only regroups segments in the picture — it never drops cost, and
  // the axis label is built from the unfolded total.
  assert.ok(markup.includes(`${F.money(total)} shown`));

  // The table view is the exact, unfolded twin: every one of the 7 series
  // still gets its own column, "Other" appears nowhere in it.
  assert.deepEqual(
    TABLES.test7.headers,
    ['Month', 'Initiative 1', 'Initiative 2', 'Initiative 3', 'Initiative 4', 'Initiative 5',
      'Initiative 6', 'Initiative 7', 'Total'],
  );
  assert.deepEqual(TABLES.test7.rows[0], [F.month('2026-01'), 700, 600, 500, 400, 300, 200, 100, 2800]);
});

test('folding leaves non-initiative work alone, in the picture and the table', () => {
  const segments = [...initiativeSegments(7), spareSegment(50)];
  const total = segments.reduce((t, s) => t + s.cost, 0);
  const markup = stackedBarsMarkup([{ month: '2026-01', segments, total }], 'testSpare', 'Test');

  assert.deepEqual(
    legendNames(markup),
    ['Initiative 1', 'Initiative 2', 'Initiative 3', 'Initiative 4', 'Initiative 5', 'Other',
      'Non-initiative work'],
  );
  // Non-initiative work is never folded into Other, and keeps its own token.
  assert.ok(markup.includes('swatch" style="background:var(--chart-spare)"'));
  assert.ok(markup.includes(`<title>Non-initiative work: ${F.money(50)}</title>`));
  assert.ok(markup.includes(`<title>Other: ${F.money(300)}</title>`));

  // At most the 6 chart tokens for non-spare series, plus the spare token —
  // 7 distinct colors total, never a collision between two series.
  assert.equal(new Set(swatchColors(markup)).size, 7);

  assert.deepEqual(
    TABLES.testSpare.headers,
    ['Month', 'Initiative 1', 'Initiative 2', 'Initiative 3', 'Initiative 4', 'Initiative 5',
      'Initiative 6', 'Initiative 7', 'Non-initiative work', 'Total'],
  );
});

test('a series keeps the same color in every column it appears in', () => {
  const busy = { month: '2026-01', segments: initiativeSegments(7),
    total: initiativeSegments(7).reduce((t, s) => t + s.cost, 0) };
  const quiet = { month: '2026-02', segments: initiativeSegments(2), total: 300 };
  const markup = stackedBarsMarkup([busy, quiet], 'testCross', 'Test');

  // Initiative 1 and 2 exist in both months and must resolve to the same
  // color in both — the fold ranks by total cost across the whole chart,
  // not per month, so a series' color never shifts between columns.
  const colors = segColors(markup);
  const colorsOf = (name) => colors.filter((s) => s.name === name).map((s) => s.color);

  assert.equal(colorsOf('Initiative 1').length, 2);
  assert.equal(colorsOf('Initiative 1')[0], colorsOf('Initiative 1')[1]);
  assert.equal(colorsOf('Initiative 2')[0], colorsOf('Initiative 2')[1]);
});
