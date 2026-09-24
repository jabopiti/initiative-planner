import type { PhaseDef } from '../brand/types';
import { monthsInRange, type Period } from './cost';
import { parseIso } from './dates';
import { currentPhaseId } from './processState';
import type { Initiative, Person } from './types';

/** `YYYY-MM` of the calendar month after the one `isoDate` falls in. */
function nextMonthKey(isoDate: string): string {
  const [year, month] = parseIso(isoDate);
  return month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, '0')}`;
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

/**
 * A person's total Allocation % per month (`YYYY-MM`) over the Active initiatives' Confirmed phases (§7.2).
 * With `teamId`, only that team's initiatives count: the Team FTE % ceiling's scope.
 */
function confirmedLoadByMonth(personId: string, initiatives: Initiative[], process: PhaseDef[], today: string, teamId?: string): Map<string, number> {
  const load = new Map<string, number>();
  for (const initiative of initiatives) {
    if (initiative.status !== 'Active' || (teamId !== undefined && initiative.teamId !== teamId)) continue;
    const current = currentPhaseId(initiative, process);
    for (const [phaseId, plan] of Object.entries(initiative.phases ?? {})) {
      if (!plan.startDate || !plan.endDate || !isPhaseConfirmed(plan.startDate, phaseId === current, today)) continue;
      const pct = plan.allocations.filter((a) => a.personId === personId).reduce((sum, a) => sum + a.allocationPct, 0);
      if (pct === 0) continue;
      for (const month of monthsInRange(plan.startDate, plan.endDate)) load.set(month, (load.get(month) ?? 0) + pct);
    }
  }
  return load;
}

/**
 * What a person has free for a phase (§5.11, §7.2): the lower of their unused Team FTE % on this team and
 * their unused Capacity % across all teams, taken as the minimum over the phase's months, in whole percent
 * rounded down so that using it can never trip a ceiling. Provisional phases and initiatives that are not
 * Active are left out. Never below 0; null when the phase has no months (no period yet, or an inverted one).
 */
export function freeCapacityPct({
  person,
  teamId,
  teamFtePct,
  period,
  initiatives,
  process,
  today,
}: {
  person: Person;
  teamId: string;
  /** The person's Team FTE % on `teamId`. */
  teamFtePct: number;
  period: Period;
  initiatives: Initiative[];
  process: PhaseDef[];
  today: string;
}): number | null {
  const months = period.startDate && period.endDate ? monthsInRange(period.startDate, period.endDate) : [];
  if (months.length === 0) return null;

  const total = confirmedLoadByMonth(person.id, initiatives, process, today);
  const onTeam = confirmedLoadByMonth(person.id, initiatives, process, today, teamId);
  const free = Math.min(...months.map((m) => Math.min(person.capacityPct - (total.get(m) ?? 0), teamFtePct - (onTeam.get(m) ?? 0))));
  // The epsilon keeps 100 - 60.000000000000001 style float dust from costing a whole point.
  return Math.max(0, Math.floor(free + 1e-9));
}
