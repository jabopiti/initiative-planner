import type { PhaseDef } from '../brand/types';
import { monthsInRange, periodMonths, type Period } from './cost';
import { monthOf } from './dates';
import { isPhaseFrozen } from './frozen';
import { currentPhaseId, isPhaseConfirmed as isConfirmedByStart } from './processState';
import { activeMembers, activeMembership } from './teamMembers';
import type { Initiative, Membership, Person, Team } from './types';

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

/** Confirmed or Provisional (§4) for one phase of an initiative: the shared rule in `processState`, applied to that phase. */
export function isPhaseConfirmed(initiative: Initiative, phaseId: string, process: PhaseDef[], today: string): boolean {
  return isConfirmedByStart(initiative.phases?.[phaseId]?.startDate, currentPhaseId(initiative, process) === phaseId, today);
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
  teams: Team[];
  people: Person[];
  memberships: Membership[];
  process: PhaseDef[];
  /** Today, `YYYY-MM-DD`. */
  today: string;
}

/** An initiative counts toward capacity when it is Active and its team is active (§7.2, §9.3); a team that is not in the list does not count. */
export const countsTowardCapacity = (initiative: Initiative, teams: Team[]) => initiative.status === 'Active' && teams.some((t) => t.id === initiative.teamId && t.active);

