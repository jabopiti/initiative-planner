/**
 * Teams: the card overview.
 */
import * as P from '../people.js';
import { app } from '../app.js';
import { html, raw, fill } from '../render/dom.js';
import { icon } from '../render/icons.js';
import { pageHead, empty, badge } from '../render/components.js';

export function renderTeams() {
  const teams = Object.values(app.TEAMS);
  const cards = teams
    .map((team) => {
      const summary = P.teamSummary(app, team.id);
      const deletable = P.canDeleteTeam(app, team.id);
      return html`<div class="card ${team.active ? '' : 'card--inactive'}">
        <div>
          <button type="button" class="link card__title" data-act="open-team" data-id="${team.id}">
            ${team.name}</button>
          ${raw(team.active ? '' : badge('inactive', 'quiet'))}
        </div>
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
