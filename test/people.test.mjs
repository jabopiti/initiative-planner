// People, memberships, and the invariants that keep the share model honest.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createMasterData } from '../src/masterData.js';
import * as E from '../src/engine.js';
import * as L from '../src/lifecycle.js';
import { SIMPLE } from './processes.mjs';
import * as P from '../src/people.js';
import * as T from '../src/transfer.js';

const NOW = 2026;
const setup = () => L.createApp(createMasterData(NOW), SIMPLE);

test('a new person starts active, on a standard role, with no team', () => {
  const app = setup();
  const person = P.createPerson(app);

  assert.equal(person.active, true);
  assert.ok(person.roleId, 'a standard role by default');
  assert.equal(person.customRole, null);
  assert.deepEqual(person.memberships, []);
  assert.equal(app.PEOPLE[person.id], person, 'and is findable in the dataset');
});

test('a person has a standard role or a custom rate, never both', () => {
  const app = setup();
  const person = P.createPerson(app);
  const roleId = person.roleId;

  P.useCustomRole(app, person, 'Contract Engineer');
  assert.equal(person.roleId, null, 'switching to custom clears the role');
  assert.ok(person.customRole.byYear[NOW] > 0);

  P.useStandardRole(person, roleId);
  assert.equal(person.customRole, null, 'and switching back clears the custom rate');
  assert.equal(person.roleId, roleId);
});

test('switching to a custom rate starts at what the person already costs', () => {
  const app = setup();
  const person = Object.values(app.PEOPLE).find((p) => p.roleId);
  const before = E.resolveRate(person, app.ROLES, app.COUNTRIES, NOW);
  const effective = Math.round(before.dayRate * before.factor);

  P.useCustomRole(app, person);
  const after = E.resolveRate(person, app.ROLES, app.COUNTRIES, NOW);

  assert.equal(after.dayRate, effective, 'the switch is cost-neutral, not a reset to zero');
  assert.equal(after.factor, 1, 'and the role factor is now baked in, not applied twice');
});

test('a custom rate is set per year, like a country rate', () => {
  const app = setup();
  const person = P.createPerson(app);
  P.useCustomRole(app, person);
  const years = Object.keys(person.customRole.byYear).map(Number).sort((a, b) => a - b);
  assert.ok(years.length > 1, 'one rate per tracked year');

  P.setCustomRate(person, years[1], 1234);
  assert.equal(E.resolveRate(person, app.ROLES, app.COUNTRIES, years[1]).dayRate, 1234);
  assert.notEqual(E.resolveRate(person, app.ROLES, app.COUNTRIES, years[0]).dayRate, 1234);
});

test('a person holds at most one membership per team', () => {
  const app = setup();
  const person = P.createPerson(app);
  const teamId = Object.keys(app.TEAMS)[0];

  P.addMembership(person, teamId, 50);
  P.setMembershipActive(app, person, teamId, false);
  P.addMembership(person, teamId, 30);

  assert.equal(person.memberships.length, 1, 'rejoining reactivates, never duplicates');
  assert.equal(person.memberships[0].active, true);
  assert.equal(person.memberships[0].sharePct, 30);
});

test('shares over capacity warn without blocking', () => {
  const app = setup();
  const person = P.createPerson(app);
  const [first, second] = Object.keys(app.TEAMS);

  P.addMembership(person, first, 70);
  P.addMembership(person, second, 60);

  const warning = P.shareWarning(person);
  assert.equal(warning.totalSharePct, 130);
  assert.equal(warning.overCommitted, true);
  assert.equal(E.totalSharePct(person), 130, 'the shares stand regardless');
});

test('unassigned capacity is what no team holds', () => {
  const app = setup();
  const person = P.createPerson(app);
  P.addMembership(person, Object.keys(app.TEAMS)[0], 60);

  const warning = P.shareWarning(person);
  assert.equal(warning.unassignedPct, 40);
  assert.equal(warning.overCommitted, false);
});

