import type { PhaseDef } from '../brand/types';
import { hasValidPeriod, phaseByMonth, phaseCoverage, phaseEffectiveTotal, phaseMonths, type RateData } from './cost';
import { isPhaseFrozen } from './frozen';
import type { FrozenPhaseSnapshot, Initiative, PhasePlan, Person } from './types';

/** What the phase's header and body show, worked out once (§5.4, §7.1, §7.3). */
export interface PhaseSummary {
  /** Both dates are set (the period may still be inverted). */
  hasPeriod: boolean;
  /** The end date is before the start date. */
  inverted: boolean;
  /** A usable period: only then does the phase cost anything. */
  costed: boolean;
  /** Its own exit gate passed: the phase shows its snapshot, not the live rates (§8.1). */
  frozen: boolean;
  snapshot: FrozenPhaseSnapshot | undefined;
  /** The snapshot's estimate when frozen, the live one otherwise. */
  estimateByMonth: Record<string, number>;
  /** Recorded actual where there is one, the estimate otherwise (§7.3). */
  total: number;
  /** Anything to cost: an allocation, a cost item or a recorded actual. */
  hasCost: boolean;
  coverage: 'frozen' | 'actual' | 'forecast' | 'estimate';
  /** Every month the phase costs something in; empty without a usable period. */
  months: string[];
}

/** A phase's summary figures. `plan` is the phase's plan, or an empty one when it isn't planned yet. */
export function phaseSummary(initiative: Initiative, phaseId: string, plan: PhasePlan, people: Person[], data: RateData): PhaseSummary {
  const hasPeriod = Boolean(plan.startDate && plan.endDate);
  const costed = hasValidPeriod(plan);
  const inverted = hasPeriod && !costed;
  const frozen = isPhaseFrozen(initiative, phaseId);
  const snapshot = initiative.gates?.[phaseId]?.frozenSnapshot;
  const estimateByMonth = frozen && snapshot ? snapshot.estimateByMonth : phaseByMonth(plan, people, data);
  const hasCost = plan.allocations.length > 0 || (plan.costItems?.length ?? 0) > 0 || Object.keys(plan.actualMonths ?? {}).length > 0;
  return {
    hasPeriod,
    inverted,
    costed,
    frozen,
    snapshot,
    estimateByMonth,
    total: phaseEffectiveTotal(initiative, phaseId, people, data, estimateByMonth),
    hasCost,
    coverage: frozen ? 'frozen' : phaseCoverage(plan),
    months: costed ? phaseMonths(plan) : [],
  };
}

/** The end date of the previous phase when this one starts on or before it (§5.4 overlap warning); null when they don't overlap. */
export function overlapWithPrevious(previousEnd: string | undefined, plan: PhasePlan): string | null {
  return previousEnd && plan.startDate && plan.startDate <= previousEnd ? previousEnd : null;
}

/** What a phase still lacks before it can be costed: its period, then its people. Null when neither is missing. */
export function planningGap(plan: PhasePlan): 'period' | 'people' | null {
  if (!(plan.startDate && plan.endDate)) return 'period';
  return plan.allocations.length === 0 ? 'people' : null;
}

/** The next step (§5.4): the first costed phase whose plan lacks a valid period or has no people yet. */
export function nextStepPhase(initiative: Initiative, process: PhaseDef[]): PhaseDef | undefined {
  return process.filter((p) => p.costed).find((p) => {
    const plan = initiative.phases?.[p.id];
    return !(plan && hasValidPeriod(plan) && plan.allocations.length > 0);
  });
}
