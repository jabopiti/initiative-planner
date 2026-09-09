/**
 * Calculation engine: calendar maths, rate resolution, cost, approval-track
 * resolution, capacity, and the stage progression.
 *
 * Every function here is pure and the module has **no side effects on
 * import** — no DOM, no `window`, nothing read at module scope — so it can be
 * imported directly under `node:test` without a browser (AGENTS.md).
 */

/* ------------------------------------------------------------------ *
 * Text
 * ------------------------------------------------------------------ */

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/**
 * Escape a value for interpolation into markup. Every user-controlled string
 * goes through this before reaching `innerHTML` (AGENTS.md) — in practice via
 * the `html` tagged template in app.js, which applies it automatically so it
 * cannot be forgotten.
 * @param {unknown} value
 */
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ESCAPES[char]);
}

/** Format a number as currency for display. */
export function formatMoney(amount, currency) {
  const rounded = Math.round(amount ?? 0);
  return `${currency}${rounded.toLocaleString('en-GB')}`;
}

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
/**
 * What one allocation costs, month by month, and the person-days behind it.
 * Both the phase total and the per-row figures on an allocation table are
 * expressed through this, so there is only ever one way the number is
 * derived.
 *
 * @returns {{ byMonth: Record<string, number>, personDays: number, cost: number }}
 */
export function allocationFigures(phase, person, allocationPct, app) {
  const country = app.COUNTRIES[person.countryId];
  const days = workingDaysForPeriod(country, phase.estStartDate, phase.estEndDate);

  /** @type {Record<string, number>} */
  const byMonth = {};
  let personDays = 0;
  let cost = 0;

  for (const [key, workingDays] of Object.entries(days)) {
    const { year } = parseMonthKey(key);
    const { dayRate, factor } = resolveRate(person, app.ROLES, app.COUNTRIES, year);
    const monthDays = workingDays * (allocationPct / 100) * factor;
    personDays += monthDays;
    byMonth[key] = monthDays * dayRate;
    cost += byMonth[key];
  }
  return { byMonth, personDays, cost };
}

