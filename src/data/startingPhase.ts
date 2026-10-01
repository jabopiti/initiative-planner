import type { PhaseDef } from '../brand/types';
import { buildDefaultPlan } from './defaultPlan';
import { checklistRecord } from './gate';
import { currentPhaseId } from './processState';
import type { GateRecord, Initiative, PhasePlan } from './types';

/** A skip recorded by choosing a starting phase (§8.2), as opposed to one taken with Skip <gate>. */
export function isStartingPhaseSkip(record: GateRecord | undefined): boolean {
  return record?.outcome === 'skipped' && record.startingPhase === true;
}

/** A phase plan holding nothing a user entered: no period, allocation, cost item or actual. */
function planIsEmpty(plan: PhasePlan): boolean {
  return !plan.startDate && !plan.endDate && plan.allocations.length === 0 && !plan.costItems?.length && Object.keys(plan.actualMonths ?? {}).length === 0;
}

/**
 * Untouched (§8.2): no plan or gate data entered by a user. The default plan counts as nothing (every plan
 * edit, actuals included, clears its flag), and so do starting-phase skips, which this mechanism itself writes;
 * any checklist entry or any other gate record touches it. Name, description, owner and team never count.
 */
export function isUntouched(initiative: Initiative): boolean {
  const planUntouched = initiative.defaultPlan === true || Object.values(initiative.phases ?? {}).every(planIsEmpty);
  const checklistUntouched = Object.values(initiative.checklist ?? {}).every((items) => Object.keys(items).length === 0);
  const gatesUntouched = Object.values(initiative.gates ?? {}).every(isStartingPhaseSkip);
  return planUntouched && checklistUntouched && gatesUntouched;
}

/** Whether the bar offers Start at a later phase (§5.4, §8.2): an Active, untouched initiative only. */
export function canChooseStartingPhase(initiative: Initiative): boolean {
  return initiative.status === 'Active' && isUntouched(initiative);
}

/** Whether a starting phase is set, so the action reads "Change starting phase" (§5.4). */
export function hasStartingPhase(initiative: Initiative): boolean {
  return Object.values(initiative.gates ?? {}).some(isStartingPhaseSkip);
}

/** The phases the select offers (§8.2): every phase but the current one, in process order. */
export function startingPhaseChoices(process: PhaseDef[], initiative: Initiative): PhaseDef[] {
  const current = currentPhaseId(initiative, process);
  return process.filter((p) => p.id !== current);
}

/** "G1", "G1 and G2", "G1, G2 and G3". */
function joinLabels(labels: string[]): string {
  return labels.length <= 1 ? (labels[0] ?? '') : `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
}

/** The gates starting at `phaseId` records as skipped, joined for the reason's label ("G1 and G2"); empty for the first phase. */
export function gatesBehindLabel(process: PhaseDef[], phaseId: string): string {
  const index = process.findIndex((p) => p.id === phaseId);
  return joinLabels(process.slice(0, Math.max(index, 0)).map((p) => p.exitGate.label));
}

export type StartAtResult = { ok: true; initiative: Initiative; phase: PhaseDef } | { ok: false; reason: string };

/**
 * Start the initiative at `phaseId` (§8.2): every gate behind it is recorded skipped with the one reason and the
 * starting-phase marker, whatever its skippable flag, replacing any earlier starting-phase skips. The default plan
 * is chained again from `today`, beginning with the first costed phase at or after the starting phase; costed
 * phases behind it get no period. The final phase's own gate is never skipped, so the initiative stays Active.
 * The first phase removes every starting-phase skip and needs no reason.
 */
export function startAtPhase(process: PhaseDef[], initiative: Initiative, phaseId: string, reason: string, today: string): StartAtResult {
  if (initiative.status !== 'Active') return { ok: false, reason: `${initiative.name} is not active.` };
  if (!isUntouched(initiative)) return { ok: false, reason: `${initiative.name} already has plan or gate data.` };
  const index = process.findIndex((p) => p.id === phaseId);
  if (index < 0) return { ok: false, reason: 'That phase is not part of the process.' };
  const phase = process[index];
  const skipReason = reason.trim();
  if (index > 0 && !skipReason) return { ok: false, reason: `Starting at ${phase.label} needs a reason.` };

  const gates: Record<string, GateRecord> = Object.fromEntries(
    process.slice(0, index).map((p) => [p.id, { outcome: 'skipped', skipReason, startingPhase: true, checklist: checklistRecord(initiative, p) } satisfies GateRecord]),
  );
  const phases = buildDefaultPlan(process.slice(index), today);
  const next: Initiative = { ...initiative, phases, defaultPlan: true, gates };
  if (Object.keys(phases).length === 0) {
    delete next.phases;
    delete next.defaultPlan;
  }
  if (index === 0) delete next.gates;
  return { ok: true, initiative: next, phase };
}