test('leaving a team strands allocations rather than dropping them', () => {
  const app = setup();
  const teamId = Object.keys(app.TEAMS)[0];
  const person = Object.values(app.PEOPLE).find((p) => E.membership(p, teamId));

  const initiative = L.createInitiative(app, SIMPLE, { name: 'Replatform', teamId });
  L.setPhasePeriod(initiative, 'plan', '2026-01-01', '2026-03-31');
  L.setAllocation(app, initiative, 'plan', person.id, 40);

  assert.deepEqual(E.strandedAllocations(app, person.id), [], 'nothing stranded yet');

  const stranded = P.setMembershipActive(app, person, teamId, false);
  assert.equal(stranded.length, 1);
  assert.equal(stranded[0].initiative.id, initiative.id);
  assert.equal(initiative.phases.plan.allocations.length, 1, 'the allocation is untouched');
  assert.ok(E.phaseBlendedTotal(initiative.phases.plan, app) > 0, 'and still costing');
});

test('capacity over time breaks non-initiative work out per team', () => {
  const app = setup();
  const person = Object.values(app.PEOPLE).find(
    (p) => p.memberships.filter((m) => m.active).length > 1,
  );
  const [first] = person.memberships.filter((m) => m.active);

  const initiative = L.createInitiative(app, SIMPLE, { name: 'Thing', teamId: first.teamId });
  L.setPhasePeriod(initiative, 'plan', '2026-05-01', '2026-05-31');
  L.setAllocation(app, initiative, 'plan', person.id, 20);

  const [row] = P.capacityOverTime(app, person.id, ['2026-05']);
  assert.equal(row.allocatedPct, 20);
  assert.equal(row.overAllocated, false);
  assert.equal(row.nonInitiative.length, person.memberships.filter((m) => m.active).length);

  const spare = row.nonInitiative.reduce((total, entry) => total + entry.pct, 0);
  assert.equal(spare, E.totalSharePct(person) - 20, 'and sums to what is uncommitted');
});

test('a person\'s initiatives include on-hold work, which still costs', () => {
  const app = setup();
  const teamId = Object.keys(app.TEAMS)[0];
  const person = Object.values(app.PEOPLE).find((p) => E.membership(p, teamId));

  const initiative = L.createInitiative(app, SIMPLE, { name: 'Paused', teamId });
  L.setPhasePeriod(initiative, 'plan', '2026-02-01', '2026-02-28');
  L.setAllocation(app, initiative, 'plan', person.id, 30);
  L.setStatus(initiative, 'on-hold');

  const rows = E.personInitiatives(app, person.id);
  assert.equal(rows.length, 1, 'it is still their work');
  assert.equal(rows[0].countsTowardCapacity, false, 'but not against their capacity');
  assert.equal(E.allocatedPct(app, person.id, '2026-02'), 0);
});

/* -------------------------------------------------- table export */

test('CSV quotes only the cells that need it', () => {
  const csv = T.toCsv(['Name', 'Note'], [['Ada', 'plain'], ['Bo, Jr', 'said "hi"'], ['Cy', 'two\nlines']]);
  const lines = csv.split('\r\n');
  assert.equal(lines[0], 'Name,Note');
  assert.equal(lines[1], 'Ada,plain');
  assert.equal(lines[2], '"Bo, Jr","said ""hi"""');
  assert.ok(csv.includes('"two\nlines"'), 'a newline inside a cell stays quoted');
});

test('the plain-text copy is tab-separated and single-line per row', () => {
  const tsv = T.toTsv(['A', 'B'], [['one\ttwo', 'three\nfour']]);
  assert.equal(tsv.split('\n').length, 2, 'an embedded newline must not split the row');
  assert.equal(tsv.split('\n')[1], 'one two\tthree four');
});

test('the rich copy escapes markup rather than emitting it', () => {
  const html = T.toHtmlTable(['Name'], [['<img src=x onerror=alert(1)>']]);
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.equal(html.includes('<img'), false);
});

test('toggling to a custom rate and back restores the original role', () => {
  const app = setup();
  const person = Object.values(app.PEOPLE).find((p) => p.roleId);
  const original = person.roleId;
  const originalRate = E.resolveRate(person, app.ROLES, app.COUNTRIES, NOW);

  P.useCustomRole(app, person);
  P.useStandardRole(person);

  assert.equal(person.roleId, original, 'exploring the choice must not reassign the role');
  assert.deepEqual(E.resolveRate(person, app.ROLES, app.COUNTRIES, NOW), originalRate);
});

test('an explicit role still wins over the remembered one', () => {
  const app = setup();
  const person = Object.values(app.PEOPLE).find((p) => p.roleId);
  const other = Object.keys(app.ROLES).find((id) => id !== person.roleId);

  P.useCustomRole(app, person);
  P.useStandardRole(person, other);
  assert.equal(person.roleId, other);
});
