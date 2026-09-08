// Engine tests. Per DESIGN.md §7 these never hardcode a master-data value:
// people, roles and bands are looked up by shape, so the same tests run
// unchanged against any brand pack.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createMasterData, trackedYears } from '../src/masterData.js';
import * as E from '../src/engine.js';
import { SIMPLE, RICH } from './processes.mjs';

const NOW = 2026;
const app = () => ({ ...createMasterData(NOW), INITIATIVES: [] });

/** A person paid through a standard role. */
const standardPerson = (a) => Object.values(a.PEOPLE).find((p) => p.roleId && !p.customRole);
/** A person on an individually negotiated rate. */
const customPerson = (a) => Object.values(a.PEOPLE).find((p) => p.customRole);
/** Someone whose capacity is split across more than one team. */
const splitPerson = (a) =>
  Object.values(a.PEOPLE).find((p) => p.memberships.filter((m) => m.active).length > 1);

function phase(overrides = {}) {
  return {
    estStartDate: null,
    estEndDate: null,
    allocations: [],
    otherCosts: [],
    actualStartDate: null,
    actualEndDate: null,
    actualMonths: {},
    frozen: null,
    ...overrides,
  };
}

function initiative(a, overrides = {}) {
  return {
    id: 'init_1',
    name: 'Test initiative',
    description: '',
    teamId: Object.keys(a.TEAMS)[0],
    phaseId: SIMPLE.phases[0].id,
    status: 'active',
    notes: '',
    phases: { plan: phase(), build: phase() },
    gates: {},
    checklist: {},
    ...overrides,
  };
}

/* -------------------------------------------------- calendar */

test('weekdays exclude weekends', () => {
  assert.equal(E.weekdaysInMonth(2026, 0), 22); // Jan 2026
  assert.equal(E.weekdaysInMonth(2026, 1), 20); // Feb 2026
});

test('a month range is inclusive at both ends', () => {
  assert.deepEqual(E.monthsInRange('2026-01-15', '2026-03-02'), ['2026-01', '2026-02', '2026-03']);
  assert.deepEqual(E.monthsInRange('2026-03-02', '2026-01-15'), []);
});

test('a year outside the window clamps to the nearest tracked year', () => {
  const years = trackedYears(NOW);
  const byYear = Object.fromEntries(years.map((y) => [y, y]));
  assert.equal(E.yearRecord(byYear, years[0] - 5), years[0]);
  assert.equal(E.yearRecord(byYear, years.at(-1) + 5), years.at(-1));
  assert.equal(E.yearRecord(byYear, years[1]), years[1]);
});

test('a whole month uses the full working-day value; partial months prorate', () => {
  const a = app();
  const country = Object.values(a.COUNTRIES)[0];

  const whole = E.workingDaysForPeriod(country, '2026-01-01', '2026-01-31');
  assert.equal(whole['2026-01'], E.workingDaysInMonth(country, '2026-01'));

  const half = E.workingDaysForPeriod(country, '2026-01-19', '2026-01-31');
  assert.ok(half['2026-01'] < whole['2026-01'], 'a partial month must cost less than a whole one');
  assert.ok(half['2026-01'] > 0);
});

/* -------------------------------------------------- rate resolution */

test('a standard role uses its country rate for the month\'s own year', () => {
  const a = app();
  const person = standardPerson(a);
  const country = a.COUNTRIES[person.countryId];
  const factor = a.ROLES[person.roleId].factor;

  for (const year of trackedYears(NOW)) {
    const { dayRate, factor: f } = E.resolveRate(person, a.ROLES, a.COUNTRIES, year);
    assert.equal(dayRate, country.byYear[year].rate);
    assert.equal(f, factor);
  }
});

test('a rate change next year does not move this year\'s months', () => {
  const a = app();
  const person = standardPerson(a);
  const [first, second] = trackedYears(NOW);
  const before = E.resolveRate(person, a.ROLES, a.COUNTRIES, first).dayRate;

  a.COUNTRIES[person.countryId].byYear[second].rate += 1000;

  assert.equal(E.resolveRate(person, a.ROLES, a.COUNTRIES, first).dayRate, before);
  assert.notEqual(E.resolveRate(person, a.ROLES, a.COUNTRIES, second).dayRate, before);
});

