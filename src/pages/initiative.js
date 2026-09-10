import * as F from '../format.js';
/**
 * Initiative detail: stepper, gate, phase panels, month-by-month and the
 * per-gate comparison.
 */
import * as E from '../engine.js';
import * as L from '../lifecycle.js';
import { PROCESS } from '../process.js';
import { app, view, navigate, STATUS_LABELS, today } from '../app.js';
import { html, raw, fill, numberField } from '../render/dom.js';
import { icon } from '../render/icons.js';
import { pageHead, scroller, empty, badge } from '../render/components.js';
import { TABLES, tableActions } from '../render/tables.js';
import { costedPhasePanels } from '../render/phase-panel.js';

export function renderInitiative() {
  const initiative = app.INITIATIVES.find((i) => i.id === view.params.id);
  if (!initiative) return navigate('initiatives');

  const panels = costedPhasePanels(initiative);
  const deleting = view.params.confirmDelete === true;

  fill(
    'root',
    html`${raw(pageHead({
      title: initiative.name,
      back: { page: 'initiatives', label: 'Initiatives' },
      lede: html`<a href="#/team/${initiative.teamId}" class="link">${app.TEAMS[initiative.teamId]?.name ?? '—'}</a> ·
        ${STATUS_LABELS[initiative.status]}`,
      actions: html`<button type="button" class="btn" data-act="duplicate-initiative"
          data-id="${initiative.id}">${raw(icon('duplicate'))}Duplicate</button>
        <button type="button" class="btn btn--danger" data-act="initiative-delete-arm"
          data-id="${initiative.id}">${raw(icon('remove'))}Delete</button>`,
    }))}
      ${raw(deleting ? deleteConfirmMarkup(initiative) : '')}
      ${raw(descriptionMarkup(initiative))}

      ${raw(stepperMarkup(initiative))}
      ${raw(gateBannerMarkup(initiative))}
      <div data-calc="band-panel">${raw(bandPanelMarkup(initiative))}</div>
      ${raw(panels)}
      ${raw(monthTableMarkup(initiative))}
      ${raw(gateComparisonMarkup(initiative))}
      ${raw(notesMarkup(initiative))}`,
  );
}

/**
 * Nothing else references an initiative by id, so — unlike a team or a
 * role — there is no usage count to check first; only the confirm step
 * guards it (D1). Named, not itemised: enumerating every allocation and
 * cost line about to go is more machinery than a single "this cannot be
 * undone" warrants here.
 */
function deleteConfirmMarkup(initiative) {
  return html`<div class="panel banner banner--alert">
    <p class="warn">${raw(icon('warning', 'icon--lead'))}Delete “${initiative.name}”
      permanently? Its estimates, allocations, costs and gate history go with it. There is
      no undo.</p>
    <div class="actions">
      <button type="button" class="btn btn--danger" data-act="initiative-delete-confirm"
        data-id="${initiative.id}">${raw(icon('remove'))}Yes, delete it</button>
      <button type="button" class="btn" data-act="initiative-delete-cancel">Cancel</button>
    </div>
  </div>`;
}

function descriptionMarkup(initiative) {
  const locked = E.isFinished(initiative);
  return html`<div class="panel">
    <h2>Description</h2>
    <input class="field" data-act="initiative-description" data-id="${initiative.id}"
      value="${initiative.description}" placeholder="What is this initiative?"
      aria-label="Description" ${raw(locked ? 'disabled' : '')} />
  </div>`;
}

/**
 * Stays writable when the initiative is closed or cancelled — recording why
 * something ended is exactly what a finished initiative still needs to
 * accept (SPEC §6.4, AGENTS.md). `setNotes` carries no `assertOpen` guard
 * for the same reason.
 */
function notesMarkup(initiative) {
  return html`<div class="panel">
    <h2>Notes</h2>
    <input class="field" data-act="initiative-notes" data-id="${initiative.id}"
      value="${initiative.notes}" placeholder="Anything worth recording"
      aria-label="Notes" />
  </div>`;
}

