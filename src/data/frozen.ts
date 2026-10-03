import type { GateRecord, Initiative } from './types';

/** Whether a phase is frozen by its passed exit gate (§8.1). */
export type PhaseFrozen = (initiative: Initiative, phaseId: string) => boolean;

/** A phase is frozen once its own exit gate has been passed (never for a skipped gate, §8.2), and not since reopened (§8.3). */
export const isPhaseFrozen: PhaseFrozen = (initiative, phaseId) => initiative.gates?.[phaseId]?.outcome === 'passed';

/** Whether a phase refuses edits other than recorded actuals: its own gate was passed (§8.1) or its initiative is Closed or Cancelled (§8.4). */
export const isPhaseLocked: PhaseFrozen = (initiative, phaseId) => isInitiativeFrozen(initiative) || isPhaseFrozen(initiative, phaseId);

/** Some gate of the initiative was passed (§9.3): it is then a record of an approval and can't be deleted. A skipped gate approved nothing. */
export const hasPassedGate = (initiative: Initiative): boolean => Object.keys(initiative.gates ?? {}).some((phaseId) => isPhaseFrozen(initiative, phaseId));

/** The reason a phase's exit gate was skipped (§8.2), or undefined when it was not skipped. */
export function skipReason(initiative: Initiative, phaseId: string): string | undefined {
  const record = initiative.gates?.[phaseId];
  return record?.outcome === 'skipped' ? (record.skipReason ?? '') : undefined;
}

/** A skip recorded by choosing a starting phase (§8.2), as opposed to one taken with Skip <gate>. */
export function isStartingPhaseSkip(record: GateRecord | undefined): boolean {
  return record?.startingPhase === true;
}

/**
 * Whether the whole initiative is frozen (§8.4): Closed and Cancelled refuse every edit but checklist-item notes and
 * recorded actuals, and the lifecycle actions that end the freeze (Reopen) or don't change it (Delete, Duplicate).
 */
export const isInitiativeFrozen = (initiative: Initiative): boolean => initiative.status === 'Closed' || initiative.status === 'Cancelled';

/** What passing a gate freezes in its phase (§8.1). Actuals stay recordable on a frozen phase (§6, §8.4), so they are not here. */
export const FROZEN_PHASE_FIELDS = ['startDate', 'endDate', 'allocations', 'costItems'] as const;

/**
 * The paths of an initiative a merge must leave as frozen (§10.5, §8.1), each with the gate record that froze it:
 * a locked phase's period, allocations and cost items (per `frozen`, injectable so a caller can test a different
 * lock rule), and every gate record that exists at all, passed or skipped — write-once by `passGate`/`reopenGate`,
 * never edited field by field, so a merge treats it as one atomic value rather than walking into its frozen snapshot.
 * A starting-phase skip (§8.2) is the exception: it holds no snapshot and is replaced or removed while the
 * initiative is untouched, so it merges like any other value.
 */
export function frozenPaths(initiative: Initiative, frozen: PhaseFrozen = isPhaseFrozen): { path: string[]; by: string[] }[] {
  const phasePaths = Object.keys(initiative.phases ?? {})
    .filter((phaseId) => frozen(initiative, phaseId))
    .flatMap((phaseId) => FROZEN_PHASE_FIELDS.map((field) => ({ path: ['phases', phaseId, field], by: ['gates', phaseId] })));
  const gatePaths = Object.entries(initiative.gates ?? {})
    .filter(([, record]) => !isStartingPhaseSkip(record))
    .map(([phaseId]) => ({ path: ['gates', phaseId], by: ['gates', phaseId] }));
  return [...phasePaths, ...gatePaths];
}
