import exampleDataset from './exampleDataset.json';
import type { BrandPack, CountryYearRates } from '../src/brand/types';

/**
 * The brand pack for this deployment (jabopiti/initiative-planner). Values
 * are taken from backlog/example-data.md, the reference data confirmed for
 * building and demoing slices 002-011.
 *
 * The colour roles, team colours and typeface are the single source for the
 * app's CSS (§2, §9.1): brandColoursPlugin generates the stylesheet from them
 * and fails the build when a pair misses the contrast rule (§9.5,
 * src/brand/contrast.ts) or a font file is missing.
 */

const germanyRates: CountryYearRates[] = [
  { year: 2026, dayRate: 1000, workingDaysByMonth: [21, 20, 22, 20, 18, 22, 23, 21, 22, 22, 21, 22] },
  { year: 2027, dayRate: 1000, workingDaysByMonth: [20, 20, 21, 22, 19, 22, 22, 22, 22, 21, 22, 23] },
  { year: 2028, dayRate: 1000, workingDaysByMonth: [21, 21, 23, 18, 21, 21, 21, 23, 21, 20, 22, 19] },
];

const spainRates: CountryYearRates[] = [
  { year: 2026, dayRate: 800, workingDaysByMonth: [20, 20, 21, 20, 19, 22, 23, 21, 22, 21, 19, 20] },
  { year: 2027, dayRate: 800, workingDaysByMonth: [19, 20, 20, 22, 21, 22, 22, 22, 22, 20, 20, 21] },
  { year: 2028, dayRate: 800, workingDaysByMonth: [20, 21, 23, 18, 20, 22, 21, 22, 21, 21, 20, 18] },
];