/** Every phase, with passed and skipped gates visually distinct. */
function stepperMarkup(initiative) {
  const order = E.phaseOrder(PROCESS);
  const currentIndex = order.indexOf(initiative.phaseId);

  const items = PROCESS.phases
    .map((phase, index) => {
      const record = initiative.gates[phase.gate.id];
      const state = record
        ? record.outcome
        : index === currentIndex && initiative.status !== 'closed'
          ? 'current'
          : 'ahead';

      const note = record
        ? record.outcome === 'skipped'
          ? html`<span class="micro">Skipped${raw(record.takenAt ? html` · ${record.takenAt}` : '')}
              — ${record.reason}</span>`
          : html`<span class="micro">${phase.gate.label} passed · ${record.takenAt}</span>`
        : html`<span class="micro">${phase.costed ? 'Costed' : 'No cost'}</span>`;

      // A skipped gate must never read as a passed one; the glyph says which
      // before the colour does, and survives being printed in grey.
      const mark = state === 'passed' ? 'check' : state === 'skipped' ? 'skip' : '';

      return html`<li class="step step--${state}">
        <span class="step__name">${raw(mark ? icon(mark) : '')}${phase.label}</span>
        ${raw(note)}
      </li>`;
    })
    .join('');

  return html`<ol class="stepper">${raw(items)}</ol>`;
}

/**
 * What this phase's gate needs, and the actions for it. A gate action is
 * disabled with its reasons spelled out rather than hidden — being told why
 * is the difference between a blocked user and a stuck one.
 */
function gateBannerMarkup(initiative) {
  if (initiative.status === 'closed') {
    return html`<div class="panel banner banner--done">
      <h2>Closed</h2>
      <p class="muted">This initiative is finished and frozen. Only notes stay writable.</p>
      <div class="actions">
        <button type="button" class="btn" data-act="reopen" data-id="${initiative.id}">
          Reopen the final gate</button>
      </div>
    </div>`;
  }
  if (initiative.status === 'cancelled') {
    return html`<div class="panel banner">
      <h2>Cancelled</h2>
      <p class="muted">Abandoned before the process finished, and frozen. Set the status back
        to Active from the registry to work on it again.</p>
    </div>`;
  }

  const phase = E.phaseById(PROCESS, initiative.phaseId);
  const gate = phase.gate;
  const check = L.gatePrecondition(app, PROCESS, initiative, gate.id);
  const order = E.phaseOrder(PROCESS);
  const canReopen = order.indexOf(initiative.phaseId) > 0;
  const closes = E.isFinalPhase(PROCESS, initiative.phaseId);

  const list = (items, kind) =>
    items.length
      ? html`<ul class="issues issues--${kind}">${raw(
          items.map((text) => html`<li class="${kind === 'blocker' ? 'warn' : 'muted'}">${text}</li>`).join(''),
        )}</ul>`
      : '';

  return html`<div class="panel banner">
    <h2>${phase.label} — ${gate.label}</h2>
    <p class="micro"><button type="button" class="link" data-act="section" data-section="process"
      >${gate.label} in the process definition</button></p>
    <p class="muted">${closes
      ? 'This is the last gate. Passing it closes the initiative.'
      : `Passing it moves to ${E.phaseLabel(PROCESS, E.nextPhase(PROCESS, phase.id))}.`}
      ${gate.requiresEstimates
        ? 'It requires a complete estimate for every costed phase.'
        : 'It has no cost requirement.'}</p>

    ${raw(list(check.blockers, 'blocker'))}
    ${raw(list(check.warnings, 'warning'))}

    <div class="actions">
      <label class="field-inline"><span>Gate date</span>
        <input type="date" class="field field--date" data-field="gate-date"
          value="${today()}" /></label>
      <button type="button" class="btn btn--primary" data-act="pass-gate"
        data-id="${initiative.id}" data-gate="${gate.id}" ${raw(check.ok ? '' : 'disabled')}>
        ${raw(icon('check'))}${closes ? `Pass ${gate.label} and close` : `Pass ${gate.label}`}</button>
      ${raw(canReopen
        ? html`<button type="button" class="btn" data-act="reopen" data-id="${initiative.id}">
            Reopen previous phase</button>`
        : '')}
    </div>

    ${raw(gate.skippable
      ? html`<div class="actions">
          <label class="field-inline"><span>Skip reason</span>
            <input class="field" data-field="skip-reason"
              placeholder="Why is this gate not needed?" /></label>
          <button type="button" class="btn" data-act="skip-gate" data-id="${initiative.id}"
            data-gate="${gate.id}">${raw(icon('skip'))}Skip this gate</button>
        </div>
        <p class="micro">A skip approves nothing and freezes nothing, so this phase stays
          editable. The reason is recorded and shown wherever the gate appears.</p>`
      : html`<p class="micro">${gate.label} cannot be skipped.</p>`)}

    ${raw((gate.checklist ?? []).length ? checklistMarkup(initiative, gate) : '')}
  </div>`;
}

