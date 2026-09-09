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

/** The currency is fixed by the build, so this needs no argument. */
function money(value) {
  return E.formatMoney(value, PROCESS.currency);
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
 * Theme
 * ------------------------------------------------------------------ */

const THEME_KEY = 'initiative-planner/theme';
const THEMES = ['system', 'light', 'dark'];
const THEME_LABELS = { system: 'System', light: 'Light', dark: 'Dark' };

/**
 * A device preference, not data: it lives under its own storage key rather
 * than in the dataset, so it is never exported and never travels between
 * machines with someone's initiatives.
 */
function currentTheme() {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    return THEMES.includes(stored) ? stored : 'system';
  } catch {
    return 'system';
  }
}

/**
 * "System" stamps nothing, leaving `prefers-color-scheme` to decide; an
 * explicit choice stamps the root. Changing this attribute repaints
 * everything, because every rule reads tokens rather than colours (SPEC §8).
 */
function applyTheme(theme) {
  if (theme === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
}

function cycleTheme() {
  const next = THEMES[(THEMES.indexOf(currentTheme()) + 1) % THEMES.length];
  try {
    localStorage.setItem(THEME_KEY, next);
  } catch {
    // A blocked store costs the preference, not the app.
  }
  applyTheme(next);
  renderShellActions();
}

/* ------------------------------------------------------------------ *
 * Shell
 * ------------------------------------------------------------------ */

function renderShellActions() {
  const theme = currentTheme();
  fill(
    'shell-actions',
    html`<button type="button" class="btn btn--small" data-act="export">Export</button>
      <label class="btn btn--small btn--file">Import
        <input type="file" accept="application/json,.json" data-act="import-file" hidden />
      </label>
      <button type="button" class="btn btn--small" data-act="theme"
        aria-label="Theme: ${THEME_LABELS[theme]}. Click to change.">
        ${THEME_LABELS[theme]}</button>`,
  );
}

/**
 * The export reminder. Dismissable by action only: exporting clears it,
 * nothing else does, because the thing it is warning about is real until the
 * export happens.
 */
function renderBanner() {
  const node = document.getElementById('banner');
  if (!node) return;

  const threshold = app.GENERAL.exportReminderDays;
  const last = app.GENERAL.lastExportAt ? Date.parse(app.GENERAL.lastExportAt) : null;
  const days = last === null ? null : Math.floor((Date.now() - last) / 86400000);

  if (!threshold || (days !== null && days < threshold)) {
    node.hidden = true;
    node.innerHTML = '';
    return;
  }

  // Escalating rather than shouting from the start: the longer it has been
  // ignored, the more it costs to keep ignoring it.
  const overdue = days === null ? threshold : days;
  const level = overdue >= threshold * 3 ? 'severe' : overdue >= threshold * 2 ? 'strong' : 'mild';
  const said = days === null
    ? 'This data has never been exported.'
    : `It has been ${days} days since the last export.`;

  node.hidden = false;
  node.innerHTML = html`<div class="banner-bar banner-bar--${level}">
    <span>${said} An export is the only backup — everything here lives in this browser
      alone.</span>
    <button type="button" class="btn btn--small" data-act="export">Export now</button>
  </div>`;
}

/* ------------------------------------------------------------------ *
 * Popovers
 * ------------------------------------------------------------------ */

/** The element a popover was opened from, so it can be repositioned. */
let popoverTrigger = null;

/**
 * Position from the trigger's bounding rectangle rather than relying on CSS
 * anchoring (AGENTS.md), clamped so it cannot open off-screen. Recomputed on
 * scroll and resize, since a fixed element does not follow its trigger.
 */
function positionPopover() {
  const node = document.getElementById('popover');
  if (!node || node.hidden || !popoverTrigger?.isConnected) return;

  const rect = popoverTrigger.getBoundingClientRect();
  const box = node.getBoundingClientRect();
  const margin = 8;
  const { innerWidth: vw, innerHeight: vh } = window;

  // With no measurable viewport — a hidden or not-yet-laid-out pane — clamping
  // would push the popover into a corner for no reason. Sit on the trigger and
  // let the next scroll or resize place it properly.
  if (!vw || !vh) {
    node.style.left = `${rect.left}px`;
    node.style.top = `${rect.bottom + margin}px`;
    return;
  }

  const left = Math.max(margin, Math.min(rect.left, vw - box.width - margin));
  const below = rect.bottom + margin;
  const top = below + box.height > vh ? rect.top - box.height - margin : below;

  node.style.left = `${left}px`;
  node.style.top = `${Math.max(margin, top)}px`;
}

function openPopover(trigger, markup) {
  const node = document.getElementById('popover');
  if (!node) return;
  popoverTrigger = trigger;
  node.innerHTML = markup;
  node.hidden = false;
  positionPopover();
}

function closePopover() {
  const node = document.getElementById('popover');
  if (!node || node.hidden) return;
  node.hidden = true;
  node.innerHTML = '';
  popoverTrigger = null;
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
  renderShellActions();
  renderBanner();

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
  if (view.page === 'teams') return renderTeams();
  if (view.page === 'team') return renderTeam();
  if (view.page === 'initiatives') return renderInitiatives();
  if (view.page === 'wizard') return renderWizard();
  if (view.page === 'initiative') return renderInitiative();
  if (view.page === 'portfolio') return renderPortfolio();

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

const PEOPLE_COLUMNS = [
  { key: 'name', label: 'Name', value: (r) => r.person.name.toLowerCase() },
  { key: 'role', label: 'Role', value: (r) => String(r.row[1]).toLowerCase() },
  { key: 'country', label: 'Country', value: (r) => String(r.row[2]).toLowerCase() },
  { key: 'rate', label: 'Day rate', value: (r) => r.row[3] },
  { key: 'capacity', label: 'Capacity %', value: (r) => r.person.capacityPct },
  { key: 'teams', label: 'Teams', value: (r) => String(r.row[5]).toLowerCase() },
  { key: 'allocated', label: 'Allocated %', value: (r) => r.allocated },
  { key: 'utilisation', label: 'Utilisation %', value: (r) => r.utilisation },
];

function renderPeople() {
  const month = selectedMonth();
  const filters = view.params.filters ?? {};
  const sort = view.params.sort ?? { key: 'name', dir: 'asc' };
  const query = (filters.q ?? '').toLowerCase();

  const people = Object.values(app.PEOPLE).filter((person) => {
    if (!filters.showInactive && !person.active) return false;
    if (filters.teamId && !E.membership(person, filters.teamId)) return false;
    // A custom-rate person has no roleId, so the role filter matches only
    // people actually on that standard role.
    if (filters.roleId && person.roleId !== filters.roleId) return false;
    if (filters.countryId && person.countryId !== filters.countryId) return false;
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
  const column = PEOPLE_COLUMNS.find((c) => c.key === sort.key) ?? PEOPLE_COLUMNS[0];
  data.sort((a, b) => {
    const left = column.value(a);
    const right = column.value(b);
    const cmp = left < right ? -1 : left > right ? 1 : 0;
    return sort.dir === 'desc' ? -cmp : cmp;
  });
  TABLES.people = { headers, rows: data.map((entry) => entry.row), name: `people-${month}` };

  const sortableHeaders = PEOPLE_COLUMNS.map(
    (c) => html`<th aria-sort="${sort.key === c.key
      ? sort.dir === 'asc' ? 'ascending' : 'descending'
      : 'none'}">
      <button type="button" class="link" data-act="sort-people" data-key="${c.key}">
        ${c.label}${raw(sort.key === c.key ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : '')}</button></th>`,
  ).join('');

  const rows = data
    .map(
      (entry) => html`<tr class="${entry.person.active ? '' : 'row--inactive'}">
        <td><button type="button" class="link" data-act="open-person" data-id="${entry.person.id}">
          ${entry.person.name}</button></td>
        <td>${entry.row[1]}${raw(entry.person.customRole ? html` <span class="tag">custom rate</span>` : '')}</td>
        <td>${entry.row[2]}</td>
        <td class="num">${money(entry.row[3])}</td>
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
        <label class="field-inline"><span>Role</span>
          <select class="field field--select" data-act="people-filter" data-filter="roleId">
            <option value="">All</option>${raw(Object.values(app.ROLES)
              .map((role) => html`<option value="${role.id}"
                ${raw(filters.roleId === role.id ? 'selected' : '')}>${role.name}</option>`)
              .join(''))}</select></label>
        <label class="field-inline"><span>Country</span>
          <select class="field field--select" data-act="people-filter" data-filter="countryId">
            <option value="">All</option>${raw(Object.values(app.COUNTRIES)
              .map((c) => html`<option value="${c.id}"
                ${raw(filters.countryId === c.id ? 'selected' : '')}>${c.name}</option>`)
              .join(''))}</select></label>
        <label class="field-inline"><input type="checkbox" data-act="people-filter"
          data-filter="showInactive" ${raw(filters.showInactive ? 'checked' : '')} />
          <span>Show inactive</span></label>
      </div>
      <div class="scroller"><table class="grid">
        <thead><tr>${raw(sortableHeaders)}<th></th></tr></thead>
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
 * Phase panels (shared by the wizard and initiative detail)
 * ------------------------------------------------------------------ */

/**
 * One costed phase's estimate. Rendered by both the creation wizard and the
 * initiative detail page, so the two can never drift apart.
 *
 * Computed cells carry `data-calc` ids rather than being rebuilt on every
 * keystroke: typing an allocation percentage updates those cells in place,
 * never the input under the caret (AGENTS.md).
 */
function phasePanel(initiative, phaseId, editable) {
  const phase = initiative.phases[phaseId];
  const label = E.phaseLabel(PROCESS, phaseId);
  const frozen = E.isFrozen(phase);

  const members = Object.values(app.PEOPLE).filter(
    (person) => person.active && E.membership(person, initiative.teamId),
  );
  const allocated = new Set(phase.allocations.map((a) => a.personId));
  const joinable = members.filter((person) => !allocated.has(person.id));

  const exportRows = [];
  const allocationRows = phase.allocations
    .map((allocation) => {
      // A frozen phase reads its own snapshot — including the people, since a
      // custom rate lives on the person record — so an approved figure on
      // screen never moves when master data changes underneath it.
      const at = E.ratesFor(app, phase);
      const person = at.PEOPLE[allocation.personId] ?? app.PEOPLE[allocation.personId];
      if (!person) return '';
      const year = phase.estStartDate ? E.parseMonthKey(phase.estStartDate.slice(0, 7)).year
        : new Date().getFullYear();
      const { dayRate, factor } = E.resolveRate(person, at.ROLES, at.COUNTRIES, year);
      const figures = E.allocationFigures(phase, allocation.personId, allocation.allocationPct, at);
      const stranded = !E.membership(person, initiative.teamId);

      exportRows.push([
        person.name,
        E.roleLabel(person, app.ROLES),
        app.COUNTRIES[person.countryId]?.name ?? '',
        Math.round(dayRate),
        factor,
        allocation.allocationPct,
        Number(figures.personDays.toFixed(1)),
        Math.round(figures.cost),
      ]);

      return html`<tr class="${stranded ? 'row--warn' : ''}">
        <td>${person.name}${raw(stranded
          ? html` <span class="tag">no longer in this team</span>`
          : '')}</td>
        <td>${E.roleLabel(person, app.ROLES)}</td>
        <td>${app.COUNTRIES[person.countryId]?.name ?? ''}</td>
        <td class="num">${money(dayRate)}</td>
        <td class="num">${factor.toFixed(2)}</td>
        <td>${raw(editable
          ? numberField({
              value: allocation.allocationPct,
              'data-act': 'allocation-pct',
              'data-id': initiative.id,
              'data-phase': phaseId,
              'data-person': person.id,
              'aria-label': `${person.name} allocation`,
            })
          : html`<span class="num">${allocation.allocationPct}%</span>`)}</td>
        <td class="num" data-calc="days-${phaseId}-${person.id}">
          ${figures.personDays.toFixed(1)}</td>
        <td class="num" data-calc="cost-${phaseId}-${person.id}">
          ${money(figures.cost)}</td>
        <td class="cell--action">${raw(editable
          ? html`<button type="button" data-act="allocation-remove" data-id="${initiative.id}"
              data-phase="${phaseId}" data-person="${person.id}">Remove</button>`
          : '')}</td>
      </tr>`;
    })
    .join('');

  const costRows = phase.otherCosts
    .map((item) => {
      const outOfPeriod =
        phase.estStartDate && phase.estEndDate &&
        !E.monthsInRange(phase.estStartDate, phase.estEndDate).includes(item.month);
      return html`<tr>
        <td>${raw(editable
          ? html`<input class="field" data-act="cost-name" data-id="${initiative.id}"
              data-phase="${phaseId}" data-cost="${item.id}" value="${item.name}"
              aria-label="Cost item name" />`
          : item.name)}</td>
        <td>${item.month}${raw(outOfPeriod
          ? html` <span class="tag">out of period</span>`
          : '')}</td>
        <td class="num">${money(item.amount)}</td>
        <td class="cell--action">${raw(editable
          ? html`<button type="button" data-act="cost-remove" data-id="${initiative.id}"
              data-phase="${phaseId}" data-cost="${item.id}">Remove</button>`
          : '')}</td>
      </tr>`;
    })
    .join('');

  return html`<div class="panel">
    <h2>${label}${raw(frozen ? html` <span class="tag">approved and frozen</span>` : '')}</h2>

    <div class="fields">
      <label class="field-row"><span>From</span>
        <input type="date" class="field field--short" data-act="phase-start"
          data-id="${initiative.id}" data-phase="${phaseId}"
          value="${phase.estStartDate ?? ''}" ${raw(editable ? '' : 'disabled')} /></label>
      <label class="field-row"><span>To</span>
        <input type="date" class="field field--short" data-act="phase-end"
          data-id="${initiative.id}" data-phase="${phaseId}"
          value="${phase.estEndDate ?? ''}" ${raw(editable ? '' : 'disabled')} /></label>
    </div>

    <h3>People</h3>
    ${raw(phase.allocations.length
      ? html`<div class="scroller"><table class="grid">
          <thead><tr><th>Person</th><th>Role</th><th>Country</th><th>Day rate</th>
            <th>Factor</th><th>Allocation %</th><th>Person-days</th><th>Cost</th><th></th></tr></thead>
          <tbody>${raw(allocationRows)}</tbody></table></div>
        ${raw(registerAllocationTable(initiative, phaseId, exportRows))}`
      : html`<p class="muted">Nobody allocated yet.</p>`)}
    ${raw(editable && joinable.length
      ? html`<div class="actions">
          <select class="field field--select" data-act="allocation-pick"
            data-phase="${phaseId}">${raw(joinable
              .map((person) => html`<option value="${person.id}">${person.name}</option>`)
              .join(''))}</select>
          <button type="button" class="btn" data-act="allocation-add" data-id="${initiative.id}"
            data-phase="${phaseId}">Allocate</button>
        </div>`
      : editable
        ? html`<p class="muted">Everyone active in this team is already allocated. Add people
            to the team first.</p>`
        : '')}

    <h3>Other costs</h3>
    ${raw(phase.otherCosts.length
      ? html`<div class="scroller"><table class="grid">
          <thead><tr><th>Item</th><th>Month</th><th>Amount</th><th></th></tr></thead>
          <tbody>${raw(costRows)}</tbody></table></div>`
      : html`<p class="muted">No non-labour costs.</p>`)}
    ${raw(editable
      ? html`<div class="actions">
          <input class="field field--short" data-act="new-cost-month" data-phase="${phaseId}"
            type="month" aria-label="Month" />
          ${raw(numberField({ value: '', 'data-act': 'new-cost-amount', 'data-phase': phaseId, 'aria-label': 'Amount' }))}
          <button type="button" class="btn" data-act="cost-add" data-id="${initiative.id}"
            data-phase="${phaseId}">Add cost</button>
        </div>`
      : '')}

    <p class="results" data-calc="total-${phaseId}">${raw(phaseTotalsMarkup(initiative, phaseId))}</p>
  </div>`;
}

/** Each phase's allocations is its own named table for copy and CSV (§8). */
function registerAllocationTable(initiative, phaseId, rows) {
  const key = `alloc-${phaseId}`;
  TABLES[key] = {
    headers: ['Person', 'Role', 'Country', 'Day rate', 'Factor', 'Allocation %',
      'Person-days', 'Cost'],
    rows,
    name: `${initiative.name}-${E.phaseLabel(PROCESS, phaseId)}-allocations`,
  };
  return tableActions(key, 'allocations');
}

/**
 * A panel per costed phase, in process order, skipping any the initiative has
 * no record for. That gap is reachable: a later build may mark a phase costed
 * that was not costed when this initiative was created, and a processVersion
 * moving forward is deliberately not fatal (DESIGN §3).
 */
function costedPhasePanels(initiative) {
  return E.costedPhaseIds(PROCESS)
    .filter((phaseId) => initiative.phases[phaseId])
    .map((phaseId) => phasePanel(initiative, phaseId, L.isPhaseEditable(initiative, phaseId)))
    .join('');
}

function phaseTotalsMarkup(initiative, phaseId) {
  const phase = initiative.phases[phaseId];

  // Both honour a snapshot themselves, so the panel agrees with the grand
  // total above it rather than quietly disagreeing.
  const labour = E.phaseLabourTotal(phase, app);
  const other = E.phaseOtherTotal(phase);

  return html`Labour ${money(labour)} + other ${money(other)} =
    <strong>${money(labour + other)}</strong>${raw(E.isFrozen(phase)
      ? html` <span class="tag">as approved</span>`
      : '')}`;
}

/** The live grand total and resolved track, recomputed without a rebuild. */
function grandMarkup(initiative) {
  const total = E.grandTotal(initiative, app);
  const band = E.resolveBand(PROCESS.bands, total);
  const coverage = E.initiativeCoverage(initiative);
  return html`<strong>${money(total)}</strong>
    <span class="tag">${coverage}</span>
    — ${band ? band.name : 'Not yet known'}${raw(band
      ? html`<span class="micro">${band.req}</span>`
      : html`<span class="micro">No approval track covers this total.</span>`)}`;
}

/**
 * Recompute every figure on screen, in place.
 *
 * Which regions exist depends on the page — the wizard has a grand-total
 * line, initiative detail has a band panel and a month table — so this asks
 * the DOM rather than taking the caller's word for it. Two hand-maintained
 * lists were what let an allocation edit refresh the phase totals while
 * leaving the approval track above them stale.
 *
 * Structure is never rebuilt, so the caret stays where the user left it.
 */
function refreshCalcRegions(initiative) {
  for (const [phaseId, phase] of Object.entries(initiative.phases)) {
    const at = E.ratesFor(app, phase);
    for (const allocation of phase.allocations) {
      const days = document.querySelector(`[data-calc="days-${phaseId}-${allocation.personId}"]`);
      const cost = document.querySelector(`[data-calc="cost-${phaseId}-${allocation.personId}"]`);
      if (!days && !cost) continue;

      const figures = E.allocationFigures(phase, allocation.personId, allocation.allocationPct, at);
      if (days) days.textContent = figures.personDays.toFixed(1);
      if (cost) cost.textContent = money(figures.cost);
    }

    const total = document.querySelector(`[data-calc="total-${phaseId}"]`);
    if (total) fill(total, phaseTotalsMarkup(initiative, phaseId));
  }

  // Blended monthly figures share a table with the actual inputs, so they are
  // written cell by cell rather than rebuilt.
  for (const month of E.initiativeMonths(initiative)) {
    const cell = document.querySelector(`[data-calc="blended-${month}"]`);
    if (cell) fill(cell, html`<strong>${money(E.initiativeCostInMonth(initiative, app, month))}</strong>`);
  }

  // These hold no inputs, so they are safe to rebuild whole — and have to be:
  // the total, its track, the marker and the variance all move together.
  const panel = document.querySelector('[data-calc="band-panel"]');
  if (panel) fill(panel, bandPanelMarkup(initiative));
  const grand = document.querySelector('[data-calc="grand"]');
  if (grand) fill(grand, grandMarkup(initiative));
}

/* ------------------------------------------------------------------ *
 * Portfolio (read-only dashboard)
 * ------------------------------------------------------------------ */

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

function renderPortfolio() {
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
        <span class="tile__value">${money(group.total)}</span>
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

  const sort = view.params.sort ?? { key: 'effective', dir: 'desc' };
  const column = PORTFOLIO_COLUMNS.find((c) => c.key === sort.key) ?? PORTFOLIO_COLUMNS[0];
  const sorted = [...rows].sort((a, b) => {
    const left = column.value(a);
    const right = column.value(b);
    const cmp = left < right ? -1 : left > right ? 1 : 0;
    return sort.dir === 'desc' ? -cmp : cmp;
  });

  const headers = PORTFOLIO_COLUMNS.map(
    (c) => html`<th aria-sort="${sort.key === c.key
      ? sort.dir === 'asc' ? 'ascending' : 'descending'
      : 'none'}">
      <button type="button" class="link" data-act="sort-portfolio" data-key="${c.key}">
        ${c.label}${raw(sort.key === c.key ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : '')}</button></th>`,
  ).join('');

  const body = sorted
    .map(
      (r) => html`<tr>
        <td><button type="button" class="link" data-act="open-initiative"
          data-id="${r.initiative.id}">${r.initiative.name}</button></td>
        <td>${r.teamName}</td>
        <td>${E.phaseLabel(PROCESS, r.initiative.phaseId)}</td>
        <td>${STATUS_LABELS[r.initiative.status]}</td>
        <td>${r.period.start ? `${r.period.start} → ${r.period.end ?? '?'}` : '—'}</td>
        <td>${r.band ? r.band.name : 'Not yet known'}</td>
        <td class="num">${r.approved === null ? '—' : money(r.approved)}</td>
        <td class="num">${money(r.effective)}
          <span class="micro">${E.initiativeCoverage(r.initiative)}</span></td>
        <td class="num ${r.variance > 0 ? 'over' : ''}">${r.variance === null
          ? '—'
          : `${r.variance > 0 ? '+' : ''}${money(r.variance)}`}</td>
      </tr>`,
    )
    .join('');

  fill(
    'root',
    html`<h1>Portfolio</h1>
      <p class="muted">Cost across every team, read-only. Capacity is a per-team and
        per-person question and lives on those pages.</p>

      <div class="tiles">${raw(tiles)}</div>
      ${raw(selected
        ? html`<p class="muted">Filtered to
            ${groups.find((g) => g.id === selected)?.name}.
            <button type="button" class="link" data-act="portfolio-tile"
              data-band="${selected}">Clear</button></p>`
        : '')}

      <div class="panel">
        <h2>Cost per month</h2>
        ${raw(yearNav(`${money(yearTotal)} across ${chartYear()}, active initiatives only.`))}
        ${raw(yearTotal === 0
          ? html`<p class="muted">No active initiative costs anything in this year.</p>`
          : stackedBarsMarkup(data))}
      </div>

      <div class="panel">
        <h2>Initiatives</h2>
        ${raw(sorted.length
          ? html`<div class="scroller"><table class="grid">
              <thead><tr>${raw(headers)}</tr></thead>
              <tbody>${raw(body)}</tbody></table></div>`
          : html`<p class="muted">Nothing to show.</p>`)}
      </div>`,
  );
}

/* ------------------------------------------------------------------ *
 * Initiatives registry
 * ------------------------------------------------------------------ */

const STATUS_LABELS = {
  active: 'Active',
  'on-hold': 'On hold',
  cancelled: 'Cancelled',
  closed: 'Closed',
};

/** Sortable columns, each with how to read the value it sorts on. */
const INITIATIVE_COLUMNS = [
  { key: 'name', label: 'Name', value: (row) => row.initiative.name.toLowerCase() },
  { key: 'team', label: 'Team', value: (row) => row.teamName.toLowerCase() },
  { key: 'phase', label: 'Phase', value: (row) => row.phaseIndex },
  { key: 'status', label: 'Status', value: (row) => row.initiative.status },
  { key: 'track', label: 'Approval track', value: (row) => row.band?.severity ?? -1 },
  { key: 'total', label: 'Total', value: (row) => row.total },
];

function renderInitiatives() {
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
    (c) => html`<th aria-sort="${sort.key === c.key
      ? sort.dir === 'asc' ? 'ascending' : 'descending'
      : 'none'}">
      <button type="button" class="link" data-act="sort-initiatives" data-key="${c.key}">
        ${c.label}${raw(sort.key === c.key ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : '')}</button></th>`,
  ).join('');

  const body = rows
    .map(
      (row) => html`<tr>
        <td><button type="button" class="link" data-act="open-initiative"
          data-id="${row.initiative.id}">${row.initiative.name}</button></td>
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
        <td class="num">${money(row.total)}
          <span class="micro">${row.coverage}</span></td>
        <td class="cell--action">
          <button type="button" data-act="duplicate-initiative" data-id="${row.initiative.id}">
            Duplicate</button></td>
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
    html`<h1>Initiatives</h1>
      <div class="toolbar">
        <label class="field-inline"><span>Search</span>
          <input class="field" data-act="initiatives-filter" data-filter="q"
            value="${filters.q ?? ''}" placeholder="Name" /></label>
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
        ? html`<p class="muted">Nothing here yet.</p>`
        : rows.length === 0
          ? html`<p class="muted">No initiative matches those filters.</p>`
          : html`<div class="scroller"><table class="grid">
              <thead><tr>${raw(headers)}<th></th></tr></thead>
              <tbody>${raw(body)}</tbody></table></div>`)}
      <button type="button" class="btn btn--primary" data-act="wizard-start">New initiative</button>`,
  );
}

/* ------------------------------------------------------------------ *
 * Initiative detail
 * ------------------------------------------------------------------ */

const today = () => new Date().toISOString().slice(0, 10);

function renderInitiative() {
  const initiative = app.INITIATIVES.find((i) => i.id === view.params.id);
  if (!initiative) return navigate('initiatives');

  const panels = costedPhasePanels(initiative);

  fill(
    'root',
    html`<button type="button" class="link" data-act="page" data-page="initiatives">
        ← Initiatives</button>
      <h1>${initiative.name}</h1>
      <p class="muted">${app.TEAMS[initiative.teamId]?.name ?? '—'} ·
        ${STATUS_LABELS[initiative.status]}</p>

      ${raw(stepperMarkup(initiative))}
      ${raw(gateBannerMarkup(initiative))}
      <div data-calc="band-panel">${raw(bandPanelMarkup(initiative))}</div>
      ${raw(panels)}
      ${raw(monthTableMarkup(initiative))}
      ${raw(gateComparisonMarkup(initiative))}`,
  );
}

/** Every phase, with passed and skipped gates visually distinct. */
function stepperMarkup(initiative) {
  const order = E.phaseOrder(PROCESS);
  const currentIndex = order.indexOf(initiative.phaseId);

  const items = PROCESS.phases
    .map((phase, index) => {
      const record = initiative.gates[phase.gate.id];
      const state = record
        ? record.outcome
        : index === currentIndex && initiative.status !== 'closed'
          ? 'current'
          : 'ahead';

      const note = record
        ? record.outcome === 'skipped'
          ? html`<span class="micro">Skipped${raw(record.takenAt ? html` · ${record.takenAt}` : '')}
              — ${record.reason}</span>`
          : html`<span class="micro">${phase.gate.label} passed · ${record.takenAt}</span>`
        : html`<span class="micro">${phase.costed ? 'Costed' : 'No cost'}</span>`;

      return html`<li class="step step--${state}">
        <span class="step__name">${phase.label}</span>
        ${raw(note)}
      </li>`;
    })
    .join('');

  return html`<ol class="stepper">${raw(items)}</ol>`;
}

/**
 * What this phase's gate needs, and the actions for it. A gate action is
 * disabled with its reasons spelled out rather than hidden — being told why
 * is the difference between a blocked user and a stuck one.
 */
function gateBannerMarkup(initiative) {
  if (initiative.status === 'closed') {
    return html`<div class="panel banner banner--done">
      <h2>Closed</h2>
      <p class="muted">This initiative is finished and frozen. Only notes stay writable.</p>
      <div class="actions">
        <button type="button" class="btn" data-act="reopen" data-id="${initiative.id}">
          Reopen the final gate</button>
      </div>
    </div>`;
  }
  if (initiative.status === 'cancelled') {
    return html`<div class="panel banner">
      <h2>Cancelled</h2>
      <p class="muted">Abandoned before the process finished, and frozen. Set the status back
        to Active from the registry to work on it again.</p>
    </div>`;
  }

  const phase = E.phaseById(PROCESS, initiative.phaseId);
  const gate = phase.gate;
  const check = L.gatePrecondition(app, PROCESS, initiative, gate.id);
  const order = E.phaseOrder(PROCESS);
  const canReopen = order.indexOf(initiative.phaseId) > 0;
  const closes = E.isFinalPhase(PROCESS, initiative.phaseId);

  const list = (items, kind) =>
    items.length
      ? html`<ul class="issues issues--${kind}">${raw(
          items.map((text) => html`<li class="${kind === 'blocker' ? 'warn' : 'muted'}">${text}</li>`).join(''),
        )}</ul>`
      : '';

  return html`<div class="panel banner">
    <h2>${phase.label} — ${gate.label}</h2>
    <p class="muted">${closes
      ? 'This is the last gate. Passing it closes the initiative.'
      : `Passing it moves to ${E.phaseLabel(PROCESS, E.nextPhase(PROCESS, phase.id))}.`}
      ${gate.requiresEstimates
        ? 'It requires a complete estimate for every costed phase.'
        : 'It has no cost requirement.'}</p>

    ${raw(list(check.blockers, 'blocker'))}
    ${raw(list(check.warnings, 'warning'))}

    <div class="actions">
      <label class="field-inline"><span>Gate date</span>
        <input type="date" class="field field--short" data-field="gate-date"
          value="${today()}" /></label>
      <button type="button" class="btn btn--primary" data-act="pass-gate"
        data-id="${initiative.id}" data-gate="${gate.id}" ${raw(check.ok ? '' : 'disabled')}>
        ${closes ? `Pass ${gate.label} and close` : `Pass ${gate.label}`}</button>
      ${raw(canReopen
        ? html`<button type="button" class="btn" data-act="reopen" data-id="${initiative.id}">
            Reopen previous phase</button>`
        : '')}
    </div>

    ${raw(gate.skippable
      ? html`<div class="actions">
          <label class="field-inline"><span>Skip reason</span>
            <input class="field" data-field="skip-reason"
              placeholder="Why is this gate not needed?" /></label>
          <button type="button" class="btn" data-act="skip-gate" data-id="${initiative.id}"
            data-gate="${gate.id}">Skip this gate</button>
        </div>
        <p class="micro">A skip approves nothing and freezes nothing, so this phase stays
          editable. The reason is recorded and shown wherever the gate appears.</p>`
      : html`<p class="micro">${gate.label} cannot be skipped.</p>`)}

    ${raw((gate.checklist ?? []).length ? checklistMarkup(initiative, gate) : '')}
  </div>`;
}

const CHECK_LABELS = { red: 'Not resolved', amber: 'Partly', green: 'Resolved' };

function checklistMarkup(initiative, gate) {
  const rows = L.checklistState(initiative, gate)
    .map(
      (item) => html`<tr class="check check--${item.status}">
        <td><strong>${item.name}</strong><span class="micro">${item.description}</span></td>
        <td>
          <select class="field field--select" data-act="checklist-status"
            data-id="${initiative.id}" data-gate="${gate.id}" data-item="${item.id}"
            aria-label="${item.name} status">
            ${raw(L.CHECKLIST_STATUSES.map((status) => html`<option value="${status}"
              ${raw(item.status === status ? 'selected' : '')}>${CHECK_LABELS[status]}</option>`).join(''))}
          </select>
        </td>
        <td><input class="field" data-act="checklist-note" data-id="${initiative.id}"
          data-gate="${gate.id}" data-item="${item.id}" value="${item.note}"
          placeholder="Note" aria-label="${item.name} note" /></td>
      </tr>`,
    )
    .join('');

  return html`<h3>Checklist</h3>
    <p class="muted">Items start unresolved, so a gate with a checklist is blocked until
      someone has looked at each one. “Partly” lets the gate pass with a warning.</p>
    <div class="scroller"><table class="grid">
      <thead><tr><th>Item</th><th>Status</th><th>Note</th></tr></thead>
      <tbody>${raw(rows)}</tbody></table></div>`;
}

/** The grand total, its track, where it sits among the bands, and variance. */
function bandPanelMarkup(initiative) {
  const total = E.grandTotal(initiative, app);
  const band = E.resolveBand(PROCESS.bands, total);
  const scale = E.bandScale(PROCESS.bands);

  const segments = [...PROCESS.bands]
    .sort((a, b) => a.lower - b.lower)
    .map((b) => {
      const from = scale.fraction(b.lower);
      const to = b.upper === null ? 1 : scale.fraction(b.upper);
      return html`<span class="bar__band ${band?.id === b.id ? 'bar__band--on' : ''}"
        style="left:${from * 100}%;width:${(to - from) * 100}%" title="${b.name}">
        <span class="bar__abbr">${b.abbr}</span></span>`;
    })
    .join('');

  const passed = L.lastPassedGate(PROCESS, initiative);
  const variance = passed ? total - passed.grandTotal : null;
  const move = passed ? E.compareBands(passed.band, band) : 'unknown';

  return html`<div class="panel">
    <h2>Approval track</h2>
    <p class="results"><strong>${money(total)}</strong>
      <span class="tag">${E.initiativeCoverage(initiative)}</span>
      — ${band ? band.name : 'Not yet known'}</p>
    <p class="muted">${band ? band.req : 'No configured approval track covers this total.'}</p>

    <div class="bar" role="img" aria-label="Where this total sits among the approval tracks">
      ${raw(segments)}
      <span class="bar__marker" style="left:${scale.fraction(total) * 100}%"></span>
    </div>

    ${raw(passed
      ? html`<p class="${move === 'escalation' ? 'warn' : 'muted'}">
          ${variance === 0
            ? 'Unchanged since the last approval.'
            : html`${variance > 0 ? 'Up' : 'Down'} ${money(Math.abs(variance))} since
                ${passed.band ? passed.band.name : 'the last approval'} was approved.`}
          ${raw(move === 'escalation'
            ? html`<strong>This now needs a stricter approval track than the one approved.</strong>`
            : move === 'de-escalation'
              ? 'It now falls under a lighter track than the one approved.'
              : '')}</p>`
      : html`<p class="muted">No gate has been passed yet, so there is nothing to compare
          against. A skipped gate approves nothing and never sets that baseline.</p>`)}
  </div>`;
}

/**
 * Every costed month across every costed phase, blending estimate and actual.
 * This is where actuals are entered, one month at a time (SPEC §5.4).
 *
 * The legend distinguishes three things that look alike but are not: a cell
 * you can record against, a gap where money was expected but nothing was
 * recorded, and the current month.
 */
function monthTableMarkup(initiative) {
  const months = E.initiativeMonths(initiative);
  const costed = E.costedPhaseIds(PROCESS).filter((id) => initiative.phases[id]);
  const locked = E.isFinished(initiative);
  const now = E.monthKey(new Date());

  if (months.length === 0) {
    return html`<div class="panel"><h2>Month by month</h2>
      <p class="muted">Nothing is costed yet. Give a phase a period and allocate someone.</p></div>`;
  }

  const headers = ['Month', ...costed.flatMap((id) => {
    const label = E.phaseLabel(PROCESS, id);
    return [`${label} estimate`, `${label} actual`];
  }), 'Blended'];

  const data = months.map((month) => {
    /** @type {Array<string|number>} */
    const cells = [month];
    let blended = 0;
    for (const phaseId of costed) {
      const phase = initiative.phases[phaseId];
      const estimate = E.phaseEstimateByMonth(phase, app)[month] ?? 0;
      const actual = phase.actualMonths[month];
      cells.push(Math.round(estimate), actual === undefined ? '' : actual);
      blended += E.phaseBlendedByMonth(phase, app)[month] ?? 0;
    }
    cells.push(Math.round(blended));
    return cells;
  });
  TABLES.months = { headers, rows: data, name: `${initiative.name}-months` };

  const body = months
    .map((month) => {
      let blended = 0;
      const cells = costed
        .map((phaseId) => {
          const phase = initiative.phases[phaseId];
          const estimate = E.phaseEstimateByMonth(phase, app)[month] ?? 0;
          const actual = phase.actualMonths[month];
          blended += E.phaseBlendedByMonth(phase, app)[month] ?? 0;
          const inPeriod = E.phaseMonths(phase).includes(month);
          const gap = inPeriod && actual === undefined && estimate > 0;

          return html`<td class="num">${estimate ? money(estimate) : '—'}</td>
            <td class="num ${gap ? 'cell--gap' : ''}">${raw(locked || !inPeriod
              ? actual === undefined ? '—' : money(actual)
              : numberField({
                  value: actual ?? '',
                  'data-act': 'actual-month',
                  'data-id': initiative.id,
                  'data-phase': phaseId,
                  'data-month': month,
                  'aria-label': `${E.phaseLabel(PROCESS, phaseId)} actual for ${month}`,
                  placeholder: 'not recorded',
                }))}</td>`;
        })
        .join('');

      return html`<tr class="${month === now ? 'row--now' : ''}">
        <td>${month}${raw(month === now ? html` <span class="tag">now</span>` : '')}</td>
        ${raw(cells)}
        <td class="num" data-calc="blended-${month}"><strong>${money(blended)}</strong></td>
      </tr>`;
    })
    .join('');

  return html`<div class="panel">
    <h2>Month by month</h2>
    <p class="legend">
      <span class="legend__item"><span class="swatch swatch--edit"></span> record an actual here</span>
      <span class="legend__item"><span class="swatch swatch--gap"></span> expected but not recorded</span>
      <span class="legend__item"><span class="swatch swatch--now"></span> current month</span>
    </p>
    <div class="scroller scroller--tall"><table class="grid">
      <thead><tr>${raw(headers.map((h) => html`<th>${h}</th>`).join(''))}</tr></thead>
      <tbody>${raw(body)}</tbody>
    </table></div>
    ${raw(tableActions('months', 'months'))}
  </div>`;
}

/** Every gate left so far, beside the live figures. */
function gateComparisonMarkup(initiative) {
  const left = PROCESS.phases
    .map((phase) => ({ phase, record: initiative.gates[phase.gate.id] }))
    .filter((entry) => entry.record);

  if (left.length === 0) return '';

  const costed = E.costedPhaseIds(PROCESS);
  const headers = ['Gate', 'Outcome', 'Date', ...costed.map((id) => E.phaseLabel(PROCESS, id)),
    'Approval track', 'Grand total'];

  /** @returns {Array<string|number>} */
  const rowFor = (label, outcome, date, costs, band, total) => [
    label, outcome, date, ...costed.map((id) => Math.round(costs[id] ?? 0)),
    band ? band.name : 'Not yet known', Math.round(total),
  ];

  const liveCosts = E.phaseCosts(initiative, app);
  const liveTotal = Object.values(liveCosts).reduce((t, v) => t + v, 0);
  const data = [
    ...left.map((entry) => rowFor(
      entry.phase.gate.label,
      entry.record.outcome,
      entry.record.takenAt ?? '—',
      entry.record.phaseCosts,
      entry.record.band,
      entry.record.grandTotal,
    )),
    rowFor('Now', 'live', today(), liveCosts, E.resolveBand(PROCESS.bands, liveTotal), liveTotal),
  ];
  TABLES.gates = { headers, rows: data, name: `${initiative.name}-gates` };

  const body = data
    .map((row, index) => {
      const entry = left[index];
      const skipped = entry?.record.outcome === 'skipped';
      return html`<tr class="${index === data.length - 1 ? 'row--live' : skipped ? 'row--warn' : ''}">
        <td>${row[0]}</td>
        <td>${raw(skipped
          ? html`<span class="tag">skipped</span><span class="micro">${entry.record.reason}</span>`
          : html`${row[1]}`)}</td>
        <td>${row[2]}</td>
        ${raw(costed.map((id, i) => html`<td class="num">${money(row[3 + i])}</td>`).join(''))}
        <td>${row[3 + costed.length]}</td>
        <td class="num"><strong>${money(row[4 + costed.length])}</strong></td>
      </tr>`;
    })
    .join('');

  return html`<div class="panel">
    <h2>At each gate</h2>
    <p class="muted">What the figures were when each gate was left, beside where they stand
      now. A skipped gate approved nothing — its numbers are a record, not a baseline.</p>
    <div class="scroller"><table class="grid">
      <thead><tr>${raw(headers.map((h) => html`<th>${h}</th>`).join(''))}</tr></thead>
      <tbody>${raw(body)}</tbody>
    </table></div>
    ${raw(tableActions('gates', 'comparison'))}
  </div>`;
}

/* ------------------------------------------------------------------ *
 * Creation wizard
 * ------------------------------------------------------------------ */

/**
 * Two steps, resumable. Step 1 creates the initiative immediately, so step 2
 * is editing a real record rather than holding a draft in memory — which is
 * what makes leaving and returning lossless.
 */
function renderWizard() {
  const initiative = view.params.id ? app.INITIATIVES.find((i) => i.id === view.params.id) : null;
  return initiative ? renderWizardEstimates(initiative) : renderWizardGeneral();
}

function renderWizardGeneral() {
  const draft = view.params.draft ?? store.loadDraft();
  const teams = Object.values(app.TEAMS).filter((team) => team.active);
  const order = E.phaseOrder(PROCESS);
  const startPhaseId = draft.startPhaseId ?? order[0];
  const skipped = order.slice(0, order.indexOf(startPhaseId));

  if (teams.length === 0) {
    return fill(
      'root',
      html`<h1>New initiative</h1>
        <p class="muted">An initiative belongs to a team, and there are no active teams yet.
          <button type="button" class="link" data-act="page" data-page="teams">Create one
          first.</button></p>`,
    );
  }

  fill(
    'root',
    html`<h1>New initiative</h1>
      <ol class="steps"><li aria-current="step">General</li><li>Estimates</li></ol>

      <div class="panel">
        <div class="fields">
          <label class="field-row"><span>Name</span>
            <input class="field" data-act="draft-field" data-field="name"
              value="${draft.name ?? ''}" placeholder="What is it called?" /></label>
          <label class="field-row"><span>Description</span>
            <input class="field" data-act="draft-field" data-field="description"
              value="${draft.description ?? ''}" /></label>
          <label class="field-row"><span>Team</span>
            <select class="field field--select" data-act="draft-select" data-field="teamId">
              ${raw(teams.map((team) => html`<option value="${team.id}"
                ${raw(draft.teamId === team.id ? 'selected' : '')}>${team.name}</option>`).join(''))}
            </select></label>
          <label class="field-row"><span>Starting phase</span>
            <select class="field field--select" data-act="draft-select" data-field="startPhaseId">
              ${raw(PROCESS.phases.map((phase) => html`<option value="${phase.id}"
                ${raw(startPhaseId === phase.id ? 'selected' : '')}>${phase.label}</option>`).join(''))}
            </select></label>
        </div>

        ${raw(skipped.length
          ? html`<div class="issues">
              <p class="warn">Starting at ${E.phaseLabel(PROCESS, startPhaseId)} records
                ${skipped.length} earlier gate${skipped.length === 1 ? '' : 's'} as skipped:
                ${skipped.map((id) => E.gateForPhase(PROCESS, id).label).join(', ')}. They
                approve nothing and freeze nothing.</p>
              <label class="field-row"><span>Reason</span>
                <input class="field" data-act="draft-field" data-field="skipReason"
                  value="${draft.skipReason ?? 'Already in progress when entered into the tool'}" /></label>
            </div>`
          : '')}

        <div class="actions">
          <button type="button" class="btn btn--primary" data-act="draft-create"
            ${raw((draft.name ?? '').trim() ? '' : 'disabled')}>Create and continue</button>
          <button type="button" class="btn" data-act="draft-discard">Cancel</button>
        </div>
        ${raw((draft.name ?? '').trim() ? '' : html`<p class="muted">A name is needed first.</p>`)}
      </div>`,
  );
}

function renderWizardEstimates(initiative) {
  const panels = costedPhasePanels(initiative);

  fill(
    'root',
    html`<h1>${initiative.name}</h1>
      <ol class="steps"><li>General</li><li aria-current="step">Estimates</li></ol>
      <p class="muted">Fill in as much as you know. Finishing with an incomplete estimate is
        fine — the gate is what blocks progress later, not this step.</p>

      <div class="panel panel--inset">
        <h2>Grand total</h2>
        <p data-calc="grand">${raw(grandMarkup(initiative))}</p>
      </div>

      ${raw(panels)}

      <div class="actions">
        <button type="button" class="btn btn--primary" data-act="open-initiative"
          data-id="${initiative.id}">Done</button>
        <button type="button" class="btn" data-act="page" data-page="initiatives">
          Back to initiatives</button>
      </div>`,
  );
}

/* ------------------------------------------------------------------ *
 * Teams
 * ------------------------------------------------------------------ */

function renderTeams() {
  const cards = Object.values(app.TEAMS)
    .map((team) => {
      const summary = P.teamSummary(app, team.id);
      const deletable = P.canDeleteTeam(app, team.id);
      return html`<div class="card ${team.active ? '' : 'card--inactive'}">
        <button type="button" class="link card__title" data-act="open-team" data-id="${team.id}">
          ${team.name}</button>
        <dl class="card__stats">
          <div><dt>Members</dt><dd>${summary.activeMembers}</dd></div>
          <div><dt>Share held</dt><dd>${summary.totalSharePct}%</dd></div>
          <div><dt>Initiatives</dt><dd>${summary.activeInitiatives}</dd></div>
        </dl>
        <div class="card__actions">
          <button type="button" data-act="team-active" data-id="${team.id}">
            ${team.active ? 'Deactivate' : 'Reactivate'}</button>
          <button type="button" data-act="team-delete" data-id="${team.id}"
            ${raw(deletable.ok ? '' : 'disabled')}
            title="${deletable.ok
              ? 'Delete this team'
              : `Used by ${deletable.blockers.join(', ')}`}">Delete</button>
        </div>
      </div>`;
    })
    .join('');

  fill(
    'root',
    html`<h1>Teams</h1>
      <p class="muted">A team holds a share of each of its people rather than owning them
        outright, which is what lets one person belong to two.</p>
      <div class="cards">${raw(cards)}</div>
      <button type="button" class="btn" data-act="team-add">New team</button>`,
  );
}

function renderTeam() {
  const team = app.TEAMS[view.params.id];
  if (!team) return navigate('teams');

  const roster = P.teamRoster(app, team.id);
  const initiatives = app.INITIATIVES.filter((i) => i.teamId === team.id);
  const deletable = P.canDeleteTeam(app, team.id);

  const rosterRows = roster
    .map((row) => {
      const warning = P.shareWarning(row.person);
      return html`<tr class="${row.membership.active && row.person.active ? '' : 'row--inactive'}">
        <td><button type="button" class="link" data-act="open-person" data-id="${row.person.id}">
          ${row.person.name}</button>
          ${raw(row.person.active ? '' : html` <span class="tag">person inactive</span>`)}</td>
        <td>${E.roleLabel(row.person, app.ROLES)}</td>
        <td>${raw(numberField({
          value: row.membership.sharePct,
          'data-act': 'membership-share',
          'data-id': row.person.id,
          'data-team': team.id,
          'aria-label': `${row.person.name} share`,
        }))}</td>
        <td class="num">${row.person.capacityPct}%</td>
        <td>${raw(warning.overCommitted
          ? html`<span class="warn">${warning.totalSharePct}% of ${warning.capacityPct}% assigned across all teams</span>`
          : '')}</td>
        <td class="cell--action">
          <button type="button" data-act="membership-active" data-id="${row.person.id}"
            data-team="${team.id}">${row.membership.active ? 'Leave team' : 'Rejoin'}</button>
        </td>
      </tr>`;
    })
    .join('');

  const joinable = Object.values(app.PEOPLE).filter(
    (person) =>
      person.active && !(person.memberships ?? []).some((m) => m.teamId === team.id && m.active),
  );

  const initiativeRows = initiatives
    .map(
      (initiative) => html`<tr>
        <td>${initiative.name}</td>
        <td>${E.phaseLabel(PROCESS, initiative.phaseId)}</td>
        <td>${initiative.status}</td>
        <td class="num">${money(E.grandTotal(initiative, app))}</td>
      </tr>`,
    )
    .join('');

  fill(
    'root',
    html`<button type="button" class="link" data-act="page" data-page="teams">← Teams</button>
      <h1>${team.name}</h1>
      ${raw(team.active ? '' : html`<p class="warn">This team is deactivated.</p>`)}

      <div class="panel">
        <h2>Name</h2>
        <div class="fields"><label class="field-row"><span>Team name</span>
          <input class="field" data-act="team-name" data-id="${team.id}"
            value="${team.name}" /></label></div>
      </div>

      <div class="panel">
        <h2>Roster</h2>
        <p class="muted">A share is how much of a person this team holds. Editing it here is
          the same edit as editing it on the person — there is one record, seen from two
          sides. People are added by assigning someone who already exists, and removed by
          leaving the team, never by deletion.</p>
        ${raw(roster.length
          ? html`<div class="scroller"><table class="grid">
              <thead><tr><th>Person</th><th>Role</th><th>Share %</th><th>Capacity %</th>
                <th></th><th></th></tr></thead>
              <tbody>${raw(rosterRows)}</tbody></table></div>`
          : html`<p class="muted">Nobody has joined yet.</p>`)}
        ${raw(joinable.length
          ? html`<div class="actions">
              <select class="field field--select" data-act="add-member-pick" data-id="${team.id}">
                ${raw(joinable.map((p) => html`<option value="${p.id}">${p.name}</option>`).join(''))}
              </select>
              <button type="button" class="btn" data-act="add-member" data-id="${team.id}">
                Add to team</button>
            </div>`
          : html`<p class="muted">Everyone active already belongs to this team.</p>`)}
      </div>

      <div class="panel">
        <h2>Initiatives</h2>
        ${raw(initiatives.length
          ? html`<div class="scroller"><table class="grid">
              <thead><tr><th>Name</th><th>Phase</th><th>Status</th><th>Total</th></tr></thead>
              <tbody>${raw(initiativeRows)}</tbody></table></div>`
          : html`<p class="muted">This team has no initiatives yet.</p>`)}
        ${raw(deletable.ok
          ? ''
          : html`<p class="muted">This team cannot be deleted while it owns initiatives.</p>`)}
      </div>

      ${raw(capacityGridMarkup(team))}
      ${raw(runRateMarkup(team))}`,
  );
}

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
function chartYear() {
  const years = trackedYears();
  const wanted = view.params.year ?? new Date().getFullYear();
  return Math.min(Math.max(wanted, years[0]), years.at(-1));
}

function monthsOfYear(year) {
  return Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);
}

function yearNav(label) {
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
 * One row per active member, one column per month. Rows are bounded by the
 * member's share in *this* team, not their whole capacity — a person split
 * 60/40 shows against 60 here.
 */
function capacityGridMarkup(team) {
  const months = monthsOfYear(chartYear());
  const roster = P.teamRoster(app, team.id).filter(
    (row) => row.membership.active && row.person.active,
  );

  if (roster.length === 0) {
    return html`<div class="panel"><h2>Capacity</h2>
      <p class="muted">Nobody active in this team yet.</p></div>`;
  }


  const rows = roster
    .map((row) => {
      const cells = months
        .map((month) => {
          const allocated = E.allocatedPct(app, row.person.id, month, team.id);
          const over = allocated > row.membership.sharePct;
          return html`<td class="cap ${over ? 'cap--over' : ''} ${allocated ? 'cap--on' : ''}">
            ${raw(allocated
              ? html`<button type="button" class="cap__btn" data-act="capacity-cell"
                  data-person="${row.person.id}" data-team="${team.id}" data-month="${month}">
                  ${allocated}%${raw(over ? ' ⚠' : '')}</button>`
              // Focusable so arrow keys can cross it. A sparse grid you
              // cannot traverse is worse than no keyboard support at all.
              : html`<span class="cap__empty" tabindex="-1"
                  aria-label="${row.person.name}, ${month}, nothing allocated">—</span>`)}
          </td>`;
        })
        .join('');
      return html`<tr>
        <th scope="row">${row.person.name}
          <span class="micro">share ${row.membership.sharePct}%</span></th>
        ${raw(cells)}
      </tr>`;
    })
    .join('');

  const spareCells = months
    .map((month) => {
      const pct = roster.reduce(
        (total, row) => total + E.nonInitiativeWorkPct(app, row.person.id, team.id, month),
        0,
      );
      const cost = roster.reduce(
        (total, row) => total + E.nonInitiativeWorkCost(app, row.person.id, team.id, month),
        0,
      );
      return html`<td class="cap cap--spare">${pct}%<span class="micro">${money(cost)}</span></td>`;
    })
    .join('');

  return html`<div class="panel">
    <h2>Capacity</h2>
    ${raw(yearNav('Allocation against each member’s share of this team.'))}
    <p class="muted">Over-allocation past a member’s share is flagged, never blocked. Click a
      figure to see which initiatives make it up.</p>
    <div class="scroller"><table class="grid grid--cap">
      <thead><tr><th>Member</th>${raw(months
        .map((m) => html`<th>${m.slice(5)}</th>`).join(''))}</tr></thead>
      <tbody>
        ${raw(rows)}
        <tr class="row--spare"><th scope="row">Non-initiative work
          <span class="micro">share not committed</span></th>${raw(spareCells)}</tr>
      </tbody>
    </table></div>
  </div>`;
}

/** What one capacity cell is made of — a person can serve several at once. */
function capacityCellMarkup(personId, teamId, month) {
  const person = app.PEOPLE[personId];
  const rows = E.allocationBreakdown(app, personId, month, teamId);
  const spare = E.nonInitiativeWorkPct(app, personId, teamId, month);
  const membership = E.membership(person, teamId);

  const items = rows
    .map((row) => {
      const initiative = app.INITIATIVES.find((i) => i.id === row.initiativeId);
      return html`<li><strong>${row.allocationPct}%</strong> ${initiative?.name ?? row.initiativeId}
        <span class="micro">${E.phaseLabel(PROCESS, row.phaseId)}</span></li>`;
    })
    .join('');

  const total = rows.reduce((t, r) => t + r.allocationPct, 0);

  // The membership is resolved at click time, not render time, so it can be
  // gone — a second tab, or an import applied while the grid is open. That is
  // also exactly what an allocation outliving its membership looks like, so
  // say so rather than throwing.
  if (!membership) {
    return html`<h3>${person.name} — ${month}</h3>
      <ul class="popover__list">${raw(items)}</ul>
      <p class="warn">${total}% allocated, but this person no longer holds an active
        membership in this team. The work still costs; the share does not exist.</p>`;
  }

  return html`<h3>${person.name} — ${month}</h3>
    <ul class="popover__list">${raw(items)}</ul>
    <p class="${total > membership.sharePct ? 'warn' : 'muted'}">
      ${total}% of the ${membership.sharePct}% this team holds${raw(total > membership.sharePct
        ? html` — more than its share.`
        : html`, ${spare}% not committed.`)}</p>`;
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
function stackedBarsMarkup(data) {
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

function runRateMarkup(team) {
  const data = E.teamRunRate(app, team.id, monthsOfYear(chartYear()));
  const yearTotal = data.reduce((t, row) => t + row.total, 0);

  return html`<div class="panel">
    <h2>Cost run rate</h2>
    ${raw(yearNav(`${money(yearTotal)} across ${chartYear()}.`))}
    ${raw(yearTotal === 0
      ? html`<p class="muted">Nothing costs anything in this year yet.</p>`
      : stackedBarsMarkup(data))}
  </div>`;
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
        <td class="num">${money(band.lower)}</td>
        <td class="num">${band.upper === null
          ? 'no limit'
          : money(band.upper)}</td>
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
                  ${money(issue.from)} to
                  ${money(issue.to)}. A total landing there
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
    ? `${money(Math.min(...rates))}–${money(Math.max(...rates))}`
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
  } else if (act === 'person-field') {
    const person = app.PEOPLE[id];
    person[field] = field === 'capacityPct' ? readNumber(target.value, person.capacityPct) : target.value;
  } else if (act === 'person-custom-label') {
    app.PEOPLE[id].customRole.label = target.value;
  } else if (act === 'person-rate') {
    P.setCustomRate(app.PEOPLE[id], target.dataset.year, readNumber(target.value, 0));
  } else if (act === 'membership-share') {
    const person = app.PEOPLE[id];
    const team = target.dataset.team;
    const current = person.memberships.find((m) => m.teamId === team);
    P.setMembershipShare(person, team, readNumber(target.value, current.sharePct));
  } else if (act === 'people-filter' || act === 'initiatives-filter') {
    // Search is the one filter that must react per keystroke, and filtering
    // rebuilds the table the box sits above. Re-render, then put the caret
    // back exactly where it was — the invariant is that typing never *loses*
    // the caret, not that nothing may re-render.
    const page = act === 'people-filter' ? 'people' : 'initiatives';
    const filters = { ...(view.params.filters ?? {}), [target.dataset.filter]: target.value };
    const caret = target.selectionStart;
    navigate(page, { ...view.params, filters });
    const restored = document.querySelector(`[data-act="${act}"][data-filter="${target.dataset.filter}"]`);
    if (restored instanceof HTMLInputElement) {
      restored.focus();
      restored.setSelectionRange(caret, caret);
    }
    return;
  } else if (act === 'draft-field') {
    // The draft lives in view params until step 1 is saved, so it survives
    // re-renders without an initiative existing yet.
    const draft = { ...(view.params.draft ?? store.loadDraft()), [field]: target.value };
    view.params = { ...view.params, draft };
    store.saveDraft(draft);
    // Only the create button's enabled state depends on this, so refresh
    // nothing else and leave the caret alone.
    const create = document.querySelector('[data-act="draft-create"]');
    if (create instanceof HTMLButtonElement) create.disabled = !(draft.name ?? '').trim();
    return;
  } else if (act === 'allocation-pct') {
    const initiative = findInitiative(target.dataset.id);
    const phaseId = target.dataset.phase;
    const current = initiative.phases[phaseId].allocations
      .find((a) => a.personId === target.dataset.person);
    L.setAllocation(app, initiative, phaseId, target.dataset.person,
      readNumber(target.value, current.allocationPct));
    commitQuietly();
    return refreshCalcRegions(initiative);
  } else if (act === 'actual-month') {
    const initiative = findInitiative(target.dataset.id);
    const phaseId = target.dataset.phase;
    const raw = target.value.trim();
    L.recordActual(initiative, phaseId, target.dataset.month,
      raw === '' ? null : readNumber(raw, 0));
    commitQuietly();
    // Recording an actual moves the blended figures, not the structure.
    return refreshCalcRegions(initiative);
  } else if (act === 'checklist-note') {
    L.setChecklistNote(findInitiative(target.dataset.id), target.dataset.gate,
      target.dataset.item, target.value);
  } else if (act === 'cost-name') {
    const initiative = findInitiative(target.dataset.id);
    const item = initiative.phases[target.dataset.phase].otherCosts
      .find((c) => c.id === target.dataset.cost);
    item.name = target.value;
  } else if (act === 'team-name') {
    P.renameTeam(app.TEAMS[id], target.value);
  } else if (act === 'general-field') {
    app.GENERAL[field] = readNumber(target.value, app.GENERAL.exportReminderDays);
  } else {
    return;
  }

  commitQuietly();
}

function findInitiative(id) {
  const initiative = app.INITIATIVES.find((i) => i.id === id);
  if (!initiative) throw new Error(`unknown initiative: ${id}`);
  return initiative;
}

/** Clicks: structural changes, which do re-render. */
function onClick(event) {
  if (!(event.target instanceof Element)) return;

  const trigger = event.target.closest('[data-act]');
  const insidePopover = event.target.closest('#popover');
  if (!insidePopover && trigger?.dataset.act !== 'capacity-cell') closePopover();

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

    case 'theme':
      return cycleTheme();
    case 'export':
      if (!store.downloadExport(app)) return undefined;
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

    case 'open-team':
      return navigate('team', { id });
    case 'capacity-cell':
      return openPopover(
        trigger,
        capacityCellMarkup(trigger.dataset.person, trigger.dataset.team, trigger.dataset.month),
      );
    case 'year-step':
      return navigate(view.page, {
        ...view.params,
        year: chartYear() + Number(trigger.dataset.step),
      });
    case 'year-today':
      return navigate(view.page, { ...view.params, year: new Date().getFullYear() });

    case 'wizard-start':
      return navigate('wizard', {});
    case 'draft-discard':
      store.clearDraft();
      return navigate('initiatives', {});
    case 'draft-create': {
      const draft = view.params.draft ?? store.loadDraft();
      if (!(draft.name ?? '').trim()) return undefined;
      const initiative = L.createInitiative(app, PROCESS, {
        name: draft.name.trim(),
        description: draft.description ?? '',
        teamId: draft.teamId ?? Object.keys(app.TEAMS)[0],
        startPhaseId: draft.startPhaseId,
        skipReason: draft.skipReason,
      });
      store.clearDraft();
      store.save(app);
      return navigate('wizard', { id: initiative.id });
    }
    case 'pass-gate': {
      const initiative = findInitiative(id);
      const date = document.querySelector('[data-field="gate-date"]');
      L.passGate(app, PROCESS, initiative, trigger.dataset.gate,
        date instanceof HTMLInputElement && date.value ? date.value : today());
      return commit();
    }
    case 'skip-gate': {
      const initiative = findInitiative(id);
      const field = document.querySelector('[data-field="skip-reason"]');
      const reason = field instanceof HTMLInputElement ? field.value.trim() : '';
      if (!reason) {
        // Refusing silently would look broken; say what is missing.
        if (field instanceof HTMLInputElement) {
          field.placeholder = 'A reason is required before a gate can be skipped';
          field.focus();
        }
        return undefined;
      }
      const date = document.querySelector('[data-field="gate-date"]');
      L.skipGate(app, PROCESS, initiative, trigger.dataset.gate, reason,
        date instanceof HTMLInputElement && date.value ? date.value : today());
      return commit();
    }
    case 'reopen':
      L.reopen(PROCESS, findInitiative(id));
      return commit();

    case 'open-initiative':
      return navigate('initiative', { id });
    case 'duplicate-initiative': {
      const copy = L.duplicate(app, PROCESS, findInitiative(id));
      store.save(app);
      return navigate('initiative', { id: copy.id });
    }
    case 'portfolio-tile': {
      // Clicking the selected tile again clears the filter.
      const band = trigger.dataset.band;
      const next = view.params.bandId === band ? null : band;
      return navigate('portfolio', { ...view.params, bandId: next });
    }
    case 'sort-people': {
      const current = view.params.sort ?? { key: 'name', dir: 'asc' };
      const key = trigger.dataset.key;
      const dir = current.key === key && current.dir === 'asc' ? 'desc' : 'asc';
      return navigate('people', { ...view.params, sort: { key, dir } });
    }
    case 'sort-portfolio': {
      const current = view.params.sort ?? { key: 'effective', dir: 'desc' };
      const key = trigger.dataset.key;
      const dir = current.key === key && current.dir === 'desc' ? 'asc' : 'desc';
      return navigate('portfolio', { ...view.params, sort: { key, dir } });
    }
    case 'sort-initiatives': {
      const current = view.params.sort ?? { key: 'name', dir: 'asc' };
      const key = trigger.dataset.key;
      const dir = current.key === key && current.dir === 'asc' ? 'desc' : 'asc';
      return navigate('initiatives', { ...view.params, sort: { key, dir } });
    }

    case 'allocation-add': {
      const initiative = findInitiative(id);
      const phaseId = trigger.dataset.phase;
      const pick = document.querySelector(`[data-act="allocation-pick"][data-phase="${phaseId}"]`);
      if (pick instanceof HTMLSelectElement) {
        L.setAllocation(app, initiative, phaseId, pick.value, 50);
      }
      return commit();
    }
    case 'allocation-remove': {
      const initiative = findInitiative(id);
      L.setAllocation(app, initiative, trigger.dataset.phase, trigger.dataset.person, 0);
      return commit();
    }
    case 'cost-add': {
      const initiative = findInitiative(id);
      const phaseId = trigger.dataset.phase;
      const monthEl = document.querySelector(`[data-act="new-cost-month"][data-phase="${phaseId}"]`);
      const amountEl = document.querySelector(`[data-act="new-cost-amount"][data-phase="${phaseId}"]`);
      const month = monthEl instanceof HTMLInputElement ? monthEl.value : '';
      const amount = amountEl instanceof HTMLInputElement ? readNumber(amountEl.value, 0) : 0;
      if (!month || !amount) return undefined;
      L.addOtherCost(initiative, phaseId, { name: 'New cost', month, amount });
      return commit();
    }
    case 'cost-remove': {
      const initiative = findInitiative(id);
      const phase = initiative.phases[trigger.dataset.phase];
      phase.otherCosts = phase.otherCosts.filter((c) => c.id !== trigger.dataset.cost);
      return commit();
    }
    case 'team-add': {
      const team = P.createTeam(app);
      store.save(app);
      return navigate('team', { id: team.id });
    }
    case 'team-active':
      P.setTeamActive(app.TEAMS[id], !app.TEAMS[id].active);
      return commit();
    case 'team-delete': {
      // Guarded in the UI too, but never trust the disabled attribute alone.
      if (!P.canDeleteTeam(app, id).ok) return undefined;
      P.deleteTeam(app, id);
      return commit();
    }
    case 'add-member': {
      const select = document.querySelector(`[data-act="add-member-pick"][data-id="${id}"]`);
      if (select instanceof HTMLSelectElement) P.addMembership(app.PEOPLE[select.value], id, 0);
      return commit();
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
      const table = TABLES[trigger.dataset.table];
      store.copyTable(table.headers, table.rows).then((result) => {
        const note = document.querySelector(`[data-note="${trigger.dataset.table}"]`);
        if (note) note.textContent = result === 'failed' ? 'Copy failed' : 'Copied';
      });
      return undefined;
    }
    case 'csv-table': {
      const table = TABLES[trigger.dataset.table];
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
    case 'draft-select': {
      const draft = {
        ...(view.params.draft ?? store.loadDraft()),
        [target.dataset.field]: target.value,
      };
      store.saveDraft(draft);
      return navigate('wizard', { ...view.params, draft });
    }
    case 'initiatives-filter': {
      const filters = { ...(view.params.filters ?? {}) };
      filters[target.dataset.filter] = target.value;
      return navigate('initiatives', { ...view.params, filters });
    }
    case 'initiative-status':
      L.setStatus(findInitiative(id), target.value);
      return commit();
    case 'phase-start':
    case 'phase-end': {
      const initiative = findInitiative(id);
      const phase = initiative.phases[target.dataset.phase];
      const start = act === 'phase-start' ? target.value : phase.estStartDate;
      const end = act === 'phase-end' ? target.value : phase.estEndDate;
      L.setPhasePeriod(initiative, target.dataset.phase, start || null, end || null);
      return commit();
    }
    case 'checklist-status':
      L.setChecklistStatus(findInitiative(id), target.dataset.gate, target.dataset.item,
        target.value);
      return commit();
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

const ARROWS = {
  ArrowUp: [-1, 0],
  ArrowDown: [1, 0],
  ArrowLeft: [0, -1],
  ArrowRight: [0, 1],
};

/**
 * Arrow-key movement between a table's controls. A capacity grid or a month
 * table is a grid of inputs, and reaching the far side of one by Tab alone is
 * punishing.
 *
 * Left and right only move when the caret is already at the end of a text
 * field, so arrowing within a value still works.
 */
function onTableKeydown(event) {
  const step = ARROWS[event.key];
  if (!step || event.metaKey || event.ctrlKey || event.altKey) return;

  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const cell = target.closest('td, th');
  const table = target.closest('table.grid');
  if (!(cell instanceof HTMLTableCellElement) || !(table instanceof HTMLTableElement)) return;

  if (target instanceof HTMLInputElement && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
    const atStart = target.selectionStart === 0 && target.selectionEnd === 0;
    const atEnd = target.selectionStart === target.value.length
      && target.selectionEnd === target.value.length;
    if (event.key === 'ArrowLeft' ? !atStart : !atEnd) return;
  }

  const row = cell.parentElement;
  if (!(row instanceof HTMLTableRowElement)) return;
  const rows = Array.from(table.rows);
  const rowIndex = rows.indexOf(row);
  const cellIndex = Array.from(row.cells).indexOf(cell);
  if (rowIndex === -1 || cellIndex === -1) return;

  const [dr, dc] = step;
  const nextRow = rows[rowIndex + dr];
  if (!nextRow) return;
  const nextCell = nextRow.cells[cellIndex + dc];
  if (!nextCell) return;

  const focusable = nextCell.querySelector('input, select, button, textarea, [tabindex]');
  if (!(focusable instanceof HTMLElement)) return;

  event.preventDefault();
  focusable.focus();
  if (focusable instanceof HTMLInputElement && focusable.type === 'text') focusable.select();
}

/** Picking a file validates it before any choice is offered. */
async function onFileChange(event) {
  const target = event.target;
  if (!(target instanceof HTMLInputElement) || target.dataset.act !== 'import-file') return;
  const file = target.files?.[0];
  if (!file) return;

  const parsed = await store.readImportFile(file);
  pendingImport = parsed.ok ? { data: parsed.data, mode: 'merge', error: null } : { error: parsed.error };
  target.value = '';

  // The preview and its Replace/Merge choice live in Settings. Importing from
  // the shell has to go there, or the file would be read and then vanish.
  if (!document.querySelector('#import-preview')) {
    return navigate('settings', { section: 'data' });
  }
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
  applyTheme(currentTheme());
  document.addEventListener('click', onClick);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') return closePopover();
    return onTableKeydown(event);
  });
  // Fixed positioning does not track the trigger, so follow it explicitly.
  window.addEventListener('scroll', positionPopover, { passive: true, capture: true });
  window.addEventListener('resize', positionPopover);
  document.addEventListener('input', onInput);
  document.addEventListener('change', onChange);
  document.addEventListener('change', onFileChange);
  window.addEventListener('beforeunload', () => store.flush(app));

  render();
  return loadReason;
}