test('a custom rate is absolute and bypasses the role factor', () => {
  const a = app();
  const person = customPerson(a);
  const { dayRate, factor } = E.resolveRate(person, a.ROLES, a.COUNTRIES, NOW);

  assert.equal(factor, 1, 'the role factor must not apply to a negotiated rate');
  assert.equal(dayRate, person.customRole.byYear[NOW]);
  assert.notEqual(dayRate, a.COUNTRIES[person.countryId].byYear[NOW].rate);
});

test('a custom-rate person still observes their country\'s working days', () => {
  const a = app();
  const person = customPerson(a);
  const country = a.COUNTRIES[person.countryId];
  const other = Object.values(a.COUNTRIES).find((c) => c.id !== country.id);

  const days = E.workingDaysForPeriod(country, '2026-02-01', '2026-02-28');
  assert.equal(days['2026-02'], E.workingDaysInMonth(country, '2026-02'));

  // Guard the point: the two countries' calendars genuinely differ, so this
  // assertion would catch a custom-rate person silently losing their holidays.
  assert.notEqual(
    E.workingDaysInMonth(country, '2026-12'),
    E.workingDaysInMonth(other, '2026-12'),
  );
});

test('a backfilled month costs against its own year, not the current one', () => {
  const a = app();
  const person = standardPerson(a);
  const [lastYear, thisYear] = trackedYears(NOW);
  const country = a.COUNTRIES[person.countryId];
  assert.notEqual(country.byYear[lastYear].rate, country.byYear[thisYear].rate);

  const back = initiative(a, {
    phases: {
      plan: phase({
        estStartDate: `${lastYear}-03-01`,
        estEndDate: `${lastYear}-03-31`,
        allocations: [{ personId: person.id, allocationPct: 100 }],
      }),
    },
  });

  const cost = E.phaseLabourByMonth(back.phases.plan, a)[`${lastYear}-03`];
  const days = E.workingDaysInMonth(country, `${lastYear}-03`);
  const expected = days * 1 * a.ROLES[person.roleId].factor * country.byYear[lastYear].rate;
  assert.equal(cost, expected);
});

/* -------------------------------------------------- phase cost */

test('the monthly breakdown sums to the phase total', () => {
  const a = app();
  const person = standardPerson(a);
  const p = phase({
    estStartDate: '2026-02-01',
    estEndDate: '2026-04-30',
    allocations: [{ personId: person.id, allocationPct: 50 }],
    // Deliberately outside the period: it must still appear in a month.
    otherCosts: [{ id: 'c1', name: 'Licence', month: '2026-09', amount: 5000 }],
  });

  const months = E.phaseBlendedByMonth(p, a);
  const monthly = Object.values(months).reduce((t, v) => t + v, 0);

  assert.ok(E.phaseMonths(p).includes('2026-09'), 'an out-of-period cost item needs a month');
  assert.equal(Math.round(monthly), Math.round(E.phaseBlendedTotal(p, a)));
  assert.ok(monthly > 5000);
});

test('costed months extend past the estimate when a phase overruns', () => {
  const a = app();
  const p = phase({
    estStartDate: '2026-01-01',
    estEndDate: '2026-02-28',
    actualMonths: { '2026-04': 9000 },
  });
  const months = E.phaseMonths(p);
  assert.ok(months.includes('2026-04'), 'overrun actuals must not vanish from monthly views');
  assert.equal(E.phaseBlendedByMonth(p, a)['2026-04'], 9000);
});

test('blended cost prefers a recorded actual over the estimate', () => {
  const a = app();
  const person = standardPerson(a);
  const p = phase({
    estStartDate: '2026-01-01',
    estEndDate: '2026-02-28',
    allocations: [{ personId: person.id, allocationPct: 100 }],
    actualMonths: { '2026-01': 1234 },
  });
  const blended = E.phaseBlendedByMonth(p, a);
  assert.equal(blended['2026-01'], 1234);
  assert.notEqual(blended['2026-02'], 1234);
});

