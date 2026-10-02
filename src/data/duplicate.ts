import type { PhaseDef } from '../brand/types';
import { planCopy } from './copyAllocations';
import { addDays, addMonths } from './defaultPlan';
import { daysBetween, monthOf } from './dates';
import { newId } from './ids';
import type { CostItem, Initiative, Membership, Person, PhasePlan, Team } from './types';

/** What Duplicate reads besides the initiative itself (§5.11). */
export interface DuplicateContext {
  process: PhaseDef[];
  people: Person[];
  memberships: Membership[];
  teams: Team[];
  /** Every initiative's name, for the "copy 2" suffix. */
  existingNames: string[];
  today: string;
}

export interface DuplicateResult {
  initiative: Initiative;
  /** People on the original's allocations who are not active members of its team: left out of the copy, in order. */
  skipped: Person[];
  /** The team the skipped people are no longer on, for the notice. */
  team: Team;
}

/** The first free "<name> copy", "<name> copy 2", "<name> copy 3" … against every initiative's name, trimmed and case-insensitive. */
export function copyName(name: string, existingNames: string[]): string {
  const taken = new Set(existingNames.map((n) => n.trim().toLowerCase()));
  for (let n = 1; ; n++) {
    const candidate = n === 1 ? `${name} copy` : `${name} copy ${n}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}

const hasPeriod = (plan: { startDate?: string; endDate?: string }): plan is { startDate: string; endDate: string } =>
  !!plan.startDate && !!plan.endDate && plan.startDate <= plan.endDate;

/** The end of a period of the same length as startDate–endDate, starting at `from`: whole months when its end is the day before the same day n months on, else its day count (§5.11). */
function endFrom(startDate: string, endDate: string, from: string): string {
  for (let months = 1; months <= 120; months++) {
    const end = addDays(addMonths(startDate, months), -1);
    if (end === endDate) return addDays(addMonths(from, months), -1);
    if (end > endDate) break;
  }
  return addDays(from, daysBetween(startDate, endDate));
}

const monthIndex = (key: string): number => {
  const [y, m] = key.split('-').map(Number);
  return y * 12 + m - 1;
};

/** A month key moved by `by` months (negative moves back). */
function shiftMonth(key: string, by: number): string {
  const index = monthIndex(key) + by;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
}

/** A phase's plan as Duplicate reads it: a passed gate's frozen snapshot where there is one, else the live plan (§8.1). */
function sourcePlan(initiative: Initiative, phaseId: string): Pick<PhasePlan, 'startDate' | 'endDate' | 'allocations' | 'costItems'> | undefined {
  return initiative.gates?.[phaseId]?.frozenSnapshot ?? initiative.phases?.[phaseId];
}

/**
 * Duplicate (§5.11): a new Active initiative with the same team, description and (active) owner and, per costed phase,
 * the same length, allocations of active team members and cost items. Periods are chained again from `today`; a
 * one-month item keeps its distance in months from its phase's start. Gates, checklist state and actuals are left behind,
 * and the copy is not a default plan.
 */
export function duplicateInitiative(source: Initiative, ctx: DuplicateContext): DuplicateResult {
  const team = ctx.teams.find((t) => t.id === source.teamId) ?? ({ id: source.teamId, name: 'the team', active: true } satisfies Team);
  const skipped = new Map<string, Person>();
  const phases: Record<string, PhasePlan> = {};
  let cursor = ctx.today;

  for (const def of ctx.process.filter((p) => p.costed)) {
    const plan = sourcePlan(source, def.id);
    if (!plan) continue;
    const costItems = plan.costItems ?? [];
    if (!hasPeriod(plan) && plan.allocations.length === 0 && costItems.length === 0) continue;

    const { copy, skipped: left } = planCopy(plan.allocations, team, ctx.people, ctx.memberships);
    for (const person of left) skipped.set(person.id, person);
    const copied: PhasePlan = { allocations: copy.map((a) => ({ id: newId(), ...a })) };

    let monthOffset: number | undefined; // how far the copy's period starts after the original's, in months
    if (hasPeriod(plan)) {
      const endDate = endFrom(plan.startDate, plan.endDate, cursor);
      copied.startDate = cursor;
      copied.endDate = endDate;
      monthOffset = monthIndex(monthOf(cursor)) - monthIndex(monthOf(plan.startDate));
      cursor = addDays(endDate, 1);
    }
    if (costItems.length > 0) {
      copied.costItems = costItems.map((item): CostItem => {
        const { month, ...rest } = item;
        const moved = month && monthOffset !== undefined ? shiftMonth(month, monthOffset) : month;
        return { ...rest, id: newId(), ...(moved && { month: moved }) };
      });
    }
    phases[def.id] = copied;
  }

  const owner = source.ownerId ? ctx.people.find((p) => p.id === source.ownerId) : undefined;
  const initiative: Initiative = {
    id: newId(),
    name: copyName(source.name, ctx.existingNames),
    ...(source.description && { description: source.description }),
    ...(owner?.active && { ownerId: owner.id }),
    teamId: source.teamId,
    status: 'Active',
    ...(Object.keys(phases).length > 0 && { phases }),
  };
  return { initiative, skipped: [...skipped.values()], team };
}
