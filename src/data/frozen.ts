import type { Initiative } from './types';

/** Whether a phase is frozen by its passed exit gate (§8.1). */
export type PhaseFrozen = (initiative: Initiative, phaseId: string) => boolean;

/** A phase is frozen once its own exit gate has been passed (never for a skipped gate, §8.2), and not since reopened (§8.3). */
export const isPhaseFrozen: PhaseFrozen = (initiative, phaseId) => initiative.gates?.[phaseId]?.outcome === 'passed';

/** What passing a gate freezes in its phase (§8.1). Actuals stay recordable on a frozen phase (§6, §8.4), so they are not here. */
const FROZEN_PHASE_FIELDS = ['startDate', 'endDate', 'allocations', 'costItems'];

/**
 * The paths of an initiative a merge must leave as frozen (§10.5, §8.1): a locked phase's period, allocations
 * and cost items (per `frozen`, injectable so a caller can test a different lock rule), and every gate record
 * that exists at all, passed or skipped — write-once by `passGate`/`reopenGate`, never edited field by field,
 * so a merge treats it as one atomic value rather than walking into its frozen snapshot.
 */
export function frozenPaths(initiative: Initiative, frozen: PhaseFrozen = isPhaseFrozen): string[][] {
  const phasePaths = Object.keys(initiative.phases ?? {})
    .filter((phaseId) => frozen(initiative, phaseId))
    .flatMap((phaseId) => FROZEN_PHASE_FIELDS.map((field) => ['phases', phaseId, field]));
  const gatePaths = Object.keys(initiative.gates ?? {}).map((phaseId) => ['gates', phaseId]);
  return [...phasePaths, ...gatePaths];
}
