// The demo export is a checked-in artifact generated from the real functions.
// These tests guard it against drifting away from the schema it must load
// under — a fixture nobody can import is worse than none.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { PROCESS } from '../src/process.js';
import * as E from '../src/engine.js';
import * as T from '../src/transfer.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const load = async () => JSON.parse(await readFile(`${root}examples/exports/demo.json`, 'utf8'));

test('the demo export imports into this build', async () => {
  const parsed = T.parseImport(JSON.stringify(await load()));
  assert.equal(parsed.ok, true, parsed.error ?? '');
});

test('every initiative sits in a phase this process defines', async () => {
  const demo = await load();
  const phases = E.phaseOrder(PROCESS);
  const costed = E.costedPhaseIds(PROCESS);

  for (const initiative of demo.INITIATIVES) {
    assert.ok(phases.includes(initiative.phaseId), `${initiative.name} is in ${initiative.phaseId}`);
    assert.ok(E.STATUSES.includes(initiative.status));
    assert.deepEqual(
      Object.keys(initiative.phases).sort(),
      [...costed].sort(),
      `${initiative.name} should carry a record for exactly the costed phases`,
    );
    for (const gateId of Object.keys(initiative.gates)) {
      assert.doesNotThrow(() => E.phaseForGate(PROCESS, gateId), `unknown gate ${gateId}`);
    }
  }
});

test('the demo shows every state the UI has to render', async () => {
  const demo = await load();
  const where = demo.INITIATIVES.map((i) => (i.status === 'closed' ? 'closed' : i.phaseId));

  for (const phase of E.phaseOrder(PROCESS)) {
    assert.ok(where.includes(phase) || phase === E.phaseOrder(PROCESS).at(-1),
      `nothing rests in ${phase}`);
  }
  assert.ok(where.includes('closed'), 'nothing is finished');
  assert.ok(demo.INITIATIVES.some((i) => i.status === 'on-hold'), 'nothing is on hold');

  const gates = demo.INITIATIVES.flatMap((i) => Object.values(i.gates));
  assert.ok(gates.some((g) => g.outcome === 'passed'), 'no gate was passed');
  assert.ok(gates.some((g) => g.outcome === 'skipped'), 'no gate was skipped');
  for (const gate of gates.filter((g) => g.outcome === 'skipped')) {
    assert.ok(gate.reason?.trim(), 'a skip without a reason should be impossible');
  }
});

test('the demo carries the two people cases worth seeing', async () => {
  const demo = await load();
  const people = Object.values(demo.PEOPLE);

  assert.ok(
    people.some((p) => p.memberships.filter((m) => m.active).length > 1),
    'nobody is split across teams, which is the case the share model exists for',
  );
  assert.ok(people.some((p) => p.customRole), 'nobody is on a custom rate');
  assert.ok(
    demo.INITIATIVES.some((i) =>
      Object.values(i.phases).some((p) => Object.keys(p.actualMonths).length > 0)),
    'nothing has actuals, so nothing reads as a forecast',
  );
});

test('a frozen phase carries the master data its figures were built from', async () => {
  const demo = await load();
  const frozen = demo.INITIATIVES.flatMap((i) => Object.values(i.phases)).filter((p) => p.frozen);

  assert.ok(frozen.length > 0, 'no phase was ever frozen');
  for (const phase of frozen) {
    for (const key of ['rolesCopy', 'countriesCopy', 'peopleCopy', 'perMonth']) {
      assert.ok(phase.frozen[key], `a frozen phase without ${key} could still move`);
    }
  }
});
