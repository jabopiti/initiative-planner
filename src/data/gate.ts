import type { ApprovalTrackDef, GateDef, PhaseDef } from '../brand/types';
import { allocationFigures, grandEstimate, hasValidPeriod, phaseByMonth, resolveApprovalTrack, type RateData } from './cost';
import { daysBetween } from './dates';
import { currentPhaseId } from './processState';
import { roleLabel } from './roleLabel';
import type { Allocation, ChecklistItemRecord, ChecklistItemState, ChecklistStatus, FrozenAllocation, FrozenPhaseSnapshot, GateRecord, Initiative, Person } from './types';

export { currentPhaseId };

/** One checklist item's live state; items start Incomplete with no note (§4, §8.1). */
export function checklistItemState(initiative: Initiative, phaseId: string, itemId: string): ChecklistItemState {
  return initiative.checklist?.[phaseId]?.[itemId] ?? { status: 'incomplete', note: '' };
}

export interface ChecklistItemView {
  id: string;
  name: string;
  description: string;
  status: ChecklistStatus;
  note: string;
}

/** A gate's own checklist items, each merged with its live status and note (§5.4). */
export function checklistItems(initiative: Initiative, phaseId: string, gate: GateDef): ChecklistItemView[] {
  return gate.checklistItems.map((item) => ({ ...item, ...checklistItemState(initiative, phaseId, item.id) }));
}

export interface CarriedForwardItem extends ChecklistItemView {
  originPhaseId: string;
  originGateId: string;
  originGateLabel: string;
}

/**
 * Items still Tentative on a gate already passed, reappearing on the gate now current until someone marks them
 * Complete (§8.1). Read from their *origin* gate's live state, since that is what `setChecklistItem` resolves
 * against — never a blocker here, only at the gate that actually defines the item.
 */
export function carriedForwardItems(process: PhaseDef[], initiative: Initiative, phaseId: string): CarriedForwardItem[] {
  const index = process.findIndex((p) => p.id === phaseId);
  const before = process.slice(0, index < 0 ? process.length : index);
  const out: CarriedForwardItem[] = [];
  for (const phase of before) {
    if (initiative.gates?.[phase.id]?.outcome !== 'passed') continue;
    for (const item of checklistItems(initiative, phase.id, phase.exitGate)) {
      if (item.status === 'tentative') {
        out.push({ ...item, originPhaseId: phase.id, originGateId: phase.exitGate.id, originGateLabel: phase.exitGate.label });
      }
    }
  }
  return out;
}

/** A costed phase counts as estimated once it has a valid period and at least one allocation or cost item (§8.1). */
function phaseIsEstimated(initiative: Initiative, phase: PhaseDef): boolean {
  const plan = initiative.phases?.[phase.id];
  return Boolean(plan && hasValidPeriod(plan) && (plan.allocations.length > 0 || (plan.costItems?.length ?? 0) > 0));
}

/** Costed phases from `fromPhaseId` onward (inclusive) that are not estimated yet (§8.1): the phase behind the gate and every costed phase still ahead. */
export function unestimatedPhases(process: PhaseDef[], initiative: Initiative, fromPhaseId: string): PhaseDef[] {
  const fromIndex = process.findIndex((p) => p.id === fromPhaseId);
  return process.slice(fromIndex < 0 ? 0 : fromIndex).filter((phase) => phase.costed && !phaseIsEstimated(initiative, phase));
}

export type RequirementState = 'blocker' | 'warning' | 'met';

export interface EstimatesRequirement {
  kind: 'estimates';
  state: RequirementState;
  text: string;
  /** The requirement as the gate panel states it, open or met (§5.4): "Validation and Development have a period and …". */
  label: string;
  missingPhaseIds: string[];
}

