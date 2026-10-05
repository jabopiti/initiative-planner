import type { PhaseDef } from '../brand/types';
import { hasValidPeriod, type RateData } from './cost';
import { daysBetween, formatMonth, monthOf, nextMonth, shortMonths } from './dates';
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
  placement: AxisPlacement | { kind: 'not-costed' } | { kind: 'no-period' };
  /** What the phase costs, as its row says; undefined for a phase the process doesn't cost. */
  cost: number | undefined;
}

export interface AxisPlacement {
  kind: 'axis';
  start: string;
  end: string;
  left: number;
  width: number;
}

/** A dated phase: always costed, so it has a cost. */
export type AxisPhase = StripPhase & { placement: AxisPlacement; cost: number };

/** Where Today sits: a fraction of the axis, the middle of the current phase's own block, or past either end of the axis. */
export type TodayMarker = { at: 'axis'; position: number } | { at: 'block'; phaseId: string } | { at: 'after' } | { at: 'before' };

export interface TimeStrip {
  /** Phases without a period ahead of every dated phase, left of the axis, in process order. */
  before: StripPhase[];
  /** Dated phases on one month axis; empty when no phase has a period. */
  axis: AxisPhase[];
  /** Every other phase without a period, right of the axis, in process order. */
  after: StripPhase[];
  /** The axis's months, `YYYY-MM`, each with its left edge as a fraction of the axis. */
  months: { key: string; left: number }[];
  today: TodayMarker;
}


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

  const firstMonth = dated.map((p) => monthOf(p.period!.start)).sort()[0];
  const lastMonth = dated.map((p) => monthOf(p.period!.end)).sort().at(-1)!;
  // Days from the axis's first day; the axis ends (exclusive) on the first day after its last month.
  const dayNumber = (isoDate: string) => daysBetween(`${firstMonth}-01`, isoDate);
  const monthStart = (key: string) => dayNumber(`${key}-01`);
  const span = monthStart(nextMonth(lastMonth));
  const fraction = (day: number) => day / span;

  const months: TimeStrip['months'] = [];
  for (let key = firstMonth; key <= lastMonth; key = nextMonth(key)) months.push({ key, left: fraction(monthStart(key)) });

  const axis = dated.map((p): AxisPhase => {
    const { start, end } = p.period!;
    const left = fraction(dayNumber(start));
    return { phase: p.phase, state: p.state, cost: p.cost ?? 0, placement: { kind: 'axis', start, end, left, width: fraction(dayNumber(end) + 1) - left } };
  });

  const todayDay = dayNumber(today);
  const currentWithoutPeriod = phases.find((p) => p.state === 'current' && !p.period && !isInitiativeFrozen(initiative));
  const todayMarker: TodayMarker =
    todayDay >= 0 && todayDay < span
      ? { at: 'axis', position: fraction(todayDay) }
      : currentWithoutPeriod
        ? { at: 'block', phaseId: currentWithoutPeriod.phase.id }
        : todayDay < 0
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

/** The month a label names on the strip: its short name, with the year when asked (the first label of each year). */
export function stripMonthLabel(key: string, withYear: boolean): string {
  return withYear ? formatMonth(key) : shortMonths()[Number(key.slice(5)) - 1];
}

