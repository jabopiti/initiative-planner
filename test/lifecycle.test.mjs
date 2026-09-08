// Lifecycle integration tests. These drive the real exported functions rather
// than a parallel implementation of the rules under test (DESIGN.md §7), and
// look master data up by shape so they run against any brand pack.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createMasterData } from '../src/masterData.js';
import * as E from '../src/engine.js';
import * as L from '../src/lifecycle.js';

const NOW = 2026;

/** @param {number} statusStages how many status stages the process has */
function setup(statusStages = 2) {
  const app = L.createApp(createMasterData('€', NOW));
  app.PROCESS.stages = app.PROCESS.stages.slice(0, statusStages);
  const teamId = Object.keys(app.TEAMS)[0];
  const people = Object.values(app.PEOPLE).filter((p) => E.membership(p, teamId));
  assert.ok(people.length > 0, 'the seed data needs a staffed team');
  return { app, teamId, people };
}

/** Take an initiative to the point where Gate 1 can be passed. */
function estimated(app, teamId, person) {
  const initiative = L.createInitiative(app, { name: 'Replatform', teamId });
  L.advanceStage(app, initiative, '2026-01-05');

  L.setPhasePeriod(initiative, E.VALIDATION, '2026-01-01', '2026-02-28');
  L.setAllocation(app, initiative, E.VALIDATION, person.id, 50);
  L.setPhasePeriod(initiative, E.DEVELOPMENT, '2026-03-01', '2026-06-30');
  L.setAllocation(app, initiative, E.DEVELOPMENT, person.id, 80);
  return initiative;
}

/* -------------------------------------------------- creation */

test('a new initiative starts in Draft with two empty phases', () => {
  const { app, teamId } = setup();
  const initiative = L.createInitiative(app, { name: 'Thing', teamId });

  assert.equal(initiative.stage, E.DRAFT);
  assert.equal(initiative.state, 'active');
  for (const phaseId of E.COSTED_PHASES) {
    assert.equal(initiative[phaseId].backfilled, false);
    assert.equal(initiative[phaseId].frozen, null);
    assert.equal(L.isPhaseEditable(initiative, phaseId), true);
  }
});

test('backfilling marks the phases already passed and skips their approvals', () => {
  const { app, teamId } = setup();
  const initiative = L.createInitiative(app, {
    name: 'Legacy work',
    teamId,
    startStage: E.DEVELOPMENT,
  });

  assert.equal(initiative.stage, E.DEVELOPMENT);
  assert.equal(initiative.validation.backfilled, true, 'Validation was skipped');
  assert.equal(initiative.development.backfilled, false, 'Development is still ahead');
  assert.equal(initiative.gateAApproval, null, 'a backfilled phase has no approval');
  assert.equal(L.isPhaseEditable(initiative, E.VALIDATION), true, 'and stays editable');
});

test('only an active member of the initiative\'s team can be allocated', () => {
  const { app, teamId } = setup();
  const initiative = L.createInitiative(app, { name: 'Thing', teamId });
  L.setPhasePeriod(initiative, E.VALIDATION, '2026-01-01', '2026-01-31');

  const outsider = Object.values(app.PEOPLE).find((p) => !E.membership(p, teamId));
  assert.ok(outsider, 'the seed data needs someone outside this team');
  assert.throws(
    () => L.setAllocation(app, initiative, E.VALIDATION, outsider.id, 50),
    /not an active member/,
  );
});

/* -------------------------------------------------- gates */

test('Gate 1 needs both phases estimated; Gate 2 needs only Development', () => {
  const { app, teamId, people } = setup();
  const person = people[0];
  const initiative = L.createInitiative(app, { name: 'Replatform', teamId });
  L.advanceStage(app, initiative, '2026-01-05');

  L.setPhasePeriod(initiative, E.VALIDATION, '2026-01-01', '2026-02-28');
  L.setAllocation(app, initiative, E.VALIDATION, person.id, 50);

  const blocked = L.gatePrecondition(app, initiative, E.VALIDATION);
  assert.equal(blocked.ok, false);
  assert.match(blocked.reason, /Development/, 'Gate 1 must name what is missing');

  L.setPhasePeriod(initiative, E.DEVELOPMENT, '2026-03-01', '2026-06-30');
  L.setAllocation(app, initiative, E.DEVELOPMENT, person.id, 80);
  assert.equal(L.gatePrecondition(app, initiative, E.VALIDATION).ok, true);
});

