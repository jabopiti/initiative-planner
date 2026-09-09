// Lifecycle integration tests. These drive the real exported functions rather
// than a parallel implementation (DESIGN §7), look master data up by shape,
// and run against more than one process shape — the only way to catch code
// that assumes two phases or that every phase is costed.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createMasterData } from '../src/masterData.js';
import * as E from '../src/engine.js';
import * as L from '../src/lifecycle.js';
import * as P from '../src/people.js';
import { SIMPLE, RICH, ALL } from './processes.mjs';

const NOW = 2026;

function setup(process) {
  const app = L.createApp(createMasterData(NOW), process);
  const teamId = Object.keys(app.TEAMS)[0];
  const people = Object.values(app.PEOPLE).filter((p) => E.membership(p, teamId));
  assert.ok(people.length > 0, 'the seed data needs a staffed team');
  return { app, process, teamId, people };
}

/** Estimate every costed phase, so any gate requiring estimates is satisfied. */
function estimateAll(app, process, initiative, person) {
  let month = 1;
  for (const phaseId of E.costedPhaseIds(process)) {
    const start = `2026-${String(month).padStart(2, '0')}-01`;
    const end = `2026-${String(month + 1).padStart(2, '0')}-28`;
    L.setPhasePeriod(initiative, phaseId, start, end);
    L.setAllocation(app, initiative, phaseId, person.id, 50);
    month += 2;
  }
}

/** Set every checklist item on a gate to one status. */
function setChecklist(process, initiative, gateId, status) {
  const gate = E.phaseForGate(process, gateId).gate;
  for (const item of gate.checklist ?? []) {
    L.setChecklistStatus(initiative, gateId, item.id, status);
  }
}

/* -------------------------------------------------- creation */

for (const process of ALL) {
  test(`[${process.id}] a new initiative starts in the first phase, active`, () => {
    const { app, teamId } = setup(process);
    const initiative = L.createInitiative(app, process, { name: 'Thing', teamId });

    assert.equal(initiative.phaseId, E.phaseOrder(process)[0]);
    assert.equal(initiative.status, 'active');
    assert.deepEqual(initiative.gates, {}, 'no gate has been left yet');
    assert.deepEqual(
      Object.keys(initiative.phases).sort(),
      [...E.costedPhaseIds(process)].sort(),
      'only costed phases get a record',
    );
  });

  test(`[${process.id}] starting later records the gates behind it as skipped`, () => {
    const { app, teamId } = setup(process);
    const order = E.phaseOrder(process);
    const start = order[order.length - 1];
    const initiative = L.createInitiative(app, process, {
      name: 'Legacy work',
      teamId,
      startPhaseId: start,
    });

    assert.equal(initiative.phaseId, start);
    for (const phaseId of order.slice(0, order.length - 1)) {
      const record = initiative.gates[E.gateForPhase(process, phaseId).id];
      assert.equal(record.outcome, 'skipped');
      assert.match(record.reason, /already in progress/i);
    }
    for (const phaseId of E.costedPhaseIds(process)) {
      assert.equal(
        L.isPhaseEditable(initiative, phaseId),
        true,
        'a skipped gate freezes nothing, so its phase stays editable',
      );
    }
  });

  test(`[${process.id}] a costed phase is the only kind with a record`, () => {
    const { app, teamId } = setup(process);
    const initiative = L.createInitiative(app, process, { name: 'Thing', teamId });
    for (const phase of process.phases) {
      assert.equal(Boolean(initiative.phases[phase.id]), phase.costed);
    }
  });
}

/* -------------------------------------------------- gates */

test('a gate requiring estimates needs every costed phase, not just its own', () => {
  const { app, process, teamId, people } = setup(RICH);
  const initiative = L.createInitiative(app, process, { name: 'Replatform', teamId });
  L.skipGate(app, process, initiative, 'g_discover', 'not needed', '2026-01-05');

  const gateId = E.gateForPhase(process, initiative.phaseId).id;
  L.setPhasePeriod(initiative, 'shape', '2026-01-01', '2026-02-28');
  L.setAllocation(app, initiative, 'shape', people[0].id, 50);
  setChecklist(process, initiative, gateId, 'green');

  const partial = L.gatePrecondition(app, process, initiative, gateId);
  assert.equal(partial.ok, false);
  assert.ok(partial.blockers.some((b) => /Deliver/.test(b)), 'must name the phase still ahead');

  L.setPhasePeriod(initiative, 'deliver', '2026-03-01', '2026-06-30');
  L.setAllocation(app, initiative, 'deliver', people[0].id, 80);
  assert.equal(L.gatePrecondition(app, process, initiative, gateId).ok, true);
});

