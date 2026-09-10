import * as F from '../format.js';
/**
 * The per-phase estimate panel and its totals, shared by the creation wizard
 * and initiative detail so the two can never drift apart (DESIGN §2).
 */
import * as E from '../engine.js';
import * as L from '../lifecycle.js';
import { PROCESS } from '../process.js';
import { app } from '../app.js';
import { html, raw, numberField } from './dom.js';
import { icon } from './icons.js';
import { scroller, empty, badge } from './components.js';
import { TABLES, tableActions } from './tables.js';

/**
 * One costed phase's estimate. Rendered by both the creation wizard and the
 * initiative detail page, so the two can never drift apart.
 *
 * Computed cells carry `data-calc` ids rather than being rebuilt on every
 * keystroke: typing an allocation percentage updates those cells in place,
 * never the input under the caret (AGENTS.md).
 */
function phasePanel(initiative, phaseId, editable) {
  const phase = initiative.phases[phaseId];
  const label = E.phaseLabel(PROCESS, phaseId);
  const frozen = E.isFrozen(phase);

  const members = Object.values(app.PEOPLE).filter(
    (person) => person.active && E.membership(person, initiative.teamId),
  );
  const allocated = new Set(phase.allocations.map((a) => a.personId));
  const joinable = members.filter((person) => !allocated.has(person.id));

  const exportRows = [];
  const allocationRows = phase.allocations
    .map((allocation) => {
      // A frozen phase reads its own snapshot — including the people, since a
      // custom rate lives on the person record — so an approved figure on
      // screen never moves when master data changes underneath it.
      const at = E.ratesFor(app, phase);
      const person = at.PEOPLE[allocation.personId] ?? app.PEOPLE[allocation.personId];
      if (!person) return '';
      const year = phase.estStartDate ? E.parseMonthKey(phase.estStartDate.slice(0, 7)).year
        : new Date().getFullYear();
      const { dayRate, factor } = E.resolveRate(person, at.ROLES, at.COUNTRIES, year);
      const figures = E.allocationFigures(phase, allocation.personId, allocation.allocationPct, at);
      const stranded = !E.membership(person, initiative.teamId);

      exportRows.push([
        person.name,
        E.roleLabel(person, app.ROLES),
        app.COUNTRIES[person.countryId]?.name ?? '',
        Math.round(dayRate),
        factor,
        allocation.allocationPct,
        Number(figures.personDays.toFixed(1)),
        Math.round(figures.cost),
      ]);

      return html`<tr class="${stranded ? 'row--warn' : ''}">
        <td>${person.name} ${raw(stranded
          ? badge('no longer in this team', 'warn', 'warning')
          : '')}</td>
        <td>${E.roleLabel(person, app.ROLES)}</td>
        <td>${app.COUNTRIES[person.countryId]?.name ?? ''}</td>
        <td class="num">${F.money(dayRate)}</td>
        <td class="num">${factor.toFixed(2)}</td>
        <td>${raw(editable
          ? numberField({
              value: allocation.allocationPct,
              'data-act': 'allocation-pct',
              'data-id': initiative.id,
              'data-phase': phaseId,
              'data-person': person.id,
              'aria-label': `${person.name} allocation`,
              extraClass: 'field--pct',
            })
          : html`<span class="num">${allocation.allocationPct}%</span>`)}</td>
        <td class="num" data-calc="days-${phaseId}-${person.id}">
          ${figures.personDays.toFixed(1)}</td>
        <td class="num" data-calc="cost-${phaseId}-${person.id}">
          ${F.money(figures.cost)}</td>
        <td class="cell--action">${raw(editable
          ? html`<button type="button" class="btn--small" data-act="allocation-remove"
              data-id="${initiative.id}" data-phase="${phaseId}" data-person="${person.id}"
              >${raw(icon('remove'))}Remove</button>`
          : '')}</td>
      </tr>`;
    })
    .join('');

  const costRows = phase.otherCosts
    .map((item) => {
      const outOfPeriod =
        phase.estStartDate && phase.estEndDate &&
        !E.monthsInRange(phase.estStartDate, phase.estEndDate).includes(item.month);
      return html`<tr>
        <td class="cell--wrap">${raw(editable
          ? html`<input class="field" data-act="cost-field" data-field="name" data-id="${initiative.id}"
              data-phase="${phaseId}" data-cost="${item.id}" value="${item.name}"
              aria-label="Cost item name" />`
          : item.name)}</td>
        <td>${raw(editable
          ? html`<input class="field field--month" data-act="cost-field" data-field="month" data-id="${initiative.id}"
              data-phase="${phaseId}" data-cost="${item.id}" type="month" value="${item.month}"
              aria-label="Month" />`
          : item.month)} ${raw(outOfPeriod
          ? badge('out of period', 'warn', 'warning')
          : '')}</td>
        <td class="num">${raw(editable
          ? numberField({ value: item.amount, 'data-act': 'cost-field', 'data-field': 'amount', 'data-id': initiative.id,
              'data-phase': phaseId, 'data-cost': item.id, 'aria-label': 'Amount',
              extraClass: 'field--money' })
          : F.money(item.amount))}</td>
        <td class="cell--action">${raw(editable
          ? html`<button type="button" class="btn--small" data-act="cost-remove"
              data-id="${initiative.id}" data-phase="${phaseId}" data-cost="${item.id}"
              >${raw(icon('remove'))}Remove</button>`
          : '')}</td>
      </tr>`;
    })
    .join('');

  // A frozen phase is settled by the process, so its mark is the `ok` kind,
  // not a warning: nothing here needs looking at.
  return html`<div class="panel ${frozen ? 'banner banner--done' : ''}">
    <h2>${label} ${raw(frozen ? badge('approved and frozen', 'ok', 'check') : '')}</h2>

    <div class="fields">
      <label class="field-row"><span>From</span>
        <input type="date" class="field field--date" data-act="phase-start"
          data-id="${initiative.id}" data-phase="${phaseId}"
          value="${phase.estStartDate ?? ''}" ${raw(editable ? '' : 'disabled')} /></label>
      <label class="field-row"><span>To</span>
        <input type="date" class="field field--date" data-act="phase-end"
          data-id="${initiative.id}" data-phase="${phaseId}"
          value="${phase.estEndDate ?? ''}" ${raw(editable ? '' : 'disabled')} /></label>
    </div>

    <h3>People</h3>
    ${raw(phase.allocations.length || (editable && joinable.length)
      ? scroller(`${label} allocations`, html`<table class="grid">
          <thead><tr><th>Person</th><th>Role</th><th>Country</th><th>Day rate</th>
            <th>Factor</th><th>Allocation %</th><th>Person-days</th><th>Cost</th><th></th></tr></thead>
          <tbody>
            ${raw(allocationRows)}
            ${raw(editable && joinable.length ? html`<tr data-id="new">
              <td><select class="field field--select" data-act="allocation-add" data-id="${initiative.id}" data-phase="${phaseId}">
                <option value="" disabled selected>Allocate…</option>
                ${raw(joinable.map((person) => html`<option value="${person.id}">${person.name}</option>`).join(''))}
              </select></td>
              <td colspan="8"></td>
            </tr>` : '')}
          </tbody></table>`)
        + (phase.allocations.length ? registerAllocationTable(initiative, phaseId, exportRows) : '')
      : empty('Nobody allocated yet.'))}
    ${raw(editable && joinable.length
      ? ''
      : editable
        ? html`<p class="muted">Everyone active in this team is already allocated. Add people
            to the team first.</p>`
        : '')}

    <h3>Other costs</h3>
    ${raw(phase.otherCosts.length || editable
      ? scroller(`${label} other costs`, html`<table class="grid">
          <thead><tr><th>Item</th><th>Month</th><th>Amount</th><th></th></tr></thead>
          <tbody>
            ${raw(costRows)}
            ${raw(editable ? html`<tr data-id="new">
              <td class="cell--wrap"><input class="field" data-act="cost-field" data-field="name" data-id="${initiative.id}"
                data-phase="${phaseId}" data-cost="new" placeholder="New cost item…"
                aria-label="New cost item name" /></td>
              <td><input class="field field--month" data-act="cost-field" data-field="month" data-id="${initiative.id}"
                data-phase="${phaseId}" data-cost="new" type="month" aria-label="Month" /></td>
              <td class="num">${raw(numberField({ 'data-act': 'cost-field', 'data-field': 'amount', 'data-id': initiative.id,
                'data-phase': phaseId, 'data-cost': 'new', 'aria-label': 'Amount', placeholder: 'Amount',
                extraClass: 'field--money' }))}</td>
              <td></td>
            </tr>` : '')}
          </tbody></table>`)
      : empty('No non-labour costs.'))}

    <p class="results" data-calc="total-${phaseId}">${raw(phaseTotalsMarkup(initiative, phaseId))}</p>
  </div>`;
}

