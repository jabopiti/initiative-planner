/**
 * Render layer: view state, the single dispatch, and the page renderers.
 *
 * Structure follows DESIGN.md §5. A **region** is the unit of structural
 * rebuild — a render function owns one container and replaces its contents
 * wholesale. Anything finer than a region (a recalculated total, a warning
 * appearing) is written into an existing node in place, so typing never
 * rebuilds the input under the caret.
 */

import * as E from './engine.js';
import * as L from './lifecycle.js';
import * as T from './transfer.js';
import * as P from './people.js';
import * as store from './store.js';
import { PROCESS } from './process.js';

/* ------------------------------------------------------------------ *
 * DOM helpers
 * ------------------------------------------------------------------ */

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
function fill(target, markup) {
  const node = typeof target === 'string' ? document.getElementById(target) : target;
  if (node) node.innerHTML = markup;
  return node;
}

/**
 * A numeric field is a text input with `inputmode="numeric"`, never
 * `type="number"` — caret handling depends on it (AGENTS.md).
 */
function numberField(attrs) {
  const { value, extraClass = '', ...rest } = attrs;
  const pairs = Object.entries(rest)
    .map(([key, val]) => html`${key}="${val}"`)
    .join(' ');
  return html`<input type="text" inputmode="numeric"
    class="field field--num ${extraClass}"
    value="${value ?? ''}" ${raw(pairs)} />`;
}