test('coverage moves estimate -> forecast -> actual', () => {
  const a = app();
  const person = standardPerson(a);
  const base = {
    estStartDate: '2026-01-01',
    estEndDate: '2026-02-28',
    allocations: [{ personId: person.id, allocationPct: 100 }],
  };
  assert.equal(E.phaseCoverage(phase(base)), 'estimate');
  assert.equal(E.phaseCoverage(phase({ ...base, actualMonths: { '2026-01': 1 } })), 'forecast');
  assert.equal(
    E.phaseCoverage(phase({ ...base, actualMonths: { '2026-01': 1, '2026-02': 2 } })),
    'actual',
  );
  assert.equal(E.initiativeCoverage(initiative(a)), 'estimate');
});

test('a frozen estimate ignores later master-data changes', () => {
  const a = app();
  const person = standardPerson(a);
  const p = phase({
    estStartDate: '2026-01-01',
    estEndDate: '2026-01-31',
    allocations: [{ personId: person.id, allocationPct: 100 }],
  });
  const live = E.phaseEstimateTotal(p, a);

  p.frozen = { estimatedPhaseCost: live };
  a.COUNTRIES[person.countryId].byYear[NOW].rate *= 3;

  assert.equal(E.phaseEstimateTotal(p, a), live, 'an approved figure must never move');
});

/* -------------------------------------------------- approval tracks */

test('a total no band covers is Not yet known, never the nearest band', () => {
  const lowest = [...SIMPLE.bands].sort((x, y) => x.lower - y.lower)[0];

  assert.equal(E.resolveBand(SIMPLE.bands, lowest.lower - 1), null, 'below the lowest bound');

  // Punch a gap between the two lowest bands and land a total inside it.
  const sorted = structuredClone(SIMPLE.bands).sort((x, y) => x.lower - y.lower);
  const gapStart = sorted[0].upper;
  sorted[1].lower = gapStart + 10000;
  assert.equal(E.resolveBand(sorted, gapStart + 5000), null, 'inside a gap');
  assert.ok(E.bandCoverageIssues(sorted).some((issue) => issue.type === 'gap'));
});

test('bounds are lower-inclusive and upper-exclusive', () => {
  const band = [...SIMPLE.bands].sort((x, y) => x.lower - y.lower)[0];
  assert.equal(E.resolveBand(SIMPLE.bands, band.lower)?.id, band.id);
  assert.notEqual(E.resolveBand(SIMPLE.bands, band.upper)?.id, band.id);
});

test('a band with no upper limit covers everything above its lower bound', () => {
  const open = SIMPLE.bands.find((b) => b.upper === null);
  assert.ok(open, 'the process needs one unbounded band');
  assert.equal(E.resolveBand(SIMPLE.bands, open.lower * 1000)?.id, open.id);
});

test('escalation compares severity alone, and survives a rename', () => {
  const [low, high] = [...SIMPLE.bands].sort((x, y) => x.severity - y.severity);
  const snapshot = { id: low.id, name: low.name, abbr: low.abbr, severity: low.severity };

  assert.equal(E.compareBands(snapshot, high), 'escalation');
  assert.equal(E.compareBands({ ...high }, low), 'de-escalation');
  assert.equal(E.compareBands(snapshot, { ...low, name: 'Renamed entirely' }), 'unchanged');
  assert.equal(E.compareBands(null, high), 'unknown');
});

/* -------------------------------------------------- capacity */

test('a person split across teams produces non-initiative work in each, and no more', () => {
  const a = app();
  const person = splitPerson(a);
  const [first, second] = person.memberships.filter((m) => m.active);
  const month = '2026-05';

  // Allocate them to one initiative in the first team only.
  const allocated = 25;
  a.INITIATIVES.push(
    initiative(a, {
      id: 'init_split',
      teamId: first.teamId,
      phases: {
        plan: phase({
          estStartDate: '2026-05-01',
          estEndDate: '2026-05-31',
          allocations: [{ personId: person.id, allocationPct: allocated }],
        }),
      },
    }),
  );

  const niwFirst = E.nonInitiativeWorkPct(a, person.id, first.teamId, month);
  const niwSecond = E.nonInitiativeWorkPct(a, person.id, second.teamId, month);

  assert.equal(niwFirst, first.sharePct - allocated);
  assert.equal(niwSecond, second.sharePct);

  // The whole point of the share model: the two teams together account for
  // exactly the person's unallocated capacity, never twice over.
  const unallocated = E.totalSharePct(person) - allocated;
  assert.equal(niwFirst + niwSecond, unallocated);
  assert.ok(niwFirst + niwSecond <= person.capacityPct);
});