/** Each phase's allocations is its own named table for copy and CSV (§8). */
function registerAllocationTable(initiative, phaseId, rows) {
  const key = `alloc-${phaseId}`;
  TABLES[key] = {
    headers: ['Person', 'Role', 'Country', 'Day rate', 'Factor', 'Allocation %',
      'Person-days', 'Cost'],
    rows,
    name: `${initiative.name}-${E.phaseLabel(PROCESS, phaseId)}-allocations`,
  };
  return tableActions(key, 'allocations');
}

/**
 * A panel per costed phase, in process order, skipping any the initiative has
 * no record for. That gap is reachable: a later build may mark a phase costed
 * that was not costed when this initiative was created, and a processVersion
 * moving forward is deliberately not fatal (DESIGN §3).
 */
export function costedPhasePanels(initiative) {
  return E.costedPhaseIds(PROCESS)
    .filter((phaseId) => initiative.phases[phaseId])
    .map((phaseId) => phasePanel(initiative, phaseId, L.isPhaseEditable(initiative, phaseId)))
    .join('');
}

export function phaseTotalsMarkup(initiative, phaseId) {
  const phase = initiative.phases[phaseId];

  // Both honour a snapshot themselves, so the panel agrees with the grand
  // total above it rather than quietly disagreeing.
  const labour = E.phaseLabourTotal(phase, app);
  const other = E.phaseOtherTotal(phase);

  return html`Labour ${F.money(labour)} + other ${F.money(other)} =
    <strong>${F.money(labour + other)}</strong> ${raw(E.isFrozen(phase)
      ? badge('as approved', 'ok')
      : '')}`;
}

/** The live grand total and resolved track, recomputed without a rebuild. */
export function grandMarkup(initiative) {
  const total = E.grandTotal(initiative, app);
  const band = E.resolveBand(PROCESS.bands, total);
  const coverage = E.initiativeCoverage(initiative);
  return html`<strong>${F.money(total)}</strong>
    ${raw(badge(coverage, 'info'))}
    — ${band ? band.name : 'Not yet known'}${raw(band
      ? html`<span class="micro">${band.req}</span>`
      : html`<span class="micro">No approval track covers this total.</span>`)}`;
}