test('a red checklist item blocks; amber warns but passes; items start red', () => {
  const { app, process, teamId, people } = setup(RICH);
  const initiative = L.createInitiative(app, process, { name: 'Replatform', teamId });
  const gateId = 'g_discover';

  const untouched = L.gatePrecondition(app, process, initiative, gateId);
  assert.equal(untouched.ok, false, 'items start red, so the gate starts blocked');
  assert.ok(untouched.blockers.some((b) => /Problem agreed/.test(b)));

  setChecklist(process, initiative, gateId, 'amber');
  const amber = L.gatePrecondition(app, process, initiative, gateId);
  assert.equal(amber.ok, true, 'amber lets it through');
  assert.ok(amber.warnings.some((w) => /Problem agreed/.test(w)), 'but says so');

  setChecklist(process, initiative, gateId, 'green');
  assert.deepEqual(
    L.gatePrecondition(app, process, initiative, gateId).warnings.filter((w) =>
      /Problem agreed/.test(w),
    ),
    [],
  );
  estimateAll(app, process, initiative, people[0]);
  L.passGate(app, process, initiative, gateId, '2026-01-05');
  assert.equal(initiative.phaseId, 'shape');
});

test('a gate with no cost requirement passes on an empty estimate', () => {
  const { app, process, teamId } = setup(RICH);
  const initiative = L.createInitiative(app, process, { name: 'Thing', teamId });
  setChecklist(process, initiative, 'g_discover', 'green');

  const record = L.passGate(app, process, initiative, 'g_discover', '2026-01-05');
  assert.equal(record.outcome, 'passed');
  assert.equal(record.grandTotal, 0);
  assert.equal(record.band?.id ?? null, process.bands[0].id, 'zero still resolves to a band here');
});

test('passing a gate freezes the phase behind it and records the whole budget', () => {
  const { app, process, teamId, people } = setup(SIMPLE);
  const initiative = L.createInitiative(app, process, { name: 'Replatform', teamId });
  estimateAll(app, process, initiative, people[0]);

  const before = E.grandTotal(initiative, app);
  const record = L.passGate(app, process, initiative, 'g_plan', '2026-02-28');

  assert.equal(record.grandTotal, before, 'a gate approves the whole initiative');
  assert.equal(initiative.phaseId, 'build');
  assert.equal(L.isPhaseEditable(initiative, 'plan'), false, 'frozen');
  assert.equal(L.isPhaseEditable(initiative, 'build'), true, 'still open');
  assert.deepEqual(Object.keys(record.phaseCosts).sort(), ['build', 'plan']);
});

test('a later master-data change never moves an approved figure', () => {
  const { app, process, teamId, people } = setup(SIMPLE);
  const person = people[0];
  const initiative = L.createInitiative(app, process, { name: 'Replatform', teamId });
  estimateAll(app, process, initiative, person);
  const record = L.passGate(app, process, initiative, 'g_plan', '2026-02-28');

  app.COUNTRIES[person.countryId].byYear[NOW].rate *= 4;
  assert.equal(initiative.gates.g_plan.grandTotal, record.grandTotal);
  assert.equal(E.phaseEstimateTotal(initiative.phases.plan, app), record.phaseCosts.plan);
});

/* -------------------------------------------------- skipping */

test('skipping requires a reason, approves nothing, and freezes nothing', () => {
  const { app, process, teamId, people } = setup(SIMPLE);
  const initiative = L.createInitiative(app, process, { name: 'Replatform', teamId });
  estimateAll(app, process, initiative, people[0]);
  L.passGate(app, process, initiative, 'g_plan', '2026-02-28');

  assert.throws(() => L.skipGate(app, process, initiative, 'g_build', '', '2026-06-30'), /reason/);
  assert.throws(() => L.skipGate(app, process, initiative, 'g_build', '   ', '2026-06-30'), /reason/);

  const record = L.skipGate(app, process, initiative, 'g_build', 'No formal review needed', '2026-06-30');
  assert.equal(record.outcome, 'skipped');
  assert.equal(record.reason, 'No formal review needed');
  assert.equal(initiative.phases.build.frozen, null, 'a skip freezes nothing');
  assert.equal(initiative.status, 'closed', 'the final gate closes, skipped or not');
});

