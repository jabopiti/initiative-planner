import * as F from '../format.js';
/**
 * Person detail: identity and rate, team memberships, initiatives and
 * capacity over time.
 */
import * as E from '../engine.js';
import * as P from '../people.js';
import { PROCESS } from '../process.js';
import * as store from '../store.js';
import { app, view, navigate, commit, commitQuietly, withUndo } from '../app.js';
import { html, raw, fill, numberField } from '../render/dom.js';
import { icon } from '../render/icons.js';
import { pageHead, scroller, empty, badge } from '../render/components.js';
import { TABLES, tableActions } from '../render/tables.js';

export function renderPerson() {
  if (view.params.id === 'new') return renderPersonDraft();

  const person = app.PEOPLE[view.params.id];
  if (!person) return navigate('people');

  const warning = P.shareWarning(person);
  const initiativeRows = E.personInitiatives(app, person.id);
  const stranded = E.strandedAllocations(app, person.id, initiativeRows);
  const months = E.windowMonths(app);

  fill(
    'root',
    html`${raw(pageHead({
      title: person.name,
      back: { page: 'people', label: 'People' },
      actions: html`<button type="button" class="btn" data-act="person-active"
        data-id="${person.id}">${person.active ? 'Deactivate' : 'Reactivate'}</button>`,
    }))}
      ${raw(person.active ? '' : html`<p class="panel banner banner--alert warn">
        ${raw(icon('warning', 'icon--lead'))}This person is deactivated. Existing allocations
        keep costing; they draw no new capacity.</p>`)}
      <div class="panel">${raw(personIdentity(person))}</div>
      <div class="panel">${raw(personTeams(person, warning, stranded))}</div>
      <div class="panel">${raw(personInitiativesPanel(person, initiativeRows, stranded))}</div>
      <div class="panel">${raw(personCapacity(person, months))}</div>`,
  );
}

/**
 * A person is not created until Save — Cancel leaves nothing behind (D1).
 * Country and role are offered up front, same as the wizard offers team and
 * starting phase, so the rate is right from the first save rather than
 * needing a second visit; both already default sensibly if left alone.
 */
