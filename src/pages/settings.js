/**
 * Settings: one scrolling page, sectioned, with a section nav — a side rail
 * on wide viewports, a sticky bar on narrow (§4.3). Every section renders at
 * once; the nav and the address bar (`#/settings/<section>`) exist to jump
 * between them, not to swap content in and out.
 */
import * as T from '../transfer.js';
import * as E from '../engine.js';
import * as F from '../format.js';
import * as L from '../lifecycle.js';
import * as store from '../store.js';
import {
  app, view, pendingImport, navigate, commit, commitQuietly, restoreCaretAfter, withUndo,
} from '../app.js';
import { html, raw, fill, numberField } from '../render/dom.js';
import { icon } from '../render/icons.js';
import { pageHead, scroller } from '../render/components.js';
import { processSectionMarkup } from '../render/process.js';

const SETTINGS_SECTIONS = [
  { id: 'roles', label: 'Roles', render: renderRoles },
  { id: 'countries', label: 'Countries & rates', render: renderCountries },
  { id: 'process', label: 'Process', render: processSectionMarkup },
  { id: 'general', label: 'General', render: renderGeneral },
  { id: 'data', label: 'Data', render: renderData },
  { id: 'danger', label: 'Danger zone', render: renderDanger },
];

export function renderSettings() {
  const section = view.params.section ?? SETTINGS_SECTIONS[0].id;

  const nav = SETTINGS_SECTIONS.map(
    (item) => html`<button type="button" data-act="section" data-section="${item.id}"
      ${raw(item.id === section ? 'aria-current="location"' : '')}>${item.label}</button>`,
  ).join('');

  const sections = SETTINGS_SECTIONS.map(
    (item) => html`<section id="settings-section-${item.id}" class="panel"
      aria-labelledby="settings-heading-${item.id}">
      <h2 id="settings-heading-${item.id}">${item.label}</h2>
      ${raw(item.render())}
    </section>`,
  ).join('');

  fill(
    'root',
    html`${raw(pageHead({ title: 'Settings' }))}
      <div class="settings-layout">
        <nav class="settings-nav" aria-label="Settings sections">${raw(nav)}</nav>
        <div class="settings-sections">${raw(sections)}</div>
      </div>`,
  );
}

/**
 * Jump to a section without a page reload — called only when the section
 * identity actually changed (from `announceNavigation`, and once from
 * `boot`), never on a quiet re-render triggered by an edit within the
 * section the reader is already looking at.
 */
export function scrollToSettingsSection() {
  const section = view.params.section ?? SETTINGS_SECTIONS[0].id;
  document.getElementById(`settings-section-${section}`)?.scrollIntoView({ block: 'start' });
}

/* ---- roles ---- */

