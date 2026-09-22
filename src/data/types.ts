/**
 * Dataset shapes (spec §6), scoped to the fields slice 003 reads or writes.
 * Person/Membership are not modelled yet — they belong to slice 004, which
 * adds the People screen. Phase/cost/gate data belongs to slice 005+.
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

export interface Initiative {
  id: string;
  name: string;
  description?: string;
  ownerId?: string;
  teamId: string;
  status: InitiativeStatus;
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