test('a period without anyone allocated is not an estimate', () => {
  const { app, teamId, people } = setup();
  const initiative = estimated(app, teamId, people[0]);
  L.setAllocation(app, initiative, E.DEVELOPMENT, people[0].id, 0);

  const check = L.gatePrecondition(app, initiative, E.VALIDATION);
  assert.equal(check.ok, false);
  assert.match(check.reason, /at least one person/);
});

test('passing Gate 1 freezes Validation, records an approval, and advances', () => {
  const { app, teamId, people } = setup();
  const initiative = estimated(app, teamId, people[0]);

  const before = E.phaseEstimateTotal(initiative.validation, app);
  const approval = L.passGate(app, initiative, E.VALIDATION, '2026-02-28');

  assert.equal(initiative.stage, E.DEVELOPMENT);
  assert.ok(initiative.validation.frozen, 'Validation is frozen');
  assert.equal(L.isPhaseEditable(initiative, E.VALIDATION), false);
  assert.equal(L.isPhaseEditable(initiative, E.DEVELOPMENT), true);
  assert.equal(approval.validationCost, before);
  assert.equal(
    approval.grandTotal,
    approval.validationCost + approval.developmentCost,
    'Gate 1 approves both phases as estimated',
  );
});

test('a later master-data change never moves an approved figure', () => {
  const { app, teamId, people } = setup();
  const person = people[0];
  const initiative = estimated(app, teamId, person);
  const approval = L.passGate(app, initiative, E.VALIDATION, '2026-02-28');

  app.COUNTRIES[person.countryId].byYear[NOW].rate *= 4;
  if (person.roleId) app.ROLES[person.roleId].factor = 9;

  assert.equal(E.phaseEstimateTotal(initiative.validation, app), approval.validationCost);
  assert.equal(initiative.gateAApproval.grandTotal, approval.grandTotal);
});

test('the approval snapshots its band, so escalation survives a deletion', () => {
  const { app, teamId, people } = setup();
  const initiative = estimated(app, teamId, people[0]);
  const approval = L.passGate(app, initiative, E.VALIDATION, '2026-02-28');
  assert.ok(approval.band, 'this estimate should land in a configured band');

  const snapshot = approval.band;
  app.BANDS = app.BANDS.filter((band) => band.id !== snapshot.id);

  const harsher = [...app.BANDS].sort((a, b) => b.severity - a.severity)[0];
  assert.equal(E.compareBands(snapshot, harsher), harsher.severity > snapshot.severity
    ? 'escalation'
    : 'unchanged');
  assert.equal(snapshot.severity, approval.band.severity, 'the snapshot is self-contained');
});

test('Gate 2 approves Validation\'s forecast plus Development\'s estimate', () => {
  const { app, teamId, people } = setup();
  const initiative = estimated(app, teamId, people[0]);
  L.passGate(app, initiative, E.VALIDATION, '2026-02-28');

  // A real actual, higher than estimated, on a Validation month.
  const month = E.phaseMonths(initiative.validation)[0];
  const estimatedMonth = initiative.validation.frozen.perMonth[month];
  L.recordActual(initiative, E.VALIDATION, month, estimatedMonth + 10000);

  const approval = L.passGate(app, initiative, E.DEVELOPMENT, '2026-06-30');
  assert.equal(approval.validationCost, E.phaseBlendedTotal(initiative.validation, app));
  assert.ok(
    approval.validationCost > initiative.gateAApproval.validationCost,
    'the overspend must show up in what Gate 2 approves',
  );
  assert.ok(initiative.development.frozen, 'Development is frozen at its own gate');
});

/* -------------------------------------------------- the full journey */

