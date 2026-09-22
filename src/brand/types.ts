/**
 * Brand pack shape (spec §2). Only the fields slice 003 actually reads are
 * modelled here — checklist requirement flags, skip rules and the example
 * dataset belong to later slices and can be added when something reads them.
 */

export interface ChecklistItemDef {
  id: string;
  name: string;
  description: string;
}

export interface GateDef {
  id: string;
  label: string;
  description: string;
  requiresEstimates: boolean;
  skippable: boolean;
  checklistItems: ChecklistItemDef[];
}

export interface PhaseDef {
  id: string;
  label: string;
  description: string;
  costed: boolean;
  /** Default duration in months, for costed phases only (§5.11). */
  defaultDurationMonths?: number;
  exitGate: GateDef;
}

export interface ApprovalTrackDef {
  id: string;
  name: string;
  abbreviation: string;
  /** Lower bound, inclusive, in the deployment's currency. */
  lowerBound: number;
  /** Upper bound, exclusive; undefined means unbounded above. */
  upperBound?: number;
  severity: number;
  requirementText: string;
}

export interface ProcessIdentity {
  id: string;
  structureVersion: number;
}

export interface GithubLocation {
  apiBaseUrl: string;
  owner: string;
  repo: string;
  appBranch: string;
  dataBranch: string;
}

export interface ColourRole {
  light: string;
  dark: string;
}

export interface BrandColours {
  surfacePage: ColourRole;
  surfaceCard: ColourRole;
  surfaceSubtle: ColourRole;
  textPrimary: ColourRole;
  textSecondary: ColourRole;
  textMuted: ColourRole;
  textOnAccent: ColourRole;
  borderDefault: ColourRole;
  borderStrong: ColourRole;
  accent: ColourRole;
  accentTint: ColourRole;
  accentText: ColourRole;
  warning: ColourRole;
  warningTint: ColourRole;
  warningText: ColourRole;
  alarm: ColourRole;
  alarmTint: ColourRole;
  alarmText: ColourRole;
  met: ColourRole;
  metTint: ColourRole;
  metText: ColourRole;
  focusRing: ColourRole;
}

/**
 * Seed values for a baseline Role/Country — no `id` here: per §6, master
 * data ids are UUIDs assigned when the entity is created, which for the
 * fresh-install baseline happens at bootstrap time (src/data/baseline.ts),
 * not fixed by the brand pack itself.
 */
export interface RoleBaseline {
  name: string;
  abbreviation: string;
  costFactor: number;
}

export interface CountryYearRates {
  year: number;
  dayRate: number;
  workingDaysByMonth: [
    number, number, number, number, number, number,
    number, number, number, number, number, number,
  ];
}

export interface CountryBaseline {
  name: string;
  ratesByYear: CountryYearRates[];
}

export interface BrandPack {
  productName: string;
  currencySymbol: string;
  process: PhaseDef[];
  approvalTracks: ApprovalTrackDef[];
  processIdentity: ProcessIdentity;
  github: GithubLocation;
  colours: BrandColours;
  freshInstallBaseline: {
    roles: RoleBaseline[];
    countries: CountryBaseline[];
  };
}
