/**
 * Lifecycle: creating initiatives, editing phases, and moving through the
 * stage progression (SPEC §6).
 *
 * Pure state transitions over the APP object. Like the engine, this module
 * has no side effects on import and never touches the DOM, so the tests drive
 * the real functions rather than a parallel implementation (DESIGN.md §7).
 */

import * as E from './engine.js';

// v2: a country's byYear record stores absolute working days per month
// (`workingDays`) instead of a reduction off the calendar's weekdays
// (`workingDayReduction`) — §4.3. No migration; see AGENTS.md.
export const SCHEMA_VERSION = 2;

/* ------------------------------------------------------------------ *
 * Construction
 * ------------------------------------------------------------------ */

/** An empty costed phase record. Only costed phases get one. */
export function createPhase() {
  return {
    estStartDate: null,
    estEndDate: null,
    allocations: [],
    otherCosts: [],
    actualStartDate: null,
    actualEndDate: null,
    actualMonths: {},
    frozen: null,
  };
}

/**
 * A fresh APP from seed data, stamped with the process it was written
 * against so an import can refuse a file that means something else.
 */
export function createApp(masterData, process) {
  return {
    schemaVersion: SCHEMA_VERSION,
    processId: process.id,
    processVersion: process.version,
    ...masterData,
    INITIATIVES: [],
  };
}