function renderPersonDraft() {
  const draft = view.params.draft ?? {};
  const countryId = draft.countryId ?? Object.keys(app.COUNTRIES)[0];
  const roleId = draft.roleId ?? Object.keys(app.ROLES)[0];

  const countryOptions = Object.values(app.COUNTRIES)
    .filter((c) => c.active)
    .map((c) => html`<option value="${c.id}" ${raw(c.id === countryId ? 'selected' : '')}>
      ${c.name}</option>`)
    .join('');
  const roleOptions = Object.values(app.ROLES)
    .filter((r) => r.active)
    .map((r) => html`<option value="${r.id}" ${raw(r.id === roleId ? 'selected' : '')}>
      ${r.name}</option>`)
    .join('');

  fill(
    'root',
    html`${raw(pageHead({ title: 'New person', back: { page: 'people', label: 'People' } }))}
      <div class="panel">
        <div class="fields">
          <label class="field-row"><span>Name</span>
            <input class="field" data-act="person-draft-field" data-field="name"
              value="${draft.name ?? ''}" placeholder="Who is it?" autofocus /></label>
          <label class="field-row"><span>Country</span>
            <select class="field field--select" data-act="person-draft-select"
              data-field="countryId">${raw(countryOptions)}</select></label>
          <label class="field-row"><span>Role</span>
            <select class="field field--select" data-act="person-draft-select"
              data-field="roleId">${raw(roleOptions)}</select></label>
        </div>
        <div class="actions">
          <button type="button" class="btn btn--primary" data-act="person-draft-create"
            ${raw((draft.name ?? '').trim() ? '' : 'disabled')}
            >${raw(icon('add'))}Create person</button>
          <button type="button" class="btn" data-act="person-draft-discard">Cancel</button>
        </div>
        ${raw((draft.name ?? '').trim() ? '' : html`<p class="muted">A name is needed first.</p>`)}
      </div>`,
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
        .map((year) => {
          const rate = person.customRole.byYear[year] ?? 0;
          return html`<tr><th scope="row">${year}</th><td>${raw(numberField({
              value: rate,
              'data-act': 'person-rate',
              'data-id': person.id,
              'data-year': year,
              'aria-label': `${year} day rate`,
              extraClass: `field--money ${rate < 0 ? 'field--warn' : ''}`,
            }))}
            ${raw(rate < 0
              ? html`<span class="field-message">${raw(icon('warning', 'icon--lead'))}A negative
                  rate pays this person to work.</span>`
              : '')}</td></tr>`;
        })
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
        ${raw(numberField({ value: person.capacityPct, 'data-act': 'person-field',
          'data-field': 'capacityPct', 'data-id': person.id, extraClass: 'field--pct' }))}</label>
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
          the role factor does not apply. Working days still come from the person's country.</p>
        ${raw(scroller('Day rate per year', html`<table class="grid grid--narrow">
          <thead><tr><th>Year</th><th>Day rate</th></tr></thead>
          <tbody>${raw(rateRows)}</tbody></table>`))}`
      : html`<p class="muted">The rate comes from this person's country for the year being
          costed, multiplied by the role's factor.</p>`)}`;
}

function personTeams(person, warning, stranded) {
  const rows = (person.memberships ?? [])
    .map((membership) => {
      const team = app.TEAMS[membership.teamId];
      const strandedHere = stranded.filter((row) => row.initiative.teamId === membership.teamId);
      return html`<tr class="row--clickable ${membership.active ? '' : 'row--inactive'}">
        <td><a class="row-link" href="#/team/${membership.teamId}">${team?.name ?? membership.teamId}</a></td>
        <td>${raw(numberField({
          value: membership.sharePct,
          'data-act': 'membership-share',
          'data-id': person.id,
          'data-team': membership.teamId,
          'aria-label': 'Team FTE %',
          extraClass: `field--pct ${warning.overCommitted ? 'field--warn' : ''}`,
        }))}</td>
        <td class="cell--wrap">${raw(strandedHere.length
          ? html`<span class="field-message">${raw(icon('warning', 'icon--lead'))}${strandedHere.length}
              allocation${strandedHere.length === 1 ? '' : 's'} still costing</span>`
          : '')}</td>
        <td class="cell--action">
          <button type="button" class="btn--small" data-act="membership-active"
            data-id="${person.id}" data-team="${membership.teamId}"
            >${membership.active ? 'Leave team' : 'Rejoin'}</button>
        </td>
      </tr>`;
    })
    .join('');

  const joinable = Object.values(app.TEAMS).filter(
    (team) => !(person.memberships ?? []).some((m) => m.teamId === team.id && m.active),
  );

  return html`<h2>Teams</h2>
    <p class="muted">A Team FTE is how much of this person one team holds. Each team draws only
      on its own Team FTE, which is what keeps someone split across teams from being counted
      twice.</p>
    ${raw(rows
      ? scroller('Team memberships', html`<table class="grid">
          <thead><tr><th>Team</th><th>Team FTE %</th><th></th><th></th></tr></thead>
          <tbody>${raw(rows)}</tbody></table>`)
      : empty('No team yet — valid, and costs nothing. This person is on the bench.'))}
    <p class="${warning.overCommitted ? 'warn' : 'muted'}">
      ${warning.totalSharePct}% of ${warning.capacityPct}% assigned${raw(warning.overCommitted
        ? html` — more than this person has. Allowed, but worth a look.`
        : html`, ${warning.unassignedPct}% unassigned.`)}</p>
    ${raw(joinable.length
      ? html`<div class="actions">
          <select class="field field--select" data-act="join-team-pick" data-id="${person.id}">
            ${raw(joinable.map((team) => html`<option value="${team.id}">${team.name}</option>`).join(''))}
          </select>
          <button type="button" class="btn" data-act="join-team" data-id="${person.id}"
            >${raw(icon('add'))}Add to team</button>
        </div>`
      : '')}`;
}

function personInitiativesPanel(person, rows, stranded) {
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
      (row) => html`<tr class="row--clickable ${strandedIds.has(`${row.initiative.id}:${row.phaseId}`) ? 'row--warn' : ''}">
        <td><a class="row-link" href="#/initiative/${row.initiative.id}">${row.initiative.name}</a></td>
        <td><a href="#/team/${row.initiative.teamId}" class="link">${app.TEAMS[row.initiative.teamId]?.name ?? row.initiative.teamId}</a></td>
        <td>${E.phaseLabel(PROCESS, row.phaseId)}</td>
        <td>${row.allocationPct}</td>
        <td>${F.date(row.start)}</td>
        <td>${F.date(row.end)}</td>
        <td>${raw(row.countsTowardCapacity ? '' : badge('not in capacity', 'quiet'))}</td>
      </tr>`,
    )
    .join('');

  return html`<h2>Initiatives</h2>
    ${raw(stranded.length
      ? html`<p class="warn">${raw(icon('warning', 'icon--lead'))}Still allocated to
          ${stranded.map((row) => row.initiative.name).join(', ')} without an active membership
          in that team. These keep costing.</p>`
      : '')}
    ${raw(rows.length
      ? scroller('Initiatives this person is allocated to', html`<table class="grid">
          <thead><tr>${raw(headers.map((h) => html`<th>${h}</th>`).join(''))}<th></th></tr></thead>
          <tbody>${raw(body)}</tbody></table>`) + tableActions('personInitiatives', 'initiatives')
      : empty('Not allocated to anything yet. Allocate them from a costed phase on an '
          + 'initiative their team owns.'))}`;
}