function renderRoles() {
  const confirming = view.params.confirmDeactivate;
  const usageByRole = new Map();
  for (const person of Object.values(app.PEOPLE)) {
    usageByRole.set(person.roleId, (usageByRole.get(person.roleId) ?? 0) + 1);
  }
  const rows = Object.values(app.ROLES)
    .map((role) => {
      const usage = usageByRole.get(role.id) ?? 0;
      const action = role.active && confirming === role.id
        ? html`<span class="field-message">${raw(icon('warning', 'icon--lead'))}Used by
              ${usage} ${usage === 1 ? 'person' : 'people'}.</span>
            <button type="button" class="btn--small btn--danger" data-act="role-active"
              data-id="${role.id}">Yes, deactivate</button>
            <button type="button" class="btn--small" data-act="deactivate-cancel"
              >Cancel</button>`
        : role.active && usage > 0
          ? html`<button type="button" class="btn--small" data-act="role-deactivate-arm"
              data-id="${role.id}">Deactivate</button>`
          : html`<button type="button" class="btn--small" data-act="role-active"
              data-id="${role.id}">${role.active ? 'Deactivate' : 'Reactivate'}</button>`;

      return html`<tr data-id="${role.id}" class="${role.active ? '' : 'row--inactive'}">
        <td><input class="field" data-act="role-field" data-field="name" data-id="${role.id}"
          value="${role.name}" aria-label="Role name" /></td>
        <td><input class="field field--abbr" data-act="role-field" data-field="abbr"
          data-id="${role.id}" value="${role.abbr}" aria-label="Abbreviation" /></td>
        <td>${raw(numberField({ value: role.factor, 'data-act': 'role-field',
          'data-field': 'factor', 'data-id': role.id, 'aria-label': 'Factor',
          extraClass: 'field--pct' }))}</td>
        <td class="cell--action">${raw(action)}</td>
      </tr>`;
    })
    .join('');

  const emptyRow = html`<tr data-id="new">
    <td><input class="field" data-act="role-field" data-field="name" data-id="new"
      placeholder="New role…" aria-label="New role name" /></td>
    <td><input class="field field--abbr" data-act="role-field" data-field="abbr"
      data-id="new" placeholder="Abbr" aria-label="Abbreviation" /></td>
    <td>${raw(numberField({ 'data-act': 'role-field',
      'data-field': 'factor', 'data-id': 'new', 'aria-label': 'Factor', placeholder: '100',
      extraClass: 'field--pct' }))}</td>
    <td></td>
  </tr>`;

  return html`<p class="muted">A role's factor multiplies the day rate that comes from a
      person's country. Roles are never deleted once referenced — deactivate instead.</p>
    ${raw(scroller('Roles', html`<table class="grid">
      <thead><tr><th>Name</th><th>Abbr.</th><th>Factor</th><th></th></tr></thead>
      <tbody>${raw(rows)}${raw(emptyRow)}</tbody>
    </table>`))}`;
}