test('a gate the build marks unskippable cannot be skipped', () => {
  const { app, process, teamId } = setup(SIMPLE);
  const initiative = L.createInitiative(app, process, { name: 'Thing', teamId });
  assert.throws(
    () => L.skipGate(app, process, initiative, 'g_plan', 'because', '2026-01-01'),
    /cannot be skipped/,
  );
});

test('a skipped gate never becomes the escalation baseline', () => {
  const { app, process, teamId, people } = setup(RICH);
  const initiative = L.createInitiative(app, process, { name: 'Replatform', teamId });

  L.skipGate(app, process, initiative, 'g_discover', 'not relevant', '2026-01-05');
  assert.equal(L.lastPassedGate(process, initiative), null, 'a skip approves nothing');

  estimateAll(app, process, initiative, people[0]);
  setChecklist(process, initiative, 'g_shape', 'green');
  L.passGate(app, process, initiative, 'g_shape', '2026-03-01');
  assert.equal(L.lastPassedGate(process, initiative).outcome, 'passed');
});

/* -------------------------------------------------- frozen display */

test('a frozen phase reads its snapshot, so its panel cannot drift from the total', () => {
  const { app, process, teamId, people } = setup(SIMPLE);
  const person = people[0];
  const initiative = L.createInitiative(app, process, { name: 'Replatform', teamId });
  estimateAll(app, process, initiative, person);
  L.passGate(app, process, initiative, 'g_plan', '2026-02-28');

  const frozen = initiative.phases.plan;
  const approvedRow = E.allocationFigures(frozen, person.id, 50, E.ratesFor(app, frozen));

  // The exact thing freezing exists to protect against.
  app.COUNTRIES[person.countryId].byYear[NOW].rate *= 3;

  const stillShows = E.allocationFigures(frozen, person.id, 50, E.ratesFor(app, frozen));
  assert.equal(stillShows.cost, approvedRow.cost, 'the row must show what was approved');
  assert.equal(stillShows.personDays, approvedRow.personDays);

  // And the per-row figures must add up to the frozen total shown beside them,
  // or the panel contradicts itself.
  const rowSum = frozen.allocations.reduce(
    (t, a) => t + E.allocationFigures(frozen, a.personId, a.allocationPct,
      E.ratesFor(app, frozen)).cost,
    0,
  );
  assert.equal(Math.round(rowSum), Math.round(frozen.frozen.estLabourTotal));

  // An open phase still tracks live master data.
  const open = initiative.phases.build;
  assert.equal(open.frozen, null);
  assert.notEqual(
    Math.round(E.allocationFigures(open, person.id, 50, E.ratesFor(app, open)).cost),
    Math.round(approvedRow.cost),
    'an unfrozen phase should have moved with the rate',
  );
});

test('the phase panels sum to the grand total, frozen or not', () => {
  const { app, process, teamId, people } = setup(SIMPLE);
  const initiative = L.createInitiative(app, process, { name: 'Replatform', teamId });
  estimateAll(app, process, initiative, people[0]);
  L.passGate(app, process, initiative, 'g_plan', '2026-02-28');
  app.COUNTRIES[people[0].countryId].byYear[NOW].rate *= 3;

  const panelTotal = E.costedPhaseIds(process).reduce((total, phaseId) => {
    const phase = initiative.phases[phaseId];
    const labour = phase.frozen
      ? phase.frozen.estLabourTotal
      : Object.values(E.phaseLabourByMonth(phase, app)).reduce((t, v) => t + v, 0);
    const other = phase.frozen
      ? phase.frozen.estOtherTotal
      : Object.values(E.phaseOtherByMonth(phase)).reduce((t, v) => t + v, 0);
    return total + labour + other;
  }, 0);

  assert.equal(Math.round(panelTotal), Math.round(E.grandTotal(initiative, app)));
});

/* -------------------------------------------------- the full journey */

for (const process of ALL) {
  test(`[${process.id}] first phase to closed, then back down one step at a time`, () => {
    const { app, teamId, people } = setup(process);
    const initiative = L.createInitiative(app, process, { name: 'Replatform', teamId });
    estimateAll(app, process, initiative, people[0]);

    const gatesInOrder = E.phaseOrder(process).map((id) => E.gateForPhase(process, id).id);
    for (const gateId of gatesInOrder) {
      setChecklist(process, initiative, gateId, 'green');
      L.passGate(app, process, initiative, gateId, '2026-06-30');
    }

    assert.equal(initiative.status, 'closed', 'the final gate closes it');
    assert.equal(Object.keys(initiative.gates).length, gatesInOrder.length);

    // Reopening walks back one transition at a time, never skipping.
    for (let i = gatesInOrder.length; i > 0; i -= 1) {
      L.reopen(process, initiative);
      assert.equal(Object.keys(initiative.gates).length, i - 1, 'exactly one gate reversed');
    }
    assert.equal(initiative.status, 'active');
    assert.equal(initiative.phaseId, E.phaseOrder(process)[0]);
    assert.throws(() => L.reopen(process, initiative), /first phase|no gate record/);
  });
}