let idCounter = 0;
/** Ids only need to be unique within one local dataset. */
export function newId(prefix) {
  idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}${idCounter.toString(36)}`;
}


/**
 * Create an initiative. Starting anywhere but the first phase records every
 * gate behind it as skipped, with a reason — which is how work that predates
 * the tool is entered (SPEC §6.2). There is no separate backfill concept.
 *
 * @param {object} app
 * @param {object} process
 * @param {{ name: string, description?: string, teamId: string,
 *           startPhaseId?: string, skipReason?: string }} input
 */
export function createInitiative(app, process, input) {
  const order = E.phaseOrder(process);
  const startPhaseId = input.startPhaseId ?? order[0];
  const startIndex = order.indexOf(startPhaseId);
  if (startIndex === -1) throw new Error(`unknown phase: ${startPhaseId}`);

  const initiative = {
    id: newId('init'),
    name: input.name,
    description: input.description ?? '',
    teamId: input.teamId,
    notes: '',
    phaseId: startPhaseId,
    status: 'active',
    phases: Object.fromEntries(
      E.costedPhaseIds(process).map((phaseId) => [phaseId, createPhase()]),
    ),
    gates: {},
    checklist: {},
  };

  const reason = input.skipReason || 'Already in progress when entered into the tool';
  for (const phaseId of order.slice(0, startIndex)) {
    const gate = E.gateForPhase(process, phaseId);
    initiative.gates[gate.id] = {
      outcome: 'skipped',
      takenAt: null,
      reason,
      grandTotal: 0,
      band: null,
      phaseCosts: {},
    };
  }

  app.INITIATIVES.push(initiative);
  return initiative;
}

/**
 * Remove an initiative outright. Unlike a team or a role, nothing else
 * references one by id — no membership, no allocation holds an initiative
 * id the way it holds a person or team id — so there is no usage count to
 * check first; a confirm step in the UI is the only guard (D1).
 */
export function deleteInitiative(app, initiativeId) {
  app.INITIATIVES = app.INITIATIVES.filter((i) => i.id !== initiativeId);
}

/* ------------------------------------------------------------------ *
 * Editing
 * ------------------------------------------------------------------ */

/**
 * Closing or cancelling freezes the whole initiative (SPEC §6.4). Every
 * field below goes through this guard; `notes` is the sole exception.
 */
function assertOpen(initiative) {
  if (E.isFinished(initiative)) {
    throw new Error(`${initiative.id} is ${initiative.status}; reopen it to make changes`);
  }
}

/**
 * A costed phase is editable unless the initiative is finished or its
 * estimate was frozen by a gate being **passed**. A skipped gate freezes
 * nothing, so a phase behind one stays editable (SPEC §6.2).
 */
export function isPhaseEditable(initiative, phaseId) {
  if (E.isFinished(initiative)) return false;
  const phase = initiative.phases[phaseId];
  return Boolean(phase) && !phase.frozen;
}

function assertEditable(initiative, phaseId) {
  if (!initiative.phases[phaseId]) throw new Error(`${phaseId} carries no cost`);
  if (!isPhaseEditable(initiative, phaseId)) {
    throw new Error(`${phaseId} is locked on ${initiative.id}`);
  }
}

export function setPhasePeriod(initiative, phaseId, startIso, endIso) {
  assertEditable(initiative, phaseId);
  Object.assign(initiative.phases[phaseId], { estStartDate: startIso, estEndDate: endIso });
}

/**
 * Allocate a person to a costed phase. Only a person holding an active
 * membership in the initiative's team may be added (SPEC §5.2); an
 * allocation that outlives its membership is left in place instead.
 */
export function setAllocation(app, initiative, phaseId, personId, allocationPct) {
  assertEditable(initiative, phaseId);
  const person = app.PEOPLE[personId];
  if (!person) throw new Error(`unknown person: ${personId}`);

  const phase = initiative.phases[phaseId];
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
  initiative.phases[phaseId].otherCosts.push(item);
  return item;
}

/** Actuals are recorded a month at a time; finishing locks them. */
export function recordActual(initiative, phaseId, monthKey, amount) {
  if (E.isFinished(initiative)) throw new Error('actuals are locked once finished');
  const phase = initiative.phases[phaseId];
  if (!phase) throw new Error(`${phaseId} carries no cost`);
  if (amount === null) delete phase.actualMonths[monthKey];
  else phase.actualMonths[monthKey] = amount;
}

export function renameInitiative(initiative, name) {
  assertOpen(initiative);
  initiative.name = name;
}

export function setDescription(initiative, description) {
  assertOpen(initiative);
  initiative.description = description;
}

/**
 * Status is independent of phase. Closed is reached only by the final gate
 * (SPEC §6.4), so it cannot be set here; Cancelled can, from anywhere.
 */
export function setStatus(initiative, status) {
  if (!E.STATUSES.includes(status)) throw new Error(`unknown status: ${status}`);
  if (status === 'closed') throw new Error('closing happens by passing the final gate');
  if (initiative.status === 'closed') {
    throw new Error('reopen the closed initiative before changing its status');
  }
  initiative.status = status;
}

/**
 * Moving an initiative to another team can strand allocations whose people
 * are not members there. Those are left in place and keep costing, exactly
 * as an allocation outliving its membership does (SPEC §5.2).
 * @returns {string[]} personIds now allocated without a membership
 */
export function setTeam(app, initiative, teamId) {
  assertOpen(initiative);
  if (!app.TEAMS[teamId]) throw new Error(`unknown team: ${teamId}`);
  initiative.teamId = teamId;

  const stranded = new Set();
  for (const phase of E.costedPhases(initiative)) {
    for (const allocation of phase.allocations) {
      const person = app.PEOPLE[allocation.personId];
      if (person && !E.membership(person, teamId)) stranded.add(allocation.personId);
    }
  }
  return [...stranded];
}

/** Notes stay writable after finishing — the one exception to the freeze. */
export function setNotes(initiative, notes) {
  initiative.notes = notes;
}

/* ------------------------------------------------------------------ *
 * Checklists
 * ------------------------------------------------------------------ */

export const CHECKLIST_STATUSES = Object.freeze(['red', 'amber', 'green']);

/** Items start red, so a gate is blocked until someone has looked at each. */
export function checklistState(initiative, gate) {
  const stored = initiative.checklist[gate.id] ?? {};
  return (gate.checklist ?? []).map((item) => ({
    ...item,
    status: stored[item.id]?.status ?? 'red',
    note: stored[item.id]?.note ?? '',
  }));
}

export function setChecklistStatus(initiative, gateId, itemId, status) {
  if (!CHECKLIST_STATUSES.includes(status)) throw new Error(`unknown status: ${status}`);
  assertOpen(initiative);
  const forGate = (initiative.checklist[gateId] ??= {});
  (forGate[itemId] ??= { status: 'red', note: '' }).status = status;
}

export function setChecklistNote(initiative, gateId, itemId, note) {
  assertOpen(initiative);
  const forGate = (initiative.checklist[gateId] ??= {});
  (forGate[itemId] ??= { status: 'red', note: '' }).note = note;
}

/* ------------------------------------------------------------------ *
 * Gates
 * ------------------------------------------------------------------ */

/** A costed phase is estimated when it has both dates and someone allocated. */
function phaseIsEstimated(phase) {
  return Boolean(
    phase &&
      phase.estStartDate &&
      phase.estEndDate &&
      (phase.allocations ?? []).some((a) => a.allocationPct > 0),
  );
}

/**
 * Everything this gate needs, each with its own state — including the ones
 * already satisfied.
 *
 * A gate requiring estimates needs *every* costed phase estimated, not just
 * the one behind it: passing a gate approves the whole initiative's budget,
 * which is why the requirement looks forward as well as back (SPEC §6.1).
 *
 * Met requirements are reported alongside unmet ones because the interface
 * asks a different question than `passGate` does. `passGate` needs to know
 * whether it may proceed; a reader needs to know what this gate is *for*, and
 * a list that shows only what is wrong cannot answer that. The `kind` says
 * what sort of thing each one is, so the panel can offer the control that
 * resolves it rather than a sentence about it.
 *
 * @returns {Array<{ id: string, kind: 'state'|'estimates'|'checklist'|'actuals',
 *   state: 'blocker'|'warning'|'met', text: string, itemId?: string,
 *   phaseIds?: string[] }>}
 */
export function gateRequirements(app, process, initiative, gateId) {
  const phase = E.phaseForGate(process, gateId);
  const gate = phase.gate;
  /** @type {Array<any>} */
  const out = [];

  if (initiative.phaseId !== phase.id) {
    out.push({ id: 'phase', kind: 'state', state: 'blocker',
      text: `this initiative is not in ${phase.label}` });
  }
  if (initiative.gates[gate.id]) {
    out.push({ id: 'left', kind: 'state', state: 'blocker',
      text: `${gate.label} has already been left` });
  }
  if (E.isFinished(initiative)) {
    out.push({ id: 'finished', kind: 'state', state: 'blocker',
      text: `this initiative is ${initiative.status}` });
  }

  if (gate.requiresEstimates) {
    const missing = E.costedPhaseIds(process).filter(
      (phaseId) => !phaseIsEstimated(initiative.phases[phaseId]),
    );
    const names = missing.map((id) => E.phaseLabel(process, id)).join(' and ');
    out.push({
      id: 'estimates',
      kind: 'estimates',
      state: missing.length > 0 ? 'blocker' : 'met',
      text: missing.length > 0
        ? `${names} needs a complete period and at least one person allocated`
        : 'every costed phase has a period and someone allocated',
      phaseIds: missing,
    });
  }

  for (const item of checklistState(initiative, gate)) {
    out.push({
      id: `checklist:${item.id}`,
      kind: 'checklist',
      itemId: item.id,
      state: item.status === 'red' ? 'blocker' : item.status === 'amber' ? 'warning' : 'met',
      text: item.status === 'red'
        ? `“${item.name}” is not resolved`
        : item.status === 'amber'
          ? `“${item.name}” is only partly resolved`
          : `“${item.name}” is resolved`,
    });
  }

  // Missing actuals never block; they only warn (SPEC §6.1).
  const costedMonths = Object.values(initiative.phases ?? {})
    .reduce((count, phase_) => count + E.phaseMonths(phase_).length, 0);
  if (costedMonths > 0) {
    const gaps = missingActuals(initiative);
    out.push({
      id: 'actuals',
      kind: 'actuals',
      state: gaps.length > 0 ? 'warning' : 'met',
      text: gaps.length > 0
        ? `${gaps.length} costed month${gaps.length === 1 ? '' : 's'} without an actual`
        : 'every costed month has an actual recorded',
    });
  }

  return out;
}

/**
 * Whether the current phase's gate can be passed, and what is stopping it.
 *
 * Derived from `gateRequirements` rather than computed a second time: two
 * implementations of "what does this gate need" is exactly how a panel ends
 * up disagreeing with the button on it.
 *
 * @returns {{ ok: boolean, blockers: string[], warnings: string[] }}
 */
export function gatePrecondition(app, process, initiative, gateId) {
  const requirements = gateRequirements(app, process, initiative, gateId);
  const of = (state) => requirements.filter((r) => r.state === state).map((r) => r.text);
  const blockers = of('blocker');
  return { ok: blockers.length === 0, blockers, warnings: of('warning') };
}

/** Snapshot everything an approved figure depends on, so it can never move. */
function freeze(app, initiative, phaseId) {
  const phase = initiative.phases[phaseId];
  if (!phase) return;
  const perMonth = E.phaseEstimateByMonth(phase, app);
  const total = (map) => Object.values(map).reduce((t, v) => t + v, 0);

  phase.frozen = {
    estimatedPhaseCost: total(perMonth),
    estLabourTotal: total(E.phaseLabourByMonth(phase, app)),
    estOtherTotal: total(E.phaseOtherByMonth(phase)),
    perMonth,
    period: { start: phase.estStartDate, end: phase.estEndDate },
    // Master data may change afterwards; an approved figure may not.
    rolesCopy: structuredClone(app.ROLES),
    countriesCopy: structuredClone(app.COUNTRIES),
    peopleCopy: structuredClone(app.PEOPLE),
  };
}

/** Move on: to the next phase, or to Closed if this was the final gate. */
function advance(process, initiative, phaseId) {
  if (E.isFinalPhase(process, phaseId)) {
    initiative.status = 'closed';
    return;
  }
  initiative.phaseId = E.nextPhase(process, phaseId);
}

/**
 * Pass a gate: freeze the phase behind it if costed, record the gate, and
 * move on. The final gate is what closes the initiative — finishing is a
 * governed act, never a bare status change (SPEC §6.4).
 */
export function passGate(app, process, initiative, gateId, takenAt) {
  const check = gatePrecondition(app, process, initiative, gateId);
  if (!check.ok) throw new Error(check.blockers.join('; '));

  const phase = E.phaseForGate(process, gateId);
  const total = E.grandTotal(initiative, app);
  const band = E.resolveBand(process.bands, total);

  freeze(app, initiative, phase.id);

  initiative.gates[gateId] = {
    outcome: 'passed',
    takenAt,
    reason: null,
    grandTotal: total,
    band: band && { id: band.id, name: band.name, abbr: band.abbr, severity: band.severity },
    phaseCosts: E.phaseCosts(initiative, app),
  };

  advance(process, initiative, phase.id);
  return initiative.gates[gateId];
}

/**
 * Skip a gate the build allows to be skipped. A skip approves nothing and
 * freezes nothing, so the phase it exits stays editable — and it never
 * becomes the baseline for an escalation comparison (SPEC §5.5).
 */
export function skipGate(app, process, initiative, gateId, reason, takenAt) {
  const phase = E.phaseForGate(process, gateId);
  if (!phase.gate.skippable) throw new Error(`${phase.gate.label} cannot be skipped`);
  if (initiative.phaseId !== phase.id) throw new Error(`this initiative is not in ${phase.label}`);
  if (initiative.gates[gateId]) throw new Error(`${phase.gate.label} has already been left`);
  if (E.isFinished(initiative)) throw new Error(`this initiative is ${initiative.status}`);
  if (!reason || !String(reason).trim()) throw new Error('skipping a gate requires a reason');

  const total = E.grandTotal(initiative, app);
  const band = E.resolveBand(process.bands, total);

  initiative.gates[gateId] = {
    outcome: 'skipped',
    takenAt,
    reason: String(reason).trim(),
    grandTotal: total,
    band: band && { id: band.id, name: band.name, abbr: band.abbr, severity: band.severity },
    phaseCosts: E.phaseCosts(initiative, app),
  };

  advance(process, initiative, phase.id);
  return initiative.gates[gateId];
}

/** The gate record that sets the escalation baseline: the last one passed. */
export function lastPassedGate(process, initiative) {
  for (const phaseId of [...E.phaseOrder(process)].reverse()) {
    const record = initiative.gates[E.gateForPhase(process, phaseId).id];
    if (record?.outcome === 'passed') return record;
  }
  return null;
}

/** Months in a costed phase that have no actual recorded. */
export function missingActuals(initiative) {
  const gaps = [];
  for (const [phaseId, phase] of Object.entries(initiative.phases ?? {})) {
    for (const month of E.phaseMonths(phase)) {
      if (phase.actualMonths[month] === undefined) gaps.push({ phaseId, month });
    }
  }
  return gaps;
}

/**
 * Reverse exactly one transition — always the most recent, never an earlier
 * one still buried under it. Checklist statuses and notes are kept: what
 * someone assessed is a record, not a side effect of the gate. Recorded
 * actuals are never touched.
 */
export function reopen(process, initiative) {
  // A closed initiative sits in its final phase with that gate recorded, so
  // reopening it is reversing that gate like any other.
  const phaseId =
    initiative.status === 'closed'
      ? initiative.phaseId
      : E.previousPhase(process, initiative.phaseId);

  if (phaseId === null) throw new Error('this initiative is at its first phase');

  const gate = E.gateForPhase(process, phaseId);
  if (!initiative.gates[gate.id]) throw new Error('there is no gate record to reverse');

  delete initiative.gates[gate.id];
  const phase = initiative.phases[phaseId];
  if (phase) phase.frozen = null;

  if (initiative.status === 'closed') initiative.status = 'active';
  initiative.phaseId = phaseId;
  return phaseId;
}

/** Copy estimates and descriptions, never actuals, gate records or checklists. */
export function duplicate(app, process, initiative) {
  const copyPhase = (phase) => ({
    ...createPhase(),
    estStartDate: phase.estStartDate,
    estEndDate: phase.estEndDate,
    allocations: structuredClone(phase.allocations),
    otherCosts: phase.otherCosts.map((item) => ({ ...item, id: newId('cost') })),
  });

  const copy = {
    ...initiative,
    id: newId('init'),
    name: `${initiative.name} (copy)`,
    phaseId: E.phaseOrder(process)[0],
    status: 'active',
    phases: Object.fromEntries(
      Object.entries(initiative.phases).map(([id, phase]) => [id, copyPhase(phase)]),
    ),
    gates: {},
    checklist: {},
  };
  app.INITIATIVES.push(copy);
  return copy;
}