test('draft -> both gates -> every status stage -> closed, then back down', () => {
  const { app, teamId, people } = setup(2);
  const stages = app.PROCESS.stages.map((s) => s.id);
  const initiative = estimated(app, teamId, people[0]);

  L.passGate(app, initiative, E.VALIDATION, '2026-02-28');
  L.passGate(app, initiative, E.DEVELOPMENT, '2026-06-30');
  assert.equal(initiative.stage, stages[0], 'the final gate advances into the first status stage');

  L.advanceStage(app, initiative, '2026-07-15');
  assert.equal(initiative.stage, stages[1]);
  assert.equal(initiative.stageHistory[stages[1]], '2026-07-15');

  L.close(app, initiative, '2026-09-01');
  assert.equal(initiative.stage, E.CLOSED);
  for (const phaseId of E.COSTED_PHASES) {
    assert.equal(L.isPhaseEditable(initiative, phaseId), false, 'closing locks every phase');
  }
  assert.throws(() => L.recordActual(initiative, E.VALIDATION, '2026-01', 1), /locked/);

  // Reopen walks back one stage at a time, never skipping.
  assert.equal(L.reopen(app, initiative), stages[1], 'back to the stage it was closed from');
  assert.equal(L.reopen(app, initiative), stages[0]);
  assert.equal(L.reopen(app, initiative), E.DEVELOPMENT);
  assert.ok(initiative.gateBApproval, 'stepping back into Development lands on its passed gate');

  assert.equal(L.reopen(app, initiative), E.DEVELOPMENT, 'now the gate itself reverses');
  assert.equal(initiative.gateBApproval, null);
  assert.equal(initiative.development.frozen, null);
  assert.ok(initiative.gateAApproval, 'Gate 1 is still buried underneath');

  assert.equal(L.reopen(app, initiative), E.VALIDATION);
  assert.equal(initiative.gateAApproval, null);
  assert.equal(L.reopen(app, initiative), E.DRAFT);
  assert.throws(() => L.reopen(app, initiative), /nothing to reopen/);
});

test('with no status stages, the final gate stops short of Closed', () => {
  const { app, teamId, people } = setup(0);
  assert.deepEqual(E.stageOrder(app.PROCESS), [E.DRAFT, E.VALIDATION, E.DEVELOPMENT, E.CLOSED]);

  const initiative = estimated(app, teamId, people[0]);
  L.passGate(app, initiative, E.VALIDATION, '2026-02-28');
  L.passGate(app, initiative, E.DEVELOPMENT, '2026-06-30');

  assert.equal(initiative.stage, E.DEVELOPMENT, 'closing is never automatic');
  assert.ok(initiative.gateBApproval);
  assert.throws(() => L.advanceStage(app, initiative, '2026-07-01'), /gate/);

  L.close(app, initiative, '2026-07-01');
  assert.equal(initiative.stage, E.CLOSED);
  assert.equal(L.reopen(app, initiative), E.DEVELOPMENT);
});

test('reopening never touches recorded actuals', () => {
  const { app, teamId, people } = setup();
  const initiative = estimated(app, teamId, people[0]);
  L.passGate(app, initiative, E.VALIDATION, '2026-02-28');

  const month = E.phaseMonths(initiative.validation)[0];
  L.recordActual(initiative, E.VALIDATION, month, 4321);
  L.reopen(app, initiative);

  assert.equal(initiative.stage, E.VALIDATION);
  assert.equal(initiative.gateAApproval, null, 'the approval is gone');
  assert.equal(initiative.validation.frozen, null, 'and so is the frozen estimate');
  assert.equal(initiative.validation.actualMonths[month], 4321, 'the actual is not');
});

test('closing is allowed from Validation, and warns rather than blocks on gaps', () => {
  const { app, teamId, people } = setup();
  const initiative = estimated(app, teamId, people[0]);

  assert.ok(L.missingActuals(initiative).length > 0, 'nothing has been recorded yet');
  L.close(app, initiative, '2026-03-01');
  assert.equal(initiative.stage, E.CLOSED);
  assert.equal(initiative.closedFrom, E.VALIDATION);
});

test('a draft cannot be closed', () => {
  const { app, teamId } = setup();
  const initiative = L.createInitiative(app, { name: 'Thing', teamId });
  assert.throws(() => L.close(app, initiative, '2026-01-01'), /draft cannot be closed/);
});

test('duplicating copies the estimate and nothing else', () => {
  const { app, teamId, people } = setup();
  const initiative = estimated(app, teamId, people[0]);
  L.addOtherCost(initiative, E.DEVELOPMENT, { name: 'Licence', month: '2026-04', amount: 2500 });
  L.passGate(app, initiative, E.VALIDATION, '2026-02-28');
  L.recordActual(initiative, E.VALIDATION, E.phaseMonths(initiative.validation)[0], 999);

  const copy = L.duplicate(app, initiative);

  assert.notEqual(copy.id, initiative.id);
  assert.equal(copy.stage, E.DRAFT, 'a copy always restarts at Draft');
  assert.equal(copy.gateAApproval, null);
  assert.equal(copy.validation.frozen, null);
  assert.deepEqual(copy.validation.actualMonths, {}, 'actuals are never copied');
  assert.deepEqual(copy.development.allocations, initiative.development.allocations);
  assert.equal(copy.development.otherCosts.length, 1);
  assert.notEqual(copy.development.otherCosts[0].id, initiative.development.otherCosts[0].id);

  copy.development.allocations[0].allocationPct = 5;
  assert.notEqual(initiative.development.allocations[0].allocationPct, 5, 'no shared references');
});