/** Parse a numeric field, treating anything unparseable as unchanged. */
function readNumber(input, fallback = 0) {
  const parsed = Number(String(input).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : fallback;
}

/* ------------------------------------------------------------------ *
 * State
 * ------------------------------------------------------------------ */

/** The whole dataset, and how it was loaded. */
export let app = null;
let loadReason = 'empty';

/** Current page plus its params (DESIGN §5). */
let view = { page: 'portfolio', params: {} };

export const PAGES = [
  { id: 'portfolio', label: 'Portfolio', kind: 'dashboard' },
  { id: 'initiatives', label: 'Initiatives', kind: 'overview' },
  { id: 'teams', label: 'Teams', kind: 'overview' },
  { id: 'people', label: 'People', kind: 'overview' },
  { id: 'process', label: 'Process', kind: 'reference' },
  { id: 'settings', label: 'Settings', kind: 'settings' },
];

export function navigate(page, params = {}) {
  view = { page, params };
  render();
}

/** Persist (debounced) and re-render. */
export function commit() {
  store.save(app);
  render();
}

/** Persist without re-rendering — for edits made under the caret. */
export function commitQuietly() {
  store.save(app);
}

/* ------------------------------------------------------------------ *
 * Dispatch
 * ------------------------------------------------------------------ */

const SETTINGS_SECTIONS = [
  { id: 'overview', label: 'Overview' },
  { id: 'roles', label: 'Roles' },
  { id: 'countries', label: 'Countries & rates' },
  { id: 'general', label: 'General' },
  { id: 'data', label: 'Data' },
  { id: 'danger', label: 'Danger zone' },
];

export function render() {
  const current = PAGES.find((page) => page.id === view.page);

  fill(
    'nav',
    PAGES.map(
      (page) => html`<button type="button" data-act="page" data-page="${page.id}"
        ${raw(page.id === view.page ? 'aria-current="page"' : '')}>${page.label}</button>`,
    ).join(''),
  );

  if (view.page === 'settings') return renderSettings();
  if (view.page === 'people') return renderPeople();
  if (view.page === 'person') return renderPerson();
  if (view.page === 'process') return renderProcessPage();

  fill(
    'root',
    html`<h1>${current.label}</h1>
      <p class="muted">Not built yet — this ${current.kind} page arrives in a later phase.</p>`,
  );
}

/* ------------------------------------------------------------------ *
 * People
 * ------------------------------------------------------------------ */

/** `YYYY-MM` for today, the month picker's default. */
function currentMonth() {
  return E.monthKey(new Date());
}

function selectedMonth() {
  return view.params.month ?? currentMonth();
}

/** Named tables, so copy and CSV can address one by name (SPEC §8). */
const TABLES = {};

function tableActions(key, label) {
  return html`<div class="actions actions--table">
    <button type="button" class="btn btn--small" data-act="copy-table" data-table="${key}">
      Copy ${label}</button>
    <button type="button" class="btn btn--small" data-act="csv-table" data-table="${key}">
      Download CSV</button>
    <span class="copy-note" data-note="${key}" aria-live="polite"></span>
  </div>`;
}

function monthPicker() {
  const months = E.windowMonths(app);
  const selected = selectedMonth();
  const options = months
    .map((month) => html`<option value="${month}" ${raw(month === selected ? 'selected' : '')}>
      ${month}</option>`)
    .join('');
  return html`<label class="field-inline">
    <span>Month</span>
    <select class="field field--select" data-act="month-picker">${raw(options)}</select>
    <button type="button" class="btn btn--small" data-act="month-today">Today</button>
  </label>`;
}

function renderPeople() {
  const month = selectedMonth();
  const filters = view.params.filters ?? {};
  const query = (filters.q ?? '').toLowerCase();

  const people = Object.values(app.PEOPLE).filter((person) => {
    if (!filters.showInactive && !person.active) return false;
    if (filters.teamId && !E.membership(person, filters.teamId)) return false;
    if (query && !person.name.toLowerCase().includes(query)) return false;
    return true;
  });

  const year = E.parseMonthKey(month).year;
  const headers = ['Name', 'Role', 'Country', 'Day rate', 'Capacity %', 'Teams', 'Allocated %', 'Utilisation %'];
  const data = people.map((person) => {
    const { dayRate, factor } = E.resolveRate(person, app.ROLES, app.COUNTRIES, year);
    const teams = (person.memberships ?? [])
      .filter((m) => m.active)
      .map((m) => `${app.TEAMS[m.teamId]?.name ?? m.teamId} ${m.sharePct}%`)
      .join(', ');
    return {
      person,
      allocated: E.allocatedPct(app, person.id, month),
      utilisation: E.utilisationPct(app, person.id, month),
      row: [
        person.name,
        E.roleLabel(person, app.ROLES),
        app.COUNTRIES[person.countryId]?.name ?? '',
        Math.round(dayRate * factor),
        person.capacityPct,
        teams || '—',
        E.allocatedPct(app, person.id, month),
        Math.round(E.utilisationPct(app, person.id, month)),
      ],
    };
  });
  TABLES.people = { headers, rows: data.map((entry) => entry.row), name: `people-${month}` };

  const rows = data
    .map(
      (entry) => html`<tr class="${entry.person.active ? '' : 'row--inactive'}">
        <td><button type="button" class="link" data-act="open-person" data-id="${entry.person.id}">
          ${entry.person.name}</button></td>
        <td>${entry.row[1]}${raw(entry.person.customRole ? html` <span class="tag">custom rate</span>` : '')}</td>
        <td>${entry.row[2]}</td>
        <td class="num">${E.formatMoney(entry.row[3], PROCESS.currency)}</td>
        <td class="num">${entry.person.capacityPct}%</td>
        <td>${entry.row[5]}</td>
        <td class="num">${entry.allocated}%</td>
        <td class="num ${entry.utilisation > 100 ? 'over' : ''}">
          ${Math.round(entry.utilisation)}%${raw(entry.utilisation > 100 ? ' ⚠' : '')}</td>
        <td class="cell--action">
          <button type="button" data-act="person-active" data-id="${entry.person.id}">
            ${entry.person.active ? 'Deactivate' : 'Reactivate'}</button></td>
      </tr>`,
    )
    .join('');

  const teamOptions = Object.values(app.TEAMS)
    .map((team) => html`<option value="${team.id}" ${raw(filters.teamId === team.id ? 'selected' : '')}>
      ${team.name}</option>`)
    .join('');

  fill(
    'root',
    html`<h1>People</h1>
      <p class="muted">A person exists independently of any team, which is what lets one
        belong to two. Every figure below describes the selected month.</p>
      <div class="toolbar">
        ${raw(monthPicker())}
        <label class="field-inline"><span>Search</span>
          <input class="field" data-act="people-filter" data-filter="q" value="${filters.q ?? ''}"
            placeholder="Name" /></label>
        <label class="field-inline"><span>Team</span>
          <select class="field field--select" data-act="people-filter" data-filter="teamId">
            <option value="">All</option>${raw(teamOptions)}</select></label>
        <label class="field-inline"><input type="checkbox" data-act="people-filter"
          data-filter="showInactive" ${raw(filters.showInactive ? 'checked' : '')} />
          <span>Show inactive</span></label>
      </div>
      <div class="scroller"><table class="grid">
        <thead><tr>${raw(headers.map((h) => html`<th>${h}</th>`).join(''))}<th></th></tr></thead>
        <tbody>${raw(rows)}</tbody>
      </table></div>
      ${raw(tableActions('people', 'table'))}
      <button type="button" class="btn" data-act="person-add">New person</button>`,
  );
}

/* ---- person detail ---- */

function renderPerson() {
  const person = app.PEOPLE[view.params.id];
  if (!person) return navigate('people');

  const warning = P.shareWarning(person);
  const stranded = E.strandedAllocations(app, person.id);
  const months = E.windowMonths(app);

  fill(
    'root',
    html`<button type="button" class="link" data-act="page" data-page="people">← People</button>
      <h1>${person.name}</h1>
      ${raw(person.active ? '' : html`<p class="warn">This person is deactivated. Existing
        allocations keep costing; they draw no new capacity.</p>`)}
      <div class="panel">${raw(personIdentity(person))}</div>
      <div class="panel">${raw(personTeams(person, warning, stranded))}</div>
      <div class="panel">${raw(personInitiativesPanel(person, stranded))}</div>
      <div class="panel">${raw(personCapacity(person, months))}</div>`,
  );
}

function personIdentity(person) {
  const custom = Boolean(person.customRole);
  const roleOptions = Object.values(app.ROLES)
    .filter((role) => role.active || role.id === person.roleId)
    .map((role) => html`<option value="${role.id}" ${raw(role.id === person.roleId ? 'selected' : '')}>
      ${role.name}</option>`)
    .join('');
  const countryOptions = Object.values(app.COUNTRIES)
    .filter((c) => c.active || c.id === person.countryId)
    .map((c) => html`<option value="${c.id}" ${raw(c.id === person.countryId ? 'selected' : '')}>
      ${c.name}</option>`)
    .join('');

  const years = Object.keys(app.COUNTRIES[person.countryId].byYear).map(Number).sort((a, b) => a - b);
  const rateRows = custom
    ? years
        .map(
          (year) => html`<tr><th scope="row">${year}</th><td>${raw(numberField({
            value: person.customRole.byYear[year] ?? 0,
            'data-act': 'person-rate',
            'data-id': person.id,
            'data-year': year,
            'aria-label': `${year} day rate`,
          }))}</td></tr>`,
        )
        .join('')
    : '';

  return html`<h2>Identity and rate</h2>
    <div class="fields">
      <label class="field-row"><span>Name</span>
        <input class="field" data-act="person-field" data-field="name" data-id="${person.id}"
          value="${person.name}" /></label>
      <label class="field-row"><span>Country</span>
        <select class="field field--select" data-act="person-country" data-id="${person.id}">
          ${raw(countryOptions)}</select></label>
      <label class="field-row"><span>Capacity %</span>
        ${raw(numberField({ value: person.capacityPct, 'data-act': 'person-field', 'data-field': 'capacityPct', 'data-id': person.id }))}</label>
      <div class="field-row"><span>Paid as</span>
        <div class="choice">
          <label><input type="radio" name="rate-kind" data-act="rate-kind" data-kind="standard"
            data-id="${person.id}" ${raw(custom ? '' : 'checked')} /> Standard role</label>
          <label><input type="radio" name="rate-kind" data-act="rate-kind" data-kind="custom"
            data-id="${person.id}" ${raw(custom ? 'checked' : '')} /> Custom rate</label>
        </div>
      </div>
      ${raw(custom
        ? html`<label class="field-row"><span>Role label</span>
            <input class="field" data-act="person-custom-label" data-id="${person.id}"
              value="${person.customRole.label}" /></label>`
        : html`<label class="field-row"><span>Role</span>
            <select class="field field--select" data-act="person-role" data-id="${person.id}">
              ${raw(roleOptions)}</select></label>`)}
    </div>
    ${raw(custom
      ? html`<p class="muted">A negotiated rate is absolute: it replaces the country rate and
          the role factor does not apply. Working days still come from the person\u2019s country.</p>
        <div class="scroller"><table class="grid grid--narrow">
          <thead><tr><th>Year</th><th>Day rate</th></tr></thead>
          <tbody>${raw(rateRows)}</tbody></table></div>`
      : html`<p class="muted">The rate comes from this person\u2019s country for the year being
          costed, multiplied by the role\u2019s factor.</p>`)}`;
}

function personTeams(person, warning, stranded) {
  const rows = (person.memberships ?? [])
    .map((membership) => {
      const team = app.TEAMS[membership.teamId];
      const strandedHere = stranded.filter((row) => row.initiative.teamId === membership.teamId);
      return html`<tr class="${membership.active ? '' : 'row--inactive'}">
        <td>${team?.name ?? membership.teamId}</td>
        <td>${raw(numberField({
          value: membership.sharePct,
          'data-act': 'membership-share',
          'data-id': person.id,
          'data-team': membership.teamId,
          'aria-label': 'Share of capacity',
        }))}</td>
        <td>${raw(strandedHere.length
          ? html`<span class="warn">${strandedHere.length} allocation${strandedHere.length === 1 ? '' : 's'} still costing</span>`
          : '')}</td>
        <td class="cell--action">
          <button type="button" data-act="membership-active" data-id="${person.id}"
            data-team="${membership.teamId}">${membership.active ? 'Leave team' : 'Rejoin'}</button>
        </td>
      </tr>`;
    })
    .join('');

  const joinable = Object.values(app.TEAMS).filter(
    (team) => !(person.memberships ?? []).some((m) => m.teamId === team.id && m.active),
  );

  return html`<h2>Teams</h2>
    <p class="muted">A share is how much of this person one team holds. Each team draws only on
      its own share, which is what keeps someone split across teams from being counted twice.</p>
    ${raw(rows
      ? html`<div class="scroller"><table class="grid">
          <thead><tr><th>Team</th><th>Share %</th><th></th><th></th></tr></thead>
          <tbody>${raw(rows)}</tbody></table></div>`
      : html`<p class="muted">No team yet — valid, and costs nothing. This person is on the bench.</p>`)}
    <p class="${warning.overCommitted ? 'warn' : 'muted'}">
      ${warning.totalSharePct}% of ${warning.capacityPct}% assigned${raw(warning.overCommitted
        ? html` — more than this person has. Allowed, but worth a look.`
        : html`, ${warning.unassignedPct}% unassigned.`)}</p>
    ${raw(joinable.length
      ? html`<div class="actions">
          <select class="field field--select" data-act="join-team-pick" data-id="${person.id}">
            ${raw(joinable.map((team) => html`<option value="${team.id}">${team.name}</option>`).join(''))}
          </select>
          <button type="button" class="btn" data-act="join-team" data-id="${person.id}">Add to team</button>
        </div>`
      : '')}`;
}

function personInitiativesPanel(person, stranded) {
  const rows = E.personInitiatives(app, person.id);
  const headers = ['Initiative', 'Team', 'Phase', 'Allocation %', 'From', 'To'];
  const data = rows.map((row) => [
    row.initiative.name,
    app.TEAMS[row.initiative.teamId]?.name ?? row.initiative.teamId,
    E.phaseLabel(PROCESS, row.phaseId),
    row.allocationPct,
    row.start ?? '',
    row.end ?? '',
  ]);
  TABLES.personInitiatives = { headers, rows: data, name: `${person.name}-initiatives` };

  const strandedIds = new Set(stranded.map((row) => `${row.initiative.id}:${row.phaseId}`));
  const body = rows
    .map(
      (row, index) => html`<tr class="${strandedIds.has(`${row.initiative.id}:${row.phaseId}`) ? 'row--warn' : ''}">
        ${raw(data[index].map((cell) => html`<td>${cell}</td>`).join(''))}
        <td>${raw(row.countsTowardCapacity ? '' : html`<span class="tag">not in capacity</span>`)}</td>
      </tr>`,
    )
    .join('');

  return html`<h2>Initiatives</h2>
    ${raw(stranded.length
      ? html`<p class="warn">Still allocated to ${stranded.map((row) => row.initiative.name).join(', ')}
          without an active membership in that team. These keep costing.</p>`
      : '')}
    ${raw(rows.length
      ? html`<div class="scroller"><table class="grid">
          <thead><tr>${raw(headers.map((h) => html`<th>${h}</th>`).join(''))}<th></th></tr></thead>
          <tbody>${raw(body)}</tbody></table></div>
        ${raw(tableActions('personInitiatives', 'initiatives'))}`
      : html`<p class="muted">Not allocated to anything yet.</p>`)}`;
}

function personCapacity(person, months) {
  const rows = P.capacityOverTime(app, person.id, months);
  const teams = rows[0]?.nonInitiative ?? [];
  const headers = ['Month', 'Allocated %', 'Capacity %', ...teams.map((t) => `${t.name} spare %`)];
  const data = rows.map((row) => [
    row.month,
    row.allocatedPct,
    row.capacityPct,
    ...row.nonInitiative.map((entry) => entry.pct),
  ]);
  TABLES.personCapacity = { headers, rows: data, name: `${person.name}-capacity` };

  const body = rows
    .map(
      (row) => html`<tr class="${row.overAllocated ? 'row--warn' : ''}">
        <td>${row.month}</td>
        <td class="num ${row.overAllocated ? 'over' : ''}">${row.allocatedPct}%${raw(row.overAllocated ? ' ⚠' : '')}</td>
        <td class="num">${row.capacityPct}%</td>
        ${raw(row.nonInitiative.map((entry) => html`<td class="num">${entry.pct}%</td>`).join(''))}
      </tr>`,
    )
    .join('');

  return html`<h2>Capacity over time</h2>
    <p class="muted">Every month in the rolling window. “Spare” is the share a team holds but
      has not allocated — ongoing work, not idle time.</p>
    <div class="scroller scroller--tall"><table class="grid">
      <thead><tr>${raw(headers.map((h) => html`<th>${h}</th>`).join(''))}</tr></thead>
      <tbody>${raw(body)}</tbody>
    </table></div>
    ${raw(tableActions('personCapacity', 'capacity'))}`;
}

/* ------------------------------------------------------------------ *
 * Process (read-only)
 * ------------------------------------------------------------------ */

/**
 * The process is fixed by the build (SPEC §2). This page is where someone
 * sees the rules they are working within — and where a wrong build becomes
 * obvious. It offers no control that suggests anything is editable.
 */
function renderProcessPage() {
  const rows = PROCESS.phases
    .map((phase) => {
      const gate = phase.gate;
      const checklist = (gate.checklist ?? []).length
        ? html`<ul class="checklist-defs">${raw(
            gate.checklist
              .map((item) => html`<li><strong>${item.name}</strong> — ${item.description}</li>`)
              .join(''),
          )}</ul>`
        : html`<span class="muted">No checklist</span>`;

      return html`<tr>
        <td><strong>${phase.label}</strong><br />
          <span class="tag">${phase.costed ? 'costed' : 'no cost or capacity'}</span></td>
        <td>${gate.label}<br />
          <span class="micro">${gate.requiresEstimates
            ? 'Requires a complete estimate for every costed phase'
            : 'No cost requirement'}</span>
          <span class="micro">${gate.skippable
            ? 'May be skipped, with a reason'
            : 'Cannot be skipped'}</span></td>
        <td>${raw(checklist)}</td>
      </tr>`;
    })
    .join('');

  const bandRows = PROCESS.bands
    .map(
      (band) => html`<tr>
        <td>${band.name} <span class="tag">${band.abbr}</span></td>
        <td class="num">${E.formatMoney(band.lower, PROCESS.currency)}</td>
        <td class="num">${band.upper === null
          ? 'no limit'
          : E.formatMoney(band.upper, PROCESS.currency)}</td>
        <td class="num">${band.severity}</td>
        <td>${band.req}</td>
      </tr>`,
    )
    .join('');

  const issues = E.bandCoverageIssues(PROCESS.bands);
  const issueMarkup = issues.length
    ? html`<div class="issues">${raw(
        issues
          .map((issue) =>
            issue.type === 'gap'
              ? html`<p class="warn">Gap: nothing covers
                  ${E.formatMoney(issue.from, PROCESS.currency)} to
                  ${E.formatMoney(issue.to, PROCESS.currency)}. A total landing there
                  resolves to “Not yet known”.</p>`
              : html`<p class="warn">Overlap: ${issue.message ?? 'two tracks cover the same amounts'}.</p>`,
          )
          .join(''),
      )}</div>`
    : '';

  fill(
    'root',
    html`<h1>Process</h1>
      <p class="muted">This is fixed by the build and cannot be changed here. Every initiative
        runs it. The last phase's gate is what closes an initiative — finishing is a governed
        act, not a status change.</p>

      <div class="panel">
        <h2>Phases and gates</h2>
        <div class="scroller"><table class="grid">
          <thead><tr><th>Phase</th><th>Its gate</th><th>Checklist</th></tr></thead>
          <tbody>${raw(rows)}</tbody>
        </table></div>
      </div>

      <div class="panel">
        <h2>Approval tracks</h2>
        <div class="scroller"><table class="grid">
          <thead><tr><th>Track</th><th>From</th><th>To</th><th>Severity</th>
            <th>Requirement</th></tr></thead>
          <tbody>${raw(bandRows)}</tbody>
        </table></div>
        ${raw(issueMarkup)}
      </div>

      <div class="panel">
        <h2>This build</h2>
        <div class="fields">
          <div class="field-row"><span>Process</span><span>${PROCESS.id}</span></div>
          <div class="field-row"><span>Version</span><span>${PROCESS.version}</span></div>
          <div class="field-row"><span>Currency</span><span>${PROCESS.currency}</span></div>
        </div>
        <p class="muted">A dataset exported here records this process. Importing it into a
          build running a different process is refused, because its phases and gates would
          not mean the same thing.</p>
      </div>`,
  );
}

/* ------------------------------------------------------------------ *
 * Settings
 * ------------------------------------------------------------------ */

function renderSettings() {
  const section = view.params.section ?? 'overview';
  const tabs = SETTINGS_SECTIONS.map(
    (item) => html`<button type="button" role="tab" data-act="section" data-section="${item.id}"
      aria-selected="${item.id === section}">${item.label}</button>`,
  ).join('');

  fill(
    'root',
    html`<h1>Settings</h1>
      <div class="tabs" role="tablist">${raw(tabs)}</div>
      <div id="settings-body" class="panel"></div>`,
  );
  renderSettingsBody(section);
}

/** One region per section, replaced wholesale when the section changes. */
function renderSettingsBody(section) {
  const renderers = {
    overview: renderOverview,
    roles: renderRoles,
    countries: renderCountries,
    general: renderGeneral,
    data: renderData,
    danger: renderDanger,
  };
  fill('settings-body', renderers[section]());
}

function tile(label, value, note = '') {
  return html`<div class="tile">
    <div class="tile__value">${value}</div>
    <div class="tile__label">${label}</div>
    ${raw(note ? html`<div class="tile__note">${note}</div>` : '')}
  </div>`;
}

function renderOverview() {
  const people = Object.values(app.PEOPLE);
  const roles = Object.values(app.ROLES);
  const countries = Object.values(app.COUNTRIES).filter((c) => c.active);
  const year = new Date().getFullYear();
  const rates = countries.map((c) => E.yearRecord(c.byYear, year).rate);
  const range = rates.length
    ? `${E.formatMoney(Math.min(...rates), PROCESS.currency)}–${E.formatMoney(Math.max(...rates), PROCESS.currency)}`
    : '—';

  const since = app.GENERAL.lastExportAt
    ? Math.floor((Date.now() - Date.parse(app.GENERAL.lastExportAt)) / 86400000)
    : null;

  return html`<div class="tiles">
    ${raw(tile('Teams', Object.keys(app.TEAMS).length))}
    ${raw(tile('People', people.length, `${people.filter((p) => p.active).length} active`))}
    ${raw(tile('Roles', roles.filter((r) => r.active).length))}
    ${raw(tile('Countries', countries.length, range))}
    ${raw(tile('Days since export', since === null ? 'never' : since))}
  </div>`;
}

/* ---- roles ---- */

function renderRoles() {
  const rows = Object.values(app.ROLES)
    .map(
      (role) => html`<tr data-id="${role.id}" class="${role.active ? '' : 'row--inactive'}">
        <td><input class="field" data-act="role-field" data-field="name" data-id="${role.id}"
          value="${role.name}" aria-label="Role name" /></td>
        <td><input class="field field--short" data-act="role-field" data-field="abbr"
          data-id="${role.id}" value="${role.abbr}" aria-label="Abbreviation" /></td>
        <td>${raw(numberField({ value: role.factor, 'data-act': 'role-field', 'data-field': 'factor', 'data-id': role.id, 'aria-label': 'Factor' }))}</td>
        <td class="cell--action"><button type="button" data-act="role-active" data-id="${role.id}">
          ${role.active ? 'Deactivate' : 'Reactivate'}</button></td>
      </tr>`,
    )
    .join('');

  return html`<p class="muted">A role's factor multiplies the day rate that comes from a
      person's country. Roles are never deleted once referenced — deactivate instead.</p>
    <div class="scroller"><table class="grid">
      <thead><tr><th>Name</th><th>Abbr.</th><th>Factor</th><th></th></tr></thead>
      <tbody>${raw(rows)}</tbody>
    </table></div>
    <button type="button" class="btn" data-act="role-add">Add role</button>`;
}

/* ---- countries & rates ---- */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function renderCountries() {
  const expanded = view.params.expanded ?? null;

  const rows = Object.values(app.COUNTRIES)
    .map((country) => {
      const years = Object.keys(country.byYear).map(Number).sort((a, b) => a - b);
      const open = expanded === country.id;

      const yearBlocks = years
        .map((year) => {
          const record = country.byYear[year];
          const cells = MONTHS.map(
            (label, index) => html`<td>
              <span class="micro">${label}</span>
              ${raw(numberField({
                value: record.workingDayReduction[index],
                'data-act': 'country-reduction',
                'data-id': country.id,
                'data-year': year,
                'data-month': index,
                'aria-label': `${label} ${year} reduction`,
                extraClass: 'field--tiny',
              }))}
            </td>`,
          ).join('');

          return html`<tr class="year-row">
            <th scope="row">${year}</th>
            <td>${raw(numberField({
              value: record.rate,
              'data-act': 'country-rate',
              'data-id': country.id,
              'data-year': year,
              'aria-label': `${year} day rate`,
            }))}</td>
            <td colspan="12"><table class="months"><tbody><tr>${raw(cells)}</tr></tbody></table></td>
          </tr>`;
        })
        .join('');

      return html`<tbody data-id="${country.id}" class="${country.active ? '' : 'row--inactive'}">
        <tr>
          <td><input class="field" data-act="country-field" data-field="name" data-id="${country.id}"
            value="${country.name}" aria-label="Country name" /></td>
          <td class="cell--action">
            <button type="button" data-act="country-expand" data-id="${country.id}"
              aria-expanded="${open}">${open ? 'Hide rates' : 'Rates & holidays'}</button>
            <button type="button" data-act="country-active" data-id="${country.id}">
              ${country.active ? 'Deactivate' : 'Reactivate'}</button>
          </td>
        </tr>
        ${raw(open ? html`<tr><td colspan="2"><table class="grid grid--nested">
          <thead><tr><th>Year</th><th>Day rate</th><th colspan="12">Reduced working days</th></tr></thead>
          <tbody>${raw(yearBlocks)}</tbody></table></td></tr>` : '')}
      </tbody>`;
    })
    .join('');

  return html`<p class="muted">Each year carries its own day rate and its own holiday
      reductions, so a rate rise next year never moves this year's months. The window
      rolls forward automatically and keeps last year, for backfilled work.</p>
    <div class="scroller"><table class="grid">
      <thead><tr><th>Name</th><th></th></tr></thead>
      ${raw(rows)}
    </table></div>
    <button type="button" class="btn" data-act="country-add">Add country</button>`;
}

/* ---- general ---- */

function renderGeneral() {
  return html`<div class="fields">
    <label class="field-row">
      <span>Days before the export reminder appears</span>
      ${raw(numberField({ value: app.GENERAL.exportReminderDays, 'data-act': 'general-field', 'data-field': 'exportReminderDays' }))}
    </label>
  </div>
  <p class="muted">The currency symbol is fixed by this build and shown on the
    <button type="button" class="link" data-act="page" data-page="process">Process</button>
    page, not here.</p>`;
}

/* ---- data ---- */

/** A validated import awaiting a Replace/Merge choice. Never auto-applied. */
let pendingImport = null;

function renderData() {
  return html`<p class="muted">The export carries everything: master data, the process, every
      person, initiative, actual and approval. It is the only backup and the only way to move
      data between machines.</p>
    <div class="actions">
      <button type="button" class="btn" data-act="export">Export JSON</button>
      <label class="btn btn--file">Import JSON
        <input type="file" accept="application/json,.json" data-act="import-file" hidden />
      </label>
    </div>
    <div id="import-preview">${raw(importPreviewMarkup())}</div>`;
}

function importPreviewMarkup() {
  if (!pendingImport) return '';
  if (pendingImport.error) {
    return html`<div class="issues"><p class="warn">${pendingImport.error}</p></div>`;
  }

  const mode = pendingImport.mode;
  const preview = T.importPreview(app, pendingImport.data, mode);
  const counts = Object.entries(preview.entities)
    .map(
      ([key, diff]) => html`<tr><th scope="row">${key}</th>
        <td>${diff.added.length}</td><td>${diff.changed.length}</td>
        <td>${mode === 'merge' ? '—' : diff.removed.length}</td></tr>`,
    )
    .join('');

  const collisions = preview.approvalCollisions.length
    ? html`<div class="issues">${raw(
        preview.approvalCollisions
          .map(
            (c) => html`<p class="warn">This would ${c.wouldBeCleared ? 'clear' : 'overwrite'}
              a recorded approval on “${c.name}”.</p>`,
          )
          .join(''),
      )}</div>`
    : '';

  const people = preview.peopleReplaced.length
    ? html`<p class="muted">${preview.peopleReplaced.length} ${preview.peopleReplaced.length === 1
        ? 'person is' : 'people are'} replaced wholesale, memberships included.</p>`
    : '';

  return html`<div class="panel panel--inset">
    <h2>Preview</h2>
    <div class="tabs" role="tablist">
      <button type="button" role="tab" data-act="import-mode" data-mode="replace"
        aria-selected="${mode === 'replace'}">Replace all</button>
      <button type="button" role="tab" data-act="import-mode" data-mode="merge"
        aria-selected="${mode === 'merge'}">Merge</button>
    </div>
    <p class="muted">${mode === 'replace'
      ? 'Everything currently here is discarded and replaced by the file.'
      : 'The file is overlaid on what is here. Anything it does not mention is kept.'}</p>
    <table class="grid">
      <thead><tr><th></th><th>Added</th><th>Changed</th><th>Removed</th></tr></thead>
      <tbody>${raw(counts)}</tbody>
    </table>
    ${raw(people)}
    ${raw(collisions)}
    <div class="actions">
      <button type="button" class="btn btn--primary" data-act="import-apply">
        ${mode === 'replace' ? 'Replace everything' : 'Merge'}</button>
      <button type="button" class="btn" data-act="import-cancel">Cancel</button>
    </div>
  </div>`;
}

/* ---- danger zone ---- */

function renderDanger() {
  const armed = view.params.armed === true;
  return html`<p class="muted">Resetting clears everything stored in this browser: master
      data, the process, every person, initiative, actual and approval. It cannot be undone,
      and an export taken beforehand is the only way back.</p>
    ${raw(armed
      ? html`<div class="issues"><p class="warn">This will erase everything. There is no undo.</p>
          <div class="actions">
            <button type="button" class="btn btn--danger" data-act="reset-confirm">
              Yes, erase everything</button>
            <button type="button" class="btn" data-act="reset-cancel">Cancel</button>
          </div></div>`
      : html`<button type="button" class="btn btn--danger" data-act="reset-arm">
          Reset to a fresh installation</button>`)}`;
}

/* ------------------------------------------------------------------ *
 * Wiring
 * ------------------------------------------------------------------ */

/**
 * Actions that only change computed output elsewhere. These must never
 * re-render: rebuilding the input under the caret would lose focus and
 * position mid-keystroke (AGENTS.md). They write to the model, persist
 * quietly, and refresh only the region that displays the result.
 */
const LIVE_REGIONS = {};

/** Named table currently registered under `key`, for copy and CSV. */
function tableFor(key) {
  return TABLES[key];
}

/** Typing: update the model in place, never the structure. */
function onInput(event) {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;
  const act = target.dataset.act;
  if (!act) return;

  const id = target.dataset.id;
  const field = target.dataset.field;

  if (act === 'role-field') {
    const role = app.ROLES[id];
    role[field] = field === 'factor' ? readNumber(target.value, role.factor) : target.value;
  } else if (act === 'country-field') {
    app.COUNTRIES[id][field] = target.value;
  } else if (act === 'country-rate') {
    const record = app.COUNTRIES[id].byYear[target.dataset.year];
    record.rate = readNumber(target.value, record.rate);
  } else if (act === 'country-reduction') {
    const record = app.COUNTRIES[id].byYear[target.dataset.year];
    record.workingDayReduction[Number(target.dataset.month)] = readNumber(target.value, 0);
  } else if (act === 'general-field') {
    app.GENERAL[field] = readNumber(target.value, app.GENERAL.exportReminderDays);
  } else {
    return;
  }

  commitQuietly();
  LIVE_REGIONS[act]?.();
}

/** Clicks: structural changes, which do re-render. */
function onClick(event) {
  if (!(event.target instanceof Element)) return;
  const trigger = event.target.closest('[data-act]');
  if (!(trigger instanceof HTMLElement)) return;

  const { act, id } = trigger.dataset;
  const section = view.params.section ?? 'overview';

  switch (act) {
    case 'page':
      return navigate(trigger.dataset.page);
    case 'section':
      return navigate('settings', { section: trigger.dataset.section });

    case 'role-add': {
      const newId = L.newId('role');
      app.ROLES[newId] = { id: newId, name: 'New role', abbr: 'NEW', factor: 1, active: true };
      return commit();
    }
    case 'role-active':
      app.ROLES[id].active = !app.ROLES[id].active;
      return commit();

    case 'country-add': {
      const newId = L.newId('country');
      const years = Object.keys(Object.values(app.COUNTRIES)[0]?.byYear ?? {});
      app.COUNTRIES[newId] = {
        id: newId,
        name: 'New country',
        active: true,
        byYear: Object.fromEntries(
          years.map((year) => [year, { rate: 0, workingDayReduction: Array(12).fill(0) }]),
        ),
      };
      return navigate('settings', { section, expanded: newId });
    }
    case 'country-active':
      app.COUNTRIES[id].active = !app.COUNTRIES[id].active;
      return commit();
    case 'country-expand':
      return navigate('settings', {
        section,
        expanded: view.params.expanded === id ? null : id,
      });

    case 'export':
      store.downloadExport(app);
      app.GENERAL.lastExportAt = new Date().toISOString();
      return commit();
    case 'import-mode':
      pendingImport.mode = trigger.dataset.mode;
      return fill('import-preview', importPreviewMarkup());
    case 'import-cancel':
      pendingImport = null;
      return fill('import-preview', importPreviewMarkup());
    case 'import-apply': {
      app = T.applyImport(app, pendingImport.data, pendingImport.mode);
      pendingImport = null;
      store.saveNow(app);
      return navigate('settings', { section: 'overview' });
    }

    case 'open-person':
      return navigate('person', { id });
    case 'person-add': {
      const person = P.createPerson(app);
      store.save(app);
      return navigate('person', { id: person.id });
    }
    case 'person-active':
      P.setPersonActive(app.PEOPLE[id], !app.PEOPLE[id].active);
      return commit();
    case 'join-team': {
      const select = document.querySelector(`[data-act="join-team-pick"][data-id="${id}"]`);
      if (select instanceof HTMLSelectElement) P.addMembership(app.PEOPLE[id], select.value, 0);
      return commit();
    }
    case 'membership-active': {
      const person = app.PEOPLE[id];
      const team = trigger.dataset.team;
      const current = person.memberships.find((m) => m.teamId === team);
      P.setMembershipActive(app, person, team, !current.active);
      return commit();
    }
    case 'month-today':
      return navigate(view.page, { ...view.params, month: currentMonth() });

    case 'copy-table': {
      const table = tableFor(trigger.dataset.table);
      store.copyTable(table.headers, table.rows).then((result) => {
        const note = document.querySelector(`[data-note="${trigger.dataset.table}"]`);
        if (note) note.textContent = result === 'failed' ? 'Copy failed' : 'Copied';
      });
      return undefined;
    }
    case 'csv-table': {
      const table = tableFor(trigger.dataset.table);
      store.downloadCsv(`${table.name}.csv`, table.headers, table.rows);
      return undefined;
    }

    case 'reset-arm':
      return navigate('settings', { section, armed: true });
    case 'reset-cancel':
      return navigate('settings', { section, armed: false });
    case 'reset-confirm': {
      store.reset();
      const fresh = store.load();
      app = fresh.app;
      return navigate('settings', { section: 'overview' });
    }
    default:
      return undefined;
  }
}

/** Selects, radios and checkboxes — structural, so these do re-render. */
function onChange(event) {
  const target = event.target;
  if (!(target instanceof HTMLSelectElement) && !(target instanceof HTMLInputElement)) return;
  const { act, id } = target.dataset;

  switch (act) {
    case 'month-picker':
      return navigate(view.page, { ...view.params, month: target.value });
    case 'people-filter': {
      const filters = { ...(view.params.filters ?? {}) };
      const key = target.dataset.filter;
      filters[key] = target.type === 'checkbox' ? target.checked : target.value;
      return navigate('people', { ...view.params, filters });
    }
    case 'person-country':
      app.PEOPLE[id].countryId = target.value;
      return commit();
    case 'person-role':
      P.useStandardRole(app.PEOPLE[id], target.value);
      return commit();
    case 'rate-kind': {
      const person = app.PEOPLE[id];
      if (target.dataset.kind === 'custom') P.useCustomRole(app, person);
      else P.useStandardRole(person);
      return commit();
    }
    default:
      return undefined;
  }
}

/** Picking a file validates it before any choice is offered (SPEC §7.7). */
async function onFileChange(event) {
  const target = event.target;
  if (!(target instanceof HTMLInputElement) || target.dataset.act !== 'import-file') return;
  const file = target.files?.[0];
  if (!file) return;

  const parsed = await store.readImportFile(file);
  pendingImport = parsed.ok ? { data: parsed.data, mode: 'merge', error: null } : { error: parsed.error };
  target.value = '';
  fill('import-preview', importPreviewMarkup());
}

/**
 * Global listeners, installed exactly once on `document` and resolving their
 * target at event time, so a replaced region never needs re-binding.
 */
export function boot() {
  const loaded = store.load();
  app = loaded.app;
  loadReason = loaded.reason;

  document.getElementById('wordmark').textContent = 'Initiative Planner';
  document.addEventListener('click', onClick);
  document.addEventListener('input', onInput);
  document.addEventListener('change', onChange);
  document.addEventListener('change', onFileChange);
  window.addEventListener('beforeunload', () => store.flush(app));

  render();
  return loadReason;
}