/** Every allocation of every counted initiative on a costed phase with a valid period (§7.2). Compute once, share across callers. */
export function activeLoads({ initiatives, teams, process, today }: Pick<CapacityData, 'initiatives' | 'teams' | 'process' | 'today'>): Load[] {
  const loads: Load[] = [];
  for (const initiative of initiatives) {
    if (!countsTowardCapacity(initiative, teams)) continue;
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

/** A person's allocations in a month, all teams, Provisional ones included (marked `confirmed: false`). */
export function loadsIn(loads: Load[], personId: string, month: string): Load[] {
  return loads.filter((l) => l.personId === personId && l.months.includes(month));
}

function groupByPerson(loads: Load[]): Map<string, Load[]> {
  const byPerson = new Map<string, Load[]>();
  for (const load of loads) {
    const list = byPerson.get(load.personId);
    if (list) list.push(load);
    else byPerson.set(load.personId, [load]);
  }
  return byPerson;
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
  /** The Team FTE % of an active member (§4); null for a person who is not one but still has allocations on the team's initiatives. */
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
export function teamCapacity(teamId: string, data: CapacityData, loads: Load[] = activeLoads(data)): TeamCapacity {
  const { people, memberships, today } = data;
  const first = monthOf(today);
  // A phase that ended before this month is history: it draws no column and, if its person left, no warning.
  const teamLoads = loads.filter((l) => l.teamId === teamId && monthOf(l.endDate) >= first);
  const members = activeMembers(teamId, memberships, people);
  const memberIds = new Set(members.map((p) => p.id));
  const loadedIds = new Set(teamLoads.map((l) => l.personId));
  const strandedPeople = people.filter((p) => !memberIds.has(p.id) && loadedIds.has(p.id));
  const allByPerson = groupByPerson(loads);
  const teamByPerson = groupByPerson(teamLoads);

  const lastEnd = teamLoads.reduce((max, l) => (l.endDate > max ? l.endDate : max), '');
  const months = lastEnd && monthOf(lastEnd) >= first ? monthsInRange(`${first}-01`, `${monthOf(lastEnd)}-01`) : [];

  const row = (person: Person, member: boolean): CapacityRow => {
    const membership = member ? activeMembership(person.id, teamId, memberships) : undefined;
    const claimedPct = claimedFtePct(person.id, memberships);
    const personTeamLoads = teamByPerson.get(person.id) ?? [];
    const personAllLoads = allByPerson.get(person.id) ?? [];
    return {
      person,
      teamFtePct: membership ? membership.teamFtePct : null,
      cells: months.map((month) => {
        const here = loadsIn(personTeamLoads, person.id, month);
        const teamPct = sum(here.filter((l) => l.confirmed));
        const totalPct = sum(loadsIn(personAllLoads, person.id, month).filter((l) => l.confirmed));
        return {
          month,
          teamPct,
          provisionalPct: sum(here.filter((l) => !l.confirmed)),
          totalPct,
          overTeamFte: membership !== undefined && teamPct > membership.teamFtePct + EPSILON,
          overCapacity: person.active && totalPct > person.capacityPct + EPSILON,
        };
      }),
      stranded: member ? [] : personTeamLoads,
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

/** A deactivated person is a member of no team (§4), so no Team FTE % applies to them. */
function memberOf(person: Person, teamId: string, data: CapacityData): Membership | undefined {
  return person.active ? activeMembership(person.id, teamId, data.memberships) : undefined;
}

// ---- One allocation against the ceilings: its row's load bar, warnings and fixes (§5.4, §5.11) ----

/** One month of a person's other counted work, beside one allocation: on the initiative's team, and on other teams. */
export interface OtherLoadMonth {
  month: string;
  onTeam: number;
  otherTeams: number;
  /** The loads behind the two figures, for naming where the work is. */
  loads: Load[];
}

/** The two ceilings an allocation is set against (§7.2); each is absent when it doesn't apply. */
export interface Ceilings {
  /** The Team FTE % of an active member of the initiative's team. */
  teamFtePct?: number;
  /** The Capacity % of an active person. */
  capacityPct?: number;
}

/** Why an allocation doesn't count toward the ceilings (§7.2), shown in place of the ceiling on its load bar. */
export type NotCountedReason = 'provisional' | 'onHold' | 'closed' | 'cancelled' | 'teamInactive' | 'personInactive';

const STATUS_REASON: Record<Exclude<Initiative['status'], 'Active'>, NotCountedReason> = { 'On Hold': 'onHold', Closed: 'closed', Cancelled: 'cancelled' };

export interface LoadBarModel extends Ceilings {
  /** Set when this allocation doesn't count toward the ceilings: no warning, no fix, and the bar never hatches. */
  notCounted?: NotCountedReason;
  /** The months the warnings check (the phase's, from the current month on), with the person's other counted work. Empty without a period. */
  months: OtherLoadMonth[];
}

/**
 * A person's confirmed, counted loads in each of `months` (§7.2), split into the team's and other teams', leaving out
 * `exclude` (the allocation being set). The one per-month split the load bar, the warnings, the fixes and free
 * capacity share, so none of them can disagree.
 */
export function otherLoadMonths(personId: string, teamId: string, months: string[], allLoads: Load[], exclude?: { initiativeId: string; phaseId: string }): OtherLoadMonth[] {
  const mine = allLoads.filter((l) => l.confirmed && l.personId === personId && !(exclude && l.initiativeId === exclude.initiativeId && l.phaseId === exclude.phaseId));
  return months.map((month) => {
    const loads = loadsIn(mine, personId, month);
    const onTeam = sum(loads.filter((l) => l.teamId === teamId));
    return { month, onTeam, otherTeams: sum(loads) - onTeam, loads };
  });
}

/** A period's months the warnings check (§5.11): from the current month on — earlier months are history, like the grid. */
export function warningMonths(period: Period, today: string): string[] {
  const first = monthOf(today);
  return periodMonths(period).filter((m) => m >= first);
}

/** Why one allocation isn't counted (§7.2), or undefined when it is: the rules of `activeLoads`, plus an active person. */
function whyNotCounted(initiative: Initiative, phaseId: string, person: Person, data: CapacityData): NotCountedReason | undefined {
  if (initiative.status !== 'Active') return STATUS_REASON[initiative.status];
  if (!countsTowardCapacity(initiative, data.teams)) return 'teamInactive';
  if (!person.active) return 'personInactive';
  const plan = initiative.phases?.[phaseId];
  return plan?.startDate && plan.endDate && !isPhaseConfirmed(initiative, phaseId, data.process, data.today) ? 'provisional' : undefined;
}

/** One allocation against the ceilings (§5.4): the person's other counted work over the warning months, and the ceilings. */
export function loadBarModel(initiative: Initiative, phaseId: string, personId: string, data: CapacityData, allLoads: Load[] = activeLoads(data)): LoadBarModel {
  const person = data.people.find((p) => p.id === personId);
  const plan = initiative.phases?.[phaseId];
  if (!person || !plan) return { months: [] };
  return {
    notCounted: whyNotCounted(initiative, phaseId, person, data),
    months: otherLoadMonths(personId, initiative.teamId, warningMonths(plan, data.today), allLoads, { initiativeId: initiative.id, phaseId }),
    teamFtePct: memberOf(person, initiative.teamId, data)?.teamFtePct,
    capacityPct: person.active ? person.capacityPct : undefined,
  };
}

/** How far a month is past each ceiling at `value`; -Infinity for a ceiling that doesn't apply. */
function overBy(ceilings: Ceilings, m: OtherLoadMonth, value: number): { team: number; capacity: number } {
  return {
    team: ceilings.teamFtePct === undefined ? -Infinity : value + m.onTeam - ceilings.teamFtePct,
    capacity: ceilings.capacityPct === undefined ? -Infinity : value + m.onTeam + m.otherTeams - ceilings.capacityPct,
  };
}

/** How far a month is past either ceiling at `value`; 0 when within both, or when the allocation isn't counted. */
function overflowAt(model: LoadBarModel, m: OtherLoadMonth, value: number): number {
  if (model.notCounted) return 0;
  const { team, capacity } = overBy(model, m, value);
  return Math.max(0, team, capacity);
}

/** The months over each ceiling at `value` (§5.4): none when the allocation isn't counted. */
export function overCeilingMonths(model: LoadBarModel, value: number): Pick<AllocationWarnings, 'overTeamFteMonths' | 'overCapacityMonths'> {
  const over = model.notCounted ? [] : model.months.map((m) => ({ month: m.month, ...overBy(model, m, value) }));
  return {
    overTeamFteMonths: over.filter((o) => o.team > EPSILON).map((o) => o.month),
    overCapacityMonths: over.filter((o) => o.capacity > EPSILON).map((o) => o.month),
  };
}

/**
 * The hatched stretches of the bar at `value` in `month` (§5.4): this team's stack past Team FTE %, and the whole load
 * past Capacity %, merged where they overlap so a stretch past both is hatched once. None when not counted.
 */
export function overflowSpans(model: LoadBarModel, month: OtherLoadMonth | undefined, value: number): [number, number][] {
  if (!month || model.notCounted) return [];
  const { team, capacity } = overBy(model, month, value);
  const spans: [number, number][] = [];
  if (team > EPSILON) spans.push([model.teamFtePct!, value + month.onTeam]);
  if (capacity > EPSILON) spans.push([model.capacityPct!, value + month.onTeam + month.otherTeams]);
  if (spans.length < 2) return spans;
  const [a, b] = spans[0][0] <= spans[1][0] ? spans : [spans[1], spans[0]];
  return a[1] >= b[0] ? [[a[0], Math.max(a[1], b[1])]] : [a, b];
}

/**
 * The person's free capacity beside one allocation (§5.4, §5.11): the highest whole percent it can take without passing
 * a ceiling in any of `months`, never below 0 or above 100, and the month that sets it (the busiest on a tie, then the
 * earliest). Fill free's value, the row's reduce fix and the roster's "% free". Undefined without months or ceilings.
 */
export function freeCapacity(months: OtherLoadMonth[], ceilings: Ceilings): { pct: number; limiting: OtherLoadMonth } | undefined {
  let limiting: OtherLoadMonth | undefined;
  let fit = Infinity;
  for (const m of months) {
    const { team, capacity } = overBy(ceilings, m, 0);
    const room = -Math.max(team, capacity);
    const busier = limiting !== undefined && m.onTeam + m.otherTeams > limiting.onTeam + limiting.otherTeams + EPSILON;
    if (room < fit - EPSILON || (room !== Infinity && Math.abs(room - fit) <= EPSILON && busier)) {
      fit = room;
      limiting = m;
    }
  }
  return limiting ? { pct: Math.min(100, Math.max(0, Math.floor(fit + EPSILON))), limiting } : undefined;
}

/**
 * The month the bar shows at `value` (§5.4): the one with the largest overflow when a ceiling is passed, else the
 * highest load; the earliest on a tie. A not-counted allocation shows the month with the most other work.
 */
export function shownLoadMonth(model: LoadBarModel, value: number): OtherLoadMonth | undefined {
  let best: OtherLoadMonth | undefined;
  let bestOver = 0;
  let bestTotal = -Infinity;
  for (const m of model.months) {
    const over = overflowAt(model, m, value);
    const total = m.onTeam + m.otherTeams;
    if (over > bestOver + EPSILON || (Math.abs(over - bestOver) <= EPSILON && total > bestTotal + EPSILON)) {
      best = m;
      bestOver = over;
      bestTotal = total;
    }
  }
  return best;
}

/**
 * One allocation row of the initiative page (§5.4): its load bar and its warnings. The ceilings look at the warning
 * months and stay silent on an allocation that isn't counted; the membership warning shows regardless, because such
 * an allocation keeps costing.
 */
export function allocationRow(initiative: Initiative, phaseId: string, personId: string, data: CapacityData, allLoads: Load[] = activeLoads(data)): { bar: LoadBarModel; warnings: AllocationWarnings } {
  const person = data.people.find((p) => p.id === personId);
  const bar = loadBarModel(initiative, phaseId, personId, data, allLoads);
  const value = initiative.phases?.[phaseId]?.allocations.find((a) => a.personId === personId)?.allocationPct ?? 0;
  return {
    bar,
    // A dangling person is shown as "Unknown person" on the row already; that is not a membership matter.
    warnings: { notMember: person !== undefined && !memberOf(person, initiative.teamId, data), ...overCeilingMonths(bar, value) },
  };
}

/** The warnings on one allocation row of the initiative page (§5.4); see `allocationRow`. */
export function allocationWarnings(initiative: Initiative, phaseId: string, personId: string, data: CapacityData, allLoads: Load[] = activeLoads(data)): AllocationWarnings {
  return allocationRow(initiative, phaseId, personId, data, allLoads).warnings;
}

// ---- Fix suggestions (§5.11) ----

/**
 * The Allocation % to reduce one allocation to so it is over neither ceiling in any month the warnings look at
 * (§5.11): the person's free capacity beside it, as Fill free offers. Null when there is nothing to fix (it is
 * within that already), nothing positive fits, or the allocation can't be edited (a frozen phase) or isn't counted.
 */
export function reduceFix(initiative: Initiative, phaseId: string, personId: string, data: CapacityData, allLoads: Load[] = activeLoads(data)): { allocationId: string; allocationPct: number } | null {
  const allocation = initiative.phases?.[phaseId]?.allocations.find((a) => a.personId === personId);
  if (!allocation || isPhaseFrozen(initiative, phaseId)) return null;
  const model = loadBarModel(initiative, phaseId, personId, data, allLoads);
  const value = model.notCounted ? undefined : freeCapacity(model.months, model)?.pct;
  return value !== undefined && value > 0 && value < allocation.allocationPct - EPSILON ? { allocationId: allocation.id, allocationPct: value } : null;
}

/**
 * The Team FTE % to raise a person's membership to (§5.11): the lowest whole percent covering their highest month
 * on the team's counted initiatives from the current month on, so every over Team FTE % warning on that team
 * clears at once. Null when they are not over it, or when the raise would not fit within their Capacity % minus
 * their other teams' Team FTE %s.
 */
export function raiseFix(personId: string, teamId: string, data: CapacityData, allLoads: Load[] = activeLoads(data)): { membershipId: string; teamFtePct: number } | null {
  const person = data.people.find((p) => p.id === personId);
  const membership = person && memberOf(person, teamId, data);
  if (!person || !membership) return null;
  const first = monthOf(data.today);
  const teamLoads = allLoads.filter((l) => l.confirmed && l.personId === personId && l.teamId === teamId);
  const months = [...new Set(teamLoads.flatMap((l) => l.months))].filter((m) => m >= first);
  const peak = months.reduce((max, m) => Math.max(max, sum(loadsIn(teamLoads, personId, m))), 0);
  if (peak <= membership.teamFtePct + EPSILON) return null;
  const value = Math.ceil(peak - EPSILON);
  return value <= unclaimedCapacityPct(person, data.memberships, membership.id) + EPSILON ? { membershipId: membership.id, teamFtePct: value } : null;
}