/* ---- countries & rates ---- */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function renderCountries() {
  const expanded = view.params.expanded ?? null;
  const confirming = view.params.confirmDeactivate;
  const thisYear = new Date().getFullYear();
  const usageByCountry = new Map();
  for (const person of Object.values(app.PEOPLE)) {
    usageByCountry.set(person.countryId, (usageByCountry.get(person.countryId) ?? 0) + 1);
  }

  const rows = Object.values(app.COUNTRIES)
    .map((country) => {
      const years = Object.keys(country.byYear).map(Number).sort((a, b) => a - b);
      const open = expanded === country.id;
      const usage = usageByCountry.get(country.id) ?? 0;
      const zeroRate = (country.byYear[thisYear]?.rate ?? 0) === 0;

      const action = country.active && confirming === country.id
        ? html`<span class="field-message">${raw(icon('warning', 'icon--lead'))}Used by
              ${usage} ${usage === 1 ? 'person' : 'people'}.</span>
            <button type="button" class="btn--small btn--danger" data-act="country-active"
              data-id="${country.id}">Yes, deactivate</button>
            <button type="button" class="btn--small" data-act="deactivate-cancel"
              >Cancel</button>`
        : country.active && usage > 0
          ? html`<button type="button" class="btn--small" data-act="country-deactivate-arm"
              data-id="${country.id}">Deactivate</button>`
          : html`<button type="button" class="btn--small" data-act="country-active"
              data-id="${country.id}">${country.active ? 'Deactivate' : 'Reactivate'}</button>`;

      const yearBlocks = years
        .map((year) => {
          const record = country.byYear[year];
          const cells = MONTHS.map(
            (label, index) => html`<td>
              <span class="micro">${label}</span>
              ${raw(numberField({
                value: record.workingDays[index],
                'data-act': 'country-workday',
                'data-id': country.id,
                'data-year': year,
                'data-month': index,
                'aria-label': `${label} ${year} working days`,
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
              extraClass: `field--money ${record.rate < 0 ? 'field--warn' : ''}`,
            }))}
              ${raw(record.rate < 0
                ? html`<span class="field-message">${raw(icon('warning', 'icon--lead'))}A negative
                    rate pays people to work.</span>`
                : '')}</td>
            <td colspan="12">
              <div class="actions">
                ${raw(numberField({
                  'data-field': 'bulk-workdays',
                  'data-id': country.id,
                  'data-year': year,
                  'aria-label': `Value to apply to every month of ${year}`,
                  placeholder: 'Value',
                  extraClass: 'field--tiny',
                }))}
                <button type="button" class="btn--small" data-act="country-apply-all"
                  data-id="${country.id}" data-year="${year}">Apply to every month</button>
                ${raw(years.length > 1
                  ? html`<button type="button" class="btn--small" data-act="country-copy-year"
                      data-id="${country.id}" data-year="${year}">Copy to other years</button>`
                  : '')}
              </div>
              ${raw(scroller(`Working days in ${year}`,
                html`<table class="months"><tbody><tr>${raw(cells)}</tr></tbody></table>`))}</td>
          </tr>`;
        })
        .join('');

      return html`<tbody data-id="${country.id}" class="${country.active ? '' : 'row--inactive'}">
        <tr>
          <td><input class="field" data-act="country-field" data-field="name" data-id="${country.id}"
            value="${country.name}" aria-label="Country name" />
            ${raw(zeroRate
              ? html`<span class="field-message">${raw(icon('warning', 'icon--lead'))}${thisYear}
                  rate is 0 — everyone here costs nothing this year</span>`
              : '')}</td>
          <td class="cell--action">
            <button type="button" class="btn--small" data-act="country-expand"
              data-id="${country.id}" aria-expanded="${open}"
              >${raw(icon(open ? 'chevron-down' : 'chevron-right'))}${open
                ? 'Hide rates & working days'
                : 'Rates & working days'}</button>
            ${raw(action)}
          </td>
        </tr>
        ${raw(open ? html`<tr><td colspan="2"><table class="grid grid--nested">
          <thead><tr><th>Year</th><th>Day rate</th><th>Working days</th></tr></thead>
          <tbody>${raw(yearBlocks)}</tbody></table></td></tr>` : '')}
      </tbody>`;
    })
    .join('');

  const emptyRow = html`<tbody data-id="new">
    <tr>
      <td><input class="field" data-act="country-field" data-field="name" data-id="new"
        placeholder="New country…" aria-label="New country name" /></td>
      <td></td>
    </tr>
  </tbody>`;

  return html`<p class="muted">Each year carries its own day rate and its own working
      days per month, so a rate rise next year never moves this year's months. Each month
      is prefilled with its real weekday count — lower it for holidays, closures or
      anything else that takes days off the calendar. The window rolls forward
      automatically and keeps last year, for backfilled work.</p>
    ${raw(scroller('Countries', html`<table class="grid">
      <thead><tr><th>Name</th><th></th></tr></thead>
      ${raw(rows)}${raw(emptyRow)}
    </table>`))}`;
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
  <p class="muted">0 turns the reminder off entirely, rather than hiding it.</p>`;
}

/* ---- data ---- */

function renderData() {
  const since = app.GENERAL.lastExportAt
    ? Math.floor((Date.now() - Date.parse(app.GENERAL.lastExportAt)) / 86400000)
    : null;

  return html`<p class="muted">The export carries everything: master data, the process, every
      person, initiative, actual and approval. It is the only backup and the only way to move
      data between machines.</p>
    <p class="muted">${since === null
      ? 'This data has never been exported.'
      : `Last exported ${since} day${since === 1 ? '' : 's'} ago.`}</p>
    <div class="actions">
      <button type="button" class="btn btn--primary" data-act="export">
        ${raw(icon('export'))}Export JSON</button>
      <label class="btn btn--file">${raw(icon('import'))}Import JSON
        <input type="file" accept="application/json,.json" data-act="import-file" hidden />
      </label>
    </div>
    <div id="import-preview">${raw(importPreviewMarkup())}</div>
    <div id="file-status">${raw(fileStatusMarkup())}</div>`;
}

/**
 * A linked file (D4) mirrors every save to a real file on disk, so a
 * background sync folder can carry it without a manual export first —
 * reconciling a copy edited elsewhere is still Import's job (D5). Chromium
 * only, so this renders nothing at all where the API doesn't exist rather
 * than a permanently-disabled control nobody outside Chromium could ever use.
 */
export function fileStatusMarkup() {
  if (!store.fileSystemAccessSupported()) return '';

  const { name, permission, failed } = store.linkedFileStatus();
  if (!name) {
    return html`<p class="muted">Every save can also be written to a file you choose — useful
        for a folder a sync tool already watches. Reconciling a copy edited elsewhere still
        goes through Import above.</p>
      <div class="actions">
        <button type="button" class="btn btn--small" data-act="link-file">
          ${raw(icon('export'))}Link a file…</button>
      </div>`;
  }

  const needsReconnect = permission !== 'granted';
  return html`<p class="${needsReconnect || failed ? 'warn' : 'muted'}">
      ${raw(needsReconnect || failed ? icon('warning', 'icon--lead') : '')}
      ${needsReconnect
        ? html`Was linked to “${name}”, but this browser needs to be asked again before
            writing to it.`
        : failed
          ? html`Linked to “${name}”, but the last write to it failed.`
          : html`Linked to “${name}”. Every save is mirrored there too.`}
    </p>
    <div class="actions">
      ${raw(needsReconnect
        ? html`<button type="button" class="btn btn--small" data-act="reconnect-file">
            Reconnect</button>`
        : '')}
      <button type="button" class="btn btn--small" data-act="unlink-file">Unlink</button>
    </div>`;
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
            <button type="button" class="btn" data-act="export">
              ${raw(icon('export'))}Export first</button>
            <button type="button" class="btn btn--danger" data-act="reset-confirm">
              ${raw(icon('remove'))}Yes, erase everything</button>
            <button type="button" class="btn" data-act="reset-cancel">Cancel</button>
          </div></div>`
      : html`<button type="button" class="btn btn--danger" data-act="reset-arm">
          Reset to a fresh installation</button>`)}`;
}

/* ---- actions ---- */

export const settingsClickActions = {
  'role-active': ({ id }) => {
    const role = app.ROLES[id];
    withUndo(`${role.active ? 'Deactivated' : 'Reactivated'} ${role.name}`, () => {
      role.active = !role.active;
    });
    return commit();
  },
  'role-deactivate-arm': ({ id }) => navigate('settings', { ...view.params, confirmDeactivate: id }),
  'country-active': ({ id }) => {
    const country = app.COUNTRIES[id];
    withUndo(`${country.active ? 'Deactivated' : 'Reactivated'} ${country.name}`, () => {
      country.active = !country.active;
    });
    return commit();
  },
  'country-deactivate-arm': ({ id }) =>
    navigate('settings', { ...view.params, confirmDeactivate: id }),
  'deactivate-cancel': () => navigate('settings', { ...view.params, confirmDeactivate: null }),
  'country-expand': ({ id }) => navigate('settings', {
    section: view.params.section ?? 'roles',
    expanded: view.params.expanded === id ? null : id,
  }),
  'country-apply-all': ({ trigger, id }) => {
    // 48 cells per country typed one at a time is the real pain (§4.3) —
    // this is a scratch value, not itself a data field, so it carries no
    // data-act of its own and is read here rather than committed on input.
    const year = trigger.dataset.year;
    const input = document.querySelector(
      `[data-field="bulk-workdays"][data-id="${id}"][data-year="${year}"]`,
    );
    if (!(input instanceof HTMLInputElement)) return undefined;
    const value = Math.max(0, F.readNumber(input.value, 0));
    withUndo(`Set every ${year} month to ${value} working days`, () => {
      app.COUNTRIES[id].byYear[year].workingDays = Array(12).fill(value);
    });
    return commit();
  },
  'country-copy-year': ({ trigger, id }) => {
    const year = trigger.dataset.year;
    const country = app.COUNTRIES[id];
    withUndo(`Copied ${year}'s working days to every other year`, () => {
      const source = country.byYear[year];
      for (const otherYear of Object.keys(country.byYear)) {
        if (otherYear === year) continue;
        // Working days only — each year keeps its own rate (a rate rise next
        // year must never move this year's months, and vice versa).
        country.byYear[otherYear].workingDays = [...source.workingDays];
      }
    });
    return commit();
  },
  // link-file, unlink-file and reconnect-file all report through
  // watchFileBinding (wired at boot to refreshFileStatus) on every actual
  // state change — a cancelled file picker changes nothing, so nothing
  // needs to redraw for it.
  'link-file': () => { store.linkFile(app); },
  'unlink-file': () => { store.unlinkFile(); },
  // Must run from this click's own gesture — that's the whole reason it's a
  // button rather than something retried automatically.
  'reconnect-file': () => { store.reconnectFile(); },
  'import-mode': ({ trigger }) => {
    pendingImport.mode = trigger.dataset.mode;
    return fill('import-preview', importPreviewMarkup());
  },
  'reset-arm': () => navigate('settings', { section: view.params.section ?? 'roles', armed: true }),
  'reset-cancel': () =>
    navigate('settings', { section: view.params.section ?? 'roles', armed: false }),
};

