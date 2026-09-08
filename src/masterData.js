/**
 * BRAND PACK — contract version 1
 *
 * The only brand-specific source file in this repository (AGENTS.md). A
 * downstream brand build replaces it wholesale; nothing else should need to
 * change. Bump the contract version whenever the *shape* below changes, so a
 * brand build can detect drift instead of silently seeding stale data.
 *
 * Everything here is fictional placeholder content. The engine must never
 * depend on these concrete values — only on their shape.
 */

/** Years the rolling window covers: last year, this year, the next two. */
export const WINDOW_BEFORE = 1;
export const WINDOW_AFTER = 2;

/**
 * The years currently tracked, oldest first.
 * @param {number} [now] current year, injectable for tests
 * @returns {number[]}
 */
export function trackedYears(now = new Date().getFullYear()) {
  const years = [];
  for (let y = now - WINDOW_BEFORE; y <= now + WINDOW_AFTER; y += 1) years.push(y);
  return years;
}

/**
 * Build a per-year record for every tracked year.
 * @template T
 * @param {number[]} years
 * @param {(year: number, index: number) => T} make
 * @returns {Record<number, T>}
 */
function byYear(years, make) {
  return Object.fromEntries(years.map((year, index) => [year, make(year, index)]));
}

/**
 * Fresh seed data. Returns a newly-constructed object every call — never a
 * shared mutable constant, so repeated seeding (across tests, say) cannot
 * leak mutations between calls.
 *
 * @param {string} [currency]
 * @param {number} [now] current year, injectable for tests
 */
export function createMasterData(currency = '€', now = new Date().getFullYear()) {
  const years = trackedYears(now);

  return {
    GENERAL: { currency, lastExportAt: null, exportReminderDays: 14 },

    // Stage labels are seeded here because they are brand vocabulary, but
    // once seeded they are ordinary user data, editable in Settings. The ids
    // are schema and never change (DESIGN.md §2).
    PROCESS: {
      draft: { label: 'Draft' },
      validation: { label: 'Validation', gateLabel: 'Gate 1' },
      development: { label: 'Development', gateLabel: 'Gate 2' },
      stages: [
        { id: 'stage_rollout', label: 'Rollout' },
        { id: 'stage_benefits', label: 'Benefits Review' },
      ],
      closed: { label: 'Closed' },
    },

    ROLES: {
      role_eng: { id: 'role_eng', name: 'Engineer', abbr: 'ENG', factor: 1.0, active: true },
      role_des: { id: 'role_des', name: 'Designer', abbr: 'DES', factor: 1.0, active: true },
      role_lead: { id: 'role_lead', name: 'Lead', abbr: 'LEAD', factor: 1.25, active: true },
      role_pm: { id: 'role_pm', name: 'Product Manager', abbr: 'PM', factor: 1.1, active: true },
    },

    COUNTRIES: {
      country_north: {
        id: 'country_north',
        name: 'Northland',
        active: true,
        // Rate drifts upward year on year so tests can tell the years apart.
        byYear: byYear(years, (_year, i) => ({
          rate: 600 + i * 25,
          workingDayReduction: [2, 1, 1, 2, 2, 0, 0, 3, 0, 1, 1, 4],
        })),
      },
      country_south: {
        id: 'country_south',
        name: 'Southland',
        active: true,
        byYear: byYear(years, (_year, i) => ({
          rate: 420 + i * 15,
          workingDayReduction: [1, 0, 2, 1, 3, 1, 0, 2, 1, 0, 2, 3],
        })),
      },
    },

    TEAMS: {
      team_platform: { id: 'team_platform', name: 'Platform', active: true },
      team_growth: { id: 'team_growth', name: 'Growth', active: true },
    },

    PEOPLE: {
      // Split across two teams: the case the share model exists for.
      person_ada: {
        id: 'person_ada',
        name: 'Ada Vance',
        active: true,
        countryId: 'country_north',
        capacityPct: 100,
        roleId: 'role_lead',
        customRole: null,
        memberships: [
          { teamId: 'team_platform', sharePct: 60, active: true },
          { teamId: 'team_growth', sharePct: 40, active: true },
        ],
      },
      person_bo: {
        id: 'person_bo',
        name: 'Bo Ferreira',
        active: true,
        countryId: 'country_north',
        capacityPct: 100,
        roleId: 'role_eng',
        customRole: null,
        memberships: [{ teamId: 'team_platform', sharePct: 100, active: true }],
      },
      person_cy: {
        id: 'person_cy',
        name: 'Cy Okafor',
        active: true,
        countryId: 'country_south',
        capacityPct: 80,
        roleId: 'role_des',
        customRole: null,
        memberships: [{ teamId: 'team_growth', sharePct: 80, active: true }],
      },
      // Contractor: an individually negotiated rate, no role factor.
      person_di: {
        id: 'person_di',
        name: 'Di Marchetti',
        active: true,
        countryId: 'country_south',
        capacityPct: 100,
        roleId: null,
        customRole: {
          label: 'Contract Engineer',
          byYear: byYear(years, (_year, i) => 800 + i * 40),
        },
        memberships: [{ teamId: 'team_platform', sharePct: 100, active: true }],
      },
      // On the bench: no membership at all, which is valid (SPEC §3).
      person_el: {
        id: 'person_el',
        name: 'El Nakamura',
        active: true,
        countryId: 'country_north',
        capacityPct: 100,
        roleId: 'role_pm',
        customRole: null,
        memberships: [],
      },
    },

    // Severity is an integer rank ordered independently of the bounds
    // (SPEC §4) — "Fast track" is cheap but deliberately mid-severity.
    BANDS: [
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

    INITIATIVES: [],
  };
}