/** "Validation", "Validation and Development", "Alpha, Beta and Gamma". */
function nameList(names: string[]): string {
  return names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

export interface ChecklistRequirement {
  kind: 'checklist';
  itemId: string;
  name: string;
  description: string;
  status: ChecklistStatus;
  note: string;
  state: RequirementState;
  text: string;
  carried?: { originPhaseId: string; originGateId: string; originGateLabel: string };
}

export type GateRequirement = EstimatesRequirement | ChecklistRequirement;

/** Everything a gate needs, met or not (§8.1): the estimate check where it applies, its own checklist items, and any carried-forward Tentative items. */
export function gateRequirements(process: PhaseDef[], initiative: Initiative, phaseId: string): GateRequirement[] {
  const phase = process.find((p) => p.id === phaseId);
  if (!phase) return [];
  const out: GateRequirement[] = [];

  if (phase.exitGate.requiresEstimates) {
    const missing = unestimatedPhases(process, initiative, phaseId);
    // The phases the requirement checks (§8.1): this one, if costed, and every costed phase still ahead.
    const checked = process.slice(process.indexOf(phase)).filter((p) => p.costed);
    const allOk = 'a period and at least one allocation or cost item';
    out.push({
      kind: 'estimates',
      state: missing.length > 0 ? 'blocker' : 'met',
      text:
        missing.length > 0
          ? `${nameList(missing.map((p) => p.label))} ${missing.length === 1 ? 'needs' : 'need'} a complete period and at least one allocation or cost item`
          : `Every costed phase has ${allOk}`,
      label: `${nameList(checked.map((p) => p.label))} ${checked.length === 1 ? 'has' : 'have'} ${allOk}`,
      missingPhaseIds: missing.map((p) => p.id),
    });
  }

  for (const item of checklistItems(initiative, phaseId, phase.exitGate)) {
    out.push({
      kind: 'checklist',
      itemId: item.id,
      name: item.name,
      description: item.description,
      status: item.status,
      note: item.note,
      state: item.status === 'incomplete' ? 'blocker' : item.status === 'tentative' ? 'warning' : 'met',
      text:
        item.status === 'incomplete'
          ? `"${item.name}" is not resolved`
          : item.status === 'tentative'
            ? `"${item.name}" is only partly resolved`
            : `"${item.name}" is resolved`,
    });
  }

  for (const item of carriedForwardItems(process, initiative, phaseId)) {
    out.push({
      kind: 'checklist',
      itemId: item.id,
      name: item.name,
      description: item.description,
      status: item.status,
      note: item.note,
      state: 'warning',
      text: `"${item.name}" is still Tentative, carried from ${item.originGateLabel}`,
      carried: { originPhaseId: item.originPhaseId, originGateId: item.originGateId, originGateLabel: item.originGateLabel },
    });
  }

  return out;
}

/** How many requirements block the gate (§5.4 "Pass gate · 3 open"): Incomplete items and missing estimates, never a Tentative item. */
export function gateOpenCount(requirements: GateRequirement[]): number {
  return requirements.filter((r) => r.state === 'blocker').length;
}

/** Requirement texts that block the gate, in the order they were found. */
export function gateBlockers(requirements: GateRequirement[]): string[] {
  return requirements.filter((r) => r.state === 'blocker').map((r) => r.text);
}

/** "X of Y complete" (§8.1): every requirement shown on the panel, including carried-forward items. */
export function gateProgress(requirements: GateRequirement[]): { complete: number; total: number } {
  return { complete: requirements.filter((r) => r.state === 'met').length, total: requirements.length };
}

/** "X of Y complete" (§8.1), the one phrase this reads as everywhere it appears (the gate panel, the Needs attention strip). */
export function gateProgressText(progress: { complete: number; total: number }): string {
  return `${progress.complete} of ${progress.total} complete`;
}

/** Nothing left blocking the gate (§8.1, §8.5) — a warning-only gate (Tentative items) reads as this too, since only Incomplete ever blocks. */
export const READY_MESSAGE = 'All requirements met';

/** Whether the phase behind a costed gate has run past the date it was itself estimated to end on (§8.1) — the one thing worth real alarm colour. */
export function gateOverdue(initiative: Initiative, phase: PhaseDef, today: string): boolean {
  const plan = initiative.phases?.[phase.id];
  return Boolean(phase.costed && plan?.endDate && plan.endDate < today);
}

/** "<phase> is N days overrun", "1 day" for one (§8.1, §8.5), the one phrase this reads as everywhere a phase's own overdue state is shown (the magic bar, the Needs attention strip). */
export function overrunMessage(phase: PhaseDef, endDate: string, today: string): string {
  const days = daysBetween(endDate, today);
  return `${phase.label} is ${days} ${days === 1 ? 'day' : 'days'} overrun`;
}

/** Each of a phase plan's allocations with its cost at today's rates; undefined for a person who no longer exists. */
export function allocationsWithCost(plan: NonNullable<Initiative['phases']>[string], people: Person[], data: RateData): (Omit<FrozenAllocation, 'cost'> & { cost?: number })[] {
  return plan.allocations.map(({ id, personId, allocationPct }) => {
    const person = people.find((p) => p.id === personId);
    return { id, personId, allocationPct, cost: person ? allocationFigures(plan, person, allocationPct, data).cost : undefined };
  });
}

/** One allocation as a gate freezes it: its cost and the person, role, country, rates and working days behind it (§6, §8.1). */
function freezeAllocation({ id, personId, allocationPct }: Allocation, plan: NonNullable<Initiative['phases']>[string], people: Person[], data: RateData): FrozenAllocation {
  const person = people.find((p) => p.id === personId);
  if (!person) return { id, personId, allocationPct, cost: 0 };
  const { cost, basis, costFactor } = allocationFigures(plan, person, allocationPct, data);
  const country = data.countries.find((c) => c.id === person.countryId);
  return {
    id,
    personId,
    allocationPct,
    cost,
    personName: person.name,
    roleName: roleLabel(person, data.roles),
    ...(country && { countryName: country.name }),
    ...(costFactor !== undefined && { costFactor }),
    months: basis,
  };
}

/** Snapshot everything an approved figure depends on, so it can never move (§8.1). */
function freezePhase(plan: NonNullable<Initiative['phases']>[string], people: Person[], data: RateData): FrozenPhaseSnapshot {
  const estimateByMonth = phaseByMonth(plan, people, data);
  const allocations = plan.allocations.map((allocation) => freezeAllocation(allocation, plan, people, data));
  return { startDate: plan.startDate!, endDate: plan.endDate!, allocations, costItems: plan.costItems ?? [], estimateByMonth };
}

/** The gate's checklist as it stands, as a gate record holds it (§8.1, §8.2). */
export function checklistRecord(initiative: Initiative, phase: PhaseDef): ChecklistItemRecord[] {
  return checklistItems(initiative, phase.id, phase.exitGate).map(({ id, name, description, status, note }) => ({ id, name, description, status, note }));
}

/**
 * The gate record for passing `phase`'s exit gate now. The grand estimate is read from the initiative as it
 * stands the instant before this record is written, so an already-frozen earlier phase uses its own snapshot
 * and this phase (still live) uses the same rates its own freeze is about to snapshot — one figure, computed once.
 */
function buildGateRecord(process: PhaseDef[], initiative: Initiative, phase: PhaseDef, people: Person[], data: RateData, approvalTracks: ApprovalTrackDef[], takenAt: string): GateRecord {
  const checklist = checklistRecord(initiative, phase);

  if (!phase.costed) return { outcome: 'passed', passedOn: takenAt, checklist };

  const plan = initiative.phases![phase.id];
  const total = grandEstimate(initiative, process, people, data);
  const track = resolveApprovalTrack(approvalTracks, total);
  return {
    outcome: 'passed',
    passedOn: takenAt,
    recordedGrandEstimate: total,
    recordedApprovalTrack: track && { id: track.id, name: track.name, severity: track.severity },
    frozenSnapshot: freezePhase(plan, people, data),
    checklist,
  };
}

export type GateRecorded = { ok: true; initiative: Initiative; phase: PhaseDef; record: GateRecord };

/** The initiative with `record` written on `phase`'s gate; the final gate closes it, passed or skipped (§8.4). */
function recordGate(process: PhaseDef[], initiative: Initiative, phase: PhaseDef, record: GateRecord): GateRecorded {
  const isFinal = process[process.length - 1].id === phase.id;
  const next: Initiative = { ...initiative, gates: { ...initiative.gates, [phase.id]: record }, ...(isFinal && { status: 'Closed' as const }) };
  return { ok: true, initiative: next, phase, record };
}

export type PassGateResult = GateRecorded | { ok: false; blockers: string[] };

/** What selecting Pass gate (or Skip <gate>) says on an On Hold initiative (§5.4, §8.4); `passGate` and `skipGate` refuse with it too. */
export function onHoldMessage(initiative: Initiative, process: PhaseDef[], verb: 'pass' | 'skip' = 'pass'): string {
  const phase = process.find((p) => p.id === currentPhaseId(initiative, process))!;
  return `${initiative.name} is on hold. Resume it to ${verb} ${phase.exitGate.label}.`;
}

/** Pass the initiative's current gate (§8.1): freezes the exited phase if costed, records the gate, and moves on — the final gate closes the initiative. */
export function passGate(process: PhaseDef[], initiative: Initiative, people: Person[], data: RateData, approvalTracks: ApprovalTrackDef[], takenAt: string): PassGateResult {
  if (initiative.status === 'On Hold') return { ok: false, blockers: [onHoldMessage(initiative, process)] };
  const phaseId = currentPhaseId(initiative, process);
  const phase = process.find((p) => p.id === phaseId)!;
  const blockers = gateBlockers(gateRequirements(process, initiative, phaseId));
  if (blockers.length > 0) return { ok: false, blockers };

  return recordGate(process, initiative, phase, buildGateRecord(process, initiative, phase, people, data, approvalTracks, takenAt));
}

export type SkipGateResult = GateRecorded | { ok: false; reason: string };

/**
 * Skip the initiative's current gate (§8.2): only where the brand pack marks it skippable, and only with a reason.
 * Both checks are bypassed; the record holds the trimmed reason and the checklist as it stood, and no date, figure,
 * approval track or frozen snapshot — so the phase stays editable and the escalation baseline is untouched (§7.4).
 * Skipping the final gate closes the initiative, exactly as passing it does (§8.4).
 */
export function skipGate(process: PhaseDef[], initiative: Initiative, reason: string): SkipGateResult {
  if (initiative.status === 'On Hold') return { ok: false, reason: onHoldMessage(initiative, process, 'skip') };
  const phaseId = currentPhaseId(initiative, process);
  const phase = process.find((p) => p.id === phaseId)!;
  if (!phase.exitGate.skippable) return { ok: false, reason: `${phase.exitGate.label} cannot be skipped.` };
  const skipReason = reason.trim();
  if (!skipReason) return { ok: false, reason: `Skipping ${phase.exitGate.label} needs a reason.` };

  return recordGate(process, initiative, phase, { outcome: 'skipped', skipReason, checklist: checklistRecord(initiative, phase) });
}

export interface ReopenGateResult {
  initiative: Initiative;
  phase: PhaseDef;
  /** The record reopening removes. */
  record: GateRecord;
}

/** The phase behind the gate before the current one, or null when the current phase is first (§8.3). */
function previousPhaseId(process: PhaseDef[], initiative: Initiative): string | null {
  const index = process.findIndex((p) => p.id === currentPhaseId(initiative, process));
  return index > 0 ? process[index - 1].id : null;
}

/** Reverse exactly the most recent transition (§8.3): clears that gate's record and discards its frozen snapshot; checklist statuses and notes are kept. Null when there is none to reverse, and on a Cancelled initiative, whose way back is Reopen (§8.4). */
export function reopenGate(process: PhaseDef[], initiative: Initiative): ReopenGateResult | null {
  if (initiative.status === 'Cancelled') return null;
  const phaseId = initiative.status === 'Closed' ? process[process.length - 1].id : previousPhaseId(process, initiative);
  if (phaseId === null) return null;
  const record = initiative.gates?.[phaseId];
  if (!record) return null;

  const phase = process.find((p) => p.id === phaseId)!;
  const gates = { ...initiative.gates };
  delete gates[phaseId];
  const next: Initiative = { ...initiative, gates, ...(initiative.status === 'Closed' && { status: 'Active' as const }) };
  return { initiative: next, phase, record };
}

/** The gate record that sets the escalation baseline (§7.4): the last *passed* gate whose exited phase was costed — a skipped gate, or one behind a non-costed phase, was never approved at a figure. */
export function lastCostedPassedGate(process: PhaseDef[], initiative: Initiative): { phase: PhaseDef; record: GateRecord } | null {
  for (const phase of [...process].reverse()) {
    if (!phase.costed) continue;
    const record = initiative.gates?.[phase.id];
    if (record?.outcome === 'passed') return { phase, record };
  }
  return null;
}

/** Set a checklist item's status and note together (§5.4): Incomplete and Complete commit at once; Tentative is saved together with its (required) note. */
export function withChecklistItem(initiative: Initiative, phaseId: string, itemId: string, status: ChecklistStatus, note: string): Initiative {
  const forPhase = { ...(initiative.checklist?.[phaseId] ?? {}), [itemId]: { status, note } };
  return { ...initiative, checklist: { ...initiative.checklist, [phaseId]: forPhase } };
}
