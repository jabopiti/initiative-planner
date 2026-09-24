import type { PhaseDef } from '../brand/types';
import { monthsInRange } from './cost';
import { MONTHS } from './dates';
import { currentPhaseId } from './processState';
import { activeMembers, isActiveMember } from './teamMembers';
import type { Initiative, Membership, Person } from './types';

/** Total Team FTE % a person's active memberships claim (§4). */
export function claimedFtePct(personId: string, memberships: Membership[], excludeMembershipId?: string): number {
  return memberships
    .filter((m) => m.personId === personId && m.active && m.id !== excludeMembershipId)
    .reduce((sum, m) => sum + m.teamFtePct, 0);
}

/**
 * Capacity % minus the Team FTE %s already held (§5.6). It caps and defaults
 * a new or edited membership so the person panel can never create an
 * over-Capacity % state (§7.2); the team detail may still raise past it.
 */
export function unclaimedCapacityPct(person: Person, memberships: Membership[], excludeMembershipId?: string): number {
  return Math.max(0, person.capacityPct - claimedFtePct(person.id, memberships, excludeMembershipId));
}

// ---- Month-by-month capacity (§5.8, §7.2) ----

/** A month as `YYYY-MM` (§6 Month encoding); a date's month is its first seven characters. */
const monthOf = (isoDate: string) => isoDate.slice(0, 7);

