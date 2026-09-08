// Export/import. The round-trip test is the one PLAN Phase 2 names: a full
// dataset must survive serialize -> parse -> apply unchanged.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createMasterData } from '../src/masterData.js';
import * as E from '../src/engine.js';
import * as L from '../src/lifecycle.js';
import * as T from '../src/transfer.js';
import { PROCESS } from '../src/process.js';

const NOW = 2026;

/** A dataset with real history in it: an approval, an actual, a cost item. */
function populated() {
  const app = L.createApp(createMasterData(NOW), PROCESS);
  const teamId = Object.keys(app.TEAMS)[0];
  const person = Object.values(app.PEOPLE).find((p) => E.membership(p, teamId));
  const [firstCosted, secondCosted] = E.costedPhaseIds(PROCESS);

  const initiative = L.createInitiative(app, PROCESS, {
    name: 'Replatform',
    teamId,
    startPhaseId: firstCosted,
  });
  L.setPhasePeriod(initiative, firstCosted, '2026-01-01', '2026-02-28');
  L.setAllocation(app, initiative, firstCosted, person.id, 50);
  L.setPhasePeriod(initiative, secondCosted, '2026-03-01', '2026-06-30');
  L.setAllocation(app, initiative, secondCosted, person.id, 80);
  L.addOtherCost(initiative, secondCosted, { name: 'Licence', month: '2026-04', amount: 2500 });

  const gate = E.gateForPhase(PROCESS, firstCosted);
  for (const item of gate.checklist ?? []) {
    L.setChecklistStatus(initiative, gate.id, item.id, 'green');
  }
  L.passGate(app, PROCESS, initiative, gate.id, '2026-02-28');
  L.recordActual(initiative, firstCosted, '2026-01', 12345);

  return { app, initiative, teamId, person, firstCosted, secondCosted };
}

test('a full dataset survives a round trip exactly', () => {
  const { app } = populated();
  const parsed = T.parseImport(T.serialize(app));

  assert.equal(parsed.ok, true, parsed.error ?? '');
  assert.deepEqual(parsed.data, JSON.parse(JSON.stringify(app)));
  assert.deepEqual(T.applyImport({}, parsed.data, 'replace'), parsed.data);
});

test('an export is named for the day it was taken', () => {
  assert.equal(T.exportFilename(new Date('2026-09-08T11:00:00Z')), 'initiative-planner-2026-09-08.json');
});

test('an unreadable or incomplete file is rejected before any choice is offered', () => {
  assert.match(T.parseImport('not json').error, /not valid JSON/);
  assert.match(T.parseImport('[1,2,3]').error, /does not contain an export/);

  const { app } = populated();
  const partial = { ...JSON.parse(T.serialize(app)) };
  delete partial.PEOPLE;
  assert.match(T.parseImport(JSON.stringify(partial)).error, /missing: PEOPLE/);
});

test('an unknown schema version is rejected outright, with no migration offered', () => {
  const { app } = populated();
  const future = { ...JSON.parse(T.serialize(app)), schemaVersion: L.SCHEMA_VERSION + 1 };
  const parsed = T.parseImport(JSON.stringify(future));

  assert.equal(parsed.ok, false);
  assert.equal(parsed.data, null);
  assert.match(parsed.error, /no migration path/);
});

test('the preview counts what would change, per entity type', () => {
  const { app } = populated();
  const incoming = JSON.parse(T.serialize(app));

  const roleId = Object.keys(incoming.ROLES)[0];
  incoming.ROLES[roleId].name = 'Renamed';
  incoming.ROLES.role_new = { id: 'role_new', name: 'New', abbr: 'NEW', factor: 1, active: true };
  delete incoming.TEAMS[Object.keys(incoming.TEAMS)[1]];

  const merge = T.importPreview(app, incoming, 'merge');
  assert.deepEqual(merge.entities.ROLES.added, ['role_new']);
  assert.deepEqual(merge.entities.ROLES.changed, [roleId]);
  assert.deepEqual(merge.entities.TEAMS.removed, [], 'a merge keeps what the import omits');

  const replace = T.importPreview(app, incoming, 'replace');
  assert.equal(replace.entities.TEAMS.removed.length, 1, 'a replace discards it');
});

