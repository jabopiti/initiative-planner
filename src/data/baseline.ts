import type { BrandPack } from '../brand/types';
import { newId } from './ids';
import { SCHEMA_VERSION, type Country, type DatasetFlags, type Role } from './types';

/**
 * The fresh-install baseline (§2, §3 "First-time join"): placeholder roles
 * and countries from the brand pack, dataset flags, and nothing else —
 * people, teams and initiatives start empty. Built once, by the first
 * write-capable client that finds no dataset in the repository.
 */
export interface BaselineDataset {
  datasetFlags: DatasetFlags;
  roles: Role[];
  countries: Country[];
  teams: [];
  people: [];
  memberships: [];
}

export function buildBaselineDataset(brand: BrandPack): BaselineDataset {
  const datasetFlags: DatasetFlags = {
    schemaVersion: SCHEMA_VERSION,
    processIdentity: brand.processIdentity,
    ratesReviewed: false,
  };

  const roles: Role[] = brand.freshInstallBaseline.roles.map((role) => ({
    id: newId(),
    name: role.name,
    abbreviation: role.abbreviation,
    costFactor: role.costFactor,
    active: true,
  }));

  const countries: Country[] = brand.freshInstallBaseline.countries.map((country) => ({
    id: newId(),
    name: country.name,
    active: true,
    ratesByYear: country.ratesByYear.map((r) => ({
      year: r.year,
      dayRate: r.dayRate,
      workingDaysByMonth: [...r.workingDaysByMonth],
    })),
  }));

  return { datasetFlags, roles, countries, teams: [], people: [], memberships: [] };
}
