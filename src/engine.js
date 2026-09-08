/**
 * Calculation engine: calendar maths, rate resolution, cost, approval-track
 * resolution, capacity, and the stage progression.
 *
 * Every function here is pure and the module has **no side effects on
 * import** — no DOM, no `window`, nothing read at module scope — so it can be
 * imported directly under `node:test` without a browser (AGENTS.md).
 */

/* ------------------------------------------------------------------ *
 * Months and years
 * ------------------------------------------------------------------ */

/** @param {Date} date @returns {string} `YYYY-MM` */
export function monthKey(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** @param {string} key `YYYY-MM` @returns {{ year: number, month: number }} month is 0-based */
export function parseMonthKey(key) {
  const [year, month] = key.split('-').map(Number);
  return { year, month: month - 1 };
}

/** @param {string} iso `YYYY-MM-DD` @returns {Date} */
export function parseDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/**
 * Every month key from `start` to `end` inclusive, in order.
 * @param {string} startIso @param {string} endIso @returns {string[]}
 */
export function monthsInRange(startIso, endIso) {
  const start = parseDate(startIso);
  const end = parseDate(endIso);
  if (end < start) return [];

  const keys = [];
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  const last = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));
  while (cursor <= last) {
    keys.push(monthKey(cursor));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return keys;
}

/**
 * Read a per-year record, clamping to the nearest tracked year rather than
 * falling back to zero (DESIGN.md §2). Applies to country `byYear` and to a
 * person's `customRole.byYear` alike.
 *
 * @template T
 * @param {Record<string|number, T>} byYear
 * @param {number} year
 * @returns {T}
 */
export function yearRecord(byYear, year) {
  const tracked = Object.keys(byYear).map(Number).sort((a, b) => a - b);
  if (tracked.length === 0) throw new Error('per-year record is empty');
  if (byYear[year] !== undefined) return byYear[year];
  const nearest = year < tracked[0] ? tracked[0] : tracked[tracked.length - 1];
  return byYear[nearest];
}

/* ------------------------------------------------------------------ *
 * Working days
 * ------------------------------------------------------------------ */

/** Weekdays (Mon–Fri) in a calendar month. @param {number} year @param {number} month 0-based */
export function weekdaysInMonth(year, month) {
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  let count = 0;
  for (let day = 1; day <= days; day += 1) {
    const weekday = new Date(Date.UTC(year, month, day)).getUTCDay();
    if (weekday !== 0 && weekday !== 6) count += 1;
  }
  return count;
}

/**
 * Working days in a whole month: weekdays minus that country's reduction for
 * that month, in that month's own year.
 * @param {object} country @param {string} monthKeyStr `YYYY-MM`
 */
export function workingDaysInMonth(country, monthKeyStr) {
  const { year, month } = parseMonthKey(monthKeyStr);
  const record = yearRecord(country.byYear, year);
  const reduction = record.workingDayReduction[month] ?? 0;
  return Math.max(0, weekdaysInMonth(year, month) - reduction);
}