function personCapacity(person, months) {
  const rows = P.capacityOverTime(app, person.id, months);
  const teams = rows[0]?.nonInitiative ?? [];
  const headers = ['Month', 'Allocated %', 'Capacity %', ...teams.map((t) => `${t.name} non-initiative work %`)];
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
        <td>${F.month(row.month)}</td>
        <td class="num ${row.overAllocated ? 'over' : ''}">${row.allocatedPct}%${raw(
          row.overAllocated ? icon('warning', 'icon--lead') : '')}</td>
        <td class="num">${row.capacityPct}%</td>
        ${raw(row.nonInitiative.map((entry) => html`<td class="num">${entry.pct}%</td>`).join(''))}
      </tr>`,
    )
    .join('');

  return html`<h2>Capacity over time</h2>
    <p class="muted">Every month in the rolling window. “Non-initiative work” is the Team FTE a
      team holds but has not committed to any initiative — ongoing work, not idle time.</p>
    ${raw(scroller('Capacity month by month', html`<table class="grid">
      <thead><tr>${raw(headers.map((h) => html`<th>${h}</th>`).join(''))}</tr></thead>
      <tbody>${raw(body)}</tbody>
    </table>`, 'scroller--tall'))}
    ${raw(tableActions('personCapacity', 'capacity'))}`;
}

export const personClickActions = {
  'person-draft-discard': () => navigate('people', {}),
  'person-draft-create': () => {
    const draft = view.params.draft ?? {};
    const name = (draft.name ?? '').trim();
    if (!name) return undefined;
    const person = P.createPerson(app, {
      name,
      countryId: draft.countryId,
      roleId: draft.roleId,
    });
    store.save(app);
    return navigate('person', { id: person.id });
  },
  'person-active': ({ id }) => {
    const person = app.PEOPLE[id];
    withUndo(`${person.active ? 'Deactivated' : 'Reactivated'} ${person.name}`, () => {
      P.setPersonActive(person, !person.active);
    });
    return commit();
  },
  'join-team': ({ id }) => {
    const select = document.querySelector(`[data-act="join-team-pick"][data-id="${id}"]`);
    if (!(select instanceof HTMLSelectElement)) return commit();
    const person = app.PEOPLE[id];
    withUndo(`Added ${person.name} to the team`, () => {
      P.addMembership(person, select.value, 0);
    });
    return commit();
  },
};

export const personChangeActions = {
  'person-draft-select': ({ target }) => {
    const draft = { ...view.params.draft, [target.dataset.field]: target.value };
    return navigate('person', { ...view.params, draft });
  },
  'person-country': ({ target, id }) => {
    const person = app.PEOPLE[id];
    withUndo(`Changed ${person.name}'s country`, () => {
      person.countryId = target.value;
    });
    return commit();
  },
  'person-role': ({ target, id }) => {
    const person = app.PEOPLE[id];
    withUndo(`Changed ${person.name}'s role`, () => {
      P.useStandardRole(person, target.value);
    });
    return commit();
  },
  'rate-kind': ({ target, id }) => {
    const person = app.PEOPLE[id];
    withUndo(`Switched ${person.name} to a ${target.dataset.kind === 'custom' ? 'custom' : 'standard'} rate`, () => {
      if (target.dataset.kind === 'custom') P.useCustomRole(app, person);
      else P.useStandardRole(person);
    });
    return commit();
  },
};

export const personInputActions = {
  'person-field': ({ target, id, field }) => {
    const person = app.PEOPLE[id];
    person[field] = field === 'capacityPct' ? F.readNumber(target.value, person.capacityPct) : target.value;
    commitQuietly();
  },
  'person-custom-label': ({ target, id }) => {
    app.PEOPLE[id].customRole.label = target.value;
    commitQuietly();
  },
  'person-rate': ({ target, id }) => {
    P.setCustomRate(app.PEOPLE[id], target.dataset.year, F.readNumber(target.value, 0));
    commitQuietly();
  },
  'membership-share': ({ target, id }) => {
    const person = app.PEOPLE[id];
    const team = target.dataset.team;
    const current = person.memberships.find((m) => m.teamId === team);
    P.setMembershipShare(person, team, F.readNumber(target.value, current.sharePct));
    commitQuietly();
  },
  // Neither team nor person exists yet, so — unlike every other draft — an
  // in-memory params object is enough; there is nothing worth surviving a
  // reload before a name has even been typed (D1).
  'person-draft-field': ({ target, field }) => {
    const draft = { ...view.params.draft, [field]: target.value };
    view.params = { ...view.params, draft };
    const create = document.querySelector('[data-act="person-draft-create"]');
    if (create instanceof HTMLButtonElement) create.disabled = !(draft.name ?? '').trim();
  },
};
