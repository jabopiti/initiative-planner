import * as F from '../format.js';
/**
 * Initiatives: the sortable, filterable registry of every initiative.
 */
import * as E from '../engine.js';
import * as L from '../lifecycle.js';
import { PROCESS } from '../process.js';
import { app, view, STATUS_LABELS, STATUS_BADGE_KIND } from '../app.js';
import { html, raw, fill } from '../render/dom.js';
import { icon } from '../render/icons.js';
import { pageHead, scroller, empty, sortHeader, sortRows, badge, badgeClass } from '../render/components.js';

/**
 * Sortable columns, each with how to read the value it sorts on. `status` is
 * last: it renders as the last column in the table, a badge that reads as a
 * state rather than a form field (§4.5).
 */
const INITIATIVE_COLUMNS = [
  { key: 'name', label: 'Name', value: (row) => row.initiative.name.toLowerCase() },
  { key: 'team', label: 'Team', value: (row) => row.teamName.toLowerCase() },
  { key: 'phase', label: 'Phase', value: (row) => row.phaseIndex },
  { key: 'track', label: 'Approval track', value: (row) => row.band?.severity ?? -1 },
  { key: 'total', label: 'Total', value: (row) => row.total },
  { key: 'status', label: 'Status', value: (row) => row.initiative.status },
];

export function renderInitiatives() {
  const filters = view.params.filters ?? {};
  const sort = view.params.sort ?? { key: 'name', dir: 'asc' };
  const query = (filters.q ?? '').toLowerCase();
  const order = E.phaseOrder(PROCESS);

  const filtered = app.INITIATIVES.map((initiative) => {
    const total = E.grandTotal(initiative, app);
    return {
      initiative,
      total,
      band: E.resolveBand(PROCESS.bands, total),
      teamName: app.TEAMS[initiative.teamId]?.name ?? '—',
      phaseIndex: order.indexOf(initiative.phaseId),
      coverage: E.initiativeCoverage(initiative),
      // An initiative whose costed phases are not all estimated cannot pass
      // a gate that requires them. Most often that is one the creation
      // wizard was walked away from, which used to leave nothing behind to
      // say so (§2.6).
      unestimated: L.unestimatedPhases(PROCESS, initiative).length,
    };
  }).filter((row) => {
    if (filters.teamId && row.initiative.teamId !== filters.teamId) return false;
    if (filters.phaseId && row.initiative.phaseId !== filters.phaseId) return false;
    if (filters.bandId && (row.band?.id ?? 'none') !== filters.bandId) return false;
    // An explicit status filter always wins. Otherwise finished work is
    // hidden by default — the registry would otherwise only ever grow — and
    // the checkbox is the one way back in, rather than "All" silently
    // including it (§4.5).
    if (filters.status) {
      if (row.initiative.status !== filters.status) return false;
    } else if (!filters.showFinished
      && (row.initiative.status === 'closed' || row.initiative.status === 'cancelled')) {
      return false;
    }
    if (query && !row.initiative.name.toLowerCase().includes(query)) return false;
    return true;
  });

  const rows = sortRows(filtered, INITIATIVE_COLUMNS, sort);

  // Status renders last: sortable like every other column, but its `<th>`
  // sits after the unlabelled action column so the badge lands where the
  // finding asks for it (§4.5).
  const dataColumns = INITIATIVE_COLUMNS.filter((c) => c.key !== 'status');
  const statusColumn = INITIATIVE_COLUMNS.find((c) => c.key === 'status');
  const headers = dataColumns.map(
    (c) => sortHeader(c, sort, { 'data-act': 'sort' }),
  ).join('') + '<th></th>' + sortHeader(statusColumn, sort, { 'data-act': 'sort' });

  const body = rows
    .map(
      (row) => html`<tr class="row--clickable">
        <td><a class="row-link" href="#/initiative/${row.initiative.id}">${row.initiative.name}</a>
          ${raw(row.unestimated ? badge('needs an estimate', 'warn', 'warning') : '')}</td>
        <td>${row.teamName}</td>
        <td>${E.phaseLabel(PROCESS, row.initiative.phaseId)}</td>
        <td>${row.band ? row.band.name : 'Not yet known'}</td>
        <td class="num">${F.money(row.total)}
          <span class="micro">${row.coverage}</span></td>
        <td class="cell--action">
          <button type="button" class="btn--small" data-act="duplicate-initiative"
            data-id="${row.initiative.id}">${raw(icon('duplicate'))}Duplicate</button></td>
        <td>${raw(statusCellMarkup(row.initiative))}</td>
      </tr>`,
    )
    .join('');

  const options = (name, list, selected) =>
    html`<select class="field field--select" data-act="filter" data-filter="${name}">
      <option value="">All</option>
      ${raw(list.map((o) => html`<option value="${o.value}"
        ${raw(selected === o.value ? 'selected' : '')}>${o.label}</option>`).join(''))}
    </select>`;

  fill(
    'root',
    html`${raw(pageHead({
      title: 'Initiatives',
      lede: 'Every initiative in the tool, whatever phase or status it is in.',
      actions: html`<button type="button" class="btn btn--primary" data-act="wizard-start">
        ${raw(icon('add'))}New initiative</button>`,
    }))}
      <div class="toolbar">
        <label class="field-inline">${raw(icon('search'))}<span class="sr-only">Search</span>
          <input class="field field--search" data-act="filter" data-filter="q"
            value="${filters.q ?? ''}" placeholder="Search by name" /></label>
        <label class="field-inline"><span>Team</span>${raw(options('teamId',
          Object.values(app.TEAMS).map((t) => ({ value: t.id, label: t.name })),
          filters.teamId))}</label>
        <label class="field-inline"><span>Phase</span>${raw(options('phaseId',
          PROCESS.phases.map((p) => ({ value: p.id, label: p.label })),
          filters.phaseId))}</label>
        <label class="field-inline"><span>Status</span>${raw(options('status',
          Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label })),
          filters.status))}</label>
        <label class="field-inline"><span>Track</span>${raw(options('bandId',
          [...PROCESS.bands.map((b) => ({ value: b.id, label: b.name })),
           { value: 'none', label: 'Not yet known' }],
          filters.bandId))}</label>
        <label class="field-inline"><input type="checkbox" data-act="filter"
          data-filter="showFinished" ${raw(filters.showFinished ? 'checked' : '')} />
          <span>Show closed &amp; cancelled</span></label>
      </div>
      ${raw(app.INITIATIVES.length === 0
        ? empty('Nothing here yet. An initiative is where a cost and a team meet.', {
            icon: 'add',
            action: html`<button type="button" class="btn btn--primary" data-act="wizard-start">
              ${raw(icon('add'))}New initiative</button>`,
          })
        : rows.length === 0
          ? empty('No initiative matches those filters.', { icon: 'filter' })
          : scroller('Initiatives', html`<table class="grid">
              <thead><tr>${raw(headers)}</tr></thead>
              <tbody>${raw(body)}</tbody></table>`))}`,
  );
}

