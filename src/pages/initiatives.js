import * as F from '../format.js';
/**
 * Initiatives: the sortable, filterable registry of every initiative.
 */
import * as E from '../engine.js';
import { PROCESS } from '../process.js';
import { app, view, STATUS_LABELS } from '../app.js';
import { html, raw, fill } from '../render/dom.js';
import { icon } from '../render/icons.js';
import { pageHead, scroller, empty, sortHeader } from '../render/components.js';

/** Sortable columns, each with how to read the value it sorts on. */
const INITIATIVE_COLUMNS = [
  { key: 'name', label: 'Name', value: (row) => row.initiative.name.toLowerCase() },
  { key: 'team', label: 'Team', value: (row) => row.teamName.toLowerCase() },
  { key: 'phase', label: 'Phase', value: (row) => row.phaseIndex },
  { key: 'status', label: 'Status', value: (row) => row.initiative.status },
  { key: 'track', label: 'Approval track', value: (row) => row.band?.severity ?? -1 },
  { key: 'total', label: 'Total', value: (row) => row.total },
];

export function renderInitiatives() {
  const filters = view.params.filters ?? {};
  const sort = view.params.sort ?? { key: 'name', dir: 'asc' };
  const query = (filters.q ?? '').toLowerCase();
  const order = E.phaseOrder(PROCESS);

  let rows = app.INITIATIVES.map((initiative) => {
    const total = E.grandTotal(initiative, app);
    return {
      initiative,
      total,
      band: E.resolveBand(PROCESS.bands, total),
      teamName: app.TEAMS[initiative.teamId]?.name ?? '—',
      phaseIndex: order.indexOf(initiative.phaseId),
      coverage: E.initiativeCoverage(initiative),
    };
  }).filter((row) => {
    if (filters.teamId && row.initiative.teamId !== filters.teamId) return false;
    if (filters.phaseId && row.initiative.phaseId !== filters.phaseId) return false;
    if (filters.status && row.initiative.status !== filters.status) return false;
    if (filters.bandId && (row.band?.id ?? 'none') !== filters.bandId) return false;
    if (query && !row.initiative.name.toLowerCase().includes(query)) return false;
    return true;
  });

  const column = INITIATIVE_COLUMNS.find((c) => c.key === sort.key) ?? INITIATIVE_COLUMNS[0];
  rows.sort((a, b) => {
    const left = column.value(a);
    const right = column.value(b);
    const cmp = left < right ? -1 : left > right ? 1 : 0;
    return sort.dir === 'desc' ? -cmp : cmp;
  });

  const headers = INITIATIVE_COLUMNS.map(
    (c) => sortHeader(c, sort, { 'data-act': 'sort-initiatives' }),
  ).join('');

  const body = rows
    .map(
      (row) => html`<tr class="row--clickable">
        <td><a class="row-link" href="#/initiative/${row.initiative.id}">${row.initiative.name}</a></td>
        <td>${row.teamName}</td>
        <td>${E.phaseLabel(PROCESS, row.initiative.phaseId)}</td>
        <td>
          <select class="field field--select" data-act="initiative-status"
            data-id="${row.initiative.id}"
            ${raw(row.initiative.status === 'closed' ? 'disabled' : '')}
            aria-label="Status">
            ${raw(['active', 'on-hold', 'cancelled']
              .map((status) => html`<option value="${status}"
                ${raw(row.initiative.status === status ? 'selected' : '')}>
                ${STATUS_LABELS[status]}</option>`)
              .join(''))}
            ${raw(row.initiative.status === 'closed'
              ? html`<option value="closed" selected>Closed</option>`
              : '')}
          </select>
        </td>
        <td>${row.band ? row.band.name : 'Not yet known'}</td>
        <td class="num">${F.money(row.total)}
          <span class="micro">${row.coverage}</span></td>
        <td class="cell--action">
          <button type="button" class="btn--small" data-act="duplicate-initiative"
            data-id="${row.initiative.id}">${raw(icon('duplicate'))}Duplicate</button></td>
      </tr>`,
    )
    .join('');

  const options = (name, list, selected) =>
    html`<select class="field field--select" data-act="initiatives-filter" data-filter="${name}">
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
          <input class="field field--search" data-act="initiatives-filter" data-filter="q"
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
              <thead><tr>${raw(headers)}<th></th></tr></thead>
              <tbody>${raw(body)}</tbody></table>`))}`,
  );
}
