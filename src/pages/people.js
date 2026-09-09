/**
 * People: the sortable, filterable roster across every team.
 */
import * as E from '../engine.js';
import { app, view, currentMonth } from '../app.js';
import { html, raw, money, fill } from '../render/dom.js';
import { TABLES, tableActions } from '../render/tables.js';

function selectedMonth() {
  return view.params.month ?? currentMonth();
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
