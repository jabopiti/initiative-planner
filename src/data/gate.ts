import type { ApprovalTrackDef, GateDef, PhaseDef } from '../brand/types';
import { allocationFigures, grandEstimate, phaseByMonth, resolveApprovalTrack, type RateData } from './cost';
import { currentPhaseId } from './processState';
import type { ChecklistItemRecord, ChecklistItemState, ChecklistStatus, FrozenAllocation, FrozenPhaseSnapshot, GateRecord, Initiative, Person } from './types';

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
  const hasPeriod = Boolean(plan?.startDate && plan.endDate && plan.startDate <= plan.endDate);
  return hasPeriod && (plan!.allocations.length > 0 || (plan!.costItems?.length ?? 0) > 0);
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
  missingPhaseIds: string[];
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
    out.push({
      kind: 'estimates',
      state: missing.length > 0 ? 'blocker' : 'met',
      text:
        missing.length > 0
          ? `${missing.map((p) => p.label).join(' and ')} needs a complete period and at least one allocation or cost item`
          : 'Every costed phase has a period and at least one allocation or cost item',
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

/** Requirement texts that block the gate, in the order they were found. */
export function gateBlockers(requirements: GateRequirement[]): string[] {
  return requirements.filter((r) => r.state === 'blocker').map((r) => r.text);
}

/** "X of Y complete" (§8.1): every requirement shown on the panel, including carried-forward items. */
export function gateProgress(requirements: GateRequirement[]): { complete: number; total: number } {
  return { complete: requirements.filter((r) => r.state === 'met').length, total: requirements.length };
}

/** Whether the phase behind a costed gate has run past the date it was itself estimated to end on (§8.1) — the one thing worth real alarm colour. */
export function gateOverdue(initiative: Initiative, phase: PhaseDef, today: string): boolean {
  const plan = initiative.phases?.[phase.id];
  return Boolean(phase.costed && plan?.endDate && plan.endDate < today);
}

/** Snapshot everything an approved figure depends on, so it can never move (§8.1). */
function freezePhase(plan: NonNullable<Initiative['phases']>[string], people: Person[], data: RateData): FrozenPhaseSnapshot {
  const estimateByMonth = phaseByMonth(plan, people, data);
  const allocations: FrozenAllocation[] = plan.allocations.map((allocation) => {
    const person = people.find((p) => p.id === allocation.personId);
    const cost = person ? allocationFigures(plan, person, allocation.allocationPct, data).cost : 0;
    return { id: allocation.id, personId: allocation.personId, allocationPct: allocation.allocationPct, cost };
  });
  return { startDate: plan.startDate!, endDate: plan.endDate!, allocations, costItems: plan.costItems ?? [], estimateByMonth };
}

/**
 * The gate record for passing `phase`'s exit gate now. The grand estimate is read from the initiative as it
 * stands the instant before this record is written, so an already-frozen earlier phase uses its own snapshot
 * and this phase (still live) uses the same rates its own freeze is about to snapshot — one figure, computed once.
 */
function buildGateRecord(process: PhaseDef[], initiative: Initiative, phase: PhaseDef, people: Person[], data: RateData, approvalTracks: ApprovalTrackDef[], takenAt: string): GateRecord {
  const checklist: ChecklistItemRecord[] = checklistItems(initiative, phase.id, phase.exitGate).map(({ id, name, description, status, note }) => ({ id, name, description, status, note }));

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

export type PassGateResult = { ok: true; initiative: Initiative; phase: PhaseDef; record: GateRecord } | { ok: false; blockers: string[] };

/** Pass the initiative's current gate (§8.1): freezes the exited phase if costed, records the gate, and moves on — the final gate closes the initiative. */
export function passGate(process: PhaseDef[], initiative: Initiative, people: Person[], data: RateData, approvalTracks: ApprovalTrackDef[], takenAt: string): PassGateResult {
  const phaseId = currentPhaseId(initiative, process);
  const phase = process.find((p) => p.id === phaseId)!;
  const blockers = gateBlockers(gateRequirements(process, initiative, phaseId));
  if (blockers.length > 0) return { ok: false, blockers };

  const record = buildGateRecord(process, initiative, phase, people, data, approvalTracks, takenAt);
  const isFinal = process[process.length - 1].id === phaseId;
  const next: Initiative = { ...initiative, gates: { ...initiative.gates, [phaseId]: record }, ...(isFinal && { status: 'Closed' as const }) };
  return { ok: true, initiative: next, phase, record };
}

export interface ReopenGateResult {
  initiative: Initiative;
  phase: PhaseDef;
}

/** Reverse exactly the most recent transition (§8.3): clears that gate's record and discards its frozen snapshot; checklist statuses and notes are kept. Null when there is none to reverse. */
export function reopenGate(process: PhaseDef[], initiative: Initiative): ReopenGateResult | null {
  const phaseId =
    initiative.status === 'Closed'
      ? process[process.length - 1].id
      : (() => {
          const index = process.findIndex((p) => p.id === currentPhaseId(initiative, process));
          return index > 0 ? process[index - 1].id : null;
        })();
  if (phaseId === null || !initiative.gates?.[phaseId]) return null;

  const phase = process.find((p) => p.id === phaseId)!;
  const gates = { ...initiative.gates };
  delete gates[phaseId];
  const next: Initiative = { ...initiative, gates, ...(initiative.status === 'Closed' && { status: 'Active' as const }) };
  return { initiative: next, phase };
}

/** The gate record that sets the escalation baseline (§7.4): the last *passed* gate whose exited phase was costed — a skipped gate, or one behind a non-costed phase, was never approved at a figure. */
export function lastCostedPassedGate(process: PhaseDef[], initiative: Initiative): GateRecord | null {
  for (const phase of [...process].reverse()) {
    if (!phase.costed) continue;
    const record = initiative.gates?.[phase.id];
    if (record?.outcome === 'passed') return record;
  }
  return null;
}

/** Set a checklist item's status and note together (§5.4): Incomplete and Complete commit at once; Tentative is saved together with its (required) note. */
export function withChecklistItem(initiative: Initiative, phaseId: string, itemId: string, status: ChecklistStatus, note: string): Initiative {
  const forPhase = { ...(initiative.checklist?.[phaseId] ?? {}), [itemId]: { status, note } };
  return { ...initiative, checklist: { ...initiative.checklist, [phaseId]: forPhase } };
}
