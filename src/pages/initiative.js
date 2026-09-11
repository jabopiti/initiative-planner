import * as F from '../format.js';
/**
 * Initiative detail: the process rail, the gate, the phase panels,
 * month-by-month and the per-gate comparison.
 *
 * This is the longest page in the app — five screens of panels that all move
 * when one allocation percentage changes. Two devices hold it together: the
 * rail across the top, which says where the initiative is and jumps to the
 * panel behind each step, and `panelsFor`, the one list of panels that the
 * rail and the jump menu both address.
 */
import * as E from '../engine.js';
import * as L from '../lifecycle.js';
import { PROCESS } from '../process.js';
import { app, view, navigate, STATUS_LABELS, today } from '../app.js';
import { html, raw, fill, numberField } from '../render/dom.js';
import { icon } from '../render/icons.js';
import { pageHead, scroller, empty, badge, panel } from '../render/components.js';
import { TABLES, tableActions } from '../render/tables.js';
import { phasePanel } from '../render/phase-panel.js';

export function renderInitiative() {
  const initiative = app.INITIATIVES.find((i) => i.id === view.params.id);
  if (!initiative) return navigate('initiatives');

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
      ${raw(stepperMarkup(initiative))}
      <div class="panel-stack">${raw(panelsFor(initiative)
        .map((entry) => entry.render(initiative))
        .join(''))}</div>`,
  );
}

/**
 * Every panel on this page, in the order it appears: its element id, the name
 * it is known by, and how it renders.
 *
 * One list rather than a hand-written sequence inside `renderInitiative`,
 * because three things have to agree on it — the page, the rail's jump
 * targets, and the jump menu. A panel that does not always exist (the gate
 * comparison before any gate has been left) is absent from the list rather
 * than rendering empty, so nothing offers to jump somewhere that is not
 * there.
 *
 * @returns {Array<{ id: string, label: string, render: (initiative: object) => string }>}
 */
export function panelsFor(initiative) {
  const costed = E.costedPhaseIds(PROCESS).filter((phaseId) => initiative.phases[phaseId]);
  const left = PROCESS.phases.some((phase) => initiative.gates[phase.gate.id]);

  return [
    { id: 'panel-description', label: 'Description', render: descriptionMarkup },
    { id: 'panel-gate', label: gatePanelLabel(initiative), render: gateBannerMarkup },
    {
      id: 'panel-approval',
      label: 'Approval track',
      // The whole body is rebuilt in place when a figure moves: the total,
      // its track, the marker and the variance all change together, and none
      // of them is an input under a caret.
      render: (subject) => panel({
        id: 'panel-approval',
        title: 'Approval track',
        body: html`<div data-calc="band-panel">${raw(bandPanelMarkup(subject))}</div>`,
      }),
    },
    ...costed.map((phaseId) => ({
      id: `panel-phase-${phaseId}`,
      label: E.phaseLabel(PROCESS, phaseId),
      render: (subject) => phasePanel(subject, phaseId, L.isPhaseEditable(subject, phaseId)),
    })),
    { id: 'panel-months', label: 'Month by month', render: monthTableMarkup },
    ...(left ? [{ id: 'panel-gates', label: 'At each gate', render: gateComparisonMarkup }] : []),
    { id: 'panel-notes', label: 'Notes', render: notesMarkup },
  ];
}

/** What the gate panel is called, which depends on what state it is in. */
function gatePanelLabel(initiative) {
  if (initiative.status === 'closed') return 'Closed';
  if (initiative.status === 'cancelled') return 'Cancelled';
  return E.gateForPhase(PROCESS, initiative.phaseId).label;
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
  return panel({
    id: 'panel-description',
    title: 'Description',
    body: html`<input class="field" data-act="initiative-description" data-id="${initiative.id}"
      value="${initiative.description}" placeholder="What is this initiative?"
      aria-label="Description" ${raw(locked ? 'disabled' : '')} />`,
  });
}

/**
 * Stays writable when the initiative is closed or cancelled — recording why
 * something ended is exactly what a finished initiative still needs to
 * accept (SPEC §6.4, AGENTS.md). `setNotes` carries no `assertOpen` guard
 * for the same reason.
 */
function notesMarkup(initiative) {
  return panel({
    id: 'panel-notes',
    title: 'Notes',
    body: html`<input class="field" data-act="initiative-notes" data-id="${initiative.id}"
      value="${initiative.notes}" placeholder="Anything worth recording"
      aria-label="Notes" />`,
  });
}

/* ------------------------------------------------------------------ *
 * The process rail
 * ------------------------------------------------------------------ */

/**
 * What one step of the rail says under its name, and where clicking it goes.
 *
 * A rail that only shows outcome answers "where am I" and nothing else, which
 * is a waste of the widest component on the page. Each step carries what is
 * actually worth knowing about that phase from a distance, and the three
 * states carry different things because they are different questions: a
 * passed phase is a settled figure, the current one is a piece of work with
 * something in its way, and one still ahead is a promise of cost.
 *
 * @returns {{ meta: string, figure: string, qualifier: string, target: string }}
 */
function stepDetail(initiative, phase, state) {
  const record = initiative.gates[phase.gate.id];
  const costedPhase = initiative.phases[phase.id];
  // A costed phase has a panel of its own; anything else is read at the gate.
  const target = costedPhase
    ? `panel-phase-${phase.id}`
    : state === 'current'
      ? 'panel-gate'
      : record
        ? 'panel-gates'
        : '';

  if (state === 'passed') {
    return {
      meta: html`${phase.gate.label} passed · ${F.date(record.takenAt)}`,
      // The frozen figure, not the live one: what a passed gate approved is
      // the number worth showing beside it, and it cannot move afterwards.
      figure: costedPhase?.frozen ? F.money(costedPhase.frozen.estimatedPhaseCost) : '',
      qualifier: costedPhase?.frozen ? 'approved' : '',
      target,
    };
  }

  if (state === 'skipped') {
    return {
      // A skip approves nothing, so it carries no figure — only why.
      meta: html`Skipped${raw(record.takenAt ? html` · ${F.date(record.takenAt)}` : '')} — ${record.reason}`,
      figure: '',
      qualifier: '',
      target,
    };
  }

  const period = costedPhase?.estStartDate && costedPhase?.estEndDate
    ? html`${F.month(costedPhase.estStartDate.slice(0, 7))} – ${F.month(costedPhase.estEndDate.slice(0, 7))}`
    : '';
  const total = costedPhase ? E.phaseBlendedTotal(costedPhase, app) : 0;

  if (state === 'current') {
    return {
      meta: period
        ? html`${phase.gate.label} · ${raw(period)}`
        : html`${phase.gate.label}${raw(costedPhase ? ' · no period set' : '')}`,
      figure: costedPhase ? F.money(total) : '',
      qualifier: costedPhase ? E.phaseCoverage(costedPhase) : '',
      target,
    };
  }

  return {
    meta: costedPhase
      ? period || 'Costed, no period set'
      : 'No cost',
    figure: costedPhase && total > 0 ? F.money(total) : '',
    qualifier: costedPhase && total > 0 ? E.phaseCoverage(costedPhase) : '',
    target,
  };
}

/**
 * The rail: one segment per phase, capped by its gate's outcome, and the
 * page's primary navigation.
 *
 * A step whose phase has nothing on this page — a phase ahead that carries no
 * cost and has left no gate — is not a button. Offering a jump to a place
 * that does not exist is worse than a segment that only reads.
 */
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

      const detail = stepDetail(initiative, phase, state);
      // A skipped gate must never read as a passed one; the glyph says which
      // before the colour does, and survives being printed in grey.
      const mark = state === 'passed' ? 'check' : state === 'skipped' ? 'skip' : '';
      const blockers = state === 'current'
        ? L.gatePrecondition(app, PROCESS, initiative, phase.gate.id).blockers.length
        : 0;

      // The figure last and pushed to the foot, so figures line up across the
      // rail however much prose the segments above them carry.
      const body = html`<span class="step__name">${raw(mark ? icon(mark) : '')}${phase.label}</span>
        <span class="step__meta">${raw(detail.meta)}</span>
        ${raw(state === 'current' && blockers
          ? html`<span class="step__flag">${raw(icon('warning', 'icon--lead'))}${blockers}
              ${blockers === 1 ? 'blocker' : 'blockers'}</span>`
          : '')}
        ${raw(detail.figure
          ? html`<span class="step__figure">${detail.figure}<span class="step__qual"
              >${detail.qualifier}</span></span>`
          : '')}`;

      return html`<li class="step step--${state}">${raw(detail.target
        ? html`<button type="button" class="step__hit" data-act="panel"
            data-panel="${detail.target}">${raw(body)}</button>`
        : html`<span class="step__hit step__hit--static">${raw(body)}</span>`)}</li>`;
    })
    .join('');

  return html`<nav class="rail" aria-label="Phases">
    <ol class="stepper">${raw(items)}</ol>
  </nav>`;
}

/* ------------------------------------------------------------------ *
 * The gate
 * ------------------------------------------------------------------ */

/**
 * What this phase's gate needs, and the actions for it. A gate action is
 * disabled with its reasons spelled out rather than hidden — being told why
 * is the difference between a blocked user and a stuck one.
 */
function gateBannerMarkup(initiative) {
  if (initiative.status === 'closed') {
    return panel({
      id: 'panel-gate',
      title: 'Closed',
      extraClass: 'banner banner--done',
      body: html`<p class="muted">This initiative is finished and frozen. Only notes stay
          writable.</p>
        <div class="actions">
          <button type="button" class="btn" data-act="reopen" data-id="${initiative.id}">
            Reopen the final gate</button>
        </div>`,
    });
  }
  if (initiative.status === 'cancelled') {
    return panel({
      id: 'panel-gate',
      title: 'Cancelled',
      extraClass: 'banner',
      body: html`<p class="muted">Abandoned before the process finished, and frozen. Set the
        status back to Active from the registry to work on it again.</p>`,
    });
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

  return panel({
    id: 'panel-gate',
    title: html`${phase.label} — ${gate.label}`,
    extraClass: 'banner',
    body: html`<p class="micro"><button type="button" class="link" data-act="section"
      data-section="process">${gate.label} in the process definition</button></p>
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

    ${raw((gate.checklist ?? []).length ? checklistMarkup(initiative, gate) : '')}`,
  });
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

/* ------------------------------------------------------------------ *
 * Figures
 * ------------------------------------------------------------------ */

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

  return html`<p class="results"><strong>${F.money(total)}</strong>
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
          against. A skipped gate approves nothing and never sets that baseline.</p>`)}`;
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
    return panel({
      id: 'panel-months',
      title: 'Month by month',
      body: empty('Nothing is costed yet. Give a phase a period and allocate someone.'),
    });
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

  return panel({
    id: 'panel-months',
    title: 'Month by month',
    body: html`<p class="legend">
      <span class="legend__item"><span class="swatch swatch--edit"></span> record an actual here</span>
      <span class="legend__item"><span class="swatch swatch--gap"></span> expected but not recorded</span>
      <span class="legend__item"><span class="swatch swatch--now"></span> current month</span>
    </p>
    ${raw(scroller('Cost month by month', html`<table class="grid">
      <thead><tr>${raw(headers.map((h) => html`<th>${h}</th>`).join(''))}</tr></thead>
      <tbody>${raw(body)}</tbody>
    </table>`, 'scroller--tall'))}
    ${raw(tableActions('months', 'months'))}`,
  });
}

/** Every gate left so far, beside the live figures. */
function gateComparisonMarkup(initiative) {
  const left = PROCESS.phases
    .map((phase) => ({ phase, record: initiative.gates[phase.gate.id] }))
    .filter((entry) => entry.record);

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
        <td>${F.date(String(row[2]))}</td>
        ${raw(costed.map((id, i) => html`<td class="num">${F.money(row[3 + i])}</td>`).join(''))}
        <td>${row[3 + costed.length]}</td>
        <td class="num"><strong>${F.money(row[4 + costed.length])}</strong></td>
      </tr>`;
    })
    .join('');

  return panel({
    id: 'panel-gates',
    title: 'At each gate',
    body: html`<p class="muted">What the figures were when each gate was left, beside where they
      stand now. A skipped gate approved nothing — its numbers are a record, not a baseline.</p>
    ${raw(scroller('Figures at each gate', html`<table class="grid">
      <thead><tr>${raw(headers.map((h) => html`<th>${h}</th>`).join(''))}</tr></thead>
      <tbody>${raw(body)}</tbody>
    </table>`))}
    ${raw(tableActions('gates', 'comparison'))}`,
  });
}
