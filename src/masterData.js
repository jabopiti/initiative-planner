/**
 * BRAND PACK — contract version 2
 *
 * The only brand-specific source file in this repository (AGENTS.md). A
 * downstream brand build replaces it wholesale; nothing else should need to
 * change. Bump the contract version whenever the *shape* below changes, so a
 * brand build can detect drift instead of silently seeding stale data.
 *
 * v2: `WINDOW_BEFORE`/`WINDOW_AFTER`/`trackedYears()` moved to `engine.js`
 * (D9) — the rolling window is process logic a build recomputes on every
 * load, not seed data a brand build owns. This file now imports
 * `trackedYears` to seed against, rather than defining it.
 *
 * Everything here is fictional placeholder content. The engine must never
 * depend on these concrete values — only on their shape.
 *
 * A country's `byYear[year].workingDays` is an absolute working-day count
 * per month, not a reduction off the calendar (§4.3) — this seed derives it
 * from the real weekday count for that year minus a fixed holiday pattern,
 * so the figures are realistic rather than a round test-friendly number,
 * and so they correctly differ year to year as weekday alignment shifts.
 */
import { weekdaysInMonth, trackedYears } from './engine.js';

/**
 * A rough public-holiday calendar: reduction off each month's weekdays.
 * Germany: Hamburg's 10 statutory holidays (incl. Reformation Day, which
 * only some states observe) — Jan 1; Good Friday + Easter Monday; May 1 +
 * Ascension Day; Whit Monday; Oct 3 + Oct 31; Dec 25 + 26.
 * Spain: Madrid city's 12 statutory holidays — Jan 1 + 6; Good Friday;
 * May 1 + May 2 (Comunidad de Madrid Day); Aug 15; Oct 12; Nov 1 + Nov 9
 * (La Almudena, a municipal holiday); Dec 6 + 8 + 25.
 */
const GERMANY_HOLIDAYS = [1, 0, 0, 2, 2, 1, 0, 0, 0, 2, 0, 2];
const SPAIN_HOLIDAYS = [2, 0, 0, 1, 2, 0, 0, 1, 0, 1, 2, 3];

/** @param {number} year @param {number[]} holidays reduction per month */
function workingDaysByMonth(year, holidays) {
  return holidays.map((reduction, month) => Math.max(0, weekdaysInMonth(year, month) - reduction));
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
 * @param {number} [now] current year, injectable for tests
 */
export function createMasterData(now = new Date().getFullYear()) {
  const years = trackedYears(now);

  return {
    GENERAL: { lastExportAt: null, exportReminderDays: 14 },


    ROLES: {
      role_pm: { id: 'role_pm', name: 'Product Manager', abbr: 'PM', factor: 0.8, active: true },
      role_xd: { id: 'role_xd', name: 'Experience Designer', abbr: 'XD', factor: 1.0, active: true },
      role_tl: { id: 'role_tl', name: 'Tech Lead', abbr: 'TL', factor: 0.8, active: true },
      role_dev: { id: 'role_dev', name: 'Developer', abbr: 'DEV', factor: 1.0, active: true },
    },

    COUNTRIES: {
      country_germany: {
        id: 'country_germany',
        name: 'Germany',
        active: true,
        // Rate drifts upward year on year so tests can tell the years apart.
        byYear: byYear(years, (year, i) => ({
          rate: 1000 + i * 25,
          workingDays: workingDaysByMonth(year, GERMANY_HOLIDAYS),
        })),
      },
      country_spain: {
        id: 'country_spain',
        name: 'Spain',
        active: true,
        byYear: byYear(years, (year, i) => ({
          rate: 800 + i * 15,
          workingDays: workingDaysByMonth(year, SPAIN_HOLIDAYS),
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
        countryId: 'country_germany',
        capacityPct: 100,
        roleId: 'role_tl',
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
        countryId: 'country_germany',
        capacityPct: 100,
        roleId: 'role_dev',
        customRole: null,
        memberships: [{ teamId: 'team_platform', sharePct: 100, active: true }],
      },
      person_cy: {
        id: 'person_cy',
        name: 'Cy Okafor',
        active: true,
        countryId: 'country_spain',
        capacityPct: 80,
        roleId: 'role_xd',
        customRole: null,
        memberships: [{ teamId: 'team_growth', sharePct: 80, active: true }],
      },
      // Contractor: an individually negotiated rate, no role factor.
      person_di: {
        id: 'person_di',
        name: 'Di Marchetti',
        active: true,
        countryId: 'country_spain',
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
        countryId: 'country_germany',
        capacityPct: 100,
        roleId: 'role_pm',
        customRole: null,
        memberships: [],
      },
    },


    INITIATIVES: [],
  };
}
