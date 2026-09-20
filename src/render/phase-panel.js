import * as F from '../format.js';
/**
 * The per-phase estimate panel and its totals, shared by the creation wizard
 * and initiative detail so the two can never drift apart (DESIGN §2).
 */
import * as E from '../engine.js';
import * as L from '../lifecycle.js';
import { PROCESS } from '../process.js';
import {
  app, withUndo, commit, commitQuietly, findInitiative, refreshCalcRegions, openPopover,
  restoreCaretAfter, today,
} from '../app.js';
import { html, raw, numberField } from './dom.js';
import { icon } from './icons.js';
import { scroller, empty, badge, panel } from './components.js';
import { TABLES, tableActions } from './tables.js';

/**
 * Who the allocation table lists: only people actually allocated. (An
 * earlier design pre-listed the whole team roster at 0% instead, so
 * allocating was typing a number next to an already-visible name — F2
 * replaced it with the add-person chips below, since a roster that size
 * mostly reads as rows to skip past.)
 *
 * Someone allocated who is no longer a member of the team is still listed —
 * their allocation keeps costing (SPEC §5.2) — and marked.
 */
function allocationPeople(phase, at) {
  return phase.allocations
    .map((allocation) => at.PEOPLE[allocation.personId] ?? app.PEOPLE[allocation.personId])
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * F2 — team members not yet on this phase: the click-to-add chips that
 * replace the old pre-listed-at-0% rows. Only offered while editable; a
 * frozen phase has nothing left to add.
 */
function addablePeople(initiative, phase) {
  const allocated = new Set(phase.allocations.map((allocation) => allocation.personId));
  return Object.values(app.PEOPLE)
    .filter((person) => person.active && E.membership(person, initiative.teamId)
      && !allocated.has(person.id))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * F2 — clicking a chip allocates that person immediately, at the best guess
 * already computed elsewhere for this exact person/phase: their own prior-
 * phase carry-forward (C4), then the team/role/phase historical median (C5),
 * then a plain 100% — fully dedicated — when neither exists. Never a 0% row
 * left waiting to be typed over.
 */
function addPersonChipsMarkup(initiative, phaseId, candidates) {
  if (candidates.length === 0) return '';
  return html`<div class="chip-row">
    <span class="micro">Add:</span>
    ${raw(candidates.map((person) => html`<button type="button" class="btn btn--small"
      data-act="allocation-add" data-id="${initiative.id}" data-phase="${phaseId}"
      data-person="${person.id}">${raw(icon('add'))}${person.name}</button>`).join(' '))}
  </div>`;
}

/**
 * The phase to seed this one from: the nearest costed phase before it that
 * has anyone allocated.
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
  const allocationByPerson = new Map(
    phase.allocations.map((allocation) => [allocation.personId, allocation.allocationPct]),
  );

  return allocationPeople(phase, at)
    .map((person) => {
      const allocationPct = allocationByPerson.get(person.id) ?? 0;
      const figures = E.allocationFigures(phase, person.id, allocationPct, at);
      const stranded = !E.membership(person, initiative.teamId);
      // Safe headroom before over-allocating: this phase's own current
      // contribution is excluded, since the chip replaces it rather than
      // stacking on top (§2, C6) — null with nothing to measure against
      // (no membership, or no period yet), in which case there's no chip.
      const maxAvail = editable
        ? E.maxAvailablePct(app, person.id, initiative.teamId, initiative.id, phaseId, phase, today())
        : null;
      // C4: if this person was allocated on an earlier phase, offer a
      // quick-apply chip carrying that percentage forward.
      const carry = editable && allocationPct === 0
        ? E.carryForwardPct(PROCESS, initiative, phaseId, person.id)
        : null;
      // C5: the historical median for this team/role/phase combination —
      // shown alongside Max available, as a separate chip.
      const personRoleId = person.customRole ? null : person.roleId;
      const usual = editable && personRoleId
        ? E.usualAllocationPct(app, initiative.teamId, personRoleId, phaseId)
        : null;

      return html`<tr class="${stranded ? 'row--warn' : ''}"
        data-alloc-phase="${phaseId}" data-alloc-person="${person.id}">
        <td>${person.name} ${raw(stranded
          ? badge('no longer in this team', 'warn', 'warning')
          : '')}</td>
        <td>${E.roleLabel(person, at.ROLES)}</td>
        <td>${app.COUNTRIES[person.countryId]?.name ?? ''}</td>
        <td>${raw(editable
          ? html`${raw(numberField({
              value: allocationPct,
              'data-act': 'allocation-pct',
              'data-id': initiative.id,
              'data-phase': phaseId,
              'data-person': person.id,
              'aria-label': `${person.name} allocation`,
              extraClass: 'field--pct',
            }))}${raw(carry
              ? html`<button type="button" class="btn--small" data-act="allocation-carry"
                  data-id="${initiative.id}" data-phase="${phaseId}" data-person="${person.id}"
                  data-amount="${carry.allocationPct}"
                  >Prev ${carry.allocationPct}%</button>`
              : '')}${raw(usual
              ? html`<button type="button" class="btn--small" data-act="allocation-usual"
                  data-id="${initiative.id}" data-phase="${phaseId}" data-person="${person.id}"
                  data-amount="${usual}"
                  >Usual ${usual}%</button>`
              : '')}${raw(maxAvail
              ? html`<button type="button" class="btn--small" data-act="allocation-max"
                  data-id="${initiative.id}" data-phase="${phaseId}" data-person="${person.id}"
                  data-amount="${maxAvail.pct}"
                  >Max available ${maxAvail.pct}%</button>${raw(maxAvail.provisionalPct
                    ? html`<span class="micro muted">+${maxAvail.provisionalPct}% provisional
                        elsewhere</span>`
                    : '')}`
              : '')}`
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
  const workingDays = E.sum(days);
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
 * C8 — Duration presets: quick-set chips for the phase's end date,
 * shown when the phase has no end date yet. Fixed presets plus a
 * data-driven "usual for this team/phase" preset.
 */
function durationPresetsMarkup(initiative, phaseId) {
  const usual = E.usualPhaseDuration(app, initiative.teamId, phaseId);
  const usualWeeks = usual ? Math.round(usual / 7) : null;
  const presets = [
    { label: '6 weeks', days: 42 },
    { label: '3 months', days: 91 },
    { label: '6 months', days: 182 },
  ];
  if (usualWeeks && usualWeeks > 0) {
    presets.push({ label: `Usual: ${usualWeeks} weeks`, days: usual });
  }
  return html`<div class="chip-row">
    <span class="micro">Quick duration:</span>
    ${raw(presets.map((preset) =>
      html`<button type="button" class="btn btn--small" data-act="duration-preset"
        data-id="${initiative.id}" data-phase="${phaseId}" data-days="${preset.days}"
        >${preset.label}</button>`).join(' '))}
  </div>`;
}

/**
 * C7 — Bulk allocation edit. Three modes packed into a compact toolbar:
 * - Set everyone to X%
 * - Set all [role] to X%
 * - Apply usual staffing (from historical medians)
 *
 * Each is a small button; the first two open a popover with a number input.
 */
function bulkEditMarkup(initiative, phaseId) {
  const usual = E.usualStaffing(app, initiative.teamId, phaseId);
  const roles = Object.entries(app.ROLES)
    .filter(([, role]) => role.active)
    .map(([id, role]) => ({ id, name: role.name }));
  return html`<details class="bulk-edit">
    <summary class="btn btn--small btn--ghost">Bulk edit…</summary>
    <div class="bulk-edit__body">
      <div class="bulk-edit__row">
        <label>Set everyone to
          <input type="text" inputmode="numeric" class="field field--num field--pct field--inline"
            data-bulk-pct="all" aria-label="Bulk percentage" />%</label>
        <button type="button" class="btn btn--small" data-act="bulk-set-all"
          data-id="${initiative.id}" data-phase="${phaseId}">Apply</button>
      </div>
      <div class="bulk-edit__row">
        <label>Set all
          <select class="field field--inline" data-bulk-role aria-label="Role">
            ${raw(roles.map((role) => html`<option value="${role.id}">${role.name}</option>`).join(''))}
          </select>
          to <input type="text" inputmode="numeric" class="field field--num field--pct field--inline"
            data-bulk-pct="role" aria-label="Bulk percentage" />%</label>
        <button type="button" class="btn btn--small" data-act="bulk-set-role"
          data-id="${initiative.id}" data-phase="${phaseId}">Apply</button>
      </div>
      ${raw(usual.length
        ? html`<div class="bulk-edit__row">
            <span>Apply usual staffing</span>
            <button type="button" class="btn btn--small" data-act="bulk-usual"
              data-id="${initiative.id}" data-phase="${phaseId}">Apply</button>
          </div>`
        : '')}
    </div>
  </details>`;
}

/**
 * C9 — Cost suggestions: a datalist (for autocomplete) plus quick-apply
 * buttons for items from the build-time library and dataset history.
 */
function costSuggestionsMarkup(initiative, phaseId) {
  const suggestions = E.otherCostSuggestions(app, phaseId, PROCESS);
  if (suggestions.length === 0) return '';
  return html`<datalist id="cost-suggestions-${phaseId}">
    ${raw(suggestions.map((s) =>
      html`<option value="${s.name}"></option>`).join(''))}
  </datalist>
  <div class="chip-row">
    <span class="micro">Suggestions:</span>
    ${raw(suggestions.map((s) =>
      html`<button type="button" class="btn btn--small" data-act="cost-suggest"
        data-id="${initiative.id}" data-phase="${phaseId}"
        data-name="${s.name}" data-amount="${s.amount}"
        >${s.name}${raw(s.amount ? html` <span class="micro">${F.money(s.amount)}</span>` : '')}</button>`
    ).join(' '))}
  </div>`;
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
  // A phase already gated through is a settled figure, not a plan any more —
  // Provisional/Confirmed answers "how solid is this plan?", which no longer
  // applies once there is no longer a plan, only a record (SPEC §3).
  const provisional = !frozen && phase.estStartDate
    && !E.isPhaseConfirmed(initiative, phaseId, today());
  // A frozen phase reads its own snapshot — including the people, since a
  // custom rate lives on the person record — so an approved figure on screen
  // never moves when master data changes underneath it.
  const at = E.ratesFor(app, phase);

  const allocationRows = allocationRowsFor(initiative, phaseId, editable, at);
  const seedFrom = editable && phase.allocations.length === 0
    ? seedSource(initiative, phaseId)
    : null;
  const candidates = editable ? addablePeople(initiative, phase) : [];

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
  // not a warning: nothing here needs looking at. Provisional shares the same
  // slot — a plan can be exactly one of "already approved" or "not solid
  // yet", never both, and a Confirmed plan needs no badge at all.
  return panel({
    id: `panel-phase-${phaseId}`,
    title: label,
    mark: frozen ? badge('approved and frozen', 'ok', 'check') : provisional ? badge('provisional', 'quiet') : '',
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
    ${raw(editable && !phase.estEndDate ? durationPresetsMarkup(initiative, phaseId) : '')}
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
    ${raw(editable && (allocationRows || candidates.length) ? bulkEditMarkup(initiative, phaseId) : '')}
    ${raw(allocationRows
      ? scroller(`${label} allocations`, html`<table class="grid">
          <thead><tr><th>Person</th><th>Role</th><th>Country</th>
            <th>Allocation %</th><th>Person-days</th><th>Cost</th><th></th></tr></thead>
          <tbody>${raw(allocationRows)}</tbody></table>`)
        + (phase.allocations.length ? registerAllocationTable(initiative, phaseId, at) : '')
      // Nobody allocated yet: with nobody left to add either, there really is
      // no one on this team (a real empty state); otherwise the chips below
      // are the whole affordance, and a redundant "nobody yet" box on top of
      // them would be exactly the noise F2 removed the pre-listed rows for.
      : !editable || candidates.length === 0
        ? empty(editable
            ? 'Nobody is in this team yet. Add people to the team, then allocate them here.'
            : 'Nobody was allocated.')
        : '')}
    ${raw(editable ? addPersonChipsMarkup(initiative, phaseId, candidates) : '')}

    <h3>Other costs</h3>
    ${raw(phase.otherCosts.length || editable
      ? scroller(`${label} other costs`, html`<table class="grid">
          <thead><tr><th>Item</th><th>Month</th><th>Amount</th><th></th></tr></thead>
          <tbody>
            ${raw(costRows)}
            ${raw(editable ? html`<tr data-id="new">
              <td class="cell--wrap"><input class="field" data-act="cost-field" data-field="name" data-id="${initiative.id}"
                data-phase="${phaseId}" data-cost="new" placeholder="New cost item…"
                aria-label="New cost item name" list="cost-suggestions-${phaseId}" /></td>
              <td><input class="field field--month" data-act="cost-field" data-field="month" data-id="${initiative.id}"
                data-phase="${phaseId}" data-cost="new" type="month" aria-label="Month" /></td>
              <td class="num">${raw(numberField({ 'data-act': 'cost-field', 'data-field': 'amount', 'data-id': initiative.id,
                'data-phase': phaseId, 'data-cost': 'new', 'aria-label': 'Amount', placeholder: 'Amount',
                extraClass: 'field--money' }))}</td>
              <td></td>
            </tr>` : '')}
          </tbody></table>`)
        + (editable ? costSuggestionsMarkup(initiative, phaseId) : '')
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

export const phasePanelClickActions = {
  'allocation-detail': ({ trigger, id }) => openPopover(
    trigger, allocationDetailMarkup(id, trigger.dataset.phase, trigger.dataset.person),
  ),
  'allocation-seed': ({ trigger, id }) => {
    // Seeded on a click, never on a render — a panel that writes allocations
    // merely by being looked at would be worse than a magic default.
    const initiative = findInitiative(id);
    const from = trigger.dataset.from;
    const phaseId = trigger.dataset.phase;
    withUndo(`Copied ${E.phaseLabel(PROCESS, from)}'s allocations`, () => {
      for (const allocation of initiative.phases[from].allocations) {
        const person = app.PEOPLE[allocation.personId];
        // Someone who has since left the team cannot be allocated afresh
        // (SPEC §5.2); they are skipped rather than throwing the copy away.
        if (!person?.active || !E.membership(person, initiative.teamId)) continue;
        L.setAllocation(app, initiative, phaseId, allocation.personId, allocation.allocationPct);
      }
    });
    return commit();
  },
  'allocation-max': ({ trigger, id }) => {
    const initiative = findInitiative(id);
    const person = app.PEOPLE[trigger.dataset.person];
    const pct = Number(trigger.dataset.amount);
    withUndo(`Set ${person.name} to ${pct}%`, () => {
      L.setAllocation(app, initiative, trigger.dataset.phase, trigger.dataset.person, pct);
    });
    return commit();
  },
  'allocation-remove': ({ trigger, id }) => {
    const initiative = findInitiative(id);
    withUndo('Removed allocation', () => {
      L.setAllocation(app, initiative, trigger.dataset.phase, trigger.dataset.person, 0);
    });
    return commit();
  },
  // F2: add-person chip — allocate at the best available default (C4's
  // carry-forward, then C5's usual, then 100%) rather than a 0% row waiting
  // to be typed over.
  'allocation-add': ({ trigger, id }) => {
    const initiative = findInitiative(id);
    const phaseId = trigger.dataset.phase;
    const personId = trigger.dataset.person;
    const person = app.PEOPLE[personId];
    const carry = E.carryForwardPct(PROCESS, initiative, phaseId, personId);
    const personRoleId = person.customRole ? null : person.roleId;
    const usual = personRoleId
      ? E.usualAllocationPct(app, initiative.teamId, personRoleId, phaseId)
      : null;
    const pct = carry?.allocationPct ?? usual ?? 100;
    withUndo(`Added ${person.name} at ${pct}%`, () => {
      L.setAllocation(app, initiative, phaseId, personId, pct);
    });
    return commit();
  },
  'cost-remove': ({ trigger, id }) => {
    const initiative = findInitiative(id);
    const phase = initiative.phases[trigger.dataset.phase];
    const cost = phase.otherCosts.find((c) => c.id === trigger.dataset.cost);
    withUndo(`Removed ${cost.name}`, () => {
      phase.otherCosts = phase.otherCosts.filter((c) => c.id !== trigger.dataset.cost);
    });
    return commit();
  },
  // C4: carry-forward chip — apply the prior phase's allocation %.
  'allocation-carry': ({ trigger, id }) => {
    const initiative = findInitiative(id);
    const person = app.PEOPLE[trigger.dataset.person];
    const pct = Number(trigger.dataset.amount);
    withUndo(`Set ${person.name} to ${pct}% (from prior phase)`, () => {
      L.setAllocation(app, initiative, trigger.dataset.phase, trigger.dataset.person, pct);
    });
    return commit();
  },
  // C5: usual allocation chip — apply the historical median %.
  'allocation-usual': ({ trigger, id }) => {
    const initiative = findInitiative(id);
    const person = app.PEOPLE[trigger.dataset.person];
    const pct = Number(trigger.dataset.amount);
    withUndo(`Set ${person.name} to ${pct}% (usual)`, () => {
      L.setAllocation(app, initiative, trigger.dataset.phase, trigger.dataset.person, pct);
    });
    return commit();
  },
  // C8: duration preset — set end date based on start + days.
  'duration-preset': ({ trigger, id }) => {
    const initiative = findInitiative(id);
    const phaseId = trigger.dataset.phase;
    const phase = initiative.phases[phaseId];
    const days = Number(trigger.dataset.days);
    // Use existing start date, or default to today.
    const startIso = phase.estStartDate || today();
    const start = new Date(startIso);
    const end = new Date(start.getTime() + days * 24 * 60 * 60 * 1000);
    const endIso = end.toISOString().slice(0, 10);
    withUndo(`Set ${E.phaseLabel(PROCESS, phaseId)} to ${trigger.textContent.trim()}`, () => {
      L.setPhasePeriod(initiative, phaseId, startIso, endIso);
    });
    return commit();
  },
  // C7: bulk set all — set every roster member to the given %.
  'bulk-set-all': ({ trigger, id }) => {
    const initiative = findInitiative(id);
    const phaseId = trigger.dataset.phase;
    const panel = trigger.closest('.bulk-edit');
    const input = panel?.querySelector('[data-bulk-pct="all"]');
    const pct = F.readNumber(input?.value ?? '', 0);
    if (pct <= 0) return;
    withUndo(`Set everyone to ${pct}%`, () => {
      for (const person of Object.values(app.PEOPLE)) {
        if (!person.active || !E.membership(person, initiative.teamId)) continue;
        L.setAllocation(app, initiative, phaseId, person.id, pct);
      }
    });
    return commit();
  },
  // C7: bulk set role — set every person with a given role to the given %.
  'bulk-set-role': ({ trigger, id }) => {
    const initiative = findInitiative(id);
    const phaseId = trigger.dataset.phase;
    const panel = trigger.closest('.bulk-edit');
    const input = panel?.querySelector('[data-bulk-pct="role"]');
    const select = panel?.querySelector('[data-bulk-role]');
    const pct = F.readNumber(input?.value ?? '', 0);
    const roleId = select?.value;
    if (pct <= 0 || !roleId) return;
    const roleName = app.ROLES[roleId]?.name ?? roleId;
    withUndo(`Set all ${roleName} to ${pct}%`, () => {
      for (const person of Object.values(app.PEOPLE)) {
        if (!person.active || !E.membership(person, initiative.teamId)) continue;
        if (person.roleId !== roleId || person.customRole) continue;
        L.setAllocation(app, initiative, phaseId, person.id, pct);
      }
    });
    return commit();
  },
  // C7: bulk usual — apply historical median staffing shape.
  'bulk-usual': ({ trigger, id }) => {
    const initiative = findInitiative(id);
    const phaseId = trigger.dataset.phase;
    const staffing = E.usualStaffing(app, initiative.teamId, phaseId);
    if (!staffing.length) return;
    const byRole = new Map(staffing.map((s) => [s.roleId, s.medianPct]));
    withUndo('Applied usual staffing', () => {
      for (const person of Object.values(app.PEOPLE)) {
        if (!person.active || !E.membership(person, initiative.teamId)) continue;
        if (person.customRole) continue;
        const pct = byRole.get(person.roleId);
        if (pct) L.setAllocation(app, initiative, phaseId, person.id, pct);
      }
    });
    return commit();
  },
  // C9: cost suggestion chip — add a pre-filled other-cost item.
  'cost-suggest': ({ trigger, id }) => {
    const initiative = findInitiative(id);
    const phaseId = trigger.dataset.phase;
    const name = trigger.dataset.name;
    const amount = Number(trigger.dataset.amount) || 0;
    withUndo(`Added ${name}`, () => {
      const item = { id: L.newId('cost'), name, month: '', amount };
      initiative.phases[phaseId].otherCosts.push(item);
    });
    return commit();
  },
};

export const phasePanelInputActions = {
  'allocation-pct': ({ target }) => {
    const initiative = findInitiative(target.dataset.id);
    const phaseId = target.dataset.phase;
    // Every row here does have a record by the time this field renders, but
    // unreadable input still needs a fallback that isn't a percentage that
    // doesn't exist.
    const current = initiative.phases[phaseId].allocations
      .find((a) => a.personId === target.dataset.person);
    L.setAllocation(app, initiative, phaseId, target.dataset.person,
      F.readNumber(target.value, current?.allocationPct ?? 0));
    commitQuietly();
    refreshCalcRegions(initiative);
  },
  'actual-month': ({ target }) => {
    const initiative = findInitiative(target.dataset.id);
    const phaseId = target.dataset.phase;
    const rawValue = target.value.trim();
    L.recordActual(initiative, phaseId, target.dataset.month,
      rawValue === '' ? null : F.readNumber(rawValue, 0));
    commitQuietly();
    // Recording an actual moves the blended figures, not the structure.
    refreshCalcRegions(initiative);
  },
  'cost-field': ({ target, field }) => {
    const initiative = findInitiative(target.dataset.id);
    const phaseId = target.dataset.phase;
    const costId = target.dataset.cost;

    if (costId === 'new') {
      const newCost = {
        id: L.newId('cost'),
        name: field === 'name' ? target.value : 'New cost',
        month: field === 'month' ? target.value : '',
        amount: field === 'amount' ? F.readNumber(target.value, 0) : 0,
      };
      initiative.phases[phaseId].otherCosts.push(newCost);
      restoreCaretAfter(
        target,
        `[data-act="cost-field"][data-field="${field}"][data-phase="${phaseId}"][data-cost="${newCost.id}"]`,
        commit,
      );
      return;
    }

    const item = initiative.phases[phaseId].otherCosts.find((c) => c.id === costId);
    if (field === 'amount') item.amount = F.readNumber(target.value, item.amount);
    else item[field] = target.value;
    // Changing an amount moves phase totals. Re-render the affected totals.
    commitQuietly();
    if (field === 'amount') refreshCalcRegions(initiative);
  },
};
