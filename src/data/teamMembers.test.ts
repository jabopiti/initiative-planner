import { describe, expect, it } from 'vitest';
import { activeMembers, activeMembership, isActiveMember, joinableTeams } from './teamMembers';
import type { Membership, Person } from './types';

const person = (id: string, active = true): Person => ({
  id,
  name: id,
  countryId: 'de',
  roleId: 'dev',
  capacityPct: 100,
  active,
});
const membership = (personId: string, teamId = 't1', active = true): Membership => ({
  id: `m-${personId}-${teamId}`,
  personId,
  teamId,
  teamFtePct: 50,
  active,
});

describe('a team’s active members (§4, §5.7)', () => {
  const people = [person('ana'), person('bo', false), person('cy'), person('di')];
  const memberships = [
    membership('ana'),
    membership('bo'),
    membership('cy', 't1', false),
    membership('di', 't2'),
  ];

  it('is an active membership held by an active person, once', () => {
    expect(activeMembers('t1', memberships, people).map((p) => p.id)).toEqual(['ana']);
  });

  it('counts a person once even when they hold two active memberships of the team', () => {
    const duplicated = [...memberships, { ...membership('ana'), id: 'm-again' }];
    expect(activeMembers('t1', duplicated, people)).toHaveLength(1);
  });

  it('leaves out a deactivated person whatever their membership says, and brings them back on reactivation', () => {
    const bo = people[1];
    expect(isActiveMember(bo, 't1', memberships)).toBe(false);
    expect(activeMembers('t1', memberships, [people[0], { ...bo, active: true }]).map((p) => p.id)).toEqual(['ana', 'bo']);
  });

  it('leaves out an inactive membership of an active person, and a member of another team', () => {
    expect(isActiveMember(people[2], 't1', memberships)).toBe(false);
    expect(isActiveMember(people[3], 't1', memberships)).toBe(false);
    expect(isActiveMember(people[3], 't2', memberships)).toBe(true);
  });
});

describe('activeMembership', () => {
  it("finds the person's active membership of the team, and nothing else", () => {
    const active = membership('ana');
    expect(activeMembership('ana', 't1', [membership('bo'), membership('ana', 't2'), active])).toBe(active);
    expect(activeMembership('ana', 't1', [membership('ana', 't1', false)])).toBeUndefined();
    expect(activeMembership('ana', 't1', [])).toBeUndefined();
  });
});

describe('joinableTeams', () => {
  const teams = [
    { id: 't1', name: 'T1', active: true },
    { id: 't2', name: 'T2', active: true },
    { id: 't3', name: 'T3', active: false },
  ];

  it('lists active teams the person has no membership of', () => {
    expect(joinableTeams('ana', teams, [membership('ana', 't1')]).map((t) => t.id)).toEqual(['t2']);
  });

  it('offers a team where the membership is inactive: joining it again reactivates that membership', () => {
    expect(joinableTeams('ana', teams, [membership('ana', 't1', false)]).map((t) => t.id)).toEqual(['t1', 't2']);
  });

  it('leaves out inactive teams and ignores other people’s memberships', () => {
    expect(joinableTeams('ana', teams, [membership('bo', 't1')]).map((t) => t.id)).toEqual(['t1', 't2']);
  });
});
