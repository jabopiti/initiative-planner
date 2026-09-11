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

/* -------------------------------------------------- teams */

test('a team can be created, renamed and deactivated', () => {
  const app = setup();
  const team = P.createTeam(app, 'Platform Enablement');

  assert.equal(app.TEAMS[team.id], team);
  assert.equal(team.active, true);
  P.renameTeam(team, 'Enablement');
  assert.equal(team.name, 'Enablement');
  P.setTeamActive(team, false);
  assert.equal(team.active, false);
});

test('a team referenced by an initiative cannot be deleted, and says which', () => {
  const app = setup();
  const teamId = Object.keys(app.TEAMS)[0];
  L.createInitiative(app, SIMPLE, { name: 'Payments migration', teamId });

  const check = P.canDeleteTeam(app, teamId);
  assert.equal(check.ok, false);
  assert.deepEqual(check.blockers, ['Payments migration']);
  assert.throws(() => P.deleteTeam(app, teamId), /Payments migration/);
  assert.ok(app.TEAMS[teamId], 'and it is still there');
});

test('deleting an unreferenced team takes its memberships with it', () => {
  const app = setup();
  const team = P.createTeam(app, 'Doomed');
  const person = Object.values(app.PEOPLE)[0];
  P.addMembership(person, team.id, 20);

  P.deleteTeam(app, team.id);

  assert.equal(app.TEAMS[team.id], undefined);
  assert.equal(
    person.memberships.some((m) => m.teamId === team.id),
    false,
    'a membership of a team that no longer exists describes nothing',
  );
});

test('the roster is everyone pointing at the team, seen from the other side', () => {
  const app = setup();
  const teamId = Object.keys(app.TEAMS)[0];
  const roster = P.teamRoster(app, teamId);

  assert.ok(roster.length > 0);
  for (const row of roster) {
    assert.equal(row.membership.teamId, teamId);
    assert.equal(
      row.membership,
      row.person.memberships.find((m) => m.teamId === teamId),
      'the same record, not a copy — editing a share here edits it on the person',
    );
  }
});

test('a leaver stays on the roster, marked inactive rather than removed', () => {
  const app = setup();
  const teamId = Object.keys(app.TEAMS)[0];
  const person = P.teamRoster(app, teamId)[0].person;
  const before = P.teamRoster(app, teamId).length;

  P.setMembershipActive(app, person, teamId, false);

  assert.equal(P.teamRoster(app, teamId).length, before, 'never a hard delete');
  assert.equal(P.teamRoster(app, teamId).find((r) => r.person.id === person.id).membership.active, false);
  assert.equal(P.teamSummary(app, teamId, `${NOW}-01`).activeMembers, before - 1, 'but out of the count');
});

test('a team summary counts only what is active', () => {
  const app = setup();
  const teamId = Object.keys(app.TEAMS)[0];
  const roster = P.teamRoster(app, teamId).filter((r) => r.membership.active);
  const expected = roster.reduce((t, r) => t + r.membership.sharePct, 0);

  const summary = P.teamSummary(app, teamId, `${NOW}-01`);
  assert.equal(summary.totalSharePct, expected);
  assert.equal(summary.activeInitiatives, 0);

  L.createInitiative(app, SIMPLE, { name: 'Live', teamId });
  const held = L.createInitiative(app, SIMPLE, { name: 'Paused', teamId });
  L.setStatus(held, 'on-hold');
  assert.equal(
    P.teamSummary(app, teamId, `${NOW}-01`).activeInitiatives, 1, 'on-hold work is not active',
  );
});

