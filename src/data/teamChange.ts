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
  /** Planned cost of the removed allocations. A phase without a valid period has no cost yet, so it adds nothing (`allocationFigures`). */
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
  const removedPeople = new Map<string, Person>();
  const stayingPeople = new Map<string, Person>();

  for (const phase of process) {
    const phasePlan = initiative.phases?.[phase.id];
    if (!phasePlan || isLocked(phase.id)) continue;
    let lost = false;
    phasePlan.allocations.forEach((allocation, index) => {
      const person = people.find((p) => p.id === allocation.personId);
      if (person && isActiveMember(person, newTeamId, memberships)) {
        stayingPeople.set(person.id, person);
        return;
      }
      lost = true;
      plan.removed.push({ phaseId: phase.id, allocation, index });
      if (person) {
        removedPeople.set(person.id, person);
        plan.cost += allocationFigures(phasePlan, person, allocation.allocationPct, rateData).cost;
      }
    });
    if (lost) plan.phaseLabels.push(phase.label);
  }

  plan.removedPeople = [...removedPeople.values()];
  plan.stayingPeople = [...stayingPeople.values()].filter((p) => !removedPeople.has(p.id));
  return plan;
}

/** "N allocation(s)": the one spelling of the count, for the confirmation, the Undo message and the commit. */
export const allocationCount = (n: number): string => `${n} allocation${n === 1 ? '' : 's'}`;

/** "A", "A and B", "A, B and C". */
function joinNames(names: string[]): string {
  return names.length < 2 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * What the confirmation says (§5.4): who is not an active member of the new team, how many allocations in which
 * open phases go and what they cost, and who is on both teams and stays.
 */
export function describeTeamChange(plan: TeamChangePlan, teamName: string, formatCost: (cost: number) => string): string {
  const one = plan.removedPeople.length === 1;
  const count = plan.removed.length;
  const cost = plan.cost > 0 ? ` (planned cost ${formatCost(plan.cost)})` : '';
  const goes =
    `${joinNames(plan.removedPeople.map((p) => p.name))} ${one ? "isn't an active member" : "aren't active members"} of ${teamName}. ` +
    `Their ${count === 1 ? 'allocation' : allocationCount(count)} in ${joinNames(plan.phaseLabels)} will be removed${cost}.`;
  const stays = plan.stayingPeople.length;
  if (stays === 0) return goes;
  return `${goes} ${joinNames(plan.stayingPeople.map((p) => p.name))} ${stays === 1 ? 'is' : 'are'} on both teams and ${stays === 1 ? 'stays' : 'stay'}.`;
}