/* -------------------------------------------------- close and cancel */

test('closing freezes the whole initiative, not only its numbers', () => {
  const { app, process, teamId, people } = setup(SIMPLE);
  const initiative = L.createInitiative(app, process, { name: 'Replatform', teamId });
  estimateAll(app, process, initiative, people[0]);
  for (const gateId of ['g_plan', 'g_build']) {
    L.passGate(app, process, initiative, gateId, '2026-06-30');
  }
  assert.equal(initiative.status, 'closed');

  assert.throws(() => L.renameInitiative(initiative, 'New name'), /closed/);
  assert.throws(() => L.setDescription(initiative, 'New description'), /closed/);
  assert.throws(() => L.setStatus(initiative, 'cancelled'), /closed/);
  assert.throws(() => L.setTeam(app, initiative, Object.keys(app.TEAMS)[1]), /closed/);
  assert.throws(() => L.setPhasePeriod(initiative, 'plan', '2026-01-01', '2026-01-31'), /locked/);
  assert.throws(() => L.setAllocation(app, initiative, 'plan', people[0].id, 10), /locked/);
  assert.throws(() => L.recordActual(initiative, 'plan', '2026-01', 1), /locked/);
  assert.throws(() => L.setChecklistStatus(initiative, 'g_plan', 'x', 'green'), /closed/);
});

test('notes stay writable after close, so the reason can be recorded', () => {
  const { app, process, teamId, people } = setup(SIMPLE);
  const initiative = L.createInitiative(app, process, { name: 'Replatform', teamId });
  estimateAll(app, process, initiative, people[0]);
  for (const gateId of ['g_plan', 'g_build']) {
    L.passGate(app, process, initiative, gateId, '2026-06-30');
  }

  L.setNotes(initiative, 'Delivered early; the vendor absorbed the overrun.');
  assert.equal(initiative.notes, 'Delivered early; the vendor absorbed the overrun.');
});

test('reopening unlocks everything closing locked, and keeps the checklist', () => {
  const { app, process, teamId, people } = setup(SIMPLE);
  const initiative = L.createInitiative(app, process, { name: 'Replatform', teamId });
  estimateAll(app, process, initiative, people[0]);
  L.passGate(app, process, initiative, 'g_plan', '2026-03-31');
  L.recordActual(initiative, 'plan', '2026-01', 4321);
  L.passGate(app, process, initiative, 'g_build', '2026-06-30');

  L.reopen(process, initiative);
  assert.equal(initiative.status, 'active');
  L.renameInitiative(initiative, 'Renamed');
  L.setStatus(initiative, 'on-hold');
  assert.equal(initiative.name, 'Renamed');
  assert.equal(initiative.status, 'on-hold');
  assert.equal(initiative.phases.plan.actualMonths['2026-01'], 4321, 'actuals untouched');
});

test('cancelling freezes too, and is reachable from anywhere', () => {
  const { app, process, teamId } = setup(SIMPLE);
  const initiative = L.createInitiative(app, process, { name: 'Abandoned', teamId });

  L.setStatus(initiative, 'cancelled');
  assert.equal(E.isFinished(initiative), true);
  assert.throws(() => L.renameInitiative(initiative, 'x'), /cancelled/);

  // And it is a plain status change, so it reverses the same way.
  initiative.status = 'active';
  L.renameInitiative(initiative, 'Revived');
  assert.equal(initiative.name, 'Revived');
});

test('closed is never reachable by setting the status', () => {
  const { app, process, teamId } = setup(SIMPLE);
  const initiative = L.createInitiative(app, process, { name: 'Thing', teamId });
  assert.throws(() => L.setStatus(initiative, 'closed'), /passing the final gate/);
  assert.throws(() => L.setStatus(initiative, 'paused'), /unknown status/);
});

/* -------------------------------------------------- duplicate */

