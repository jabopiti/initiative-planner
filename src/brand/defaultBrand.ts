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
    surfacePage: { light: '#F7FAF9', dark: '#0E1512' },
    surfaceCard: { light: '#FFFFFF', dark: '#16211C' },
    surfaceSubtle: { light: '#EEF4F1', dark: '#182620' },

    textPrimary: { light: '#14201B', dark: '#EAF3EE' },
    textSecondary: { light: '#5B6B64', dark: '#9FB0A8' },
    textMuted: { light: '#7C8B83', dark: '#6E8079' },
    textOnAccent: { light: '#FFFFFF', dark: '#0E1512' },

    borderDefault: { light: '#DCE6E1', dark: '#24322B' },
    borderStrong: { light: '#B9C7C0', dark: '#3A4B41' },

    accent: { light: '#075E46', dark: '#2FD9A6' },
    accentTint: { light: '#E8FFF2', dark: '#12291F' },
    accentText: { light: '#075E46', dark: '#2FD9A6' },

    warning: { light: '#B45309', dark: '#FBBF24' },
    warningTint: { light: '#FDF0DC', dark: '#2E2410' },
    warningText: { light: '#B45309', dark: '#FBBF24' },

    alarm: { light: '#DC2626', dark: '#F87171' },
    alarmTint: { light: '#FCE4E4', dark: '#2E1616' },
    alarmText: { light: '#DC2626', dark: '#F87171' },

    met: { light: '#16A34A', dark: '#4ADE80' },
    metTint: { light: '#E7F7ED', dark: '#16291D' },
    metText: { light: '#16A34A', dark: '#4ADE80' },

    focusRing: { light: '#075E46', dark: '#2FD9A6' },
  },
};
