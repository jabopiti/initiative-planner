import type { PhaseDef } from '../brand/types';
import { monthKey, parseIso } from './dates';
import type { Initiative } from './types';

/**
 * An initiative's current phase (§6: "Derived — position in the process").
 * Slice 003 has no gate records yet (passing a gate is slice 008), so every
 * initiative is in the process's first phase — this needs to read gate
 * records once that exists.
 */
export function currentPhaseId(_initiative: Initiative, process: PhaseDef[]): string {
  return process[0].id;
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