test('duplicating copies the estimate and nothing else', () => {
  const { app, process, teamId, people } = setup(RICH);
  const initiative = L.createInitiative(app, process, { name: 'Original', teamId });
  estimateAll(app, process, initiative, people[0]);
  L.addOtherCost(initiative, 'shape', { name: 'Licence', month: '2026-04', amount: 2500 });
  L.skipGate(app, process, initiative, 'g_discover', 'not needed', '2026-01-05');
  L.recordActual(initiative, 'shape', '2026-01', 999);

  const copy = L.duplicate(app, process, initiative);

  assert.notEqual(copy.id, initiative.id);
  assert.equal(copy.phaseId, E.phaseOrder(process)[0], 'always restarts at the first phase');
  assert.equal(copy.status, 'active');
  assert.deepEqual(copy.gates, {}, 'gate records are never copied');
  assert.deepEqual(copy.checklist, {}, 'nor checklist statuses');
  assert.deepEqual(copy.phases.shape.actualMonths, {}, 'nor actuals');
  assert.equal(copy.phases.shape.frozen, null);
  assert.deepEqual(copy.phases.shape.allocations, initiative.phases.shape.allocations);
  assert.equal(copy.phases.shape.otherCosts.length, 1);
  assert.notEqual(copy.phases.shape.otherCosts[0].id, initiative.phases.shape.otherCosts[0].id);

  copy.phases.shape.allocations[0].allocationPct = 5;
  assert.notEqual(initiative.phases.shape.allocations[0].allocationPct, 5, 'no shared references');
});

/* -------------------------------------------------- allocation rules */

test('only an active member of the initiative\'s team can be allocated', () => {
  const { app, process, teamId } = setup(SIMPLE);
  const initiative = L.createInitiative(app, process, { name: 'Thing', teamId });
  const outsider = Object.values(app.PEOPLE).find((p) => !E.membership(p, teamId));
  assert.ok(outsider, 'the seed data needs someone outside this team');
  assert.throws(
    () => L.setAllocation(app, initiative, 'plan', outsider.id, 50),
    /not an active member/,
  );
});

test('moving teams strands allocations rather than dropping them', () => {
  const { app, process, teamId, people } = setup(SIMPLE);
  const other = Object.keys(app.TEAMS).find((id) => id !== teamId);
  const initiative = L.createInitiative(app, process, { name: 'Thing', teamId });
  estimateAll(app, process, initiative, people[0]);
  const before = structuredClone(initiative.phases.plan.allocations);

  const stranded = L.setTeam(app, initiative, other);

  assert.equal(initiative.teamId, other);
  assert.deepEqual(initiative.phases.plan.allocations, before, 'nothing silently dropped');
  const expected = [...new Set(before.map((a) => a.personId))]
    .filter((id) => !E.membership(app.PEOPLE[id], other));
  assert.deepEqual(stranded.sort(), expected.sort(), 'and the caller is told');
});

test('a phase with a period but nobody allocated is not an estimate', () => {
  const { app, process, teamId, people } = setup(SIMPLE);
  const initiative = L.createInitiative(app, process, { name: 'Thing', teamId });
  estimateAll(app, process, initiative, people[0]);
  L.setAllocation(app, initiative, 'build', people[0].id, 0);

  const check = L.gatePrecondition(app, process, initiative, 'g_plan');
  assert.equal(check.ok, false);
  assert.ok(check.blockers.some((b) => /at least one person/.test(b)));
});

test('a frozen phase survives a custom rate being renegotiated', () => {
  // The country-rate case is covered above. This is the other half: a custom
  // rate lives on the person record, not in ROLES or COUNTRIES, so a snapshot
  // that swapped only those would leave an approved figure free to move.
  const { app, process, teamId, people } = setup(SIMPLE);
  const person = people[0];
  P.useCustomRole(app, person, 'Contract Engineer');

  const initiative = L.createInitiative(app, process, { name: 'Replatform', teamId });
  estimateAll(app, process, initiative, person);
  L.passGate(app, process, initiative, 'g_plan', '2026-02-28');

  const frozen = initiative.phases.plan;
  const approved = E.allocationFigures(frozen, person.id, 50, E.ratesFor(app, frozen)).cost;
  assert.ok(approved > 0);

  for (const year of Object.keys(person.customRole.byYear)) {
    person.customRole.byYear[year] *= 5;
  }

  assert.equal(
    E.allocationFigures(frozen, person.id, 50, E.ratesFor(app, frozen)).cost,
    approved,
    'a renegotiated contractor rate must not move what was already approved',
  );
  assert.equal(Math.round(approved), Math.round(frozen.frozen.estLabourTotal));

  // The open phase still tracks the new rate, which is the whole point.
  assert.ok(
    E.allocationFigures(initiative.phases.build, person.id, 50, app).cost > approved,
    'an unfrozen phase should have moved with the rate',
  );
});
