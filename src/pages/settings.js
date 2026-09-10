import * as F from '../format.js';
/**
 * Settings: one page, sectioned by a tab strip. Each section is its own
 * region, replaced wholesale when the tab changes.
 */
import * as E from '../engine.js';
import * as T from '../transfer.js';
import { app, view, pendingImport } from '../app.js';
import { html, raw, fill, numberField } from '../render/dom.js';
import { icon } from '../render/icons.js';
import { pageHead, scroller } from '../render/components.js';

const SETTINGS_SECTIONS = [
  { id: 'overview', label: 'Overview' },
  { id: 'roles', label: 'Roles' },
  { id: 'countries', label: 'Countries & rates' },
  { id: 'general', label: 'General' },
  { id: 'data', label: 'Data' },
  { id: 'danger', label: 'Danger zone' },
];

export function renderSettings() {
  const section = view.params.section ?? 'overview';
  const tabs = SETTINGS_SECTIONS.map(
    (item) => html`<button type="button" role="tab" data-act="section" data-section="${item.id}"
      aria-selected="${item.id === section}">${item.label}</button>`,
  ).join('');

  fill(
    'root',
    html`${raw(pageHead({ title: 'Settings' }))}
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
    ? `${F.money(Math.min(...rates))}–${F.money(Math.max(...rates))}`
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
        <td><input class="field field--abbr" data-act="role-field" data-field="abbr"
          data-id="${role.id}" value="${role.abbr}" aria-label="Abbreviation" /></td>
        <td>${raw(numberField({ value: role.factor, 'data-act': 'role-field',
          'data-field': 'factor', 'data-id': role.id, 'aria-label': 'Factor',
          extraClass: 'field--pct' }))}</td>
        <td class="cell--action"><button type="button" class="btn--small" data-act="role-active"
          data-id="${role.id}">${role.active ? 'Deactivate' : 'Reactivate'}</button></td>
      </tr>`,
    )
    .join('');

  return html`<p class="muted">A role's factor multiplies the day rate that comes from a
      person's country. Roles are never deleted once referenced — deactivate instead.</p>
    ${raw(scroller('Roles', html`<table class="grid">
      <thead><tr><th>Name</th><th>Abbr.</th><th>Factor</th><th></th></tr></thead>
      <tbody>${raw(rows)}</tbody>
    </table>`))}
    <div class="actions"><button type="button" class="btn" data-act="role-add"
      >${raw(icon('add'))}Add role</button></div>`;
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
              extraClass: 'field--money',
            }))}</td>
            <td colspan="12">${raw(scroller(`Reduced working days in ${year}`,
              html`<table class="months"><tbody><tr>${raw(cells)}</tr></tbody></table>`))}</td>
          </tr>`;
        })
        .join('');

      return html`<tbody data-id="${country.id}" class="${country.active ? '' : 'row--inactive'}">
        <tr>
          <td><input class="field" data-act="country-field" data-field="name" data-id="${country.id}"
            value="${country.name}" aria-label="Country name" /></td>
          <td class="cell--action">
            <button type="button" class="btn--small" data-act="country-expand"
              data-id="${country.id}" aria-expanded="${open}"
              >${raw(icon(open ? 'chevron-down' : 'chevron-right'))}${open
                ? 'Hide rates'
                : 'Rates & holidays'}</button>
            <button type="button" class="btn--small" data-act="country-active"
              data-id="${country.id}">${country.active ? 'Deactivate' : 'Reactivate'}</button>
          </td>
        </tr>
        ${raw(open ? html`<tr><td colspan="2"><table class="grid grid--nested">
          <thead><tr><th>Year</th><th>Day rate</th><th>Reduced working days</th></tr></thead>
          <tbody>${raw(yearBlocks)}</tbody></table></td></tr>` : '')}
      </tbody>`;
    })
    .join('');

  return html`<p class="muted">Each year carries its own day rate and its own holiday
      reductions, so a rate rise next year never moves this year's months. The window
      rolls forward automatically and keeps last year, for backfilled work.</p>
    ${raw(scroller('Countries', html`<table class="grid">
      <thead><tr><th>Name</th><th></th></tr></thead>
      ${raw(rows)}
    </table>`))}
    <div class="actions"><button type="button" class="btn" data-act="country-add"
      >${raw(icon('add'))}Add country</button></div>`;
}

/* ---- general ---- */

function renderGeneral() {
  return html`<div class="fields">
    <label class="field-row">
      <span>Days before the export reminder appears</span>
      ${raw(numberField({ value: app.GENERAL.exportReminderDays, 'data-act': 'general-field',
        'data-field': 'exportReminderDays', extraClass: 'field--pct' }))}
    </label>
  </div>
  <p class="muted">The currency symbol is fixed by this build and shown on the
    <button type="button" class="link" data-act="page" data-page="process">Process</button>
    page, not here.</p>`;
}

/* ---- data ---- */

function renderData() {
  return html`<p class="muted">The export carries everything: master data, the process, every
      person, initiative, actual and approval. It is the only backup and the only way to move
      data between machines.</p>
    <div class="actions">
      <button type="button" class="btn btn--primary" data-act="export">
        ${raw(icon('export'))}Export JSON</button>
      <label class="btn btn--file">${raw(icon('import'))}Import JSON
        <input type="file" accept="application/json,.json" data-act="import-file" hidden />
      </label>
    </div>
    <div id="import-preview">${raw(importPreviewMarkup())}</div>`;
}

export function importPreviewMarkup() {
  if (!pendingImport) return '';
  if (pendingImport.error) {
    return html`<div class="issues"><p class="warn">${raw(icon('warning', 'icon--lead'))}${
      pendingImport.error}</p></div>`;
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
            (c) => html`<p class="warn">${raw(icon('warning', 'icon--lead'))}This would
              ${c.wouldBeCleared ? 'clear' : 'overwrite'} a recorded approval on
              “${c.name}”.</p>`,
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
    ${raw(scroller('What the import changes', html`<table class="grid">
      <thead><tr><th></th><th>Added</th><th>Changed</th><th>Removed</th></tr></thead>
      <tbody>${raw(counts)}</tbody>
    </table>`))}
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
      ? html`<div class="issues"><p class="warn">${raw(icon('warning', 'icon--lead'))}This will
            erase everything. There is no undo.</p>
          <div class="actions">
            <button type="button" class="btn btn--danger" data-act="reset-confirm">
              ${raw(icon('remove'))}Yes, erase everything</button>
            <button type="button" class="btn" data-act="reset-cancel">Cancel</button>
          </div></div>`
      : html`<button type="button" class="btn btn--danger" data-act="reset-arm">
          Reset to a fresh installation</button>`)}`;
}
