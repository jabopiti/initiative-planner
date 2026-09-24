import type { PhaseDef } from '../brand/types';
import { allocationFigures, type RateData } from './cost';
import { isActiveMember } from './teamMembers';
import type { Allocation, Initiative, Membership, Person } from './types';

/** One allocation a team change takes out, with its place so an Undo can put it back where it was (§5.11). */
export interface RemovedAllocation {
  phaseId: string;
  allocation: Allocation;
  index: number;
}

/** What moving an initiative to another team would do (§7.2). Nothing here changes any data. */
export interface TeamChangePlan {
  removed: RemovedAllocation[];
  /** Who loses allocations: not active members of the new team. Each once, in phase order. */
  removedPeople: Person[];
  /** Allocated in a phase that stays open and on both teams: their allocations are kept. */
  stayingPeople: Person[];
  /** Labels of the phases that lose allocations, in process order. */
  phaseLabels: string[];
  /** Planned cost of the removed allocations. A phase without a valid period has no cost yet, so it adds nothing. */
  cost: number;
}

/**
 * Who a change of team removes (§7.2): from every phase that is not locked, the allocations of people who
 * are not active members of the new team. Locked phases are never looked at. Costs use the phase's own
 * period, as the phase does on the page, and are unrounded.
 */
export function planTeamChange(input: {
  initiative: Initiative;
  newTeamId: string;
  process: PhaseDef[];
  people: Person[];
  memberships: Membership[];
  rateData: RateData;
  isLocked: (phaseId: string) => boolean;
}): TeamChangePlan {
  const { initiative, newTeamId, process, people, memberships, rateData, isLocked } = input;
  const plan: TeamChangePlan = { removed: [], removedPeople: [], stayingPeople: [], phaseLabels: [], cost: 0 };
  const removedIds = new Set<string>();
  const stayingIds = new Set<string>();

  for (const phase of process) {
    const phasePlan = initiative.phases?.[phase.id];
    if (!phasePlan || isLocked(phase.id)) continue;
    const costed = Boolean(phasePlan.startDate && phasePlan.endDate && phasePlan.startDate <= phasePlan.endDate);
    let lost = false;
    phasePlan.allocations.forEach((allocation, index) => {
      const person = people.find((p) => p.id === allocation.personId);
      if (person && isActiveMember(person, newTeamId, memberships)) {
        stayingIds.add(person.id);
        return;
      }
      lost = true;
      plan.removed.push({ phaseId: phase.id, allocation, index });
      if (person && !removedIds.has(person.id)) {
        removedIds.add(person.id);
        plan.removedPeople.push(person);
      }
      if (person && costed) plan.cost += allocationFigures(phasePlan, person, allocation.allocationPct, rateData).cost;
    });
    if (lost) plan.phaseLabels.push(phase.label);
  }

  plan.stayingPeople = people.filter((p) => stayingIds.has(p.id) && !removedIds.has(p.id));
  return plan;
}
