/**
 * Teams: the card overview.
 */
import * as P from '../people.js';
import { app } from '../app.js';
import { html, raw, fill } from '../render/dom.js';

export function renderTeams() {
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