test('someone with no membership has non-initiative work nowhere', () => {
  const a = app();
  const bench = Object.values(a.PEOPLE).find((p) => p.memberships.length === 0);
  assert.ok(bench, 'the seed data needs one person with no team');
  for (const teamId of Object.keys(a.TEAMS)) {
    assert.equal(E.nonInitiativeWorkPct(a, bench.id, teamId, '2026-05'), 0);
  }
});

test('on-hold and cancelled initiatives leave capacity alone but keep costing', () => {
  const a = app();
  const person = standardPerson(a);
  const teamId = person.memberships[0].teamId;
  const p = phase({
    estStartDate: '2026-05-01',
    estEndDate: '2026-05-31',
    allocations: [{ personId: person.id, allocationPct: 40 }],
  });
  const held = initiative(a, { id: 'init_held', teamId, status: 'on-hold', phases: { plan: p } });
  a.INITIATIVES.push(held);

  assert.equal(E.allocatedPct(a, person.id, '2026-05'), 0, 'excluded from capacity');
  assert.ok(E.phaseBlendedTotal(p, a) > 0, 'but still costed');
});

test('allocation is broken down by initiative, since a person can serve several', () => {
  const a = app();
  const person = standardPerson(a);
  const teamId = person.memberships[0].teamId;
  const make = (id, pct) =>
    initiative(a, {
      id,
      teamId,
      phases: {
        plan: phase({
          estStartDate: '2026-06-01',
          estEndDate: '2026-06-30',
          allocations: [{ personId: person.id, allocationPct: pct }],
        }),
      },
    });
  a.INITIATIVES.push(make('init_a', 30), make('init_b', 20));

  const rows = E.allocationBreakdown(a, person.id, '2026-06', teamId);
  assert.equal(rows.length, 2);
  assert.equal(E.allocatedPct(a, person.id, '2026-06'), 50);
  assert.equal(E.utilisationPct(a, person.id, '2026-06'), (50 / person.capacityPct) * 100);
});

test('both ceilings warn and neither blocks', () => {
  const a = app();
  const person = splitPerson(a);
  const [first] = person.memberships.filter((m) => m.active);
  const over = first.sharePct + 10;

  a.INITIATIVES.push(
    initiative(a, {
      id: 'init_over',
      teamId: first.teamId,
      phases: {
        plan: phase({
          estStartDate: '2026-07-01',
          estEndDate: '2026-07-31',
          allocations: [{ personId: person.id, allocationPct: over }],
        }),
      },
    }),
  );

  const warnings = E.capacityWarnings(a, person.id, first.teamId, '2026-07');
  assert.equal(warnings.overTeamShare, true);
  assert.equal(warnings.allocatedPct, over, 'the allocation stands despite the warning');
  assert.equal(E.nonInitiativeWorkPct(a, person.id, first.teamId, '2026-07'), 0, 'never negative');
});

/* -------------------------------------------------- stage progression */

/* -------------------------------------------------- module hygiene */

test('the engine touches no DOM, so it imports under node:test', async () => {
  const { readFile } = await import('node:fs/promises');
  const { fileURLToPath } = await import('node:url');
  const source = await readFile(fileURLToPath(new URL('../src/engine.js', import.meta.url)), 'utf8');
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  for (const global of ['document', 'window', 'localStorage']) {
    assert.doesNotMatch(code, new RegExp(`\\b${global}\\b`), `engine.js must not reference ${global}`);
  }
});

test('seeding twice cannot leak mutations between calls', () => {
  const first = createMasterData(NOW);
  first.ROLES[Object.keys(first.ROLES)[0]].factor = 99;
  first.PEOPLE[Object.keys(first.PEOPLE)[0]].capacityPct = 3;
  first.COUNTRIES[Object.keys(first.COUNTRIES)[0]].byYear[NOW].rate = 1;

  const second = createMasterData(NOW);
  assert.notEqual(second.ROLES[Object.keys(second.ROLES)[0]].factor, 99);
  assert.notEqual(second.PEOPLE[Object.keys(second.PEOPLE)[0]].capacityPct, 3);
  assert.notEqual(second.COUNTRIES[Object.keys(second.COUNTRIES)[0]].byYear[NOW].rate, 1);
});