/* -------------------------------------------------- the close freeze */

test('closing freezes the whole initiative, not only its numbers', () => {
  const { app, teamId, people } = setup();
  const initiative = estimated(app, teamId, people[0]);
  L.close(app, initiative, '2026-03-01');

  assert.throws(() => L.renameInitiative(initiative, 'New name'), /closed/);
  assert.throws(() => L.setDescription(initiative, 'New description'), /closed/);
  assert.throws(() => L.setState(initiative, 'cancelled'), /closed/);
  assert.throws(() => L.setTeam(app, initiative, Object.keys(app.TEAMS)[1]), /closed/);
  assert.throws(() => L.setPhasePeriod(initiative, E.VALIDATION, '2026-01-01', '2026-01-31'), /locked/);
  assert.throws(() => L.setAllocation(app, initiative, E.VALIDATION, people[0].id, 10), /locked/);
  assert.throws(() => L.addOtherCost(initiative, E.VALIDATION, { name: 'x', month: '2026-01', amount: 1 }), /locked/);
  assert.throws(() => L.recordActual(initiative, E.VALIDATION, '2026-01', 1), /locked/);
});

test('notes stay writable after close, so the reason can be recorded', () => {
  const { app, teamId, people } = setup();
  const initiative = estimated(app, teamId, people[0]);
  L.close(app, initiative, '2026-03-01');

  L.setNotes(initiative, 'Closed early: the vendor withdrew.');
  assert.equal(initiative.notes, 'Closed early: the vendor withdrew.');
});

test('reopening unlocks everything closing locked', () => {
  const { app, teamId, people } = setup();
  const initiative = estimated(app, teamId, people[0]);
  L.close(app, initiative, '2026-03-01');
  L.reopen(app, initiative);

  L.renameInitiative(initiative, 'Renamed');
  L.setState(initiative, 'on-hold');
  L.recordActual(initiative, E.VALIDATION, '2026-01', 500);

  assert.equal(initiative.name, 'Renamed');
  assert.equal(initiative.state, 'on-hold');
  assert.equal(initiative.validation.actualMonths['2026-01'], 500);
});

test('closing is the only way into Closed, whatever the process looks like', () => {
  for (const statusStages of [0, 1, 2]) {
    const { app, teamId, people } = setup(statusStages);
    const initiative = estimated(app, teamId, people[0]);

    L.passGate(app, initiative, E.VALIDATION, '2026-02-28');
    L.passGate(app, initiative, E.DEVELOPMENT, '2026-06-30');
    while (initiative.stage !== E.stageOrder(app.PROCESS).at(-2)) {
      L.advanceStage(app, initiative, '2026-07-01');
    }

    assert.notEqual(initiative.stage, E.CLOSED, `${statusStages} stages: never automatic`);
    // The refusal differs by terminal stage — a phase says "pass its gate",
    // a status stage says "closing is explicit" — but both refuse.
    assert.throws(() => L.advanceStage(app, initiative, '2026-08-01'));

    L.close(app, initiative, '2026-09-01');
    assert.equal(initiative.stage, E.CLOSED);
  }
});

test('an unknown state is refused', () => {
  const { app, teamId } = setup();
  const initiative = L.createInitiative(app, { name: 'Thing', teamId });
  assert.throws(() => L.setState(initiative, 'paused'), /unknown state/);
  for (const state of L.STATES) {
    L.setState(initiative, state);
    assert.equal(initiative.state, state);
  }
});

test('moving teams strands allocations rather than dropping them', () => {
  const { app, teamId, people } = setup();
  const other = Object.keys(app.TEAMS).find((id) => id !== teamId);
  const initiative = estimated(app, teamId, people[0]);
  const before = structuredClone(initiative.validation.allocations);

  const stranded = L.setTeam(app, initiative, other);

  assert.equal(initiative.teamId, other);
  assert.deepEqual(initiative.validation.allocations, before, 'nothing is silently dropped');
  const expected = before
    .map((a) => a.personId)
    .filter((id) => !E.membership(app.PEOPLE[id], other));
  assert.deepEqual(stranded.sort(), [...new Set(expected)].sort(), 'and the caller is told');
});