test('a team summary carries this month\'s cost and allocated share (§4.5)', () => {
  const app = setup();
  const teamId = Object.keys(app.TEAMS)[0];
  const person = Object.values(app.PEOPLE).find((p) => E.membership(p, teamId));
  const share = E.membership(person, teamId).sharePct;

  const initiative = L.createInitiative(app, SIMPLE, { name: 'Alpha', teamId });
  L.setPhasePeriod(initiative, 'plan', '2026-05-01', '2026-05-31');
  L.setAllocation(app, initiative, 'plan', person.id, share);

  const summary = P.teamSummary(app, teamId, '2026-05');
  assert.equal(summary.allocatedSharePct, share, 'fully allocated, no spare share left');
  assert.equal(
    Math.round(summary.costThisMonth),
    Math.round(E.teamRunRate(app, teamId, ['2026-05'])[0].total),
  );

  // A month with nothing allocated costs only whatever non-initiative work
  // the roster's unused share still implies (SPEC §5.2) — never zero for a
  // team with an active roster.
  const idle = P.teamSummary(app, teamId, '2026-01');
  assert.equal(idle.allocatedSharePct, 0);
  assert.ok(idle.costThisMonth > 0, 'unused share still costs as non-initiative work');
});

/* -------------------------------------------------- run rate */

test('a team run-rate stacks its initiatives plus one non-initiative segment', () => {
  const app = setup();
  const teamId = Object.keys(app.TEAMS)[0];
  const person = Object.values(app.PEOPLE).find((p) => E.membership(p, teamId));

  const make = (name, pct) => {
    const initiative = L.createInitiative(app, SIMPLE, { name, teamId });
    L.setPhasePeriod(initiative, 'plan', '2026-05-01', '2026-05-31');
    L.setAllocation(app, initiative, 'plan', person.id, pct);
    return initiative;
  };
  const first = make('Alpha', 20);
  const second = make('Beta', 30);

  const [row] = E.teamRunRate(app, teamId, ['2026-05']);
  const byName = Object.fromEntries(row.segments.map((s) => [s.name, s.cost]));

  assert.ok(byName.Alpha > 0 && byName.Beta > 0);
  assert.ok(byName['Non-initiative work'] > 0, 'the share nobody committed still costs');
  assert.equal(
    Math.round(row.total),
    Math.round(row.segments.reduce((t, s) => t + s.cost, 0)),
    'the stack must add up to the bar',
  );

  // The two initiatives together cost what their allocations imply, and the
  // chart's figure for one must match that initiative's own.
  assert.equal(
    Math.round(byName.Alpha),
    Math.round(E.initiativeCostInMonth(first, app, '2026-05')),
  );
  assert.equal(
    Math.round(byName.Beta),
    Math.round(E.initiativeCostInMonth(second, app, '2026-05')),
  );
});

test('non-initiative work is costed like initiative work, not at a discount', () => {
  const app = setup();
  const teamId = Object.keys(app.TEAMS)[0];
  const person = Object.values(app.PEOPLE).find(
    (p) => E.membership(p, teamId) && E.membership(p, teamId).sharePct === 100,
  );
  assert.ok(person, 'need someone a team holds outright');

  const month = '2026-05';
  const spare = E.nonInitiativeWorkCost(app, person.id, teamId, month);

  // Nothing is allocated, so their whole share is non-initiative work — which
  // must cost exactly what allocating them fully would have.
  const initiative = L.createInitiative(app, SIMPLE, { name: 'Full', teamId });
  L.setPhasePeriod(initiative, 'plan', '2026-05-01', '2026-05-31');
  L.setAllocation(app, initiative, 'plan', person.id, 100);
  const allocated = E.initiativeCostInMonth(initiative, app, month);

  assert.equal(Math.round(spare), Math.round(allocated));
  assert.equal(E.nonInitiativeWorkCost(app, person.id, teamId, month), 0, 'and now none is spare');
});

test('a person split across teams costs each team only its own share', () => {
  const app = setup();
  const person = Object.values(app.PEOPLE).find(
    (p) => p.memberships.filter((m) => m.active).length > 1,
  );
  const [first, second] = person.memberships.filter((m) => m.active);
  const month = '2026-05';

  const a = E.nonInitiativeWorkCost(app, person.id, first.teamId, month);
  const b = E.nonInitiativeWorkCost(app, person.id, second.teamId, month);
  const whole = (a + b) * (person.capacityPct / E.totalSharePct(person));

  assert.ok(a > 0 && b > 0);
  assert.ok(
    Math.abs(a / b - first.sharePct / second.sharePct) < 0.0001,
    'each team pays in proportion to the share it holds',
  );
  assert.ok(whole > 0, 'and together they account for the person, never twice over');
});
