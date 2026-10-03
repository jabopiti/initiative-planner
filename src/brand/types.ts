/**
 * Brand pack shape (spec §2). Only the fields the built slices read are
 * modelled here — anything else can be added when something reads it.
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

/** The fixed set of Lucide icons a brand pack picks a phase's icon from (§9.10). */
export type PhaseIconName = 'search' | 'clipboard-check' | 'hammer' | 'rocket';

export interface PhaseDef {
  id: string;
  label: string;
  /** Shown beside the label in the process view (§5.9). */
  icon: PhaseIconName;
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
  /** Form-control outlines (fields, selects, checkboxes); held to 3:1 on page and card (§9.5). */
  borderInput: ColourRole;
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

/** One font file in the brand folder, with the characters it covers (served with the build, never fetched elsewhere, §2). */
export interface FontFile {
  /** Relative to the brand folder, e.g. `fonts/geist-latin-wght-normal.woff2`. */
  path: string;
  unicodeRange: string;
  /** The weights this file covers: a range for a variable font (the default, `100 900`) or one weight for a static one. */
  weight?: string;
  /** `normal` (the default) or `italic`. */
  style?: 'normal' | 'italic';
}

/** The brand pack's typeface (§2, §9.8): woff2 files that live in the brand folder, and a fallback stack. */
export interface Typeface {
  family: string;
  files: FontFile[];
  fallback: string;
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

/**
 * The example dataset (§2, §5.9): plain data, loaded from the Danger zone into an empty dataset. Entities refer to
 * each other by `key`, people to roles by abbreviation and to countries by name; months are offsets from the month
 * it is loaded in, so it never goes stale. A phase runs from the first day of `fromMonth` to the last of `toMonth`.
 */
export interface ExampleDataset {
  teams: { key: string; name: string }[];
  people: { key: string; name: string; role: string; country: string; team: string }[];
  initiatives: {
    name: string;
    description: string;
    owner?: string;
    team: string;
    /** Per costed phase id; absent while nothing is planned. */
    phases?: Record<string, { fromMonth: number; toMonth: number; allocations: { person: string; pct: number }[] }>;
    /** Gates passed at load, in process order, each by the phase it exits, on the first day of `month`. */
    passedGates: { phase: string; month: number }[];
  }[];
}

export interface BrandPack {
  productName: string;
  currencySymbol: string;
  process: PhaseDef[];
  approvalTracks: ApprovalTrackDef[];
  processIdentity: ProcessIdentity;
  github: GithubLocation;
  colours: BrandColours;
  /** Six categorical team colours (§2, §9.8); a team takes the one at its position in the teams file, wrapping after six. */
  teamColours: ColourRole[];
  typeface: Typeface;
  freshInstallBaseline: {
    roles: RoleBaseline[];
    countries: CountryBaseline[];
  };
  exampleDataset: ExampleDataset;
}
