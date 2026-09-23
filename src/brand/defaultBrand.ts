import type { BrandPack, CountryYearRates } from './types';

/**
 * The brand pack for this deployment (jabopiti/initiative-planner). Values
 * are taken from backlog/example-data.md, the reference data confirmed for
 * building and demoing slices 002-011.
 *
 * Colour roles beyond what example-data.md specified (muted text, borders,
 * tints/text variants for Warning/Alarm/Met, focus ring, text-on-accent)
 * are derived here, not independently confirmed — the automated contrast
 * check called for in §9.5/§10.7 is deferred (not in slice 003's scope) and
 * is the real gate before these ship.
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
          { id: 'g1-problem-statement', name: 'Problem statement validated', description: '' },
          { id: 'g1-stakeholders-aligned', name: 'Stakeholders aligned', description: '' },
        ],
      },
    },
    {
      id: 'validation',
      label: 'Validation',
      description: 'Validate the approach and build the business case.',
      costed: true,
      exitGate: {
        id: 'g2',
        label: 'G2',
        description: 'Validation exit gate.',
        requiresEstimates: true,
        skippable: true,
        checklistItems: [
          { id: 'g2-business-case', name: 'Business case approved', description: '' },
          { id: 'g2-cost-estimate', name: 'Cost estimate reviewed', description: '' },
          { id: 'g2-technical-feasibility', name: 'Technical feasibility confirmed', description: '' },
        ],
      },
    },
    {
      id: 'development',
      label: 'Development',
      description: 'Build the initiative.',
      costed: true,
      exitGate: {
        id: 'g3',
        label: 'G3',
        description: 'Development exit gate.',
        requiresEstimates: true,
        skippable: false,
        checklistItems: [
          { id: 'g3-acceptance-testing', name: 'Acceptance testing passed', description: '' },
          { id: 'g3-security-review', name: 'Security review completed', description: '' },
          { id: 'g3-rollout-plan', name: 'Rollout plan approved', description: '' },
        ],
      },
    },
    {
      id: 'rollout',
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
          { id: 'g4-hypercare', name: 'Hypercare period completed', description: '' },
          { id: 'g4-lessons-learned', name: 'Lessons learned documented', description: '' },
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
      { name: 'Germany', ratesByYear: germanyRates },
      { name: 'Spain', ratesByYear: spainRates },
    ],
  },

  colours: {
    surfacePage: { light: 'oklch(0.983 0.003 174.5)', dark: 'oklch(0.187 0.012 167.0)' },
    surfaceCard: { light: 'oklch(1 0 89.9)', dark: 'oklch(0.235 0.018 165.2)' },
    surfaceSubtle: { light: 'oklch(0.962 0.007 164.9)', dark: 'oklch(0.254 0.022 166.2)' },

    textPrimary: { light: 'oklch(0.23 0.02 167.0)', dark: 'oklch(0.956 0.012 162.0)' },
    textSecondary: { light: 'oklch(0.512 0.022 167.2)', dark: 'oklch(0.742 0.022 165.9)' },
    textMuted: { light: 'oklch(0.622 0.021 162.6)', dark: 'oklch(0.583 0.024 170.1)' },
    textOnAccent: { light: 'oklch(1 0 89.9)', dark: 'oklch(0.187 0.012 167.0)' },

    borderDefault: { light: 'oklch(0.916 0.013 164.8)', dark: 'oklch(0.302 0.023 163.0)' },
    borderStrong: { light: 'oklch(0.817 0.018 164.5)', dark: 'oklch(0.395 0.027 159.1)' },

    accent: { light: 'oklch(0.429 0.085 167.5)', dark: 'oklch(0.79 0.152 167.0)' },
    accentTint: { light: 'oklch(0.98 0.029 161.1)', dark: 'oklch(0.258 0.035 163.9)' },
    accentText: { light: 'oklch(0.429 0.085 167.5)', dark: 'oklch(0.79 0.152 167.0)' },

    warning: { light: 'oklch(0.555 0.146 49.0)', dark: 'oklch(0.837 0.164 84.4)' },
    warningTint: { light: 'oklch(0.960 0.030 78.8)', dark: 'oklch(0.267 0.036 83.4)' },
    warningText: { light: 'oklch(0.555 0.146 49.0)', dark: 'oklch(0.837 0.164 84.4)' },

    alarm: { light: 'oklch(0.577 0.215 27.3)', dark: 'oklch(0.711 0.166 22.2)' },
    alarmTint: { light: 'oklch(0.938 0.026 17.6)', dark: 'oklch(0.234 0.039 20.5)' },
    alarmText: { light: 'oklch(0.577 0.215 27.3)', dark: 'oklch(0.711 0.166 22.2)' },

    met: { light: 'oklch(0.627 0.17 149.2)', dark: 'oklch(0.8 0.182 151.7)' },
    metTint: { light: 'oklch(0.962 0.021 158.6)', dark: 'oklch(0.260 0.034 155.5)' },
    metText: { light: 'oklch(0.627 0.17 149.2)', dark: 'oklch(0.8 0.182 151.7)' },

    focusRing: { light: 'oklch(0.429 0.085 167.5)', dark: 'oklch(0.79 0.152 167.0)' },
  },
};