export function phaseLabourByMonth(phase, app) {
  /** @type {Record<string, number>} */
  const out = {};
  for (const allocation of phase.allocations ?? []) {
    const person = app.PEOPLE[allocation.personId];
    if (!person) continue;
    const { byMonth } = allocationFigures(phase, person, allocation.allocationPct, app);
    for (const [key, amount] of Object.entries(byMonth)) add(out, key, amount);
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

/**
 * Every month any costed phase of this initiative touches, sorted. Wider than
 * the estimate periods: overrun actuals and out-of-period cost items extend
 * it, and a monthly view that missed them would not sum to the totals beside
 * it (SPEC §5.3, §5.4).
 * @returns {string[]}
 */
export function initiativeMonths(initiative) {
  const months = new Set();
  for (const phase of Object.values(initiative.phases ?? {})) {
    for (const month of phaseMonths(phase)) months.add(month);
  }
  return [...months].sort();
}

/**
 * Where a total sits across the configured bands, as a 0–1 fraction, for the
 * threshold bar. The scale ends a little past the last bound so an unbounded
 * top band has somewhere to be drawn.
 */
export function bandScale(bands) {
  const bounds = bands.flatMap((band) => [band.lower, band.upper]).filter((v) => v !== null);
  const max = Math.max(...bounds, 1);
  return {
    max: max * 1.25,
    fraction: (value) => Math.max(0, Math.min(1, value / (max * 1.25))),
  };
}

/**
 * Costed phase records, in no particular order. Only costed phases have a
 * record, so this needs no knowledge of the process — which is what keeps
 * the cost and capacity functions free of it.
 */
export function costedPhases(initiative) {
  return Object.values(initiative.phases ?? {});
}

/** The blended grand total across every costed phase. */
export function grandTotal(initiative, app) {
  return costedPhases(initiative).reduce(
    (total, phase) => total + phaseBlendedTotal(phase, app),
    0,
  );
}

/** Per-phase blended totals, keyed by phase id. */
export function phaseCosts(initiative, app) {
  return Object.fromEntries(
    Object.entries(initiative.phases ?? {}).map(([id, phase]) => [
      id,
      phaseBlendedTotal(phase, app),
    ]),
  );
}

/** Coverage across every costed phase. @returns {'estimate'|'forecast'|'actual'} */
export function initiativeCoverage(initiative) {
  const labels = costedPhases(initiative).map(phaseCoverage);
  if (labels.length === 0) return 'estimate';
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
  if (sorted.length === 0) return issues;

  const unbounded = sorted.filter((band) => band.upper === null || band.upper === undefined);
  if (unbounded.length > 1) {
    issues.push({ type: 'overlap', message: 'more than one band has no upper limit' });
  }

  // Anything below the lowest bound is uncovered too, and resolves to "Not
  // yet known" exactly as a gap between bands does (§5.5). Reporting only the
  // gaps *between* bands would hide it.
  if (sorted[0].lower > 0) {
    issues.push({ type: 'gap', from: 0, to: sorted[0].lower });
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
      initiative.status === 'active' && (teamId === undefined || initiative.teamId === teamId),
  );
}

/**
 * What a person is allocated in one month, broken down by initiative.
 * @param {object} app @param {string} personId @param {string} monthKeyStr
 * @param {string} [teamId] restrict to one team's initiatives
 * @returns {Array<{ initiativeId: string, teamId: string, phaseId: string, allocationPct: number }>}
 */
export function allocationBreakdown(app, personId, monthKeyStr, teamId) {
  const rows = [];
  for (const initiative of capacityInitiatives(app, teamId)) {
    for (const [phaseId, phase] of Object.entries(initiative.phases ?? {})) {
      if (!phaseMonths(phase).includes(monthKeyStr)) continue;
      for (const allocation of phase.allocations ?? []) {
        if (allocation.personId !== personId || allocation.allocationPct <= 0) continue;
        rows.push({
          initiativeId: initiative.id,
          teamId: initiative.teamId,
          phaseId,
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
 * What a team's unallocated share of one person costs in a month. This is
 * ongoing work outside the initiative portfolio, not idle time (SPEC §7.2),
 * so it is costed exactly as initiative work is — same rate, same factor,
 * same working days.
 */
export function nonInitiativeWorkCost(app, personId, teamId, monthKeyStr) {
  const pct = nonInitiativeWorkPct(app, personId, teamId, monthKeyStr);
  if (pct <= 0) return 0;

  const person = app.PEOPLE[personId];
  const { year } = parseMonthKey(monthKeyStr);
  const { dayRate, factor } = resolveRate(person, app.ROLES, app.COUNTRIES, year);
  const days = workingDaysInMonth(app.COUNTRIES[person.countryId], monthKeyStr);
  return days * (pct / 100) * factor * dayRate;
}

/** One initiative's blended cost in a month, across all its costed phases. */
export function initiativeCostInMonth(initiative, app, monthKeyStr) {
  return costedPhases(initiative).reduce(
    (total, phase) => total + (phaseBlendedByMonth(phase, app)[monthKeyStr] ?? 0),
    0,
  );
}

/**
 * A team's monthly cost, split by initiative plus one non-initiative-work
 * segment — what the run-rate chart stacks (SPEC §7.2).
 *
 * @returns {Array<{ month: string, segments: Array<{ id: string, name: string, cost: number }>, total: number }>}
 */
export function teamRunRate(app, teamId, months) {
  const initiatives = app.INITIATIVES.filter((i) => i.teamId === teamId);
  const members = Object.values(app.PEOPLE).filter((person) => membership(person, teamId));

  return months.map((month) => {
    const segments = initiatives
      .map((initiative) => ({
        id: initiative.id,
        name: initiative.name,
        cost: initiativeCostInMonth(initiative, app, month),
      }))
      .filter((segment) => segment.cost > 0);

    const spare = members.reduce(
      (total, person) => total + nonInitiativeWorkCost(app, person.id, teamId, month),
      0,
    );
    if (spare > 0) segments.push({ id: 'non-initiative', name: 'Non-initiative work', cost: spare });

    return { month, segments, total: segments.reduce((t, seg) => t + seg.cost, 0) };
  });
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

/**
 * Every allocation a person holds, across all initiatives and both phases,
 * regardless of month. The Person detail page's "where does this person's
 * time go?" table (SPEC §7.3).
 *
 * Unlike the capacity figures, this includes on-hold and cancelled
 * initiatives — the allocation exists and is costed either way (SPEC §3), and
 * hiding it would make the page disagree with the initiative itself.
 */
export function personInitiatives(app, personId) {
  const rows = [];
  for (const initiative of app.INITIATIVES) {
    for (const [phaseId, phase] of Object.entries(initiative.phases ?? {})) {
      const allocation = (phase.allocations ?? []).find((a) => a.personId === personId);
      if (!allocation) continue;
      rows.push({
        initiative,
        phaseId,
        allocationPct: allocation.allocationPct,
        start: phase.estStartDate,
        end: phase.estEndDate,
        countsTowardCapacity: initiative.status === 'active',
      });
    }
  }
  return rows;
}

/**
 * Allocations a person holds on a team they are no longer an active member
 * of. These keep costing rather than being dropped (SPEC §5.2), so both the
 * Person and Team pages surface them by name.
 */
export function strandedAllocations(app, personId) {
  const person = app.PEOPLE[personId];
  return personInitiatives(app, personId).filter(
    (row) => !membership(person, row.initiative.teamId),
  );
}

/** Every month in the rolling window, oldest first. */
export function windowMonths(app) {
  const years = new Set();
  for (const country of Object.values(app.COUNTRIES)) {
    for (const year of Object.keys(country.byYear)) years.add(Number(year));
  }
  return [...years]
    .sort((a, b) => a - b)
    .flatMap((year) =>
      Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`),
    );
}

/** Utilisation for the People overview: allocated against capacity, one month. */
export function utilisationPct(app, personId, monthKeyStr) {
  const person = app.PEOPLE[personId];
  if (!person.capacityPct) return 0;
  return (allocatedPct(app, personId, monthKeyStr) / person.capacityPct) * 100;
}

/* ------------------------------------------------------------------ *
 * The process
 * ------------------------------------------------------------------ */

/**
 * These read the compiled-in process, which is passed in rather than
 * imported so the same code can be exercised against differently-shaped
 * processes (DESIGN.md §7). Nothing here may assume how many phases exist,
 * that any given one is costed, or that a gate has a checklist.
 */

/** Phase ids in order. @returns {string[]} */
export function phaseOrder(process) {
  return process.phases.map((phase) => phase.id);
}

/** @returns {object} the phase with this id */
export function phaseById(process, phaseId) {
  const phase = process.phases.find((candidate) => candidate.id === phaseId);
  if (!phase) throw new Error(`unknown phase: ${phaseId}`);
  return phase;
}

/** Ids of the phases that carry cost and capacity. @returns {string[]} */
export function costedPhaseIds(process) {
  return process.phases.filter((phase) => phase.costed).map((phase) => phase.id);
}

export function isCostedPhase(process, phaseId) {
  return phaseById(process, phaseId).costed;
}

/** The gate out of a phase. Every phase has exactly one (SPEC §3). */
export function gateForPhase(process, phaseId) {
  return phaseById(process, phaseId).gate;
}

/** The phase whose gate this is. */
export function phaseForGate(process, gateId) {
  const phase = process.phases.find((candidate) => candidate.gate.id === gateId);
  if (!phase) throw new Error(`unknown gate: ${gateId}`);
  return phase;
}

/** Whether this phase's gate is the one that closes the initiative. */
export function isFinalPhase(process, phaseId) {
  return process.phases[process.phases.length - 1].id === phaseId;
}

/**
 * Display labels. Never render an id, and never compare or sort on a label —
 * ordering always comes from the declared phase order (DESIGN.md §2).
 */
export function phaseLabel(process, phaseId) {
  return phaseById(process, phaseId).label;
}

export function gateLabel(process, gateId) {
  return phaseForGate(process, gateId).gate.label;
}

/** The phase after this one, or null at the end of the process. */
export function nextPhase(process, phaseId) {
  const order = phaseOrder(process);
  const index = order.indexOf(phaseId);
  if (index === -1) throw new Error(`unknown phase: ${phaseId}`);
  return order[index + 1] ?? null;
}

/** The phase before this one, or null at the start. */
export function previousPhase(process, phaseId) {
  const order = phaseOrder(process);
  const index = order.indexOf(phaseId);
  if (index === -1) throw new Error(`unknown phase: ${phaseId}`);
  return index === 0 ? null : order[index - 1];
}

/* ------------------------------------------------------------------ *
 * Status
 * ------------------------------------------------------------------ */

/** Status is independent of phase, and never to be confused with it. */
export const STATUSES = Object.freeze(['active', 'on-hold', 'cancelled', 'closed']);

/** Closed and Cancelled both freeze the initiative (SPEC §6.4). */
export function isFinished(initiative) {
  return initiative.status === 'closed' || initiative.status === 'cancelled';
}