export const defaultBrandPack: BrandPack = {
  productName: 'Initiative Planner',
  currencySymbol: '€',

  processIdentity: {
    id: 'initiative-planner-core',
    structureVersion: 1,
  },

  github: {
    apiBaseUrl: 'https://api.github.com',
    owner: 'jabopiti',
    repo: 'initiative-planner',
    appBranch: 'main',
    dataBranch: 'data',
  },

  process: [
    {
      id: 'discovery',
      icon: 'search',
      label: 'Discovery',
      description: 'Explore the problem before committing to a plan.',
      costed: false,
      exitGate: {
        id: 'g1',
        label: 'G1',
        description: 'Discovery exit gate.',
        requiresEstimates: false,
        skippable: true,
        checklistItems: [
          { id: 'g1-problem-statement', name: 'Problem statement validated', description: 'Problem written down and agreed.' },
          { id: 'g1-stakeholders-aligned', name: 'Stakeholders aligned', description: 'Backers have seen the problem and goal.' },
        ],
      },
    },
    {
      id: 'validation',
      icon: 'clipboard-check',
      label: 'Validation',
      description: 'Validate the approach and build the business case.',
      costed: true,
      defaultDurationMonths: 3,
      exitGate: {
        id: 'g2',
        label: 'G2',
        description: 'Validation exit gate.',
        requiresEstimates: true,
        skippable: true,
        checklistItems: [
          { id: 'g2-business-case', name: 'Business case approved', description: 'Costs, benefits and return signed off.' },
          { id: 'g2-cost-estimate', name: 'Cost estimate reviewed', description: 'Estimate reviewed by someone else.' },
          { id: 'g2-technical-feasibility', name: 'Technical feasibility confirmed', description: 'Approach confirmed buildable by the team.' },
        ],
      },
    },
    {
      id: 'development',
      icon: 'hammer',
      label: 'Development',
      description: 'Build the initiative.',
      costed: true,
      defaultDurationMonths: 6,
      exitGate: {
        id: 'g3',
        label: 'G3',
        description: 'Development exit gate.',
        requiresEstimates: true,
        skippable: false,
        checklistItems: [
          { id: 'g3-acceptance-testing', name: 'Acceptance testing passed', description: 'Agreed acceptance tests have passed.' },
          { id: 'g3-security-review', name: 'Security review completed', description: 'Findings resolved or accepted.' },
          { id: 'g3-rollout-plan', name: 'Rollout plan approved', description: 'Steps, owners and a way back agreed.' },
        ],
      },
    },
    {
      id: 'rollout',
      icon: 'rocket',
      label: 'Rollout',
      description: 'Release and close out the initiative.',
      costed: false,
      exitGate: {
        id: 'g4',
        label: 'G4',
        description: 'Rollout exit gate — closes the initiative.',
        requiresEstimates: false,
        skippable: false,
        checklistItems: [
          { id: 'g4-hypercare', name: 'Hypercare period completed', description: 'Support period over, no critical issues.' },
          { id: 'g4-lessons-learned', name: 'Lessons learned documented', description: 'Lessons written down for the next time.' },
        ],
      },
    },
  ],

  approvalTracks: [
    {
      id: 'light',
      name: 'Light',
      abbreviation: 'L',
      lowerBound: 0,
      upperBound: 50_000,
      severity: 1,
      requirementText: 'No additional approval required',
    },
    {
      id: 'standard',
      name: 'Standard',
      abbreviation: 'S',
      lowerBound: 50_000,
      upperBound: 200_000,
      severity: 2,
      requirementText: 'Requires department head approval',
    },
    {
      id: 'elevated',
      name: 'Elevated',
      abbreviation: 'E',
      lowerBound: 200_000,
      severity: 3,
      requirementText: 'Requires steering committee approval',
    },
  ],

  freshInstallBaseline: {
    roles: [
      { name: 'Product Manager', abbreviation: 'PM', costFactor: 0.8 },
      { name: 'Experience Designer', abbreviation: 'XD', costFactor: 1.0 },
      { name: 'Tech Lead', abbreviation: 'TL', costFactor: 0.8 },
      { name: 'Developer', abbreviation: 'Dev', costFactor: 1.0 },
    ],
    countries: [
      { name: 'Germany', code: 'DE', ratesByYear: germanyRates },
      { name: 'Spain', code: 'ES', ratesByYear: spainRates },
    ],
  },

  exampleDataset,

  colours: {
    // Neutral roles: zinc greys in light, graphite in dark (slice 057), so the accent is the only colour that isn't a state.
    surfacePage: { light: 'oklch(0.975 0.002 286)', dark: 'oklch(0.17 0.004 286)' },
    surfaceCard: { light: 'oklch(1 0 0)', dark: 'oklch(0.212 0.005 286)' },
    surfaceSubtle: { light: 'oklch(0.955 0.003 286)', dark: 'oklch(0.245 0.006 286)' },

    textPrimary: { light: 'oklch(0.21 0.006 286)', dark: 'oklch(0.965 0.002 286)' },
    textSecondary: { light: 'oklch(0.442 0.017 286)', dark: 'oklch(0.765 0.008 286)' },
    textMuted: { light: 'oklch(0.535 0.016 286)', dark: 'oklch(0.68 0.012 286)' },
    textOnAccent: { light: 'oklch(1 0 0)', dark: 'oklch(0.17 0.004 286)' },

    borderDefault: { light: 'oklch(0.92 0.004 286)', dark: 'oklch(0.29 0.006 286)' },
    borderStrong: { light: 'oklch(0.871 0.006 286)', dark: 'oklch(0.37 0.008 286)' },
    borderInput: { light: 'oklch(0.6 0.014 286)', dark: 'oklch(0.54 0.012 286)' },

    accent: { light: 'oklch(0.429 0.085 167.5)', dark: 'oklch(0.79 0.152 167.0)' },
    accentTint: { light: 'oklch(0.98 0.029 161.1)', dark: 'oklch(0.258 0.035 163.9)' },
    accentText: { light: 'oklch(0.429 0.085 167.5)', dark: 'oklch(0.79 0.152 167.0)' },

    warning: { light: 'oklch(0.555 0.146 49.0)', dark: 'oklch(0.837 0.164 84.4)' },
    warningTint: { light: 'oklch(0.960 0.030 78.8)', dark: 'oklch(0.267 0.036 83.4)' },
    warningText: { light: 'oklch(0.547 0.146 49.0)', dark: 'oklch(0.837 0.164 84.4)' },

    alarm: { light: 'oklch(0.577 0.215 27.3)', dark: 'oklch(0.711 0.166 22.2)' },
    alarmTint: { light: 'oklch(0.938 0.026 17.6)', dark: 'oklch(0.234 0.039 20.5)' },
    alarmText: { light: 'oklch(0.543 0.215 27.3)', dark: 'oklch(0.711 0.166 22.2)' },

    met: { light: 'oklch(0.627 0.17 149.2)', dark: 'oklch(0.8 0.182 151.7)' },
    metTint: { light: 'oklch(0.962 0.021 158.6)', dark: 'oklch(0.260 0.034 155.5)' },
    metText: { light: 'oklch(0.513 0.17 149.2)', dark: 'oklch(0.8 0.182 151.7)' },

    focusRing: { light: 'oklch(0.429 0.085 167.5)', dark: 'oklch(0.79 0.152 167.0)' },
  },

  // Violet, blue, teal, magenta, sand, slate: muted, and clear of the Alarm, Warning and Met hues (§9.8).
  teamColours: [
    { light: 'oklch(0.52 0.13 293)', dark: 'oklch(0.72 0.12 293)' },
    { light: 'oklch(0.52 0.12 255)', dark: 'oklch(0.72 0.11 255)' },
    { light: 'oklch(0.53 0.08 205)', dark: 'oklch(0.72 0.08 205)' },
    { light: 'oklch(0.52 0.15 340)', dark: 'oklch(0.72 0.13 340)' },
    { light: 'oklch(0.55 0.07 65)', dark: 'oklch(0.74 0.07 70)' },
    { light: 'oklch(0.5 0.03 265)', dark: 'oklch(0.72 0.03 265)' },
  ],

  // Geist (SIL Open Font License, fonts/OFL.txt), taken from @fontsource-variable/geist 5.3.0.
  typeface: {
    family: 'Geist',
    files: [
      {
        path: 'fonts/geist-latin-ext-wght-normal.woff2',
        unicodeRange:
          'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF',
      },
      {
        path: 'fonts/geist-latin-wght-normal.woff2',
        unicodeRange:
          'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD',
      },
    ],
    fallback: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  },
};
