/**
 * Generates the fictional demo export.
 *
 * It drives the real engine and lifecycle functions rather than writing JSON
 * by hand (DESIGN §7): a hand-built fixture can express states the code can
 * never produce, and then quietly rots when the rules change. Anything this
 * script cannot build is a state the app cannot reach.
 *
 *   node scripts/demo.mjs
 */
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { PROCESS } from '../src/process.js';
import { createMasterData } from '../src/masterData.js';
import * as E from '../src/engine.js';
import * as L from '../src/lifecycle.js';
import * as P from '../src/people.js';
import { serialize } from '../src/transfer.js';

// Ids embed the clock, so freeze it: a demo file whose every id churns on
// each regeneration makes for a useless diff.
const realNow = Date.now;
const FROZEN = Date.parse('2026-01-05T09:00:00Z');
Date.now = () => FROZEN;

const YEAR = new Date(FROZEN).getUTCFullYear();
const app = L.createApp(createMasterData(YEAR), PROCESS);

const teams = Object.values(app.TEAMS);
const order = E.phaseOrder(PROCESS);
const costed = E.costedPhaseIds(PROCESS);

/** Everyone this team may allocate, which is everyone holding a membership. */
const membersOf = (teamId) =>
  Object.values(app.PEOPLE).filter((person) => person.active && E.membership(person, teamId));

function estimate(initiative, spans) {
  const people = membersOf(initiative.teamId);
  costed.forEach((phaseId, index) => {
    const [start, end] = spans[index];
    L.setPhasePeriod(initiative, phaseId, start, end);
    people.slice(0, index + 1).forEach((person, i) => {
      L.setAllocation(app, initiative, phaseId, person.id, [60, 40, 25][i] ?? 20);
    });
  });
}

const greenAll = (initiative, gateId) => {
  for (const item of E.phaseForGate(PROCESS, gateId).gate.checklist ?? []) {
    L.setChecklistStatus(initiative, gateId, item.id, 'green');
  }
};

/** Take an initiative as far as `stopAt`, passing or skipping as told. */
function advanceTo(initiative, stopAt, { skip = [], dates = {} } = {}) {
  while (initiative.phaseId !== stopAt && initiative.status !== 'closed') {
    const gate = E.gateForPhase(PROCESS, initiative.phaseId);
    const when = dates[gate.id] ?? `${YEAR}-03-31`;
    if (skip.includes(gate.id)) {
      L.skipGate(app, PROCESS, initiative, gate.id, 'Not relevant to this initiative', when);
    } else {
      greenAll(initiative, gate.id);
      L.passGate(app, PROCESS, initiative, gate.id, when);
    }
  }
}

const make = (name, description, teamId) =>
  L.createInitiative(app, PROCESS, { name, description, teamId });

/* One initiative resting in each phase, so every state is represented. */

const discovery = make('Customer portal refresh', 'Replace the ageing self-service portal.', teams[0].id);
estimate(discovery, [[`${YEAR}-04-01`, `${YEAR}-06-30`], [`${YEAR}-07-01`, `${YEAR}-12-31`]]);

const validation = make('Payments migration', 'Move card processing to the new provider.', teams[0].id);
estimate(validation, [[`${YEAR}-02-01`, `${YEAR}-05-31`], [`${YEAR}-06-01`, `${YEAR}-11-30`]]);
advanceTo(validation, 'validation', { dates: { gate_discovery: `${YEAR}-01-28` } });

// This one skipped its first gate, so the stepper and gate comparison have a
// skip to show, and its Validation phase is left unfrozen by it.
const development = make('Warehouse automation', 'Automate pick-and-pack in the main depot.', teams[0].id);
estimate(development, [[`${YEAR}-01-01`, `${YEAR}-04-30`], [`${YEAR}-05-01`, `${YEAR}-10-31`]]);
advanceTo(development, 'development', {
  skip: ['gate_discovery'],
  dates: { gate_discovery: `${YEAR}-01-10`, gate_validation: `${YEAR}-04-30` },
});
// A phase underway has actuals, so the demo shows a forecast rather than a
// pure estimate.
for (const [month, amount] of [[`${YEAR}-01`, 41000], [`${YEAR}-02`, 38500], [`${YEAR}-03`, 44250]]) {
  L.recordActual(development, costed[0], month, amount);
}

const rollout = make('Supplier portal', 'Give suppliers self-service order tracking.', teams[1].id);
estimate(rollout, [[`${YEAR}-01-01`, `${YEAR}-03-31`], [`${YEAR}-04-01`, `${YEAR}-08-31`]]);
advanceTo(rollout, order.at(-1), {
  dates: { gate_discovery: `${YEAR}-01-15`, gate_validation: `${YEAR}-03-31`, gate_development: `${YEAR}-08-31` },
});

const closed = make('Fraud scoring v2', 'Second-generation fraud model, delivered.', teams[1].id);
estimate(closed, [[`${YEAR - 1}-06-01`, `${YEAR - 1}-09-30`], [`${YEAR - 1}-10-01`, `${YEAR}-01-31`]]);
advanceTo(closed, '__never__', {
  dates: {
    gate_discovery: `${YEAR - 1}-05-20`,
    gate_validation: `${YEAR - 1}-09-30`,
    gate_development: `${YEAR}-01-31`,
    gate_rollout: `${YEAR}-02-14`,
  },
});
L.setNotes(closed, 'Delivered on time. Benefits review scheduled for the summer.');

/* One initiative parked, so On Hold appears too. */
const parked = make('Loyalty scheme', 'Points and tiers for repeat customers.', teams[1].id);
estimate(parked, [[`${YEAR}-09-01`, `${YEAR}-12-31`], [`${YEAR + 1}-01-01`, `${YEAR + 1}-06-30`]]);
L.setStatus(parked, 'on-hold');

/* Someone on the bench joins a team, so the roster is not uniform. */
const bench = Object.values(app.PEOPLE).find((person) => person.memberships.length === 0);
if (bench) P.addMembership(bench, teams[1].id, 50);

Date.now = realNow;

const root = fileURLToPath(new URL('..', import.meta.url));
const path = `${root}examples/exports/demo.json`;
await writeFile(path, `${serialize(app)}\n`);

const summary = app.INITIATIVES.map(
  (i) => `  ${i.name} — ${i.status === 'closed' ? 'closed' : E.phaseLabel(PROCESS, i.phaseId)}` +
    ` (${i.status}), ${Object.keys(i.gates).length} gate(s)`,
).join('\n');
console.log(`wrote ${path}\n${summary}`);