function nextMonth(key: string): string {
  const [year, month] = key.split('-').map(Number);
  return month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, '0')}`;
}

/** "Sep 2026". */
export function formatMonth(key: string): string {
  const [year, month] = key.split('-').map(Number);
  return `${MONTHS[month - 1]} ${year}`;
}

/** "Sep 26", for a grid column. */
export function formatMonthShort(key: string): string {
  const [year, month] = key.split('-').map(Number);
  return `${MONTHS[month - 1]} ${String(year).slice(2)}`;
}

/** Consecutive months merged: "Sep 2026, Nov – Dec 2026, Jan – Feb 2027". Keys are ascending. */
export function formatMonthRanges(keys: string[]): string {
  const runs: string[][] = [];
  for (const key of keys) {
    const run = runs[runs.length - 1];
    if (run && nextMonth(run[run.length - 1]) === key) run.push(key);
    else runs.push([key]);
  }
  return runs
    .map((run) => {
      const first = run[0];
      const last = run[run.length - 1];
      if (first === last) return formatMonth(first);
      const start = first.slice(0, 4) === last.slice(0, 4) ? formatMonth(first).slice(0, 3) : formatMonth(first);
      return `${start} – ${formatMonth(last)}`;
    })
    .join(', ');
}

/**
 * Confirmed or Provisional (§4): Confirmed when it is the initiative's current phase or its start date falls in
 * the current or the next calendar month. The threshold is a month-key comparison, not date arithmetic, so it
 * has no day-31 overflow (engine-audit.md). A phase with no start date is Provisional.
 */
export function isPhaseConfirmed(initiative: Initiative, phaseId: string, process: PhaseDef[], today: string): boolean {
  if (currentPhaseId(initiative, process) === phaseId) return true;
  const start = initiative.phases?.[phaseId]?.startDate;
  if (!start) return false;
  const now = monthOf(today);
  const startMonth = monthOf(start);
  return startMonth === now || startMonth === nextMonth(now);
}

/** One person's Allocation % on one phase of an Active initiative, with the months it covers. */
export interface Load {
  personId: string;
  initiativeId: string;
  initiativeName: string;
  teamId: string;
  phaseId: string;
  phaseLabel: string;
  startDate: string;
  endDate: string;
  months: string[];
  allocationPct: number;
  confirmed: boolean;
}

export interface CapacityData {
  initiatives: Initiative[];
  people: Person[];
  memberships: Membership[];
  process: PhaseDef[];
  /** Today, `YYYY-MM-DD`. */
  today: string;
}

/** Every allocation of every Active initiative on a costed phase with a valid period (§7.2: only Active count). */
function activeLoads({ initiatives, process, today }: CapacityData): Load[] {
  const loads: Load[] = [];
  for (const initiative of initiatives) {
    if (initiative.status !== 'Active') continue;
    for (const phase of process) {
      const plan = initiative.phases?.[phase.id];
      if (!phase.costed || !plan?.startDate || !plan.endDate) continue;
      const months = monthsInRange(plan.startDate, plan.endDate);
      if (months.length === 0) continue;
      const confirmed = isPhaseConfirmed(initiative, phase.id, process, today);
      for (const allocation of plan.allocations) {
        loads.push({
          personId: allocation.personId,
          initiativeId: initiative.id,
          initiativeName: initiative.name,
          teamId: initiative.teamId,
          phaseId: phase.id,
          phaseLabel: phase.label,
          startDate: plan.startDate,
          endDate: plan.endDate,
          months,
          allocationPct: allocation.allocationPct,
          confirmed,
        });
      }
    }
  }
  return loads;
}

/** Allocations are unrounded, so a sum such as 0.1 + 0.2 must not read as over 0.3. */
const EPSILON = 1e-9;

const sum = (loads: Load[]) => loads.reduce((total, l) => total + l.allocationPct, 0);
const inMonth = (loads: Load[], personId: string, month: string) => loads.filter((l) => l.personId === personId && l.months.includes(month));

/** A person's allocations in a month, all teams, Provisional ones included (marked `confirmed: false`). */
export function loadsIn(loads: Load[], personId: string, month: string): Load[] {
  return inMonth(loads, personId, month);
}

export interface CapacityCell {
  month: string;
  /** Allocation % on this team's Active initiatives, Confirmed phases only. */
  teamPct: number;
  /** Allocation % on this team's Provisional phases: shown apart, counted toward nothing (§7.2). */
  provisionalPct: number;
  /** Allocation % across every team's Confirmed phases. */
  totalPct: number;
  overTeamFte: boolean;
  overCapacity: boolean;
}

export interface CapacityRow {
  person: Person;
  /** An active member of the team (§4). A person who is not still has allocations on the team's initiatives. */
  member: boolean;
  teamFtePct: number | null;
  cells: CapacityCell[];
  /** The team's Active-initiative allocations that outlived the membership (§7.2). */
  stranded: Load[];
  /** Set when the person's Team FTE %s add up to more than their Capacity % (§7.2). */
  fteSumOverCapacity: { claimedPct: number; capacityPct: number } | null;
}

export interface TeamCapacity {
  /** From the current month through the last month with an allocation; empty when there is none. */
  months: string[];
  rows: CapacityRow[];
  /** Every Active-initiative allocation of every team, for the detail of a cell or a row. */
  loads: Load[];
}

/** The team's capacity view (§5.8): a row per active member, then a row per person whose allocation outlived their membership. */
export function teamCapacity(teamId: string, data: CapacityData): TeamCapacity {
  const { people, memberships, today } = data;
  const loads = activeLoads(data);
  const teamLoads = loads.filter((l) => l.teamId === teamId);
  const members = activeMembers(teamId, memberships, people);
  const memberIds = new Set(members.map((p) => p.id));
  const strandedPeople = people.filter((p) => !memberIds.has(p.id) && teamLoads.some((l) => l.personId === p.id));

  const first = monthOf(today);
  const last = teamLoads.reduce((max, l) => (l.months[l.months.length - 1] > max ? l.months[l.months.length - 1] : max), '');
  const months = last >= first ? monthsInRange(`${first}-01`, `${last}-01`) : [];

  const row = (person: Person, member: boolean): CapacityRow => {
    const membership = member ? memberships.find((m) => m.personId === person.id && m.teamId === teamId && m.active) : undefined;
    const claimedPct = claimedFtePct(person.id, memberships);
    return {
      person,
      member,
      teamFtePct: membership ? membership.teamFtePct : null,
      cells: months.map((month) => {
        const here = inMonth(teamLoads, person.id, month);
        const teamPct = sum(here.filter((l) => l.confirmed));
        const totalPct = sum(inMonth(loads, person.id, month).filter((l) => l.confirmed));
        return {
          month,
          teamPct,
          provisionalPct: sum(here.filter((l) => !l.confirmed)),
          totalPct,
          overTeamFte: membership !== undefined && teamPct > membership.teamFtePct + EPSILON,
          overCapacity: person.active && totalPct > person.capacityPct + EPSILON,
        };
      }),
      stranded: member ? [] : teamLoads.filter((l) => l.personId === person.id),
      fteSumOverCapacity: member && claimedPct > person.capacityPct + EPSILON ? { claimedPct, capacityPct: person.capacityPct } : null,
    };
  };

  const byName = (a: Person, b: Person) => a.name.localeCompare(b.name);
  return {
    months,
    rows: [...members.sort(byName).map((p) => row(p, true)), ...strandedPeople.sort(byName).map((p) => row(p, false))],
    loads,
  };
}

/** Whether any row of the capacity view carries a §7.2 warning: the marker on the Teams overview (§5.7). */
export function teamHasCapacityWarning(capacity: TeamCapacity): boolean {
  return capacity.rows.some((r) => r.stranded.length > 0 || r.fteSumOverCapacity !== null || r.cells.some((c) => c.overTeamFte || c.overCapacity));
}

export interface AllocationWarnings {
  /** The person is no longer an active member of the initiative's team (§7.2). */
  notMember: boolean;
  /** Months of the phase in which the person is over their Team FTE % on the team. */
  overTeamFteMonths: string[];
  /** Months of the phase in which the person is over their Capacity % across all teams. */
  overCapacityMonths: string[];
}

/**
 * The warnings on one allocation row of the initiative page (§5.4). The ceilings look at the phase's own
 * months and stay silent on a Provisional phase or an initiative that is not Active, whose allocation is not
 * counted; the membership warning shows regardless, because such an allocation keeps costing.
 */
export function allocationWarnings(initiative: Initiative, phaseId: string, personId: string, data: CapacityData): AllocationWarnings {
  const person = data.people.find((p) => p.id === personId);
  const none: AllocationWarnings = { notMember: !person || !isActiveMember(person, initiative.teamId, data.memberships), overTeamFteMonths: [], overCapacityMonths: [] };
  const plan = initiative.phases?.[phaseId];
  if (!person || initiative.status !== 'Active' || !plan?.startDate || !plan.endDate) return none;
  if (!isPhaseConfirmed(initiative, phaseId, data.process, data.today)) return none;

  const loads = activeLoads(data).filter((l) => l.confirmed);
  const teamLoads = loads.filter((l) => l.teamId === initiative.teamId);
  const membership = data.memberships.find((m) => m.personId === personId && m.teamId === initiative.teamId && m.active);
  const months = monthsInRange(plan.startDate, plan.endDate);
  return {
    ...none,
    overTeamFteMonths: membership ? months.filter((m) => sum(inMonth(teamLoads, personId, m)) > membership.teamFtePct + EPSILON) : [],
    overCapacityMonths: person.active ? months.filter((m) => sum(inMonth(loads, personId, m)) > person.capacityPct + EPSILON) : [],
  };
}
