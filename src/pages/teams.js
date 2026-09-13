/**
 * Teams: the card overview.
 */
import * as F from '../format.js';
import * as P from '../people.js';
import * as store from '../store.js';
import { app, view, currentMonth, navigate, commit, withUndo, today } from '../app.js';
import { html, raw, fill } from '../render/dom.js';
import { icon } from '../render/icons.js';
import { pageHead, empty, badge } from '../render/components.js';

export function renderTeams() {
  const month = currentMonth();
  const teams = Object.values(app.TEAMS);
  const cards = teams
    .map((team) => {
      const summary = P.teamSummary(app, team.id, month, today());
      const deletable = P.canDeleteTeam(app, team.id);
      // "Capacity" here is how much of the Team FTE the team holds is
      // actually committed right now — a team can hold 100% of someone and
      // still use none of it. Over 100% is the same over-allocation the
      // Capacity overview and Portfolio surface (§4.5), just one team's
      // slice of it.
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
          <div><dt>Team FTE held</dt><dd>${summary.totalSharePct}%</dd></div>
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
      lede: 'A team holds a Team FTE of each of its people rather than owning them outright, '
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

export const teamsClickActions = {
  // Nothing is created yet — Cancel on the draft below leaves no record
  // behind (D1, and the review's "a team is just created with no chance
  // to cancel").
  'team-add': () => navigate('team', { id: 'new' }),
  'team-draft-discard': () => navigate('teams', {}),
  'team-draft-create': () => {
    const name = (view.params.draft?.name ?? '').trim();
    if (!name) return undefined;
    const team = P.createTeam(app, name);
    store.save(app);
    return navigate('team', { id: team.id });
  },
  'team-active': ({ id }) => {
    const team = app.TEAMS[id];
    withUndo(`${team.active ? 'Deactivated' : 'Reactivated'} ${team.name}`, () => {
      P.setTeamActive(team, !team.active);
    });
    return commit();
  },
  'team-delete': ({ id }) => {
    // Guarded in the UI too, but never trust the disabled attribute alone.
    if (!P.canDeleteTeam(app, id).ok) return undefined;
    withUndo(`Deleted team ${app.TEAMS[id].name}`, () => {
      P.deleteTeam(app, id);
    });
    return commit();
  },
};

export const teamsInputActions = {
  // Neither team nor person exists yet, so — unlike every other draft — an
  // in-memory params object is enough; there is nothing worth surviving a
  // reload before a name has even been typed (D1).
  'team-draft-field': ({ target, field }) => {
    const draft = { ...view.params.draft, [field]: target.value };
    view.params = { ...view.params, draft };
    const create = document.querySelector('[data-act="team-draft-create"]');
    if (create instanceof HTMLButtonElement) create.disabled = !(draft.name ?? '').trim();
  },
};