const CHECK_LABELS = { red: 'Not resolved', amber: 'Partly', green: 'Resolved' };

function checklistMarkup(initiative, gate) {
  const rows = L.checklistState(initiative, gate)
    .map(
      (item) => html`<tr class="check check--${item.status}">
        <td class="cell--wrap"><strong>${item.name}</strong>
          <span class="micro">${item.description}</span></td>
        <td>
          <select class="field field--select" data-act="checklist-status"
            data-id="${initiative.id}" data-gate="${gate.id}" data-item="${item.id}"
            aria-label="${item.name} status">
            ${raw(L.CHECKLIST_STATUSES.map((status) => html`<option value="${status}"
              ${raw(item.status === status ? 'selected' : '')}>${CHECK_LABELS[status]}</option>`).join(''))}
          </select>
        </td>
        <td class="cell--wrap"><input class="field" data-act="checklist-note"
          data-id="${initiative.id}" data-gate="${gate.id}" data-item="${item.id}"
          value="${item.note}" placeholder="Note" aria-label="${item.name} note" /></td>
      </tr>`,
    )
    .join('');

  return html`<h3>Checklist</h3>
    <p class="muted">Items start unresolved, so a gate with a checklist is blocked until
      someone has looked at each one. “Partly” lets the gate pass with a warning.</p>
    ${raw(scroller(`${gate.label} checklist`, html`<table class="grid">
      <thead><tr><th>Item</th><th>Status</th><th>Note</th></tr></thead>
      <tbody>${raw(rows)}</tbody></table>`))}`;
}

