import type { ApprovalTrackDef, PhaseDef } from '../brand/types';
import { formatMonth, monthOf, nextMonth } from './dates';
import { currentPhaseId, gateOverdue, gateProgress, gateProgressText, gateRequirements, lastCostedPassedGate, overrunMessage, READY_MESSAGE, type GateRequirement } from './gate';
import { grandEstimate, phaseMonths, resolveApprovalTrack, type RateData } from './cost';
import type { Initiative } from './types';
import type { Person } from './types';

export type NeedsAttentionKind = 'escalated' | 'overrun' | 'overdue' | 'due' | 'ready';

/** Priority order (§8.5): consequential first, an opportunity last. */
const KIND_ORDER: NeedsAttentionKind[] = ['escalated', 'overrun', 'overdue', 'due', 'ready'];

interface NeedsAttentionBase {
  initiativeId: string;
  initiativeName: string;
  reason: string;
}

export type NeedsAttentionItem =
  | (NeedsAttentionBase & { kind: 'escalated' })
  | (NeedsAttentionBase & { kind: 'overrun'; phaseId: string })
  | (NeedsAttentionBase & { kind: 'overdue'; phaseId: string; month: string })
  | (NeedsAttentionBase & { kind: 'due'; phaseId: string; blocker: GateRequirement })
  | (NeedsAttentionBase & { kind: 'ready' });

/**
 * Escalated (§7.4, §8.5): the live approval track is stricter than the one recorded at the last passed gate that
 * carried cost. `null` with no such baseline yet, when no band covers the live total, or when the baseline itself
 * carries no recorded track (a gap in the bands at the time it passed) — none of these give a severity to compare.
 */
function escalatedReason(initiative: Initiative, process: PhaseDef[], people: Person[], data: RateData, approvalTracks: ApprovalTrackDef[]): string | null {
  const baseline = lastCostedPassedGate(process, initiative)?.record.recordedApprovalTrack;
  if (!baseline) return null;
  const live = resolveApprovalTrack(approvalTracks, grandEstimate(initiative, process, people, data));
  if (!live || live.severity <= baseline.severity) return null;
  return `Needs ${live.name} approval (was ${baseline.name})`;
}

/** Overrun (§8.1, §8.5): the current phase is past its own estimated end date, whether or not its gate is otherwise ready. */
function overrunReason(initiative: Initiative, process: PhaseDef[], phaseId: string, today: string): string | null {
  const phase = process.find((p) => p.id === phaseId)!;
  if (!gateOverdue(initiative, phase, today)) return null;
  const endDate = initiative.phases![phaseId].endDate!;
  return overrunMessage(phase, endDate, today);
}

/**
 * Overdue (§7.3, §8.5): the earliest costed phase and month with a closed, unrecorded actual once a further
 * calendar month has passed since it ended — scanned across every costed phase, not just the current one, since a
 * phase already past its own gate can still owe an actual.
 */
function overdueTarget(initiative: Initiative, process: PhaseDef[], today: string): { phaseId: string; month: string } | null {
  for (const phase of process) {
    if (!phase.costed) continue;
    const plan = initiative.phases?.[phase.id];
    if (!plan) continue;
    for (const month of phaseMonths(plan)) {
      if (plan.actualMonths?.[month] !== undefined) continue;
      const closed = month < monthOf(today);
      if (closed && monthOf(today) > nextMonth(month)) return { phaseId: phase.id, month };
    }
  }
  return null;
}

/**
 * Due (§8.1, §8.5): the current phase's own end date has been reached and its gate still has a blocker (a
 * warning-only, e.g. Tentative, gate reads Ready instead — §8.1: only Incomplete ever blocks). The blocker itself
 * is kept, not just its text, so the strip can jump straight to it (§5.2) without re-deriving it.
 */
function dueReason(initiative: Initiative, process: PhaseDef[], phaseId: string, today: string, requirements: GateRequirement[]): { text: string; blocker: GateRequirement } | null {
  const phase = process.find((p) => p.id === phaseId)!;
  const plan = initiative.phases?.[phaseId];
  if (!phase.costed || !plan?.endDate || plan.endDate > today) return null;
  const blocker = requirements.find((r) => r.state === 'blocker');
  if (!blocker) return null;
  return { text: gateProgressText(gateProgress(requirements)), blocker };
}

/** Ready (§8.5): nothing left blocking the current gate — a warning-only gate (Tentative items) reads as Ready too, matching the magic bar (§5.4). */
function readyReason(requirements: GateRequirement[]): string | null {
  return requirements.every((r) => r.state !== 'blocker') ? READY_MESSAGE : null;
}

/** The one Needs attention item for an Active initiative (§8.5), or `null` when none of the five kinds apply. */
function needsAttentionItem(initiative: Initiative, process: PhaseDef[], people: Person[], data: RateData, approvalTracks: ApprovalTrackDef[], today: string): NeedsAttentionItem | null {
  const base = { initiativeId: initiative.id, initiativeName: initiative.name };
  const phaseId = currentPhaseId(initiative, process);

  const escalated = escalatedReason(initiative, process, people, data, approvalTracks);
  if (escalated) return { ...base, kind: 'escalated', reason: escalated };

  const overrun = overrunReason(initiative, process, phaseId, today);
  if (overrun) return { ...base, kind: 'overrun', reason: overrun, phaseId };

  const overdue = overdueTarget(initiative, process, today);
  if (overdue) {
    const phase = process.find((p) => p.id === overdue.phaseId)!;
    return { ...base, kind: 'overdue', reason: `${phase.label}: no actual recorded for ${formatMonth(overdue.month)}`, phaseId: overdue.phaseId, month: overdue.month };
  }

  const requirements = gateRequirements(process, initiative, phaseId);

  const due = dueReason(initiative, process, phaseId, today, requirements);
  if (due) return { ...base, kind: 'due', reason: due.text, phaseId, blocker: due.blocker };

  const ready = readyReason(requirements);
  if (ready) return { ...base, kind: 'ready', reason: ready };

  return null;
}

/**
 * Every Active initiative's Needs attention item (§8.5), ranked by kind priority; On Hold, Closed and Cancelled
 * initiatives never appear. Its length is also the Initiatives nav count (§5.1): each initiative contributes at
 * most one item, so counting items is counting initiatives with one.
 */
export function needsAttentionItems(initiatives: Initiative[], process: PhaseDef[], people: Person[], data: RateData, approvalTracks: ApprovalTrackDef[], today: string): NeedsAttentionItem[] {
  const items: NeedsAttentionItem[] = [];
  for (const initiative of initiatives) {
    if (initiative.status !== 'Active') continue;
    const item = needsAttentionItem(initiative, process, people, data, approvalTracks, today);
    if (item) items.push(item);
  }
  return items.sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
}
