import type { PhaseDef } from '../brand/types';
import { monthKey, parseIso } from './dates';
import type { Initiative } from './types';

/**
 * An initiative's current phase (§4, §6: "Derived — position in the process"): the first phase in process order
 * whose exit gate has no record yet. Once every phase's gate is recorded, the initiative is at its last phase
 * (Closed, its final gate having been passed) — the same rule §8.3 Reopening uses in reverse.
 */
export function currentPhaseId(initiative: Initiative, process: PhaseDef[]): string {
  for (const phase of process) {
    if (!initiative.gates?.[phase.id]) return phase.id;
  }
  return process[process.length - 1].id;
}

/** `YYYY-MM` of the calendar month after the one `isoDate` falls in. */
function nextMonthKey(isoDate: string): string {
  const [year, month] = parseIso(isoDate);
  return monthKey(month === 12 ? year + 1 : year, month % 12);
}

/**
 * Confirmed, as opposed to Provisional (§4): the initiative's current phase, or a phase whose start
 * falls in the current or the next calendar month. Compared as month keys, never by shifting a date
 * (a month added to 31 January would land in March; engine-audit.md). An earlier start is confirmed
 * too: a phase already under way is not a rough plan. `today` is the local date (§7.1).
 */
export function isPhaseConfirmed(startDate: string | undefined, isCurrentPhase: boolean, today: string): boolean {
  if (isCurrentPhase) return true;
  if (!startDate) return false;
  return startDate.slice(0, 7) <= nextMonthKey(today);
}
