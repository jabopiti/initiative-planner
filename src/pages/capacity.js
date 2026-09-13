import * as F from '../format.js';
/**
 * Capacity overview (D7, SPEC §7): every over-allocation across every team
 * and person, for one month at a time — the question per-team and
 * per-person capacity each answer alone, but neither answers for "anyone,
 * anywhere."
 */
import * as E from '../engine.js';
import { app, view, currentMonth, today } from '../app.js';
import { html, raw, fill } from '../render/dom.js';
import { pageHead, scroller, empty, panel } from '../render/components.js';

function selectedMonth() {
  return view.params.month ?? currentMonth();
}

/** Same shape as People's month picker (§4.5) — kept page-local rather than
 * shared, since the two pages otherwise have nothing else in common. */
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

function overCapacityMarkup(rows) {
  const body = rows
    .map((row) => {
      const person = app.PEOPLE[row.personId];
      return html`<tr class="row--clickable row--warn">
        <td><a class="row-link" href="#/person/${person.id}">${person.name}</a></td>
        <td class="num">${row.capacityPct}%</td>
        <td class="num over">${row.allocatedPct}%</td>
        <td class="num over">+${row.allocatedPct - row.capacityPct}%</td>
      </tr>`;
    })
    .join('');

  return panel({
    id: 'panel-over-capacity',
    title: 'Over capacity',
    body: html`<p class="muted">Allocated more than their own capacity allows, across every
        team combined.</p>
      ${raw(rows.length === 0
        ? empty('Nobody is over their capacity this month.')
        : scroller('People over capacity', html`<table class="grid">
            <thead><tr><th>Person</th><th>Capacity %</th><th>Allocated %</th><th>Over by</th></tr></thead>
            <tbody>${raw(body)}</tbody></table>`))}`,
  });
}

function overShareMarkup(rows) {
  const body = rows
    .map((row) => {
      const person = app.PEOPLE[row.personId];
      const team = app.TEAMS[row.teamId];
      return html`<tr class="row--clickable row--warn">
        <td><a class="row-link" href="#/person/${person.id}">${person.name}</a></td>
        <td><a href="#/team/${team.id}" class="link">${team.name}</a></td>
        <td class="num">${row.sharePct}%</td>
        <td class="num over">${row.allocatedPct}%</td>
        <td class="num over">+${row.allocatedPct - row.sharePct}%</td>
      </tr>`;
    })
    .join('');

  return panel({
    id: 'panel-over-share',
    title: 'Over their Team FTE',
    body: html`<p class="muted">Allocated more within one team than the Team FTE that team holds
        of them.</p>
      ${raw(rows.length === 0
        ? empty('No membership is over its Team FTE this month.')
        : scroller('Memberships over their Team FTE', html`<table class="grid">
            <thead><tr><th>Person</th><th>Team</th><th>Team FTE %</th><th>Allocated %</th>
              <th>Over by</th></tr></thead>
            <tbody>${raw(body)}</tbody></table>`))}`,
  });
}

export function renderCapacity() {
  const month = selectedMonth();
  const { overCapacity, overShare } = E.overAllocations(app, month, today());

  fill(
    'root',
    html`${raw(pageHead({
      title: 'Capacity',
      lede: 'Over-allocation across every team and person, one month at a time. '
        + 'Both ceilings warn — neither ever blocks.',
    }))}
      <div class="toolbar">${raw(monthPicker())}</div>
      <div class="panel-stack">
        ${raw(overCapacityMarkup(overCapacity))}
        ${raw(overShareMarkup(overShare))}
      </div>`,
  );
}
