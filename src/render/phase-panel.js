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
import { scroller, empty, badge, panel } from './components.js';
import { TABLES, tableActions } from './tables.js';

/**
 * Who the allocation table lists.
 *
 * While a phase is editable it lists **the whole team roster**, allocated or
 * not, with a percentage field on every row (D2). Allocating is then typing a
 * number next to a name, rather than finding a select, choosing a person, and
 * correcting the 50% they arrive at — a magic number with no explanation,
 * which is what this replaces. A 0% row costs nothing and must not warn (D2's
 * caveat).
 *
 * Once a gate freezes the phase the roster is gone and only the allocations
 * remain: the list of people you could still add is an editing affordance,
 * and there is nothing left to edit.
 *
 * Someone allocated who is no longer a member of the team is listed either
 * way — their allocation keeps costing (SPEC §5.2) — after the roster, and
 * marked.
 */
function allocationPeople(initiative, phase, editable, at) {
  const roster = editable
    ? Object.values(app.PEOPLE)
      .filter((person) => person.active && E.membership(person, initiative.teamId))
      .sort((a, b) => a.name.localeCompare(b.name))
    : [];
  const listed = new Set(roster.map((person) => person.id));

  const rest = phase.allocations
    .filter((allocation) => !listed.has(allocation.personId))
    .map((allocation) => at.PEOPLE[allocation.personId] ?? app.PEOPLE[allocation.personId])
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));

  return [...roster, ...rest];
}

/**
 * The phase to seed this one from: the nearest costed phase before it that
 * has anyone allocated (D2).
 *
 * Offered as one click rather than done silently. Copying someone else's
 * percentages into a phase is a real edit with a real cost attached, and a
 * render is the wrong moment to make one — the panel would write to the
 * dataset merely by being looked at.
 */
function seedSource(initiative, phaseId) {
  const costed = E.costedPhaseIds(PROCESS).filter((id) => initiative.phases[id]);
  const index = costed.indexOf(phaseId);
  for (let before = index - 1; before >= 0; before -= 1) {
    const candidate = costed[before];
    if (initiative.phases[candidate].allocations.length > 0) return candidate;
  }
  return null;
}

/**
 * One row per person, with the rate arithmetic behind the Cost figure.
 *
 * Day rate and Factor are gone from the table. While you are deciding how
 * much of someone's time a phase needs, neither is a number you act on —
 * they are inputs to the two that matter, Person-days and Cost, which stay so
 * the rows still add up to the phase total (DESIGN §2). The arithmetic is one
 * click away on the figure itself, for the moment someone questions it, and
 * it is still in the copied table in full.
 */
function allocationRowsFor(initiative, phaseId, editable, at) {
  const phase = initiative.phases[phaseId];

  return allocationPeople(initiative, phase, editable, at)
    .map((person) => {
      const allocationPct = phase.allocations
        .find((allocation) => allocation.personId === person.id)?.allocationPct ?? 0;
      const figures = E.allocationFigures(phase, person.id, allocationPct, at);
      const stranded = !E.membership(person, initiative.teamId);

      return html`<tr class="${stranded ? 'row--warn' : ''}"
        data-alloc-phase="${phaseId}" data-alloc-person="${person.id}">
        <td>${person.name} ${raw(stranded
          ? badge('no longer in this team', 'warn', 'warning')
          : '')}</td>
        <td>${E.roleLabel(person, at.ROLES)}</td>
        <td>${app.COUNTRIES[person.countryId]?.name ?? ''}</td>
        <td>${raw(editable
          ? numberField({
              value: allocationPct,
              'data-act': 'allocation-pct',
              'data-id': initiative.id,
              'data-phase': phaseId,
              'data-person': person.id,
              'aria-label': `${person.name} allocation`,
              extraClass: 'field--pct',
            })
          : html`<span class="num">${allocationPct}%</span>`)}</td>
        <td class="num"><span data-calc="days-${phaseId}-${person.id}"
          >${figures.personDays.toFixed(1)}</span></td>
        <td class="num"><button type="button" class="num-explain"
          data-act="allocation-detail" data-id="${initiative.id}" data-phase="${phaseId}"
          data-person="${person.id}"
          aria-label="How ${person.name}'s cost is worked out"
          ><span data-calc="cost-${phaseId}-${person.id}">${F.money(figures.cost)}</span></button></td>
        <td class="cell--action">${raw(editable && allocationPct > 0
          ? html`<button type="button" class="btn--small" data-act="allocation-remove"
              data-id="${initiative.id}" data-phase="${phaseId}" data-person="${person.id}"
              >${raw(icon('remove'))}Remove</button>`
          : '')}</td>
      </tr>`;
    })
    .join('');
}

