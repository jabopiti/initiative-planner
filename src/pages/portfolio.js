import * as F from '../format.js';
/**
 * Portfolio: the read-only cost dashboard across every team.
 */
import * as E from '../engine.js';
import * as L from '../lifecycle.js';
import { PROCESS } from '../process.js';
import { app, view, STATUS_LABELS, currentMonth } from '../app.js';
import { html, raw, fill } from '../render/dom.js';
import { icon } from '../render/icons.js';
import { pageHead, scroller, empty, sortHeader } from '../render/components.js';
import { chartYear, monthsOfYear, yearNav, stackedBarsMarkup } from '../render/charts.js';

const NO_BAND = 'none';

/** Sortable columns for the portfolio table. */
const PORTFOLIO_COLUMNS = [
  { key: 'name', label: 'Name', value: (r) => r.initiative.name.toLowerCase() },
  { key: 'team', label: 'Team', value: (r) => r.teamName.toLowerCase() },
  { key: 'phase', label: 'Phase', value: (r) => r.phaseIndex },
  { key: 'status', label: 'Status', value: (r) => r.initiative.status },
  { key: 'period', label: 'Period', value: (r) => r.period.start ?? '' },
  { key: 'track', label: 'Approval track', value: (r) => r.band?.severity ?? -1 },
  { key: 'approved', label: 'Approved', value: (r) => r.approved ?? -1 },
  { key: 'effective', label: 'Effective', value: (r) => r.effective },
  { key: 'variance', label: 'Variance', value: (r) => r.variance ?? 0 },
];

function portfolioRows() {
  const order = E.phaseOrder(PROCESS);
  return app.INITIATIVES.map((initiative) => {
    const effective = E.grandTotal(initiative, app);
    const passed = L.lastPassedGate(PROCESS, initiative);
    return {
      initiative,
      effective,
      approved: passed ? passed.grandTotal : null,
      variance: passed ? effective - passed.grandTotal : null,
      band: E.resolveBand(PROCESS.bands, effective),
      teamName: app.TEAMS[initiative.teamId]?.name ?? '—',
      phaseIndex: order.indexOf(initiative.phaseId),
      period: E.initiativePeriod(initiative),
    };
  });
}

