/**
 * Lifecycle: creating initiatives, editing phases, and moving through the
 * stage progression (SPEC §6).
 *
 * Pure state transitions over the APP object. Like the engine, this module
 * has no side effects on import and never touches the DOM, so the tests drive
 * the real functions rather than a parallel implementation (DESIGN.md §7).
 */

import * as E from './engine.js';

export const SCHEMA_VERSION = 1;

/* ------------------------------------------------------------------ *
 * Construction
 * ------------------------------------------------------------------ */

/** An empty costed phase. */
export function createPhase(backfilled = false) {
  return {
    estStartDate: null,
    estEndDate: null,
    allocations: [],
    otherCosts: [],
    actualStartDate: null,
    actualEndDate: null,
    actualMonths: {},
    frozen: null,
    backfilled,
  };
}

/** A fresh APP from seed data. */
export function createApp(masterData) {
  return { schemaVersion: SCHEMA_VERSION, ...masterData, INITIATIVES: [] };
}

let idCounter = 0;
/** Ids only need to be unique within one local dataset. */
export function newId(prefix) {
  idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}${idCounter.toString(36)}`;
}

/**
 * Create an initiative, optionally at a later stage to backfill work that
 * already existed when the tool was adopted (SPEC §7.6). Any costed phase the
 * initiative has already passed is marked backfilled: it gets no approval and
 * stays editable until close (SPEC §3).
 *
 * @param {object} app
 * @param {{ name: string, description?: string, teamId: string, startStage?: string }} input
 */
export function createInitiative(app, input) {
  const startStage = input.startStage ?? E.DRAFT;
  const order = E.stageOrder(app.PROCESS);
  if (!order.includes(startStage)) throw new Error(`unknown stage: ${startStage}`);

  const startIndex = order.indexOf(startStage);
  const passed = (phaseId) => order.indexOf(phaseId) < startIndex;

  const initiative = {
    id: newId('init'),
    name: input.name,
    description: input.description ?? '',
    teamId: input.teamId,
    stage: startStage,
    state: 'active',
    notes: '',
    validation: createPhase(passed(E.VALIDATION)),
    development: createPhase(passed(E.DEVELOPMENT)),
    gateAApproval: null,
    gateBApproval: null,
    stageHistory: {},
    closedFrom: null,
  };
  app.INITIATIVES.push(initiative);
  return initiative;
}

/* ------------------------------------------------------------------ *
 * Editing
 * ------------------------------------------------------------------ */

/**
 * A phase is editable unless the initiative is closed or the phase's estimate
 * was frozen at a gate. A backfilled phase skipped its gate, so it stays
 * editable until close regardless of stage (SPEC §3).
 */
export function isPhaseEditable(initiative, phaseId) {
  if (initiative.stage === E.CLOSED) return false;
  const phase = initiative[phaseId];
  return phase.backfilled || !phase.frozen;
}

function assertEditable(initiative, phaseId) {
  if (!isPhaseEditable(initiative, phaseId)) {
    throw new Error(`${phaseId} is locked on ${initiative.id}`);
  }
}

export function setPhasePeriod(initiative, phaseId, startIso, endIso) {
  assertEditable(initiative, phaseId);
  const phase = initiative[phaseId];
  phase.estStartDate = startIso;
  phase.estEndDate = endIso;
}

/**
 * Allocate a person to a phase. Only a person holding an active membership in
 * the initiative's team may be added (SPEC §5.2); an allocation that outlives
 * its membership is a different case, handled by leaving it in place.
 *
 * Percentages above a ceiling warn elsewhere and are never blocked here.
 */
export function setAllocation(app, initiative, phaseId, personId, allocationPct) {
  assertEditable(initiative, phaseId);
  const person = app.PEOPLE[personId];
  if (!person) throw new Error(`unknown person: ${personId}`);

  const phase = initiative[phaseId];
  const existing = phase.allocations.find((a) => a.personId === personId);
  if (!existing && !E.membership(person, initiative.teamId)) {
    throw new Error(`${personId} is not an active member of team ${initiative.teamId}`);
  }

  if (allocationPct <= 0) {
    phase.allocations = phase.allocations.filter((a) => a.personId !== personId);
    return;
  }
  if (existing) existing.allocationPct = allocationPct;
  else phase.allocations.push({ personId, allocationPct });
}

export function addOtherCost(initiative, phaseId, { name, month, amount }) {
  assertEditable(initiative, phaseId);
  const item = { id: newId('cost'), name, month, amount };
  initiative[phaseId].otherCosts.push(item);
  return item;
}

/** Actuals are recorded a month at a time, and closing locks them. */
export function recordActual(initiative, phaseId, monthKey, amount) {
  if (initiative.stage === E.CLOSED) throw new Error('actuals are locked once closed');
  if (amount === null) delete initiative[phaseId].actualMonths[monthKey];
  else initiative[phaseId].actualMonths[monthKey] = amount;
}

/* ------------------------------------------------------------------ *
 * Gates and stages
 * ------------------------------------------------------------------ */

/** A phase is complete when it has both dates and someone allocated above 0%. */
function phaseIsEstimated(phase) {
  const hasPeriod = Boolean(phase.estStartDate && phase.estEndDate);
  const hasPeople = (phase.allocations ?? []).some((a) => a.allocationPct > 0);
  return hasPeriod && hasPeople;
}

/**
 * Whether a gate can be passed, and why not if it can't.
 *
 * Gate 1 needs *both* phases estimated, because it approves a budget for the
 * whole initiative; Gate 2 needs only Development (SPEC §6).
 *
 * @returns {{ ok: boolean, reason: string|null }}
 */
export function gatePrecondition(app, initiative, phaseId) {
  const label = (id) => E.stageTerm(app.PROCESS, id);

  if (initiative.stage !== phaseId) {
    return { ok: false, reason: `this initiative is not in ${label(phaseId)}` };
  }
  if (initiative[phaseId].frozen) {
    return { ok: false, reason: `${E.gateTerm(app.PROCESS, phaseId)} has already been passed` };
  }

  const required =
    phaseId === E.VALIDATION ? [E.VALIDATION, E.DEVELOPMENT] : [E.DEVELOPMENT];
  const missing = required.filter((id) => !phaseIsEstimated(initiative[id]));
  if (missing.length > 0) {
    return {
      ok: false,
      reason: `${missing.map(label).join(' and ')} needs a complete period and at least one person allocated`,
    };
  }
  return { ok: true, reason: null };
}

/** Snapshot everything an approved figure depends on, so it can never move. */
function freeze(app, initiative, phaseId) {
  const phase = initiative[phaseId];
  const perMonth = E.phaseEstimateByMonth(phase, app);
  const labour = E.phaseLabourByMonth(phase, app);
  const other = E.phaseOtherByMonth(phase);
  const total = (map) => Object.values(map).reduce((t, v) => t + v, 0);

  phase.frozen = {
    estimatedPhaseCost: total(perMonth),
    estLabourTotal: total(labour),
    estOtherTotal: total(other),
    perMonth,
    period: { start: phase.estStartDate, end: phase.estEndDate },
    // Master data may change afterwards; an approved figure may not.
    rolesCopy: structuredClone(app.ROLES),
    countriesCopy: structuredClone(app.COUNTRIES),
    peopleCopy: structuredClone(app.PEOPLE),
  };
}

/**
 * Pass a gate: freeze the phase, record an approval, advance the stage.
 *
 * The approval snapshots the resolved band rather than referencing it, so
 * escalation still resolves after a band is renamed or deleted (SPEC §5.5).
 *
 * A gate never advances an initiative into Closed — closing is always an
 * explicit action (SPEC §6). With no status stages configured, passing the
 * final gate therefore leaves the initiative in Development with its approval
 * recorded, awaiting an explicit close.
 */
export function passGate(app, initiative, phaseId, takenAt) {
  const check = gatePrecondition(app, initiative, phaseId);
  if (!check.ok) throw new Error(check.reason);

  // Gate 1 approves both estimates; Gate 2 approves Validation's forecast
  // (actuals where known) plus Development's estimate (SPEC §6).
  const validationCost =
    phaseId === E.VALIDATION
      ? E.phaseEstimateTotal(initiative.validation, app)
      : E.phaseBlendedTotal(initiative.validation, app);
  const developmentCost = E.phaseEstimateTotal(initiative.development, app);
  const total = validationCost + developmentCost;
  const band = E.resolveBand(app.BANDS, total);

  freeze(app, initiative, phaseId);

  const approval = {
    takenAt,
    grandTotal: total,
    band: band && { id: band.id, name: band.name, abbr: band.abbr, severity: band.severity },
    validationCost,
    developmentCost,
  };
  if (phaseId === E.VALIDATION) initiative.gateAApproval = approval;
  else initiative.gateBApproval = approval;

  const next = E.nextStage(app.PROCESS, initiative.stage);
  if (next && next !== E.CLOSED) initiative.stage = next;
  return approval;
}

/**
 * Move to the next stage without a gate. This covers Draft, which has no
 * gate, and every status stage, which carries nothing to approve.
 */
export function advanceStage(app, initiative, at) {
  if (E.isCostedPhase(initiative.stage)) {
    throw new Error(`${initiative.stage} advances by passing its gate, not by advancing`);
  }
  const next = E.nextStage(app.PROCESS, initiative.stage);
  if (!next || next === E.CLOSED) throw new Error('closing is an explicit action');

  initiative.stage = next;
  if (!E.isCostedPhase(next)) initiative.stageHistory[next] = at;
  return next;
}

/** Closing locks every phase and every actual. Missing actuals only warn. */
export function close(app, initiative, at) {
  if (initiative.stage === E.DRAFT) throw new Error('a draft cannot be closed');
  if (initiative.stage === E.CLOSED) throw new Error('already closed');
  initiative.closedFrom = initiative.stage;
  initiative.stage = E.CLOSED;
  initiative.stageHistory[E.CLOSED] = at;
}

/** Months in a phase that are costed but have no actual recorded. */
export function missingActuals(initiative) {
  const gaps = [];
  for (const phaseId of E.COSTED_PHASES) {
    const phase = initiative[phaseId];
    for (const month of E.phaseMonths(phase)) {
      if (phase.actualMonths[month] === undefined) gaps.push({ phaseId, month });
    }
  }
  return gaps;
}

/**
 * Reverse exactly one stage transition — always the most recent, never an
 * earlier one still buried under it. Recorded actuals are never touched.
 */
export function reopen(app, initiative) {
  const stage = initiative.stage;
  if (stage === E.DRAFT) throw new Error('a draft has nothing to reopen');

  if (stage === E.CLOSED) {
    initiative.stage = initiative.closedFrom ?? E.DEVELOPMENT;
    initiative.closedFrom = null;
    delete initiative.stageHistory[E.CLOSED];
    return initiative.stage;
  }

  // Development holds two reversible transitions: the final gate (passed but
  // not advanced, because a gate never enters Closed), then Gate 1 beneath it.
  if (stage === E.DEVELOPMENT && initiative.gateBApproval) {
    initiative.gateBApproval = null;
    initiative.development.frozen = null;
    return stage;
  }
  if (stage === E.DEVELOPMENT) {
    initiative.gateAApproval = null;
    initiative.validation.frozen = null;
    initiative.stage = E.VALIDATION;
    return initiative.stage;
  }
  if (stage === E.VALIDATION) {
    initiative.stage = E.DRAFT;
    return initiative.stage;
  }

  // A status stage: step back one and forget the date it was reached.
  const previous = E.previousStage(app.PROCESS, stage);
  delete initiative.stageHistory[stage];
  initiative.stage = previous;

  // Stepping back into Development lands on its passed gate, not before it.
  return initiative.stage;
}

/** Copy estimates and descriptions, never actuals or approvals; always Draft. */
export function duplicate(app, initiative) {
  const copyPhase = (phase) => ({
    ...createPhase(false),
    estStartDate: phase.estStartDate,
    estEndDate: phase.estEndDate,
    allocations: structuredClone(phase.allocations),
    otherCosts: phase.otherCosts.map((item) => ({ ...item, id: newId('cost') })),
  });

  const copy = {
    ...initiative,
    id: newId('init'),
    name: `${initiative.name} (copy)`,
    stage: E.DRAFT,
    state: 'active',
    validation: copyPhase(initiative.validation),
    development: copyPhase(initiative.development),
    gateAApproval: null,
    gateBApproval: null,
    stageHistory: {},
    closedFrom: null,
  };
  app.INITIATIVES.push(copy);
  return copy;
}
