import type { ApprovalTrackDef, PhaseDef } from '../brand/types';
import { costByYear, resolveApprovalTrack, type RateData, type YearFigures } from './cost';
import { lastCostedPassedGate } from './gate';
import { matchesChip as ok, type InitiativeRow } from './initiativeList';
import { escalation, recordedActuals } from './keyFigures';
import type { Person } from './types';

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
  return JSON.stringify(f) === JSON.stringify({ ...f, ...PORTFOLIO_DEFAULTS });
}

/**
 * An initiative as the board shows it: its cost and deviation are the chosen year's, or lifetime under All years.
 * `byYear` is worked out once per data change, so changing a filter never re-walks the cost.
 */
export interface PortfolioRow extends InitiativeRow {
  byYear: Map<number, YearFigures>;
  cost: number;
  deviation: number;
  /** The card's bullet bar (§5.2), always lifetime: the figure approved at the last costed gate, the actuals to date, and whether it is escalated. */
  approved: number | undefined;
  actuals: number;
  escalated: boolean;
}

/** Every row with its figures by year, its lifetime cost and deviation, and its bullet bar's figures. */
export function costedRows(rows: InitiativeRow[], process: PhaseDef[], people: Person[], data: RateData, approvalTracks: ApprovalTrackDef[]): PortfolioRow[] {
  return rows.map((r) => {
    const byYear = costByYear(r.initiative, process, people, data);
    const deviation = [...byYear.values()].reduce((total, y) => total + y.deviation, 0);
    return {
      ...r,
      byYear,
      cost: r.total,
      deviation,
      approved: lastCostedPassedGate(process, r.initiative)?.record.recordedGrandEstimate,
      actuals: recordedActuals(r.initiative, process).total,
      escalated: escalation(r.initiative, process, resolveApprovalTrack(approvalTracks, r.total)) !== null,
    };
  });
}

/** Every year any initiative, in any status, has non-zero cost in — the year chip's choices (§5.2). */
export function portfolioYears(rows: PortfolioRow[]): number[] {
  const years = new Set(rows.flatMap((r) => [...r.byYear].filter(([, y]) => y.cost !== 0).map(([year]) => year)));
  return [...years].sort((a, b) => a - b);
}

/** A picked year that no longer has cost anywhere (an initiative edited or deleted since) falls back to All years, as the other chips drop a missing pick. */
export function liveYear(year: number | null, years: number[]): number | null {
  return year !== null && years.includes(year) ? year : null;
}

/**
 * The initiatives the Portfolio shows (§5.2): AND across chips, OR within one (§9.11). With a year chosen, an
 * initiative with no cost that year is hidden, and cost and deviation count only that year's months; the approval
 * track stays on the lifetime grand estimate.
 */
export function portfolioRows(rows: PortfolioRow[], f: PortfolioFilters): PortfolioRow[] {
  const out: PortfolioRow[] = [];
  for (const r of rows) {
    const i = r.initiative;
    if (!(ok(f.team, i.teamId) && ok(f.phase, r.phaseId) && ok(f.initiative, i.id) && ok(f.track, r.trackId) && ok(f.status, i.status))) continue;
    if (f.year === null) out.push(r);
    else {
      const year = r.byYear.get(f.year);
      if (year && year.cost !== 0) out.push({ ...r, ...year });
    }
  }
  return out;
}
