/**
 * Teams: the card overview.
 */
import * as F from '../format.js';
import * as P from '../people.js';
import { app, currentMonth } from '../app.js';
import { html, raw, fill } from '../render/dom.js';
import { icon } from '../render/icons.js';
import { pageHead, empty, badge } from '../render/components.js';

export function renderTeams() {
  const month = currentMonth();
  const teams = Object.values(app.TEAMS);
  const cards = teams
    .map((team) => {
      const summary = P.teamSummary(app, team.id, month);
      const deletable = P.canDeleteTeam(app, team.id);
      // "Capacity" here is how much of the share the team holds is actually
      // committed right now — a team can hold 100% of someone and still use
      // none of it. Over 100% is the same over-allocation the Capacity
      // overview and Portfolio surface (§4.5), just one team's slice of it.
      const capacityPct = summary.totalSharePct > 0
        ? Math.round((summary.allocatedSharePct / summary.totalSharePct) * 100)
        : null;
      return html`<div class="card card--clickable ${team.active ? '' : 'card--inactive'}">
        <div>
          <a class="card-link card__title" href="#/team/${team.id}">${team.name}</a>
          ${raw(team.active ? '' : badge('inactive', 'quiet'))}
        </div>
        <dl class="card__stats">
          <div><dt>Members</dt><dd>${summary.activeMembers}</dd></div>
          <div><dt>Share held</dt><dd>${summary.totalSharePct}%</dd></div>
          <div><dt>Initiatives</dt><dd>${summary.activeInitiatives}</dd></div>
          <div><dt>Cost this month</dt><dd>${F.money(summary.costThisMonth)}</dd></div>
          <div><dt>Capacity used</dt>
            <dd class="${capacityPct > 100 ? 'over' : ''}">${capacityPct === null ? '—' : `${capacityPct}%`}</dd></div>
        </dl>
        <div class="card__actions">
          <button type="button" data-act="team-active" data-id="${team.id}">
            ${team.active ? 'Deactivate' : 'Reactivate'}</button>
          <button type="button" data-act="team-delete" data-id="${team.id}"
            ${raw(deletable.ok ? '' : 'disabled')}
            title="${deletable.ok
              ? 'Delete this team'
              : `Used by ${deletable.blockers.join(', ')}`}">${raw(icon('remove'))}Delete</button>
        </div>
      </div>`;
    })
    .join('');

  fill(
    'root',
    html`${raw(pageHead({
      title: 'Teams',
      lede: 'A team holds a share of each of its people rather than owning them outright, '
        + 'which is what lets one person belong to two.',
      actions: html`<button type="button" class="btn btn--primary" data-act="team-add">
        ${raw(icon('add'))}New team</button>`,
    }))}
      ${raw(teams.length
        ? html`<div class="cards">${raw(cards)}</div>`
        : empty('No teams yet. An initiative belongs to one, so this is the place to start.', {
            icon: 'add',
            action: html`<button type="button" class="btn btn--primary" data-act="team-add">
              ${raw(icon('add'))}New team</button>`,
          }))}`,
  );
}