/**
 * The arithmetic behind one cost figure — the disclosure the table's dropped
 * columns moved into.
 *
 * Read against the phase's own rates, so an approved figure is reproduced
 * rather than recalculated. Rates and working days come from each month's own
 * year (SPEC §5.2), so across a period spanning two years the day rate shown
 * is the effective one and says so.
 */
export function allocationDetailMarkup(initiativeId, phaseId, personId) {
  const initiative = app.INITIATIVES.find((i) => i.id === initiativeId);
  const phase = initiative.phases[phaseId];
  const at = E.ratesFor(app, phase);
  const person = at.PEOPLE[personId] ?? app.PEOPLE[personId];
  const allocationPct = phase.allocations
    .find((allocation) => allocation.personId === personId)?.allocationPct ?? 0;

  const days = E.workingDaysForPeriod(at.COUNTRIES[person.countryId],
    phase.estStartDate, phase.estEndDate);
  const workingDays = Object.values(days).reduce((total, value) => total + value, 0);
  const years = new Set(Object.keys(days).map((key) => E.parseMonthKey(key).year));
  const figures = E.allocationFigures(phase, personId, allocationPct, at);
  const effective = figures.personDays > 0 ? figures.cost / figures.personDays : 0;

  const line = (term, value) => html`<dt>${term}</dt><dd class="num">${value}</dd>`;

  return html`<h3>${person.name} — ${E.phaseLabel(PROCESS, phaseId)}</h3>
    <p class="micro">${E.roleLabel(person, at.ROLES)} ·
      ${at.COUNTRIES[person.countryId]?.name ?? '—'}${raw(person.customRole
        ? html` · ${raw(badge('custom rate', 'info'))}`
        : '')}</p>
    <dl class="detail">
      ${raw(line('Working days in the period', workingDays.toFixed(1)))}
      ${raw(line('Allocation', `${allocationPct}%`))}
      ${raw(person.customRole
        ? ''
        : line('Role factor',
            E.resolveRate(person, at.ROLES, at.COUNTRIES, [...years][0] ?? new Date().getFullYear())
              .factor.toFixed(2)))}
      ${raw(line('Person-days', figures.personDays.toFixed(1)))}
      ${raw(line(years.size > 1 ? 'Effective day rate' : 'Day rate', F.money(effective)))}
      ${raw(line('Cost', F.money(figures.cost)))}
    </dl>
    ${raw(years.size > 1
      ? html`<p class="micro">This period spans ${years.size} years. Rates and working days are
          read for each month's own year, so the day rate above is the effective one across
          the whole period.</p>`
      : '')}
    ${raw(E.isFrozen(phase)
      ? html`<p class="micro">Read against the rates this phase was approved at, not today's.</p>`
      : '')}`;
}

/**
 * One costed phase's estimate. Rendered by both the creation wizard and the
 * initiative detail page, so the two can never drift apart.
 *
 * Computed cells carry `data-calc` ids rather than being rebuilt on every
 * keystroke: typing an allocation percentage updates those cells in place,
 * never the input under the caret (AGENTS.md).
 */
export function phasePanel(initiative, phaseId, editable) {
  const phase = initiative.phases[phaseId];
  const label = E.phaseLabel(PROCESS, phaseId);
  const frozen = E.isFrozen(phase);
  // A frozen phase reads its own snapshot — including the people, since a
  // custom rate lives on the person record — so an approved figure on screen
  // never moves when master data changes underneath it.
  const at = E.ratesFor(app, phase);

  const allocationRows = allocationRowsFor(initiative, phaseId, editable, at);
  const seedFrom = editable && phase.allocations.length === 0
    ? seedSource(initiative, phaseId)
    : null;

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
  return panel({
    id: `panel-phase-${phaseId}`,
    title: label,
    mark: frozen ? badge('approved and frozen', 'ok', 'check') : '',
    extraClass: frozen ? 'banner banner--done' : '',
    body: html`<div class="fields">
      <label class="field-row"><span>From</span>
        <input type="date" class="field field--date" data-act="phase-start"
          data-id="${initiative.id}" data-phase="${phaseId}"
          value="${phase.estStartDate ?? ''}" ${raw(editable ? '' : 'disabled')} /></label>
      <label class="field-row"><span>To</span>
        <input type="date" class="field field--date" data-act="phase-end"
          data-id="${initiative.id}" data-phase="${phaseId}"
          value="${phase.estEndDate ?? ''}" ${raw(editable ? '' : 'disabled')} /></label>
    </div>
    ${raw(phase.estStartDate && phase.estEndDate && phase.estEndDate < phase.estStartDate
      ? html`<p class="field-message">${raw(icon('warning', 'icon--lead'))}Ends before it starts —
          nothing in this period costs anything until that's fixed.</p>`
      : editable && (phase.allocations.length || phase.otherCosts.length)
        ? html`<p class="micro">Changing this period rescales every allocation's cost beneath
            it.</p>`
        : '')}

    <h3>People</h3>
    ${raw(seedFrom && editable
      ? html`<p class="micro">Nobody is allocated yet.
          <button type="button" class="btn btn--small" data-act="allocation-seed"
            data-id="${initiative.id}" data-phase="${phaseId}" data-from="${seedFrom}"
            >${raw(icon('duplicate'))}Copy ${E.phaseLabel(PROCESS, seedFrom)}'s allocations</button></p>`
      : '')}
    ${raw(allocationRows
      ? scroller(`${label} allocations`, html`<table class="grid">
          <thead><tr><th>Person</th><th>Role</th><th>Country</th>
            <th>Allocation %</th><th>Person-days</th><th>Cost</th><th></th></tr></thead>
          <tbody>${raw(allocationRows)}</tbody></table>`)
        + (phase.allocations.length ? registerAllocationTable(initiative, phaseId, at) : '')
      : empty(editable
          ? 'Nobody is in this team yet. Add people to the team, then allocate them here.'
          : 'Nobody was allocated.'))}

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

    <p class="results" data-calc="total-${phaseId}">${raw(phaseTotalsMarkup(initiative, phaseId))}</p>`,
  });
}

/**
 * Each phase's allocations is its own named table for copy (§8).
 *
 * It keeps Day rate and Factor, which the rendered table dropped. Copying a
 * table out is the bulk version of the per-row disclosure — someone takes it
 * to a spreadsheet precisely to check the arithmetic — so the columns that
 * are noise while allocating are the ones worth carrying when the figures are
 * being questioned. Only people with an allocation appear: a roster row at 0%
 * is an empty field on screen, not a line in a costing.
 */
function registerAllocationTable(initiative, phaseId, at) {
  const phase = initiative.phases[phaseId];
  const year = phase.estStartDate
    ? E.parseMonthKey(phase.estStartDate.slice(0, 7)).year
    : new Date().getFullYear();

  const rows = phase.allocations
    .map((allocation) => {
      const person = at.PEOPLE[allocation.personId] ?? app.PEOPLE[allocation.personId];
      if (!person) return null;
      const { dayRate, factor } = E.resolveRate(person, at.ROLES, at.COUNTRIES, year);
      const figures = E.allocationFigures(phase, person.id, allocation.allocationPct, at);
      return [
        person.name,
        E.roleLabel(person, at.ROLES),
        app.COUNTRIES[person.countryId]?.name ?? '',
        Math.round(dayRate),
        factor,
        allocation.allocationPct,
        Number(figures.personDays.toFixed(1)),
        Math.round(figures.cost),
      ];
    })
    .filter((row) => row !== null);

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
