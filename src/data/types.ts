/**
 * Dataset shapes (spec §6), scoped to the fields the built slices read or write.
 * Actuals and gate records arrive with their own slices.
 */

export type InitiativeStatus = 'Active' | 'On Hold' | 'Cancelled' | 'Closed';

export interface DatasetFlags {
  schemaVersion: number;
  processIdentity: { id: string; structureVersion: number };
  ratesReviewed: boolean;
}

export interface Team {
  id: string;
  name: string;
  active: boolean;
}

/** A custom role's absolute day rate for one calendar year (§6, §7.2). */
export interface CustomRoleYearRate {
  year: number;
  dayRate: number;
}

/** A per-person role label with its own day rate and cost factor; replaces country rate × role factor (§6). */
export interface CustomRole {
  /** Whether the person is costed and shown with the custom role. Off keeps the entries for later (§6). */
  active: boolean;
  label: string;
  /** Multiplied against the day rate, like a standard role's cost factor. */
  costFactor: number;
  dayRatesByYear: CustomRoleYearRate[];
}

export interface Person {
  id: string;
  name: string;
  countryId: string;
  roleId: string;
  /** While `customRole.active`, the person is costed at its rate and factor instead of the country rate and role factor (§7.1). */
  customRole?: CustomRole;
  /** Ceiling on total concurrent commitment across all teams (§4). */
  capacityPct: number;
  active: boolean;
}

export interface Membership {
  id: string;
  personId: string;
  teamId: string;
  /** The team's claim on the person's full-time capacity (§4). */
  teamFtePct: number;
  active: boolean;
}

/** One person's share of a phase (§6): Allocation % is a plain number, unrounded. */
export interface Allocation {
  id: string;
  personId: string;
  allocationPct: number;
}

/**
 * A priced cost that is not people time (§4, §6): the full amount in one month of the phase, or an equal share in
 * every month of its period. `month` (`YYYY-MM`) is kept while the timing is `spread`, so switching back restores it.
 */
export interface CostItem {
  id: string;
  label: string;
  amount: number;
  timing: 'month' | 'spread';
  month?: string;
}

/** A costed phase's plan (§6 "Phase data"). Dates are ISO `YYYY-MM-DD`; either may be unset while planning. */
export interface PhasePlan {
  startDate?: string;
  endDate?: string;
  allocations: Allocation[];
  /** Absent until the first item is added, so files written before cost items existed need no migration. */
  costItems?: CostItem[];
}

export interface Initiative {
  id: string;
  name: string;
  description?: string;
  ownerId?: string;
  teamId: string;
  status: InitiativeStatus;
  /** Per costed phase, keyed by the process's phase id. Absent until the phase is first planned. */
  phases?: Record<string, PhasePlan>;
  /** Set while the phase periods are the tool's suggestion (§5.11); the first user edit to the plan clears it (§8.2 "untouched"). */
  defaultPlan?: true;
}

export interface Role {
  id: string;
  name: string;
  abbreviation: string;
  costFactor: number;
  active: boolean;
}

export interface CountryYearRateRecord {
  year: number;
  dayRate: number;
  workingDaysByMonth: number[];
}

export interface Country {
  id: string;
  name: string;
  active: boolean;
  ratesByYear: CountryYearRateRecord[];
}

/** File paths on the data branch (§10.2): one master file per kind, one file per initiative. */
export const FILE_PATHS = {
  datasetFlags: 'dataset.json',
  roles: 'roles.json',
  countries: 'countries.json',
  teams: 'teams.json',
  people: 'people.json',
  memberships: 'memberships.json',
  initiative: (id: string) => `initiatives/${id}.json`,
} as const;

export const SCHEMA_VERSION = 1;
