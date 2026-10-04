import type { PhaseDef } from '../brand/types';
import { hasValidPeriod, type RateData } from './cost';
import { nextMonth, parseIso } from './dates';
import { isInitiativeFrozen } from './frozen';
import { phaseSummary } from './phaseSummary';
import { currentPhaseId } from './processState';
import type { Initiative, Person } from './types';

export type StripState = 'done' | 'current' | 'ahead';

/** One phase on the initiative header's time strip (§5.4). */
export interface StripPhase {
  phase: PhaseDef;
  state: StripState;
  /** On the month axis: its period. Otherwise a hatched block: a phase the process doesn't cost, or a costed one without a usable period yet. */
  placement: { kind: 'axis'; start: string; end: string; left: number; width: number } | { kind: 'not-costed' } | { kind: 'no-period' };
  /** What the phase costs, as its row says; undefined for a phase the process doesn't cost. */
  cost: number | undefined;
}

/** Where Today sits: a fraction of the axis, the middle of the current phase's own block, or past either end of the axis. */
export type TodayMarker = { at: 'axis'; position: number } | { at: 'block'; phaseId: string } | { at: 'after' } | { at: 'before' };

export interface TimeStrip {
  /** Phases without a period ahead of every dated phase, left of the axis, in process order. */
  before: StripPhase[];
  /** Dated phases on one month axis; empty when no phase has a period. */
  axis: StripPhase[];
  /** Every other phase without a period, right of the axis, in process order. */
  after: StripPhase[];
  /** The axis's months, `YYYY-MM`, each with its left edge as a fraction of the axis. */
  months: { key: string; left: number }[];
  today: TodayMarker;
}

const dayNumber = (isoDate: string) => {
  const [y, m, d] = parseIso(isoDate);
  return Date.UTC(y, m - 1, d) / 86_400_000;
};
const monthStart = (key: string) => dayNumber(`${key}-01`);

/**
 * The time strip under the initiative header (§5.4): each phase with a period sits on one month axis, so gaps and
 * overlaps show as they are; a phase without one is a hatched block at its place in phase order, outside the axis —
 * ahead of it while no dated phase comes earlier, after it otherwise. A frozen phase shows its snapshot's period.
 * Today sits on the axis, on the current phase's block when that phase has no period, or past an end of the axis.
 */
export function timeStrip(initiative: Initiative, process: PhaseDef[], people: Person[], data: RateData, today: string): TimeStrip {
  const currentIndex = process.findIndex((p) => p.id === currentPhaseId(initiative, process));
  const closed = initiative.status === 'Closed';
  const phases = process.map((phase, index) => {
    const state: StripState = closed || index < currentIndex ? 'done' : index === currentIndex ? 'current' : 'ahead';
    if (!phase.costed) return { phase, state, period: null, cost: undefined };
    const plan = initiative.phases?.[phase.id] ?? { allocations: [] };
    const summary = phaseSummary(initiative, phase.id, plan, people, data);
    const period = summary.frozen && summary.snapshot ? summary.snapshot : plan;
    return { phase, state, period: hasValidPeriod(period) ? { start: period.startDate!, end: period.endDate! } : null, cost: summary.costed ? summary.total : 0 };
  });

  const dated = phases.filter((p) => p.period);
  const firstDated = phases.findIndex((p) => p.period);
  const block = (p: (typeof phases)[number]): StripPhase => ({ phase: p.phase, state: p.state, cost: p.cost, placement: { kind: p.phase.costed ? 'no-period' : 'not-costed' } });
  if (dated.length === 0) {
    const current = phases.find((p) => p.state === 'current') ?? phases[phases.length - 1];
    return { before: phases.map(block), axis: [], after: [], months: [], today: { at: 'block', phaseId: current.phase.id } };
  }

  const firstMonth = dated.map((p) => p.period!.start.slice(0, 7)).sort()[0];
  const lastMonth = dated.map((p) => p.period!.end.slice(0, 7)).sort().at(-1)!;
  const axisStart = monthStart(firstMonth);
  const axisEnd = monthStart(nextMonth(lastMonth)); // exclusive: the day after the last month
  const span = axisEnd - axisStart;
  const fraction = (day: number) => (day - axisStart) / span;

  const months: TimeStrip['months'] = [];
  for (let key = firstMonth; key <= lastMonth; key = nextMonth(key)) months.push({ key, left: fraction(monthStart(key)) });

  const axis = dated.map((p): StripPhase => {
    const { start, end } = p.period!;
    const left = fraction(dayNumber(start));
    return { phase: p.phase, state: p.state, cost: p.cost, placement: { kind: 'axis', start, end, left, width: fraction(dayNumber(end) + 1) - left } };
  });

  const todayDay = dayNumber(today);
  const currentWithoutPeriod = phases.find((p) => p.state === 'current' && !p.period && !isInitiativeFrozen(initiative));
  const todayMarker: TodayMarker =
    todayDay >= axisStart && todayDay < axisEnd
      ? { at: 'axis', position: fraction(todayDay) }
      : currentWithoutPeriod
        ? { at: 'block', phaseId: currentWithoutPeriod.phase.id }
        : todayDay < axisStart
          ? { at: 'before' }
          : { at: 'after' };

  return {
    before: phases.slice(0, firstDated).map(block),
    axis,
    after: phases.slice(firstDated).filter((p) => !p.period).map(block),
    months,
    today: todayMarker,
  };
}

/** The month a label names on the strip: its short name, with the year on the first label and on January. */
export function stripMonthLabel(key: string, first: boolean, shortMonthNames: readonly string[]): string {
  const [year, month] = parseIso(`${key}-01`);
  const name = shortMonthNames[month - 1];
  return first || month === 1 ? `${name} ${year}` : name;
}

