import * as F from '../format.js';
/**
 * Team detail: roster, initiatives, capacity grid and run rate.
 */
import * as E from '../engine.js';
import * as P from '../people.js';
import { PROCESS } from '../process.js';
import { app, view, navigate } from '../app.js';
import { html, raw, fill, numberField } from '../render/dom.js';
import { icon } from '../render/icons.js';
import { pageHead, scroller, empty, badge } from '../render/components.js';
import { chartYear, monthsOfYear, yearNav, stackedBarsMarkup } from '../render/charts.js';

export function renderTeam() {
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
          ${raw(row.person.active ? '' : badge('person inactive', 'quiet'))}</td>
        <td>${E.roleLabel(row.person, app.ROLES)}</td>
        <td>${raw(numberField({
          value: row.membership.sharePct,
          'data-act': 'membership-share',
          'data-id': row.person.id,
          'data-team': team.id,
          'aria-label': `${row.person.name} share`,
          extraClass: 'field--pct',
        }))}</td>
        <td class="num">${row.person.capacityPct}%</td>
        <td class="cell--wrap">${raw(warning.overCommitted
          ? html`<span class="warn">${raw(icon('warning', 'icon--lead'))}${warning.totalSharePct}%
              of ${warning.capacityPct}% assigned across all teams</span>`
          : '')}</td>
        <td class="cell--action">
          <button type="button" class="btn--small" data-act="membership-active"
            data-id="${row.person.id}" data-team="${team.id}"
            >${row.membership.active ? 'Leave team' : 'Rejoin'}</button>
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
        <td class="num">${F.money(E.grandTotal(initiative, app))}</td>
      </tr>`,
    )
    .join('');

  fill(
    'root',
    html`${raw(pageHead({
      title: team.name,
      back: { page: 'teams', label: 'Teams' },
      actions: html`<button type="button" class="btn" data-act="team-active"
        data-id="${team.id}">${team.active ? 'Deactivate' : 'Reactivate'}</button>`,
    }))}
      ${raw(team.active ? '' : html`<p class="panel banner banner--alert warn">
        ${raw(icon('warning', 'icon--lead'))}This team is deactivated.</p>`)}

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
          ? scroller('Team roster', html`<table class="grid">
              <thead><tr><th>Person</th><th>Role</th><th>Share %</th><th>Capacity %</th>
                <th></th><th></th></tr></thead>
              <tbody>${raw(rosterRows)}</tbody></table>`)
          : empty('Nobody has joined yet. Add someone who already exists as a person.'))}
        ${raw(joinable.length
          ? html`<div class="actions">
              <select class="field field--select" data-act="add-member-pick" data-id="${team.id}">
                ${raw(joinable.map((p) => html`<option value="${p.id}">${p.name}</option>`).join(''))}
              </select>
              <button type="button" class="btn" data-act="add-member" data-id="${team.id}">
                ${raw(icon('add'))}Add to team</button>
            </div>`
          : html`<p class="muted">Everyone active already belongs to this team.</p>`)}
      </div>

      <div class="panel">
        <h2>Initiatives</h2>
        ${raw(initiatives.length
          ? scroller('Initiatives owned by this team', html`<table class="grid">
              <thead><tr><th>Name</th><th>Phase</th><th>Status</th><th>Total</th></tr></thead>
              <tbody>${raw(initiativeRows)}</tbody></table>`)
          : empty('This team has no initiatives yet.'))}
        ${raw(deletable.ok
          ? ''
          : html`<p class="muted">This team cannot be deleted while it owns initiatives.</p>`)}
      </div>

      ${raw(capacityGridMarkup(team))}
      ${raw(runRateMarkup(team))}`,
  );
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
      ${raw(empty('Nobody active in this team yet.'))}</div>`;
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
                  data-person="${row.person.id}" data-team="${team.id}" data-month="${F.month(month)}"
                  title="${row.person.name}, ${F.month(month)}: ${allocated}% allocated">
                  ${allocated}%${raw(over ? icon('warning') : '')}</button>`
              // Focusable so arrow keys can cross it. A sparse grid you
              // cannot traverse is worse than no keyboard support at all.
              : html`<span class="cap__empty" tabindex="-1"
                  aria-label="${row.person.name}, ${F.month(month)}, nothing allocated">—</span>`)}
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
      return html`<td class="cap cap--spare">${pct}%<span class="micro">${F.money(cost)}</span></td>`;
    })
    .join('');

  return html`<div class="panel">
    <h2>Capacity</h2>
    ${raw(yearNav('Allocation against each member’s share of this team.'))}
    <p class="muted">Over-allocation past a member’s share is flagged, never blocked. Click a
      figure to see which initiatives make it up.</p>
    ${raw(scroller('Allocation per member per month', html`<table class="grid grid--cap">
      <thead><tr><th>Member</th>${raw(months
        .map((m) => html`<th>${m.slice(5)}</th>`).join(''))}</tr></thead>
      <tbody>
        ${raw(rows)}
        <tr class="row--spare"><th scope="row">Non-initiative work
          <span class="micro">share not committed</span></th>${raw(spareCells)}</tr>
      </tbody>
    </table>`))}
  </div>`;
}

/** What one capacity cell is made of — a person can serve several at once. */
export function capacityCellMarkup(personId, teamId, month) {
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
    return html`<h3>${person.name} — ${F.month(month)}</h3>
      <ul class="popover__list">${raw(items)}</ul>
      <p class="warn">${raw(icon('warning', 'icon--lead'))}${total}% allocated, but this person
        no longer holds an active membership in this team. The work still costs; the share does
        not exist.</p>`;
  }

  return html`<h3>${person.name} — ${F.month(month)}</h3>
    <ul class="popover__list">${raw(items)}</ul>
    <p class="${total > membership.sharePct ? 'warn' : 'muted'}">
      ${total}% of the ${membership.sharePct}% this team holds${raw(total > membership.sharePct
        ? html` — more than its share.`
        : html`, ${spare}% not committed.`)}</p>`;
}

function runRateMarkup(team) {
  const data = E.teamRunRate(app, team.id, monthsOfYear(chartYear()));
  const yearTotal = data.reduce((t, row) => t + row.total, 0);

  return html`<div class="panel">
    <h2>Cost run rate</h2>
    ${raw(yearNav(`${F.money(yearTotal)} across ${chartYear()}.`))}
    ${raw(yearTotal === 0
      ? empty('Nothing costs anything in this year yet.', { icon: 'warning' })
      : stackedBarsMarkup(data))}
  </div>`;
}