/**
 * The status column's cell: a badge that opens a menu rather than a form
 * field, so it reads as a state at a glance (§4.5). Closed has nowhere left
 * to go from here — reopening is a gate action, on the initiative itself —
 * so it renders as a plain, non-interactive badge.
 */
function statusCellMarkup(initiative) {
  const label = STATUS_LABELS[initiative.status];
  const kind = STATUS_BADGE_KIND[initiative.status];
  if (initiative.status === 'closed') return badge(label, kind);
  return html`<button type="button" class="badge badge--button ${badgeClass(kind)}"
    data-act="status-menu" data-id="${initiative.id}" aria-haspopup="menu">
    ${label}${raw(icon('chevron-down'))}</button>`;
}

/** The status badge's menu: switch directly, or arm a confirm for Cancelled. */
export function statusMenuMarkup(initiativeId) {
  const initiative = app.INITIATIVES.find((i) => i.id === initiativeId);
  const options = ['active', 'on-hold', 'cancelled'].filter((s) => s !== initiative.status);
  return html`<h3>Status</h3>
    <div class="popover__actions">
      ${raw(options.map((status) => status === 'cancelled'
        ? html`<button type="button" class="btn" data-act="status-cancel-arm"
            data-id="${initiative.id}">${raw(icon('remove'))}Cancel this initiative…</button>`
        : html`<button type="button" class="btn" data-act="status-set"
            data-id="${initiative.id}" data-status="${status}">${STATUS_LABELS[status]}</button>`)
        .join(''))}
    </div>`;
}

/**
 * Cancelling should not be one stray click (§4.5) — a second, explicit step
 * inside the same popover, rather than a whole-page arm/confirm: nothing
 * else on this row needs to survive the round trip.
 */
export function statusCancelConfirmMarkup(initiativeId) {
  const initiative = app.INITIATIVES.find((i) => i.id === initiativeId);
  return html`<h3>Cancel “${initiative.name}”?</h3>
    <p class="muted">Cancelling freezes it. Set the status back to Active from here to work on
      it again.</p>
    <div class="popover__actions">
      <button type="button" class="btn btn--danger" data-act="status-cancel-confirm"
        data-id="${initiative.id}">${raw(icon('remove'))}Cancel initiative</button>
      <button type="button" class="btn" data-act="status-cancel-abort">Never mind</button>
    </div>`;
}
