/**
 * BRAND PACK — contract version 2
 *
 * The compiled-in process: which phases exist, which of them carry cost,
 * what each gate requires, and the approval tracks. This is **governance the
 * end user cannot change** (SPEC §2) — unlike `masterData.js`, which is only
 * a starting point they edit freely afterwards. Never seed one from the
 * other.
 *
 * A downstream brand build replaces this file wholesale. Bump the contract
 * version when the *shape* changes.
 *
 * `id` and `version` identify the process. Phase, gate and checklist **ids
 * end up in stored data**, so changing one is a breaking change and must
 * come with a `version` bump; changing a `label` is free.
 *
 * v2 (§4.8): added `wordmark` — the app's own name, read once at boot and
 * written into the shell. It belongs here, not as a literal in `app.js`:
 * it is build-fixed identity, the same kind of thing `currency` already is,
 * and a brand build free to pick its own has nowhere else agnostic code
 * could source it from.
 *
 * `adminPassword` (SPEC §2, DESIGN §4): gates edits to General, Roles and
 * Countries & rates. A hardcoded constant, not user-set and with no
 * first-run prompt — changing it means rebuilding, same as any other value
 * on this page. Explicitly a soft deterrent against casual or accidental
 * changes on a shared device, never real access control: a client-side
 * password in an offline, single-file app cannot be more than that.
 *
 * Everything here is fictional placeholder content, shaped to exercise the
 * model rather than to look tidy: four phases, only two of them costed, a
 * mix of skippable and mandatory gates, and checklists on some gates but not
 * all.
 */

export const PROCESS = {
  id: 'placeholder-process',
  version: 1,
  currency: '€',
  wordmark: 'Initiative Planner',
  adminPassword: 'admin',

  phases: [
    {
      id: 'discovery',
      label: 'Discovery',
      costed: false,
      gate: {
        id: 'gate_discovery',
        label: 'Discovery review',
        requiresEstimates: false,
        skippable: true,
        checklist: [
          {
            id: 'chk_problem',
            name: 'Problem statement agreed',
            description: 'The problem is written down and the sponsor agrees it is worth solving.',
          },
        ],
      },
    },
    {
      id: 'validation',
      label: 'Validation',
      costed: true,
      gate: {
        id: 'gate_validation',
        label: 'Gate 1',
        requiresEstimates: true,
        skippable: false,
        checklist: [
          {
            id: 'chk_scope',
            name: 'Scope agreed',
            description: 'What is in and out of scope is written down and agreed with the sponsor.',
          },
          {
            id: 'chk_risk',
            name: 'Risks assessed',
            description: 'Delivery and compliance risks are identified, with an owner for each.',
          },
        ],
      },
    },
    {
      id: 'development',
      label: 'Development',
      costed: true,
      gate: {
        id: 'gate_development',
        label: 'Gate 2',
        requiresEstimates: true,
        skippable: false,
        checklist: [
          {
            id: 'chk_ready',
            name: 'Ready to release',
            description: 'The work is complete, tested, and the receiving team has accepted it.',
          },
        ],
      },
    },
    {
      id: 'rollout',
      label: 'Rollout',
      costed: false,
      gate: {
        id: 'gate_rollout',
        label: 'Closure review',
        requiresEstimates: false,
        skippable: true,
        checklist: [
          {
            id: 'chk_benefits',
            name: 'Benefits recorded',
            description: 'The outcome is recorded against what the initiative set out to achieve.',
          },
        ],
      },
    },
  ],

  // Severity is an integer rank ordered independently of the bounds
  // (SPEC §5.5) — a cheap band can still demand heavy approval.
  bands: [
    {
      id: 'band_light',
      name: 'Light touch',
      abbr: 'LT',
      lower: 0,
      upper: 50000,
      req: 'Team lead sign-off.',
      severity: 1,
    },
    {
      id: 'band_standard',
      name: 'Standard',
      abbr: 'STD',
      lower: 50000,
      upper: 250000,
      req: 'Department head sign-off.',
      severity: 2,
    },
    {
      id: 'band_major',
      name: 'Major',
      abbr: 'MAJ',
      lower: 250000,
      upper: null,
      req: 'Board approval and a written business case.',
      severity: 3,
    },
  ],

  // C9: common other-cost items — an org-standard category list the
  // suggestion chips draw on alongside dataset-derived names. Name only;
  // the amount is a typical default the user can adjust. A brand build
  // may replace this list wholesale.
  commonOtherCosts: [
    { name: 'Licences', amount: 5000 },
    { name: 'External review', amount: 3000 },
    { name: 'Training', amount: 2000 },
  ],
};