/** The grand total, its track, where it sits among the bands, and variance. */
export function bandPanelMarkup(initiative) {
  const total = E.grandTotal(initiative, app);
  const band = E.resolveBand(PROCESS.bands, total);
  const scale = E.bandScale(PROCESS.bands);

  const segments = [...PROCESS.bands]
    .sort((a, b) => a.lower - b.lower)
    .map((b) => {
      const from = scale.fraction(b.lower);
      const to = b.upper === null ? 1 : scale.fraction(b.upper);
      return html`<span class="bar__band ${band?.id === b.id ? 'bar__band--on' : ''}"
        style="left:${from * 100}%;width:${(to - from) * 100}%" title="${b.name}">
        <span class="bar__abbr">${b.abbr}</span></span>`;
    })
    .join('');

  const passed = L.lastPassedGate(PROCESS, initiative);
  const variance = passed ? total - passed.grandTotal : null;
  const move = passed ? E.compareBands(passed.band, band) : 'unknown';

  return html`<div class="panel">
    <h2>Approval track</h2>
    <p class="results"><strong>${F.money(total)}</strong>
      ${raw(badge(E.initiativeCoverage(initiative), 'info'))}
      — ${band ? band.name : 'Not yet known'}</p>
    <p class="muted">${band ? band.req : 'No configured approval track covers this total.'}</p>

    <div class="bar" role="img" aria-label="Where this total sits among the approval tracks">
      ${raw(segments)}
      <span class="bar__marker" style="left:${scale.fraction(total) * 100}%"></span>
    </div>

    ${raw(passed
      ? html`<p class="${move === 'escalation' ? 'warn' : 'muted'}">
          ${variance === 0
            ? 'Unchanged since the last approval.'
            : html`${variance > 0 ? 'Up' : 'Down'} ${F.money(Math.abs(variance))} since
                ${passed.band ? passed.band.name : 'the last approval'} was approved.`}
          ${raw(move === 'escalation'
            ? html`<strong>${raw(icon('warning', 'icon--lead'))}This now needs a stricter approval
                track than the one approved.</strong>`
            : move === 'de-escalation'
              ? 'It now falls under a lighter track than the one approved.'
              : '')}</p>`
      : html`<p class="muted">No gate has been passed yet, so there is nothing to compare
          against. A skipped gate approves nothing and never sets that baseline.</p>`)}
  </div>`;
}

/**
 * Every costed month across every costed phase, blending estimate and actual.
 * This is where actuals are entered, one month at a time (SPEC §5.4).
 *
 * The legend distinguishes three things that look alike but are not: a cell
 * you can record against, a gap where money was expected but nothing was
 * recorded, and the current month.
 */
function monthTableMarkup(initiative) {
  const months = E.initiativeMonths(initiative);
  const costed = E.costedPhaseIds(PROCESS).filter((id) => initiative.phases[id]);
  const locked = E.isFinished(initiative);
  const now = E.monthKey(new Date());

  if (months.length === 0) {
    return html`<div class="panel"><h2>Month by month</h2>
      ${raw(empty('Nothing is costed yet. Give a phase a period and allocate someone.'))}</div>`;
  }

  const headers = ['Month', ...costed.flatMap((id) => {
    const label = E.phaseLabel(PROCESS, id);
    return [`${label} estimate`, `${label} actual`];
  }), 'Blended'];

  const data = months.map((month) => {
    /** @type {Array<string|number>} */
    const cells = [month];
    let blended = 0;
    for (const phaseId of costed) {
      const phase = initiative.phases[phaseId];
      const estimate = E.phaseEstimateByMonth(phase, app)[month] ?? 0;
      const actual = phase.actualMonths[month];
      cells.push(Math.round(estimate), actual === undefined ? '' : actual);
      blended += E.phaseBlendedByMonth(phase, app)[month] ?? 0;
    }
    cells.push(Math.round(blended));
    return cells;
  });
  TABLES.months = { headers, rows: data, name: `${initiative.name}-months` };

  const body = months
    .map((month) => {
      let blended = 0;
      const cells = costed
        .map((phaseId) => {
          const phase = initiative.phases[phaseId];
          const estimate = E.phaseEstimateByMonth(phase, app)[month] ?? 0;
          const actual = phase.actualMonths[month];
          blended += E.phaseBlendedByMonth(phase, app)[month] ?? 0;
          const inPeriod = E.phaseMonths(phase).includes(month);
          const gap = inPeriod && actual === undefined && estimate > 0;

          return html`<td class="num">${estimate ? F.money(estimate) : '—'}</td>
            <td class="num ${gap ? 'cell--gap' : ''}">${raw(locked || !inPeriod
              ? actual === undefined ? '—' : F.money(actual)
              : numberField({
                  value: actual ?? '',
                  'data-act': 'actual-month',
                  'data-id': initiative.id,
                  'data-phase': phaseId,
                  'data-month': month,
                  'aria-label': `${E.phaseLabel(PROCESS, phaseId)} actual for ${F.month(month)}`,
                  placeholder: 'not recorded',
                  extraClass: 'field--money',
                }))}</td>`;
        })
        .join('');

      return html`<tr class="${month === now ? 'row--now' : ''}">
        <td>${F.month(month)} ${raw(month === now ? badge('now', 'accent') : '')}</td>
        ${raw(cells)}
        <td class="num" data-calc="blended-${F.month(month)}"><strong>${F.money(blended)}</strong></td>
      </tr>`;
    })
    .join('');

  return html`<div class="panel">
    <h2>Month by month</h2>
    <p class="legend">
      <span class="legend__item"><span class="swatch swatch--edit"></span> record an actual here</span>
      <span class="legend__item"><span class="swatch swatch--gap"></span> expected but not recorded</span>
      <span class="legend__item"><span class="swatch swatch--now"></span> current month</span>
    </p>
    ${raw(scroller('Cost month by month', html`<table class="grid">
      <thead><tr>${raw(headers.map((h) => html`<th>${h}</th>`).join(''))}</tr></thead>
      <tbody>${raw(body)}</tbody>
    </table>`, 'scroller--tall'))}
    ${raw(tableActions('months', 'months'))}
  </div>`;
}

