import type { Initiative } from './types';

/** Whether a phase is frozen by its passed exit gate (§8.1). */
export type PhaseFrozen = (initiative: Initiative, phaseId: string) => boolean;

/** Gates arrive with slice 008, which bases this on the gate record (passed, not reopened); until then no phase is frozen. */
export const isPhaseFrozen: PhaseFrozen = () => false;

/** What passing a gate freezes in its phase (§8.1). Actuals stay recordable on a frozen phase (§6, §8.4), so they are not here. */
const FROZEN_PHASE_FIELDS = ['startDate', 'endDate', 'allocations', 'costItems'];

/** The paths of an initiative a merge must leave as frozen (§10.5, §8.1). */
export function frozenPaths(initiative: Initiative, frozen: PhaseFrozen = isPhaseFrozen): string[][] {
  return Object.keys(initiative.phases ?? {})
    .filter((phaseId) => frozen(initiative, phaseId))
    .flatMap((phaseId) => FROZEN_PHASE_FIELDS.map((field) => ['phases', phaseId, field]));
}