test('escaping neutralises every character that could break out of markup', () => {
  assert.equal(E.escapeHtml('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;');
  assert.equal(E.escapeHtml('a & b'), 'a &amp; b');
  assert.equal(E.escapeHtml('say "hi"'), 'say &quot;hi&quot;');
  assert.equal(E.escapeHtml("it's"), 'it&#39;s');
  assert.equal(E.escapeHtml(null), '');
  assert.equal(E.escapeHtml(42), '42');

  // Ampersand must be escaped first, or the others get double-escaped.
  assert.equal(E.escapeHtml('&lt;'), '&amp;lt;');
});

test('an uncovered floor below the lowest band is reported like any other gap', () => {
  const sorted = structuredClone(SIMPLE.bands).sort((x, y) => x.lower - y.lower);
  assert.deepEqual(E.bandCoverageIssues(sorted), [], 'the process covers from zero');

  sorted[0].lower = 5000;
  const issues = E.bandCoverageIssues(sorted);
  assert.equal(issues.length, 1);
  assert.deepEqual(issues[0], { type: 'gap', from: 0, to: 5000 });
  assert.equal(E.resolveBand(sorted, 2500), null, 'and a total there really is unbanded');
});

test('no bands at all is reported as no issues, not a crash', () => {
  assert.deepEqual(E.bandCoverageIssues([]), []);
  assert.equal(E.resolveBand([], 100), null);
});

/* -------------------------------------------------- the process */

test('the process defines the progression; nothing assumes its shape', () => {
  for (const process of [SIMPLE, RICH]) {
    const order = E.phaseOrder(process);
    assert.equal(order.length, process.phases.length);
    assert.equal(E.previousPhase(process, order[0]), null);
    assert.equal(E.nextPhase(process, order.at(-1)), null);
    assert.equal(E.isFinalPhase(process, order.at(-1)), true);
    assert.equal(E.isFinalPhase(process, order[0]), order.length === 1);

    for (let i = 0; i < order.length - 1; i += 1) {
      assert.equal(E.nextPhase(process, order[i]), order[i + 1]);
      assert.equal(E.previousPhase(process, order[i + 1]), order[i]);
    }
  }
});

test('every phase has exactly one gate, and each resolves back to its phase', () => {
  for (const process of [SIMPLE, RICH]) {
    for (const phase of process.phases) {
      const gate = E.gateForPhase(process, phase.id);
      assert.ok(gate.id, `${phase.id} must have a gate`);
      assert.equal(E.phaseForGate(process, gate.id).id, phase.id);
      assert.equal(E.gateLabel(process, gate.id), gate.label);
    }
  }
});

test('costed phases are whatever the process says, not a fixed pair', () => {
  assert.deepEqual(E.costedPhaseIds(SIMPLE), ['plan', 'build']);
  assert.deepEqual(E.costedPhaseIds(RICH), ['shape', 'deliver']);
  assert.equal(E.isCostedPhase(RICH, 'discover'), false);
  assert.equal(E.isCostedPhase(RICH, 'shape'), true);
});

test('labels are looked up, never rendered from an id', () => {
  for (const process of [SIMPLE, RICH]) {
    for (const phase of process.phases) {
      const label = E.phaseLabel(process, phase.id);
      assert.ok(label && label !== phase.id, `${phase.id} needs a label of its own`);
    }
  }
  assert.throws(() => E.phaseLabel(SIMPLE, 'nope'), /unknown phase/);
  assert.throws(() => E.gateLabel(SIMPLE, 'nope'), /unknown gate/);
});

test('status is a fixed set, and finishing means closed or cancelled', () => {
  assert.deepEqual([...E.STATUSES], ['active', 'on-hold', 'cancelled', 'closed']);
  assert.equal(E.isFinished({ status: 'closed' }), true);
  assert.equal(E.isFinished({ status: 'cancelled' }), true);
  assert.equal(E.isFinished({ status: 'active' }), false);
  assert.equal(E.isFinished({ status: 'on-hold' }), false);
});
