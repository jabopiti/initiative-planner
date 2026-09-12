import * as F from '../format.js';
/**
 * People: the sortable, filterable roster across every team.
 */
import * as E from '../engine.js';
import { app, view, currentMonth, navigate } from '../app.js';
import { html, raw, fill } from '../render/dom.js';
import { icon } from '../render/icons.js';
import { pageHead, scroller, empty, badge, sortHeader, sortRows } from '../render/components.js';
import { TABLES, tableActions } from '../render/tables.js';

function selectedMonth() {
  return view.params.month ?? currentMonth();
}

function monthPicker() {
  const months = E.windowMonths(app);
  const selected = selectedMonth();
  const options = months
    .map((month) => html`<option value="${F.month(month)}" ${raw(month === selected ? 'selected' : '')}>
      ${F.month(month)}</option>`)
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

export function renderPeople() {
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
    // Computed once and reused below rather than re-derived per column: this
    // runs on every keystroke in the search box above.
    const allocated = E.allocatedPct(app, person.id, month);
    const utilisation = person.capacityPct ? (allocated / person.capacityPct) * 100 : 0;
    return {
      person,
      allocated,
      utilisation,
      row: [
        person.name,
        E.roleLabel(person, app.ROLES),
        app.COUNTRIES[person.countryId]?.name ?? '',
        Math.round(dayRate * factor),
        person.capacityPct,
        teams || '—',
        allocated,
        Math.round(utilisation),
      ],
    };
  });
  const sorted = sortRows(data, PEOPLE_COLUMNS, sort);
  TABLES.people = { headers, rows: sorted.map((entry) => entry.row), name: `people-${F.month(month)}` };

  const sortableHeaders = PEOPLE_COLUMNS.map(
    (c) => sortHeader(c, sort, { 'data-act': 'sort' }),
  ).join('');

  const rows = sorted
    .map(
      (entry) => html`<tr class="row--clickable ${entry.person.active ? '' : 'row--inactive'}">
        <td><a class="row-link" href="#/person/${entry.person.id}">${entry.person.name}</a>
          ${raw(entry.person.active ? '' : badge('inactive', 'quiet'))}</td>
        <td>${entry.row[1]} ${raw(entry.person.customRole ? badge('custom rate', 'info') : '')}</td>
        <td>${entry.row[2]}</td>
        <td class="num">${F.money(entry.row[3])}</td>
        <td class="num">${entry.person.capacityPct}%</td>
        <td>${entry.row[5]}</td>
        <td class="num">${entry.allocated}%</td>
        <td class="num ${entry.utilisation > 100 ? 'over' : ''}">
          ${Math.round(entry.utilisation)}%${raw(entry.utilisation > 100
            ? icon('warning', 'icon--lead')
            : '')}</td>
        <td class="cell--action">
          <button type="button" class="btn--small" data-act="person-active"
            data-id="${entry.person.id}">
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
    html`${raw(pageHead({
      title: 'People',
      lede: 'A person exists independently of any team, which is what lets one belong to two. '
        + 'Every figure below describes the selected month.',
      actions: html`<button type="button" class="btn btn--primary" data-act="person-add">
        ${raw(icon('add'))}New person</button>`,
    }))}
      <div class="toolbar">
        ${raw(monthPicker())}
        <label class="field-inline">${raw(icon('search'))}<span class="sr-only">Search</span>
          <input class="field field--search" data-act="filter" data-filter="q"
            value="${filters.q ?? ''}" placeholder="Search by name" /></label>
        <label class="field-inline"><span>Team</span>
          <select class="field field--select" data-act="filter" data-filter="teamId">
            <option value="">All</option>${raw(teamOptions)}</select></label>
        <label class="field-inline"><span>Role</span>
          <select class="field field--select" data-act="filter" data-filter="roleId">
            <option value="">All</option>${raw(Object.values(app.ROLES)
              .map((role) => html`<option value="${role.id}"
                ${raw(filters.roleId === role.id ? 'selected' : '')}>${role.name}</option>`)
              .join(''))}</select></label>
        <label class="field-inline"><span>Country</span>
          <select class="field field--select" data-act="filter" data-filter="countryId">
            <option value="">All</option>${raw(Object.values(app.COUNTRIES)
              .map((c) => html`<option value="${c.id}"
                ${raw(filters.countryId === c.id ? 'selected' : '')}>${c.name}</option>`)
              .join(''))}</select></label>
        <label class="field-inline"><input type="checkbox" data-act="filter"
          data-filter="showInactive" ${raw(filters.showInactive ? 'checked' : '')} />
          <span>Show inactive</span></label>
      </div>
      ${raw(data.length
        ? scroller(`People in ${F.month(month)}`, html`<table class="grid">
            <thead><tr>${raw(sortableHeaders)}<th></th></tr></thead>
            <tbody>${raw(rows)}</tbody>
          </table>`) + tableActions('people', 'table')
        : Object.keys(app.PEOPLE).length === 0
          ? empty('Nobody here yet. People are added once and then shared between teams.', {
              icon: 'add',
              action: html`<button type="button" class="btn btn--primary" data-act="person-add">
                ${raw(icon('add'))}New person</button>`,
            })
          : empty('Nobody matches those filters.', { icon: 'filter' }))}`,
  );
}

export const peopleClickActions = {
  // Nothing is created yet — Cancel on the draft below leaves no record
  // behind (D1, and the review's "a person is just created with no
  // chance to cancel").
  'person-add': () => navigate('person', { id: 'new' }),
};
