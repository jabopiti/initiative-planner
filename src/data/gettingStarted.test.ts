import { describe, expect, it } from 'vitest';
import { gettingStartedSteps } from './gettingStarted';
import type { Initiative, Membership, Person, Team } from './types';

const flags = (ratesReviewed: boolean) => ({ schemaVersion: 1, processIdentity: { id: 'p', structureVersion: 1 }, ratesReviewed });
const team = (id: string, active = true): Team => ({ id, name: id, active });
const person = (id: string, active = true): Person => ({ id, name: id, countryId: 'c', roleId: 'r', capacityPct: 100, active });
const member = (personId: string, teamId: string, active = true): Membership => ({ id: `${personId}-${teamId}`, personId, teamId, teamFtePct: 50, active });
const init = { id: 'i', name: 'I', teamId: 't1', status: 'Active' } as Initiative;
type Data = Parameters<typeof gettingStartedSteps>[0];
const base: Data = { datasetFlags: flags(false), teams: [], people: [], memberships: [], initiatives: [] };
const done = (data: Partial<Data>) => gettingStartedSteps({ ...base, ...data }).map((s) => s.done);

describe('gettingStartedSteps (§5.2)', () => {
  it('has four open steps on a fresh dataset, and treats flags not yet loaded as not reviewed', () => {
    expect(done({})).toEqual([false, false, false, false]);
    expect(done({ datasetFlags: null })).toEqual([false, false, false, false]);
  });

  it('checks each step as its data appears', () => {
    expect(done({ datasetFlags: flags(true) })).toEqual([true, false, false, false]);
    expect(done({ teams: [team('t1')] })).toEqual([false, true, false, false]);
    expect(done({ teams: [team('t1')], people: [person('a')], memberships: [member('a', 't1')] })).toEqual([false, true, true, false]);
    expect(done({ initiatives: [init] })).toEqual([false, false, false, true]);
  });

  it('counts a member only when the membership, the person and the team are all active', () => {
    const one = { people: [person('a')], memberships: [member('a', 't1')] };
    expect(done({ ...one, teams: [team('t1', false)] })[2]).toBe(false);
    expect(done({ ...one, teams: [team('t1')], memberships: [member('a', 't1', false)] })[2]).toBe(false);
    expect(done({ ...one, teams: [team('t1')], people: [person('a', false)] })[2]).toBe(false);
  });

  it('links to the settings section, Teams, the first active team and the draft page', () => {
    const steps = gettingStartedSteps({ ...base, teams: [team('old', false), team('t1'), team('t2')] });
    expect(steps.map((s) => s.href)).toEqual(['#/settings/countries', '#/teams', '#/teams/t1', '#/initiatives/new']);
    expect(steps.every((s) => s.arrives)).toBe(true);
  });

  it('sends the steps that need an active team to Teams while none is active, where they arrive at nothing', () => {
    for (const teams of [[], [team('old', false)]]) {
      const steps = gettingStartedSteps({ ...base, teams }).slice(2);
      expect(steps.map((s) => s.href)).toEqual(['#/teams', '#/teams']);
      expect(steps.map((s) => s.arrives)).toEqual([false, false]);
    }
  });
});
