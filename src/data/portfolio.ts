import type { PhaseDef } from '../brand/types';
import { costYears, grandDeviation, yearDeviation, yearEstimate, type RateData } from './cost';
import type { InitiativeRow } from './initiativeList';
import type { Initiative, Person } from './types';

/** The Portfolio's filters (§5.2): five multi-select chips and the single-select year, kept apart from the Initiatives table's. */
export interface PortfolioFilters {
  team: string[];
  phase: string[];
  /** Specific initiatives, by id. */
  initiative: string[];
  track: string[];
  status: string[];
  /** One calendar year, or null for All years. */
  year: number | null;
}

/** Status starts on Active, and Clear filters returns to this, not to "all" (§5.2). */
export const PORTFOLIO_DEFAULTS: PortfolioFilters = { team: [], phase: [], initiative: [], track: [], status: ['Active'], year: null };

/** Whether Clear filters would change anything. */
export function isDefaultPortfolioFilters(f: PortfolioFilters): boolean {
  return f.team.length + f.phase.length + f.initiative.length + f.track.length === 0 && f.year === null && f.status.length === 1 && f.status[0] === 'Active';
}

/** An initiative as the board shows it: its cost and deviation are the chosen year's, or lifetime under All years. */
export interface PortfolioRow extends InitiativeRow {
  cost: number;
  deviation: number;
}

/** Every year any initiative, in any status, has cost in — the year chip's choices (§5.2). */
export function portfolioYears(initiatives: Initiative[], process: PhaseDef[], people: Person[], data: RateData): number[] {
  const years = new Set(initiatives.flatMap((i) => costYears(i, process, people, data)));
  return [...years].sort((a, b) => a - b);
}

/**
 * The initiatives the Portfolio shows (§5.2): AND across chips, OR within one (§9.11). With a year chosen, an
 * initiative with no cost that year is hidden, and cost and deviation count only that year's months; the approval
 * track stays on the lifetime grand estimate.
 */
export function portfolioRows(rows: InitiativeRow[], f: PortfolioFilters, process: PhaseDef[], people: Person[], data: RateData): PortfolioRow[] {
  const ok = (chosen: string[], value: string) => chosen.length === 0 || chosen.includes(value);
  const out: PortfolioRow[] = [];
  for (const r of rows) {
    const i = r.initiative;
    if (!(ok(f.team, i.teamId) && ok(f.phase, r.phaseId) && ok(f.initiative, i.id) && ok(f.track, r.trackId) && ok(f.status, i.status))) continue;
    if (f.year === null) {
      out.push({ ...r, cost: r.total, deviation: grandDeviation(i, process, people, data) });
    } else if (costYears(i, process, people, data).includes(f.year)) {
      out.push({ ...r, cost: yearEstimate(i, process, people, data, f.year), deviation: yearDeviation(i, process, people, data, f.year) });
    }
  }
  return out;
}