test('the preview names every approval a merge would overwrite', () => {
  const { app, initiative } = populated();
  const incoming = JSON.parse(T.serialize(app));
  const incomingInitiative = incoming.INITIATIVES.find((i) => i.id === initiative.id);
  const gateId = Object.keys(initiative.gates)[0];

  incomingInitiative.gates[gateId] = { ...incomingInitiative.gates[gateId], grandTotal: 1 };
  const changed = T.importPreview(app, incoming, 'merge');
  assert.equal(changed.approvalCollisions.length, 1);
  assert.equal(changed.approvalCollisions[0].initiativeId, initiative.id);
  assert.equal(changed.approvalCollisions[0].wouldBeCleared, false);

  delete incomingInitiative.gates[gateId];
  const cleared = T.importPreview(app, incoming, 'merge');
  assert.equal(cleared.approvalCollisions[0].wouldBeCleared, true, 'losing one is worse, not less');
});

test('an untouched approval is not reported as a collision', () => {
  const { app } = populated();
  const incoming = JSON.parse(T.serialize(app));
  assert.deepEqual(T.importPreview(app, incoming, 'merge').approvalCollisions, []);
});

test('a merge replaces a person wholesale, memberships included', () => {
  const { app, teamId } = populated();
  const incoming = JSON.parse(T.serialize(app));
  const person = Object.values(incoming.PEOPLE).find((p) => E.membership(p, teamId));

  person.memberships = [{ teamId, sharePct: 10, active: true }];
  person.capacityPct = 10;

  const preview = T.importPreview(app, incoming, 'merge');
  assert.ok(preview.peopleReplaced.includes(person.id));

  const merged = T.applyImport(app, incoming, 'merge');
  assert.deepEqual(merged.PEOPLE[person.id].memberships, person.memberships);
  assert.equal(merged.PEOPLE[person.id].capacityPct, 10);
});

test('a merge keeps local initiatives the import does not carry', () => {
  const { app, teamId } = populated();
  const incoming = JSON.parse(T.serialize(app));
  const local = L.createInitiative(app, PROCESS, { name: 'Local only', teamId });

  const merged = T.applyImport(app, incoming, 'merge');
  assert.ok(merged.INITIATIVES.some((i) => i.id === local.id), 'merge keeps it');

  const replaced = T.applyImport(app, incoming, 'replace');
  assert.equal(replaced.INITIATIVES.some((i) => i.id === local.id), false, 'replace does not');
});

test('applying an import shares no references with either side', () => {
  const { app } = populated();
  const incoming = JSON.parse(T.serialize(app));
  const merged = T.applyImport(app, incoming, 'merge');

  merged.INITIATIVES[0].name = 'Mutated';
  assert.notEqual(app.INITIATIVES[0].name, 'Mutated');
  assert.notEqual(incoming.INITIATIVES[0].name, 'Mutated');
});

test('a round trip preserves the numbers, not just the shape', () => {
  const { app, initiative } = populated();
  const before = {
    grand: E.grandTotal(initiative, app),
    coverage: E.initiativeCoverage(initiative),
    band: E.resolveBand(PROCESS.bands, E.grandTotal(initiative, app))?.id ?? null,
  };

  const restored = T.applyImport({}, T.parseImport(T.serialize(app)).data, 'replace');
  const copy = restored.INITIATIVES.find((i) => i.id === initiative.id);

  assert.equal(E.grandTotal(copy, restored), before.grand);
  assert.equal(E.initiativeCoverage(copy), before.coverage);
  assert.equal(E.resolveBand(PROCESS.bands, E.grandTotal(copy, restored))?.id ?? null, before.band);
});

test('an export from a different process is refused, and says so plainly', () => {
  const { app } = populated();
  const foreign = { ...JSON.parse(T.serialize(app)), processId: 'someone-elses-process' };
  const parsed = T.parseImport(JSON.stringify(foreign));

  assert.equal(parsed.ok, false);
  assert.equal(parsed.data, null);
  assert.match(parsed.error, /different process/);
  assert.doesNotMatch(parsed.error, /schema version/, 'a wrong process is not a wrong schema');
});

test('the export carries the process it means', () => {
  const { app } = populated();
  const exported = JSON.parse(T.serialize(app));
  assert.equal(exported.processId, PROCESS.id);
  assert.equal(exported.processVersion, PROCESS.version);
});
