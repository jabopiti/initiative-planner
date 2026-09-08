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
import * as store from './store.js';

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
  { id: 'bands', label: 'Approval tracks' },
  { id: 'process', label: 'Process' },
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

  fill(
    'root',
    html`<h1>${current.label}</h1>
      <p class="muted">Not built yet — this ${current.kind} page arrives in a later phase.</p>`,
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
    bands: renderBands,
    process: renderProcess,
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
    ? `${E.formatMoney(Math.min(...rates), app.GENERAL.currency)}–${E.formatMoney(Math.max(...rates), app.GENERAL.currency)}`
    : '—';

  const since = app.GENERAL.lastExportAt
    ? Math.floor((Date.now() - Date.parse(app.GENERAL.lastExportAt)) / 86400000)
    : null;

  return html`<div class="tiles">
    ${raw(tile('Teams', Object.keys(app.TEAMS).length))}
    ${raw(tile('People', people.length, `${people.filter((p) => p.active).length} active`))}
    ${raw(tile('Roles', roles.filter((r) => r.active).length))}
    ${raw(tile('Countries', countries.length, range))}
    ${raw(tile('Approval tracks', app.BANDS.length))}
    ${raw(tile('Stages', E.stageOrder(app.PROCESS).length))}
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

/* ---- approval tracks ---- */

function renderBands() {
  const rows = app.BANDS.map(
    (band) => html`<tr data-id="${band.id}">
      <td><input class="field" data-act="band-field" data-field="name" data-id="${band.id}"
        value="${band.name}" aria-label="Track name" /></td>
      <td><input class="field field--short" data-act="band-field" data-field="abbr"
        data-id="${band.id}" value="${band.abbr}" aria-label="Abbreviation" /></td>
      <td>${raw(numberField({ value: band.lower, 'data-act': 'band-field', 'data-field': 'lower', 'data-id': band.id, 'aria-label': 'Lower bound' }))}</td>
      <td>${raw(numberField({ value: band.upper ?? '', 'data-act': 'band-field', 'data-field': 'upper', 'data-id': band.id, 'aria-label': 'Upper bound', placeholder: 'no limit' }))}</td>
      <td>${raw(numberField({ value: band.severity, 'data-act': 'band-field', 'data-field': 'severity', 'data-id': band.id, 'aria-label': 'Severity' }))}</td>
      <td><input class="field" data-act="band-field" data-field="req" data-id="${band.id}"
        value="${band.req}" aria-label="Approval requirement" /></td>
      <td class="cell--action"><button type="button" data-act="band-delete" data-id="${band.id}">
        Delete</button></td>
    </tr>`,
  ).join('');

  return html`<p class="muted">Bounds are lower-inclusive and upper-exclusive; leave the upper
      bound empty for no limit. Severity is a rank, higher meaning stricter — it is ordered
      independently of the amounts, so a cheap track can still demand heavy approval.</p>
    <div class="scroller"><table class="grid">
      <thead><tr><th>Name</th><th>Abbr.</th><th>From</th><th>To</th><th>Severity</th>
        <th>Requirement</th><th></th></tr></thead>
      <tbody>${raw(rows)}</tbody>
    </table></div>
    <div id="band-issues" class="issues">${raw(bandIssuesMarkup())}</div>
    <button type="button" class="btn" data-act="band-add">Add approval track</button>`;
}

/** Live region: recomputed on every keystroke without rebuilding the inputs. */
function bandIssuesMarkup() {
  const issues = E.bandCoverageIssues(app.BANDS);
  if (issues.length === 0) return html`<p class="ok">Every amount is covered exactly once.</p>`;

  const money = (value) => E.formatMoney(value, app.GENERAL.currency);
  return issues
    .map((issue) =>
      issue.type === 'gap'
        ? html`<p class="warn">Gap: nothing covers ${money(issue.from)} to ${money(issue.to)}.
            A total landing there resolves to “Not yet known”.</p>`
        : html`<p class="warn">Overlap: ${issue.message ?? 'two tracks cover the same amounts'}.</p>`,
    )
    .join('');
}

/* ---- process ---- */

function renderProcess() {
  const stages = app.PROCESS.stages;
  const inUse = (stageId) => app.INITIATIVES.filter((i) => i.stage === stageId);

  const fixed = (id, extra = '') => html`<tr>
    <th scope="row" class="fixed">${id === E.DRAFT || id === E.CLOSED ? 'Fixed' : 'Costed phase'}</th>
    <td><input class="field" data-act="process-label" data-stage="${id}"
      value="${app.PROCESS[id].label}" aria-label="Stage name" /></td>
    <td>${raw(extra)}</td>
    <td class="cell--action"><span class="muted">Cannot be removed</span></td>
  </tr>`;

  const gateField = (id) => html`<input class="field" data-act="process-gate" data-stage="${id}"
    value="${app.PROCESS[id].gateLabel}" aria-label="Gate name" />`;

  const statusRows = stages
    .map((stage, index) => {
      const blocking = inUse(stage.id);
      return html`<tr data-id="${stage.id}">
        <th scope="row" class="muted">Status</th>
        <td><input class="field" data-act="stage-label" data-id="${stage.id}"
          value="${stage.label}" aria-label="Stage name" /></td>
        <td class="muted">No cost or capacity</td>
        <td class="cell--action">
          <button type="button" data-act="stage-move" data-id="${stage.id}" data-dir="-1"
            ${raw(index === 0 ? 'disabled' : '')} aria-label="Move earlier">↑</button>
          <button type="button" data-act="stage-move" data-id="${stage.id}" data-dir="1"
            ${raw(index === stages.length - 1 ? 'disabled' : '')} aria-label="Move later">↓</button>
          <button type="button" data-act="stage-delete" data-id="${stage.id}"
            ${raw(blocking.length ? 'disabled' : '')}
            title="${blocking.length ? `In use by ${blocking.length}` : 'Delete this stage'}">
            Delete</button>
        </td>
      </tr>`;
    })
    .join('');

  return html`<p class="muted">One process, shared by every initiative. Only Validation and
      Development carry cost, capacity and a gate; stages after Development record only that
      the initiative reached them. Every name here can be changed. Closing is always the last
      action, whatever the process looks like.</p>
    <div class="scroller"><table class="grid">
      <thead><tr><th>Kind</th><th>Name</th><th>Gate</th><th></th></tr></thead>
      <tbody>
        ${raw(fixed(E.DRAFT))}
        ${raw(fixed(E.VALIDATION, gateField(E.VALIDATION)))}
        ${raw(fixed(E.DEVELOPMENT, gateField(E.DEVELOPMENT)))}
        ${raw(statusRows)}
        ${raw(fixed(E.CLOSED))}
      </tbody>
    </table></div>
    <div id="stage-issues" class="issues">${raw(stageIssuesMarkup())}</div>
    <button type="button" class="btn" data-act="stage-add">Add status stage</button>`;
}

/** Explains, by name, why a stage cannot be deleted (SPEC §7.7). */
function stageIssuesMarkup() {
  const blocked = app.PROCESS.stages
    .map((stage) => ({ stage, using: app.INITIATIVES.filter((i) => i.stage === stage.id) }))
    .filter((entry) => entry.using.length > 0);

  if (blocked.length === 0) return '';
  return blocked
    .map(
      (entry) => html`<p class="warn">“${entry.stage.label}” cannot be deleted:
        ${entry.using.map((i) => i.name).join(', ')} ${entry.using.length === 1 ? 'is' : 'are'}
        currently in it.</p>`,
    )
    .join('');
}

/* ---- general ---- */

function renderGeneral() {
  return html`<div class="fields">
    <label class="field-row">
      <span>Currency symbol</span>
      <input class="field field--short" data-act="general-field" data-field="currency"
        value="${app.GENERAL.currency}" />
    </label>
    <label class="field-row">
      <span>Days before the export reminder appears</span>
      ${raw(numberField({ value: app.GENERAL.exportReminderDays, 'data-act': 'general-field', 'data-field': 'exportReminderDays' }))}
    </label>
  </div>`;
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
const LIVE_REGIONS = {
  'band-field': () => fill('band-issues', bandIssuesMarkup()),
  'stage-label': () => fill('stage-issues', stageIssuesMarkup()),
};

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
  } else if (act === 'band-field') {
    const band = app.BANDS.find((candidate) => candidate.id === id);
    if (field === 'upper') band.upper = target.value.trim() === '' ? null : readNumber(target.value, null);
    else if (field === 'lower' || field === 'severity') band[field] = readNumber(target.value, band[field]);
    else band[field] = target.value;
  } else if (act === 'process-label') {
    app.PROCESS[target.dataset.stage].label = target.value;
  } else if (act === 'process-gate') {
    app.PROCESS[target.dataset.stage].gateLabel = target.value;
  } else if (act === 'stage-label') {
    app.PROCESS.stages.find((stage) => stage.id === id).label = target.value;
  } else if (act === 'general-field') {
    app.GENERAL[field] =
      field === 'exportReminderDays'
        ? readNumber(target.value, app.GENERAL.exportReminderDays)
        : target.value;
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

    case 'band-add': {
      const highest = app.BANDS.reduce((max, b) => Math.max(max, b.upper ?? b.lower), 0);
      app.BANDS.push({
        id: L.newId('band'),
        name: 'New track',
        abbr: 'NEW',
        lower: highest,
        upper: null,
        req: '',
        severity: app.BANDS.length + 1,
      });
      return commit();
    }
    case 'band-delete':
      app.BANDS = app.BANDS.filter((band) => band.id !== id);
      return commit();

    case 'stage-add':
      app.PROCESS.stages.push({ id: L.newId('stage'), label: 'New stage' });
      return commit();
    case 'stage-move': {
      const stages = app.PROCESS.stages;
      const from = stages.findIndex((stage) => stage.id === id);
      const to = from + Number(trigger.dataset.dir);
      if (to < 0 || to >= stages.length) return undefined;
      [stages[from], stages[to]] = [stages[to], stages[from]];
      return commit();
    }
    case 'stage-delete': {
      // Guarded in the UI too, but never trust the disabled attribute alone.
      if (app.INITIATIVES.some((initiative) => initiative.stage === id)) return undefined;
      app.PROCESS.stages = app.PROCESS.stages.filter((stage) => stage.id !== id);
      return commit();
    }

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
  document.addEventListener('change', onFileChange);
  window.addEventListener('beforeunload', () => store.flush(app));

  render();
  return loadReason;
}
