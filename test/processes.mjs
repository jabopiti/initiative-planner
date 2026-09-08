// Test processes. DESIGN §7 requires the lifecycle to be exercised against
// more than one shape, built here rather than taken from the brand pack —
// anything that assumes two phases, or that every phase is costed, is a bug
// only a differently-shaped process will catch.

/** The simplest thing that can work: two costed phases, no checklists. */
export const SIMPLE = {
  id: 'test-simple',
  version: 1,
  currency: '€',
  phases: [
    {
      id: 'plan',
      label: 'Plan',
      costed: true,
      gate: { id: 'g_plan', label: 'Plan gate', requiresEstimates: true, skippable: false, checklist: [] },
    },
    {
      id: 'build',
      label: 'Build',
      costed: true,
      gate: { id: 'g_build', label: 'Build gate', requiresEstimates: true, skippable: true, checklist: [] },
    },
  ],
  bands: [
    { id: 'b_low', name: 'Low', abbr: 'LO', lower: 0, upper: 100000, req: 'Lead', severity: 1 },
    { id: 'b_high', name: 'High', abbr: 'HI', lower: 100000, upper: null, req: 'Board', severity: 5 },
  ],
};

/** Four phases, only the middle two costed, checklists, mixed skippability. */
export const RICH = {
  id: 'test-rich',
  version: 3,
  currency: '$',
  phases: [
    {
      id: 'discover',
      label: 'Discover',
      costed: false,
      gate: {
        id: 'g_discover',
        label: 'Discovery review',
        requiresEstimates: false,
        skippable: true,
        checklist: [{ id: 'i_problem', name: 'Problem agreed', description: 'x' }],
      },
    },
    {
      id: 'shape',
      label: 'Shape',
      costed: true,
      gate: {
        id: 'g_shape',
        label: 'Shaping gate',
        requiresEstimates: true,
        skippable: false,
        checklist: [
          { id: 'i_scope', name: 'Scope agreed', description: 'x' },
          { id: 'i_risk', name: 'Risks assessed', description: 'x' },
        ],
      },
    },
    {
      id: 'deliver',
      label: 'Deliver',
      costed: true,
      gate: {
        id: 'g_deliver',
        label: 'Delivery gate',
        requiresEstimates: true,
        skippable: false,
        checklist: [],
      },
    },
    {
      id: 'embed',
      label: 'Embed',
      costed: false,
      gate: {
        id: 'g_embed',
        label: 'Closure review',
        requiresEstimates: false,
        skippable: true,
        checklist: [{ id: 'i_benefits', name: 'Benefits recorded', description: 'x' }],
      },
    },
  ],
  bands: [
    { id: 'r_a', name: 'A', abbr: 'A', lower: 0, upper: 10000, req: 'Lead', severity: 1 },
    { id: 'r_b', name: 'B', abbr: 'B', lower: 10000, upper: null, req: 'Exec', severity: 4 },
  ],
};

export const ALL = [SIMPLE, RICH];