export const settingsInputActions = {
  'role-field': ({ target, id, field }) => {
    if (id === 'new') {
      const newId = L.newId('role');
      app.ROLES[newId] = { id: newId, name: '', abbr: '', factor: 1, active: true };
      app.ROLES[newId][field] = field === 'factor' ? F.readNumber(target.value, 1) : target.value;
      return restoreCaretAfter(
        target, `[data-act="role-field"][data-field="${field}"][data-id="${newId}"]`, commit,
      );
    }
    const role = app.ROLES[id];
    role[field] = field === 'factor' ? F.readNumber(target.value, role.factor) : target.value;
    commitQuietly();
  },
  'country-field': ({ target, id, field }) => {
    if (id === 'new') {
      const newId = L.newId('country');
      const years = Object.keys(Object.values(app.COUNTRIES)[0]?.byYear ?? {});
      app.COUNTRIES[newId] = {
        id: newId,
        name: target.value,
        active: true,
        // Prefilled with the calendar's own weekday count for that year, so
        // the field shows what a holiday-free month looks like rather than
        // an unexplained zero (§4.3).
        byYear: Object.fromEntries(
          years.map((year) => [year, {
            rate: 0,
            workingDays: Array.from({ length: 12 }, (_, month) => E.weekdaysInMonth(Number(year), month)),
          }]),
        ),
      };
      return restoreCaretAfter(
        target, `[data-act="country-field"][data-field="${field}"][data-id="${newId}"]`, commit,
      );
    }
    app.COUNTRIES[id][field] = target.value;
    commitQuietly();
  },
  'country-rate': ({ target, id }) => {
    const record = app.COUNTRIES[id].byYear[target.dataset.year];
    record.rate = F.readNumber(target.value, record.rate);
    commitQuietly();
  },
  'country-workday': ({ target, id }) => {
    const record = app.COUNTRIES[id].byYear[target.dataset.year];
    const month = Number(target.dataset.month);
    record.workingDays[month] = Math.max(0, F.readNumber(target.value, record.workingDays[month]));
    commitQuietly();
  },
  'general-field': ({ target, field }) => {
    // 0 is a real, meaningful value here — it turns the reminder off — so
    // the bound is only against nonsense, not against the low end.
    const read = F.readNumber(target.value, app.GENERAL.exportReminderDays);
    app.GENERAL[field] = Math.min(365, Math.max(0, read));
    commitQuietly();
  },
};