/** Every gate left so far, beside the live figures. */
function gateComparisonMarkup(initiative) {
  const left = PROCESS.phases
    .map((phase) => ({ phase, record: initiative.gates[phase.gate.id] }))
    .filter((entry) => entry.record);

  if (left.length === 0) return '';

  const costed = E.costedPhaseIds(PROCESS);
  const headers = ['Gate', 'Outcome', 'Date', ...costed.map((id) => E.phaseLabel(PROCESS, id)),
    'Approval track', 'Grand total'];

  /** @returns {Array<string|number>} */
  const rowFor = (label, outcome, date, costs, band, total) => [
    label, outcome, date, ...costed.map((id) => Math.round(costs[id] ?? 0)),
    band ? band.name : 'Not yet known', Math.round(total),
  ];

  const liveCosts = E.phaseCosts(initiative, app);
  const liveTotal = Object.values(liveCosts).reduce((t, v) => t + v, 0);
  const data = [
    ...left.map((entry) => rowFor(
      entry.phase.gate.label,
      entry.record.outcome,
      entry.record.takenAt ?? '—',
      entry.record.phaseCosts,
      entry.record.band,
      entry.record.grandTotal,
    )),
    rowFor('Now', 'live', today(), liveCosts, E.resolveBand(PROCESS.bands, liveTotal), liveTotal),
  ];
  TABLES.gates = { headers, rows: data, name: `${initiative.name}-gates` };

  const body = data
    .map((row, index) => {
      const entry = left[index];
      const skipped = entry?.record.outcome === 'skipped';
      return html`<tr class="${index === data.length - 1 ? 'row--live' : skipped ? 'row--warn' : ''}">
        <td>${row[0]}</td>
        <td class="cell--wrap">${raw(skipped
          ? badge('skipped', 'warn', 'skip') + html`<span class="micro">${entry.record.reason}</span>`
          : html`${row[1]}`)}</td>
        <td>${row[2]}</td>
        ${raw(costed.map((id, i) => html`<td class="num">${F.money(row[3 + i])}</td>`).join(''))}
        <td>${row[3 + costed.length]}</td>
        <td class="num"><strong>${F.money(row[4 + costed.length])}</strong></td>
      </tr>`;
    })
    .join('');

  return html`<div class="panel">
    <h2>At each gate</h2>
    <p class="muted">What the figures were when each gate was left, beside where they stand
      now. A skipped gate approved nothing — its numbers are a record, not a baseline.</p>
    ${raw(scroller('Figures at each gate', html`<table class="grid">
      <thead><tr>${raw(headers.map((h) => html`<th>${h}</th>`).join(''))}</tr></thead>
      <tbody>${raw(body)}</tbody>
    </table>`))}
    ${raw(tableActions('gates', 'comparison'))}
  </div>`;
}
