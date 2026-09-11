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
        .join(''))}</div>
      <div class="summary" data-calc="summary" role="region"
        aria-label="Totals, approval track and what is next"
        aria-live="polite" aria-atomic="true">${raw(summaryBarMarkup(initiative))}</div>`,
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
        body: html`<div data-calc="band-panel" aria-live="polite" aria-atomic="true">
          ${raw(bandPanelMarkup(subject))}</div>`,
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
 * The summary bar
 * ------------------------------------------------------------------ */

/**
 * The figures, the track and what is next, kept at the foot of the viewport.
 *
 * This page earns a sticky bar and no other page in the app does. It is five
 * screens long, every figure on it moves as you type an allocation percentage
 * four panels down, and the question you are editing against — what does this
 * now cost, and what does that mean for who has to approve it — is answered
 * at the top. A bar that follows keeps the answer beside the edit.
 *
 * Sticky rather than fixed, so at the foot of the page it comes to rest in
 * the flow and stops covering anything. It holds no inputs, which is what
 * lets a recalculation rebuild it whole without ever touching a caret.
 *
 * The action is a jump to the gate, never the gate action itself: passing a
 * gate freezes a phase and sets an approval baseline, and doing that from a
 * strip at the bottom of the screen — without the blockers, the date and the
 * consequences in view — is not a thing this tool should make easy.
 */
export function summaryBarMarkup(initiative) {
  const totals = E.initiativeTotals(initiative, app);
  const band = E.resolveBand(PROCESS.bands, totals.forecast);
  const passed = L.lastPassedGate(PROCESS, initiative);
  const escalated = passed && E.compareBands(passed.band, band) === 'escalation';
  const finished = E.isFinished(initiative);

  const blockers = finished
    ? 0
    : L.gateRequirements(app, PROCESS, initiative, E.gateForPhase(PROCESS, initiative.phaseId).id)
      .filter((requirement) => requirement.state === 'blocker').length;

  const figure = (label, value, on, note = '') => html`<div
    class="summary__figure ${on ? 'summary__figure--on' : ''}">
    <dt>${label}</dt>
    <dd>${F.money(value)}${raw(note ? html`<span class="summary__note">${note}</span>` : '')}</dd>
  </div>`;

  return html`<dl class="summary__figures">
      ${raw(figure('Estimate', totals.estimate, totals.coverage === 'estimate'))}
      ${raw(figure('Forecast', totals.forecast, totals.coverage === 'forecast'))}
      ${raw(figure('Actual', totals.actual, totals.coverage === 'actual',
        totals.months ? `${totals.recorded} of ${totals.months} months` : ''))}
    </dl>

    <div class="summary__facts">
      <p class="summary__fact">
        <span class="label-voice">Approval track</span>
        <span>${band ? band.name : 'Not yet known'}${raw(escalated
          ? html` ${raw(badge('escalated', 'warn', 'warning'))}`
          : '')}</span>
      </p>
      <p class="summary__fact">
        <span class="label-voice">Phase</span>
        <span>${finished
          ? STATUS_LABELS[initiative.status]
          : E.phaseLabel(PROCESS, initiative.phaseId)}${raw(blockers
          ? html` ${raw(badge(`${blockers} ${blockers === 1 ? 'blocker' : 'blockers'}`,
              'warn', 'warning'))}`
          : '')}</span>
      </p>
    </div>

    <div class="summary__actions">
      ${raw(finished
        ? ''
        : html`<button type="button" class="btn ${blockers ? '' : 'btn--primary'}"
            data-act="panel" data-panel="panel-gate">${blockers
              ? `Clear ${blockers === 1 ? 'the blocker' : 'the blockers'}`
              : `Pass ${E.gateForPhase(PROCESS, initiative.phaseId).label}`}</button>`)}
      <button type="button" class="btn" data-act="jump-menu" data-id="${initiative.id}"
        aria-haspopup="menu">Jump to${raw(icon('chevron-down'))}</button>
    </div>`;
}

/** Every panel on this page, as somewhere to go. */
export function jumpMenuMarkup(initiativeId) {
  const initiative = app.INITIATIVES.find((i) => i.id === initiativeId);
  const items = panelsFor(initiative)
    .map((entry) => html`<button type="button" class="btn" data-act="panel"
      data-panel="${entry.id}">${entry.label}</button>`)
    .join('');

  return html`<h3>On this page</h3>
    <div class="popover__actions">${raw(items)}</div>`;
}

/* ------------------------------------------------------------------ *
 * The gate
 * ------------------------------------------------------------------ */

/**
 * The gate, in three parts: what state it is in, what it needs, and what you
 * can do about it.
 *
 * It used to be one run of markup holding a heading, prose, two lists, a date
 * field, two buttons, an always-visible skip box, micro-copy and a checklist
 * table — with the same checklist item named twice, once as a blocker and
 * again as a row with a control on it. The three parts separate the reading
 * from the doing, and each requirement now carries the control that resolves
 * it instead of a sentence describing what you would have to go and find.
 *
 * A gate action is disabled with its reasons spelled out rather than hidden:
 * being told why is the difference between a blocked user and a stuck one.
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
  const requirements = L.gateRequirements(app, PROCESS, initiative, gate.id);
  const blockers = requirements.filter((r) => r.state === 'blocker').length;
  const closes = E.isFinalPhase(PROCESS, initiative.phaseId);

  return panel({
    id: 'panel-gate',
    title: `${phase.label} — ${gate.label}`,
    mark: blockers
      ? badge(`${blockers} ${blockers === 1 ? 'blocker' : 'blockers'}`, 'warn', 'warning')
      : badge('ready to pass', 'ok', 'check'),
    extraClass: 'banner',
    body: html`<div class="gate__part">
        <p class="muted">${closes
          ? 'This is the last gate. Passing it closes the initiative.'
          : `Passing it moves to ${E.phaseLabel(PROCESS, E.nextPhase(PROCESS, phase.id))}.`}
          ${gate.requiresEstimates
            ? 'It requires a complete estimate for every costed phase.'
            : 'It has no cost requirement.'}</p>
        <p class="micro"><button type="button" class="link" data-act="section"
          data-section="process">${gate.label} in the process definition</button></p>
      </div>

      <div class="gate__part">
        <h3>What this gate needs</h3>
        ${raw(requirementsMarkup(initiative, gate, requirements))}
      </div>

      ${raw(gateActionsMarkup(initiative, gate, closes, blockers === 0))}`,
  });
}

const CHECK_LABELS = { red: 'Not resolved', amber: 'Partly', green: 'Resolved' };

/**
 * Every requirement, each with the control that settles it.
 *
 * A checklist item is resolved where it is read — the status select and the
 * note sit on the row that names it. The two that cannot be settled in a
 * sentence-sized control (an estimate, a missing actual) offer the trip to
 * where they can, which is the honest version of "resolvable in place": the
 * control is a period and a table of people, not something that fits here.
 */
function requirementsMarkup(initiative, gate, requirements) {
  const checklist = L.checklistState(initiative, gate);
  const itemFor = (id) => checklist.find((item) => item.id === id);

  const items = requirements
    .map((requirement) => {
      const mark = requirement.state === 'met' ? 'check' : 'warning';
      const item = requirement.kind === 'checklist' ? itemFor(requirement.itemId) : null;

      const fix = item
        ? html`<select class="field field--select" data-act="checklist-status"
            data-id="${initiative.id}" data-gate="${gate.id}" data-item="${item.id}"
            aria-label="${requirement.text}">
            ${raw(L.CHECKLIST_STATUSES.map((status) => html`<option value="${status}"
              ${raw(item.status === status ? 'selected' : '')}
              >${CHECK_LABELS[status]}</option>`).join(''))}
          </select>`
        : requirement.kind === 'estimates' && requirement.phaseIds?.length
          ? requirement.phaseIds.map((phaseId) => html`<button type="button" class="btn btn--small"
              data-act="panel" data-panel="panel-phase-${phaseId}"
              >${E.phaseLabel(PROCESS, phaseId)}${raw(icon('chevron-right'))}</button>`).join('')
          : requirement.kind === 'actuals' && requirement.state === 'warning'
            ? html`<button type="button" class="btn btn--small" data-act="panel"
                data-panel="panel-months">Month by month${raw(icon('chevron-right'))}</button>`
            : '';

      return html`<li class="req req--${requirement.state}">
        <span class="req__mark">${raw(icon(mark))}</span>
        <div class="req__body">
          <p class="req__text">${requirement.text}</p>
          ${raw(item
            ? html`<p class="micro">${item.description}</p>
              <label class="field-inline"><span>Note</span>
                <input class="field" data-act="checklist-note" data-id="${initiative.id}"
                  data-gate="${gate.id}" data-item="${item.id}" value="${item.note}" /></label>`
            : '')}
        </div>
        <div class="req__fix">${raw(fix)}</div>
      </li>`;
    })
    .join('');

  return html`<ul class="reqs">${raw(items)}</ul>
    ${raw((gate.checklist ?? []).length
      ? html`<p class="micro">Checklist items start unresolved, so a gate with one is blocked
          until someone has looked at each. “Partly” lets the gate pass with a warning.</p>`
      : '')}`;
}

/**
 * One primary action, and everything else behind a menu.
 *
 * Skipping and reopening are both rarer than passing and both undo or bypass
 * governance, so neither belongs beside the button people actually press.
 * The menu is absent rather than empty when this gate offers neither.
 */
function gateActionsMarkup(initiative, gate, closes, ready) {
  const canReopen = E.phaseOrder(PROCESS).indexOf(initiative.phaseId) > 0;
  const hasMenu = gate.skippable || canReopen;

  return html`<div class="gate__part gate__part--actions">
    <label class="field-inline"><span>Gate date</span>
      <input type="date" class="field field--date" data-field="gate-date"
        value="${today()}" /></label>
    <button type="button" class="btn btn--primary" data-act="pass-gate"
      data-id="${initiative.id}" data-gate="${gate.id}" ${raw(ready ? '' : 'disabled')}>
      ${raw(icon('check'))}${closes ? `Pass ${gate.label} and close` : `Pass ${gate.label}`}</button>
    ${raw(hasMenu
      ? html`<button type="button" class="btn" data-act="gate-menu" data-id="${initiative.id}"
          aria-haspopup="menu">More${raw(icon('chevron-down'))}</button>`
      : '')}
  </div>`;
}

/** What the gate's secondary menu offers, which depends on the gate. */
export function gateMenuMarkup(initiativeId) {
  const initiative = app.INITIATIVES.find((i) => i.id === initiativeId);
  const gate = E.gateForPhase(PROCESS, initiative.phaseId);
  const canReopen = E.phaseOrder(PROCESS).indexOf(initiative.phaseId) > 0;

  return html`<h3>${gate.label}</h3>
    <div class="popover__actions">
      ${raw(gate.skippable
        ? html`<button type="button" class="btn" data-act="skip-gate-open"
            data-id="${initiative.id}" data-gate="${gate.id}"
            >${raw(icon('skip'))}Skip this gate…</button>`
        : '')}
      ${raw(canReopen
        ? html`<button type="button" class="btn" data-act="reopen" data-id="${initiative.id}"
            >Reopen previous phase</button>`
        : '')}
    </div>
    ${raw(gate.skippable
      ? html`<p class="micro">A skip approves nothing and freezes nothing, so this phase stays
          editable.</p>`
      : html`<p class="micro">${gate.label} cannot be skipped.</p>`)}`;
}

/**
 * The skip dialog.
 *
 * Modal, and deliberately so: a skip cannot proceed without a reason, and the
 * two things that could lose a half-typed one — a click anywhere else, a
 * scroll away from the field — are exactly what a popover does for free. It
 * is the app's only modal for the same reason it is the app's only required
 * field.
 */
export function skipDialogMarkup(initiativeId, gateId) {
  const initiative = app.INITIATIVES.find((i) => i.id === initiativeId);
  const gate = E.gateForPhase(PROCESS, initiative.phaseId);

  return html`<h2 id="dialog-heading">Skip ${gate.label}</h2>
    <p class="muted">A skip records that this gate was passed over and why. It approves
      nothing and freezes nothing, so ${E.phaseLabel(PROCESS, initiative.phaseId)} stays
      editable and no figure here becomes a baseline.</p>
    <div class="fields">
      <label class="field-row"><span>Reason</span>
        <input class="field" data-field="skip-reason"
          placeholder="Why is this gate not needed?" /></label>
      <label class="field-row"><span>Date</span>
        <input type="date" class="field field--date" data-field="skip-date"
          value="${today()}" /></label>
    </div>
    <p class="field-message" data-note="skip-error" hidden>${raw(icon('warning', 'icon--lead'))}A
      reason is required before a gate can be skipped.</p>
    <div class="actions">
      <button type="button" class="btn btn--primary" data-act="skip-gate"
        data-id="${initiative.id}" data-gate="${gateId}">${raw(icon('skip'))}Skip ${gate.label}</button>
      <button type="button" class="btn" data-act="dialog-cancel">Cancel</button>
    </div>`;
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

  // The foot is part of the table, so it travels with a copy of it: a
  // month-by-month table pasted into a spreadsheet without its totals is a
  // table someone then has to total by hand.
  const totals = monthTotals(initiative, costed);
  TABLES.months = {
    headers,
    rows: [
      ...data,
      ['Total', ...costed.flatMap((id) => [
        Math.round(totals.estimate[id]), Math.round(totals.actual[id]),
      ]), Math.round(totals.blended)],
    ],
    name: `${initiative.name}-months`,
  };

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
      <tfoot data-calc="month-totals" aria-live="polite" aria-atomic="true">
        ${raw(monthTotalsRowMarkup(initiative))}</tfoot>
    </table>`, 'scroller--tall'))}
    ${raw(tableActions('months', 'months'))}`,
  });
}

/**
 * What each column of the month table adds up to.
 *
 * The estimate columns sum only the months the table shows, which is every
 * month any costed phase touches (`initiativeMonths`), so the foot reconciles
 * with the column above it rather than with a separately-derived phase total.
 */
function monthTotals(initiative, costed) {
  const months = E.initiativeMonths(initiative);
  /** @type {Record<string, number>} */
  const estimate = {};
  /** @type {Record<string, number>} */
  const actual = {};
  let blended = 0;

  for (const phaseId of costed) {
    const phase = initiative.phases[phaseId];
    const byMonth = E.phaseEstimateByMonth(phase, app);
    const blendedByMonth = E.phaseBlendedByMonth(phase, app);
    estimate[phaseId] = 0;
    actual[phaseId] = 0;
    for (const month of months) {
      estimate[phaseId] += byMonth[month] ?? 0;
      actual[phaseId] += phase.actualMonths[month] ?? 0;
      blended += blendedByMonth[month] ?? 0;
    }
  }

  return { estimate, actual, blended };
}

/**
 * The foot of the month table. A column of figures with nothing at the bottom
 * of it is the one thing a ledger never does.
 */
export function monthTotalsRowMarkup(initiative) {
  const costed = E.costedPhaseIds(PROCESS).filter((id) => initiative.phases[id]);
  const totals = monthTotals(initiative, costed);
  const cells = costed
    .map((phaseId) => html`<td class="num">${F.money(totals.estimate[phaseId])}</td>
      <td class="num">${F.money(totals.actual[phaseId])}</td>`)
    .join('');

  return html`<tr class="row--total">
    <th scope="row">Total</th>
    ${raw(cells)}
    <td class="num"><strong>${F.money(totals.blended)}</strong></td>
  </tr>`;
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