export function renderPortfolio() {
  const all = portfolioRows();
  const selected = view.params.bandId ?? null;
  const rows = selected ? all.filter((r) => (r.band?.id ?? NO_BAND) === selected) : all;

  // One tile per configured track, plus one for totals no track covers. A
  // track with nothing in it still shows, so the shape of the portfolio is
  // legible rather than inferred from what happens to be there.
  const groups = [
    ...PROCESS.bands.map((band) => ({ id: band.id, name: band.name, abbr: band.abbr })),
    { id: NO_BAND, name: 'Not yet known', abbr: '—' },
  ].map((group) => {
    const members = all.filter((r) => (r.band?.id ?? NO_BAND) === group.id);
    return {
      ...group,
      count: members.length,
      total: members.reduce((t, r) => t + r.effective, 0),
    };
  });

  const tiles = groups
    .map(
      (group) => html`<button type="button"
        class="tile tile--action ${selected === group.id ? 'tile--on' : ''}"
        data-act="portfolio-tile" data-band="${group.id}"
        aria-pressed="${selected === group.id}">
        <span class="tile__value">${F.money(group.total)}</span>
        <span class="tile__label">${group.name}</span>
        <span class="tile__note">${group.count} initiative${group.count === 1 ? '' : 's'}</span>
      </button>`,
    )
    .join('');

  // The chart shows active work only — on-hold and cancelled initiatives keep
  // their costs but are not what the portfolio is spending now (SPEC §3).
  const charted = rows.map((r) => r.initiative).filter((i) => i.status === 'active');
  const data = E.runRate(app, charted, monthsOfYear(chartYear()));
  const yearTotal = data.reduce((t, row) => t + row.total, 0);

  // Capacity is read for the current month, not the chart's selected year —
  // it is a "right now" question, independent of which year the cost chart
  // happens to be showing (SPEC §7).
  const capacityMonth = currentMonth();
  const { overCapacity, overShare } = E.overAllocations(app, capacityMonth);

  const sort = view.params.sort ?? { key: 'effective', dir: 'desc' };
  const column = PORTFOLIO_COLUMNS.find((c) => c.key === sort.key) ?? PORTFOLIO_COLUMNS[0];
  const sorted = [...rows].sort((a, b) => {
    const left = column.value(a);
    const right = column.value(b);
    const cmp = left < right ? -1 : left > right ? 1 : 0;
    return sort.dir === 'desc' ? -cmp : cmp;
  });

  const headers = PORTFOLIO_COLUMNS.map(
    (c) => sortHeader(c, sort, { 'data-act': 'sort-portfolio' }),
  ).join('');

  const body = sorted
    .map(
      (r) => html`<tr class="row--clickable">
        <td><a class="row-link" href="#/initiative/${r.initiative.id}">${r.initiative.name}</a></td>
        <td>${r.teamName}</td>
        <td>${E.phaseLabel(PROCESS, r.initiative.phaseId)}</td>
        <td>${STATUS_LABELS[r.initiative.status]}</td>
        <td>${r.period.start ? `${F.date(r.period.start)} → ${r.period.end ? F.date(r.period.end) : '?'}` : '—'}</td>
        <td>${r.band ? r.band.name : 'Not yet known'}</td>
        <td class="num">${r.approved === null ? '—' : F.money(r.approved)}</td>
        <td class="num">${F.money(r.effective)}
          <span class="micro">${E.initiativeCoverage(r.initiative)}</span></td>
        <td class="num ${r.variance > 0 ? 'over' : ''}">${r.variance === null
          ? '—'
          : `${r.variance > 0 ? '+' : ''}${F.money(r.variance)}`}</td>
      </tr>`,
    )
    .join('');

  fill(
    'root',
    html`${raw(pageHead({
      title: 'Portfolio',
      lede: 'Cost and capacity across every team, read-only.',
    }))}

      <div class="tiles">${raw(tiles)}</div>
      ${raw(selected
        // The funnel says what a reader cannot otherwise tell: that this is
        // not everything.
        ? html`<p class="muted actions">${raw(icon('filter', 'icon--lead'))}Filtered to
            ${groups.find((g) => g.id === selected)?.name}.
            <button type="button" class="link" data-act="portfolio-tile"
              data-band="${F.month(selected)}">Clear</button></p>`
        : '')}

      <div class="panel">
        <h2>Cost per month</h2>
        ${raw(yearNav(`${F.money(yearTotal)} across ${chartYear()}, active initiatives only.`))}
        ${raw(yearTotal === 0
          ? empty('No active initiative costs anything in this year.', { icon: 'warning' })
          : stackedBarsMarkup(data, 'portfolioCost', 'Cost per month'))}
      </div>

      <div class="panel">
        <h2>Capacity this month</h2>
        <p class="muted">Over-allocation across every team and person, right now
          (${F.month(capacityMonth)}). <a href="#/capacity" class="link">Full breakdown</a></p>
        <div class="tiles">
          <div class="tile ${overCapacity.length ? 'tile--warn' : ''}">
            <span class="tile__value">${overCapacity.length}</span>
            <span class="tile__label">over capacity</span>
          </div>
          <div class="tile ${overShare.length ? 'tile--warn' : ''}">
            <span class="tile__value">${overShare.length}</span>
            <span class="tile__label">over their team's share</span>
          </div>
        </div>
      </div>

      <div class="panel">
        <h2>Initiatives</h2>
        ${raw(sorted.length
          ? scroller('Initiatives by cost', html`<table class="grid">
              <thead><tr>${raw(headers)}</tr></thead>
              <tbody>${raw(body)}</tbody></table>`)
          : empty('Nothing to show.'))}
      </div>`,
  );
}