/** Weekdays between two dates inclusive. @param {Date} from @param {Date} to */
function weekdaysBetween(from, to) {
  let count = 0;
  const cursor = new Date(from.getTime());
  while (cursor <= to) {
    const weekday = cursor.getUTCDay();
    if (weekday !== 0 && weekday !== 6) count += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return count;
}

/**
 * Working days per month across a period. The first and last months are
 * prorated by the share of weekdays actually covered; whole months use the
 * full working-day value (SPEC §5.1).
 *
 * @param {object} country @param {string} startIso @param {string} endIso
 * @returns {Record<string, number>} month key -> working days
 */
export function workingDaysForPeriod(country, startIso, endIso) {
  if (!startIso || !endIso) return {};
  const start = parseDate(startIso);
  const end = parseDate(endIso);

  /** @type {Record<string, number>} */
  const out = {};
  for (const key of monthsInRange(startIso, endIso)) {
    const { year, month } = parseMonthKey(key);
    const monthStart = new Date(Date.UTC(year, month, 1));
    const monthEnd = new Date(Date.UTC(year, month + 1, 0));

    const whole = workingDaysInMonth(country, key);
    const totalWeekdays = weekdaysInMonth(year, month);
    const covered = weekdaysBetween(
      start > monthStart ? start : monthStart,
      end < monthEnd ? end : monthEnd,
    );

    out[key] = totalWeekdays === 0 ? 0 : whole * (covered / totalWeekdays);
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Rate resolution
 * ------------------------------------------------------------------ */

/**
 * The single place a person's rate and factor are derived (DESIGN.md §2).
 * A custom rate is absolute: it replaces the country rate and bypasses the
 * role factor. Working days still come from the person's country either way.
 *
 * @param {object} person @param {object} roles @param {object} countries
 * @param {number} year
 * @returns {{ dayRate: number, factor: number }}
 */
export function resolveRate(person, roles, countries, year) {
  if (person.customRole) {
    return { dayRate: yearRecord(person.customRole.byYear, year), factor: 1 };
  }
  const country = countries[person.countryId];
  if (!country) throw new Error(`person ${person.id} has no country`);
  const role = roles[person.roleId];
  if (!role) throw new Error(`person ${person.id} has neither a role nor a custom role`);
  return { dayRate: yearRecord(country.byYear, year).rate, factor: role.factor };
}

/** The label shown for a person's role, custom or standard. */
export function roleLabel(person, roles) {
  return person.customRole ? person.customRole.label : roles[person.roleId]?.name ?? '';
}

/* ------------------------------------------------------------------ *
 * Phase cost
 * ------------------------------------------------------------------ */

/** Sum the values of a month-keyed map. @param {Record<string, number>} map */
function sum(map) {
  return Object.values(map).reduce((total, value) => total + value, 0);
}

/** Add `amount` to `map[key]`. @param {Record<string, number>} map */
function add(map, key, amount) {
  map[key] = (map[key] ?? 0) + amount;
}

/**
 * Labour cost per month across a phase's *estimated* period.
 * @param {object} phase @param {object} app
 * @returns {Record<string, number>}
 */
export function phaseLabourByMonth(phase, app) {
  /** @type {Record<string, number>} */
  const out = {};
  for (const allocation of phase.allocations ?? []) {
    const person = app.PEOPLE[allocation.personId];
    if (!person) continue;
    const country = app.COUNTRIES[person.countryId];
    const days = workingDaysForPeriod(country, phase.estStartDate, phase.estEndDate);

    for (const [key, workingDays] of Object.entries(days)) {
      const { year } = parseMonthKey(key);
      const { dayRate, factor } = resolveRate(person, app.ROLES, app.COUNTRIES, year);
      const personDays = workingDays * (allocation.allocationPct / 100) * factor;
      add(out, key, personDays * dayRate);
    }
  }
  return out;
}

/**
 * Non-labour cost items per month. An item counts even when its month falls
 * outside the phase's period — it is flagged out-of-period, never dropped
 * (SPEC §5.3), which is why it also joins the month set below.
 * @param {object} phase @returns {Record<string, number>}
 */
export function phaseOtherByMonth(phase) {
  /** @type {Record<string, number>} */
  const out = {};
  for (const item of phase.otherCosts ?? []) add(out, item.month, item.amount);
  return out;
}

/** Estimated cost per month: labour plus cost items. */
export function phaseEstimateByMonth(phase, app) {
  const out = { ...phaseLabourByMonth(phase, app) };
  for (const [key, amount] of Object.entries(phaseOtherByMonth(phase))) add(out, key, amount);
  return out;
}

/**
 * Every month a phase costs something in. Wider than the estimate period: an
 * actual period, a recorded actual, or an out-of-period cost item all extend
 * it, or overrun money silently vanishes from monthly views (SPEC §5.4).
 * @param {object} phase @returns {string[]} sorted
 */
export function phaseMonths(phase) {
  const keys = new Set();
  if (phase.estStartDate && phase.estEndDate) {
    for (const key of monthsInRange(phase.estStartDate, phase.estEndDate)) keys.add(key);
  }
  if (phase.actualStartDate && phase.actualEndDate) {
    for (const key of monthsInRange(phase.actualStartDate, phase.actualEndDate)) keys.add(key);
  }
  for (const key of Object.keys(phase.actualMonths ?? {})) keys.add(key);
  for (const item of phase.otherCosts ?? []) keys.add(item.month);
  return [...keys].sort();
}

/**
 * Blended cost per month: the recorded actual where there is one, the
 * estimate otherwise (SPEC §5.4). Monthly views always show this.
 */
export function phaseBlendedByMonth(phase, app) {
  const estimate = phase.frozen ? phase.frozen.perMonth : phaseEstimateByMonth(phase, app);
  const actuals = phase.actualMonths ?? {};
  /** @type {Record<string, number>} */
  const out = {};
  for (const key of phaseMonths(phase)) {
    out[key] = actuals[key] ?? estimate[key] ?? 0;
  }
  return out;
}

/** A phase's frozen estimate wins once its gate is passed (SPEC §6). */
export function phaseEstimateTotal(phase, app) {
  if (phase.frozen) return phase.frozen.estimatedPhaseCost;
  return sum(phaseEstimateByMonth(phase, app));
}

export function phaseBlendedTotal(phase, app) {
  return sum(phaseBlendedByMonth(phase, app));
}

/**
 * Estimate / Forecast / Actual, by how far actuals cover the costed months.
 * @returns {'estimate'|'forecast'|'actual'}
 */
export function phaseCoverage(phase) {
  const months = phaseMonths(phase);
  const actuals = phase.actualMonths ?? {};
  const recorded = months.filter((key) => actuals[key] !== undefined).length;
  if (recorded === 0) return 'estimate';
  return recorded === months.length ? 'actual' : 'forecast';
}

/** The blended grand total across both costed phases. */
export function grandTotal(initiative, app) {
  return (
    phaseBlendedTotal(initiative.validation, app) +
    phaseBlendedTotal(initiative.development, app)
  );
}

/** Coverage across both phases combined. @returns {'estimate'|'forecast'|'actual'} */
export function initiativeCoverage(initiative) {
  const phases = [initiative.validation, initiative.development];
  const labels = phases.map(phaseCoverage);
  if (labels.every((label) => label === 'actual')) return 'actual';
  if (labels.every((label) => label === 'estimate')) return 'estimate';
  return 'forecast';
}

/* ------------------------------------------------------------------ *
 * Approval tracks
 * ------------------------------------------------------------------ */

/**
 * Match a total against the configured bands, lower-inclusive and
 * upper-exclusive. A total no band covers — a gap, or below the lowest bound
 * — resolves to `null`, meaning "Not yet known". It is never rounded to the
 * nearest band (SPEC §5.5).
 * @returns {object|null}
 */
export function resolveBand(bands, total) {
  for (const band of bands) {
    const aboveLower = total >= band.lower;
    const belowUpper = band.upper === null || band.upper === undefined || total < band.upper;
    if (aboveLower && belowUpper) return band;
  }
  return null;
}

/**
 * Compare a live band against the one snapshotted at a gate. Severity alone
 * decides, so this survives a band being renamed, re-bounded or deleted.
 * @returns {'escalation'|'de-escalation'|'unchanged'|'unknown'}
 */
export function compareBands(snapshot, live) {
  if (!snapshot || !live) return 'unknown';
  if (live.severity > snapshot.severity) return 'escalation';
  if (live.severity < snapshot.severity) return 'de-escalation';
  return 'unchanged';
}

/** Gaps and overlaps across the configured range, for the Settings warning. */
export function bandCoverageIssues(bands) {
  const sorted = [...bands].sort((a, b) => a.lower - b.lower);
  const issues = [];
  const unbounded = sorted.filter((band) => band.upper === null || band.upper === undefined);
  if (unbounded.length > 1) {
    issues.push({ type: 'overlap', message: 'more than one band has no upper limit' });
  }
  for (let i = 0; i < sorted.length - 1; i += 1) {
    const current = sorted[i];
    const next = sorted[i + 1];
    if (current.upper === null || current.upper === undefined) {
      issues.push({ type: 'overlap', bands: [current.id, next.id] });
    } else if (current.upper < next.lower) {
      issues.push({ type: 'gap', from: current.upper, to: next.lower });
    } else if (current.upper > next.lower) {
      issues.push({ type: 'overlap', bands: [current.id, next.id] });
    }
  }
  return issues;
}

/* ------------------------------------------------------------------ *
 * Capacity
 * ------------------------------------------------------------------ */

/** A person's active membership in one team, if any. */
export function membership(person, teamId) {
  return (person.memberships ?? []).find((m) => m.teamId === teamId && m.active) ?? null;
}

/** A person's total share across active memberships. */
export function totalSharePct(person) {
  return (person.memberships ?? [])
    .filter((m) => m.active)
    .reduce((total, m) => total + m.sharePct, 0);
}

/** Initiatives that count toward capacity: active only (SPEC §3). */
function capacityInitiatives(app, teamId) {
  return app.INITIATIVES.filter(
    (initiative) =>
      initiative.state === 'active' && (teamId === undefined || initiative.teamId === teamId),
  );
}

/**
 * What a person is allocated in one month, broken down by initiative.
 * @param {object} app @param {string} personId @param {string} monthKeyStr
 * @param {string} [teamId] restrict to one team's initiatives
 * @returns {Array<{ initiativeId: string, teamId: string, phase: string, allocationPct: number }>}
 */
export function allocationBreakdown(app, personId, monthKeyStr, teamId) {
  const rows = [];
  for (const initiative of capacityInitiatives(app, teamId)) {
    for (const phaseId of ['validation', 'development']) {
      const phase = initiative[phaseId];
      if (!phaseMonths(phase).includes(monthKeyStr)) continue;
      for (const allocation of phase.allocations ?? []) {
        if (allocation.personId !== personId || allocation.allocationPct <= 0) continue;
        rows.push({
          initiativeId: initiative.id,
          teamId: initiative.teamId,
          phase: phaseId,
          allocationPct: allocation.allocationPct,
        });
      }
    }
  }
  return rows;
}

/** Total allocation percentage for a person in a month, optionally per team. */
export function allocatedPct(app, personId, monthKeyStr, teamId) {
  return allocationBreakdown(app, personId, monthKeyStr, teamId).reduce(
    (total, row) => total + row.allocationPct,
    0,
  );
}

/**
 * The share a team holds of a person but hasn't allocated. Costed at the same
 * rate and shown as ongoing work, not idle time (SPEC §7.2).
 *
 * Each team draws only on its own share, which is exactly what stops a person
 * split across teams being counted twice.
 */
export function nonInitiativeWorkPct(app, personId, teamId, monthKeyStr) {
  const person = app.PEOPLE[personId];
  const member = membership(person, teamId);
  if (!member) return 0;
  return Math.max(0, member.sharePct - allocatedPct(app, personId, monthKeyStr, teamId));
}

/**
 * Both ceilings, neither of which ever blocks (SPEC §5.2).
 * @returns {{ overTeamShare: boolean, overCapacity: boolean, allocatedPct: number, sharePct: number }}
 */
export function capacityWarnings(app, personId, teamId, monthKeyStr) {
  const person = app.PEOPLE[personId];
  const member = membership(person, teamId);
  const inTeam = allocatedPct(app, personId, monthKeyStr, teamId);
  const overall = allocatedPct(app, personId, monthKeyStr);
  return {
    allocatedPct: inTeam,
    sharePct: member ? member.sharePct : 0,
    overTeamShare: member ? inTeam > member.sharePct : inTeam > 0,
    overCapacity: overall > person.capacityPct,
  };
}

/** Utilisation for the People overview: allocated against capacity, one month. */
export function utilisationPct(app, personId, monthKeyStr) {
  const person = app.PEOPLE[personId];
  if (!person.capacityPct) return 0;
  return (allocatedPct(app, personId, monthKeyStr) / person.capacityPct) * 100;
}

/* ------------------------------------------------------------------ *
 * Stage progression
 * ------------------------------------------------------------------ */

/** Stage ids that are schema rather than user data (DESIGN.md §2). */
export const DRAFT = 'draft';
export const VALIDATION = 'validation';
export const DEVELOPMENT = 'development';
export const CLOSED = 'closed';
export const COSTED_PHASES = Object.freeze([VALIDATION, DEVELOPMENT]);

/** The configured progression, in order. @returns {string[]} */
export function stageOrder(process) {
  return [
    DRAFT,
    VALIDATION,
    DEVELOPMENT,
    ...process.stages.map((stage) => stage.id),
    CLOSED,
  ];
}

/** Whether a stage carries cost and capacity. */
export function isCostedPhase(stageId) {
  return COSTED_PHASES.includes(stageId);
}

/**
 * A stage's display label. Never render a stage id, and never compare label
 * text — ordering always comes from `stageOrder` (DESIGN.md §2).
 */
export function stageTerm(process, stageId) {
  if (process[stageId]?.label) return process[stageId].label;
  const stage = process.stages.find((candidate) => candidate.id === stageId);
  if (!stage) throw new Error(`unknown stage: ${stageId}`);
  return stage.label;
}

/** A costed phase's gate label. */
export function gateTerm(process, phaseId) {
  if (!isCostedPhase(phaseId)) throw new Error(`${phaseId} has no gate`);
  return process[phaseId].gateLabel;
}

/** The stage after `stageId`, or null at the end of the progression. */
export function nextStage(process, stageId) {
  const order = stageOrder(process);
  const index = order.indexOf(stageId);
  if (index === -1) throw new Error(`unknown stage: ${stageId}`);
  return order[index + 1] ?? null;
}

/** The stage before `stageId`, or null at the start. */
export function previousStage(process, stageId) {
  const order = stageOrder(process);
  const index = order.indexOf(stageId);
  if (index === -1) throw new Error(`unknown stage: ${stageId}`);
  return index === 0 ? null : order[index - 1];
}
