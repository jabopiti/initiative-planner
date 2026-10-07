import { describe, expect, it } from 'vitest';
import type { Country, Role, Team } from '../data/types';
import { countryWords, roleWords, teamWords } from './commitWords';

const role: Role = { id: 'r1', name: 'Engineer', abbreviation: 'ENG', costFactor: 1, active: true };
const country: Country = { id: 'c1', name: 'Germany', code: 'DE', active: true } as Country;
const team: Team = { id: 't1', name: 'Payments', active: true } as Team;

describe('commit words', () => {
  it('names an added and a removed role', () => {
    expect(roleWords(undefined, role)).toBe('Roles: Engineer added');
    expect(roleWords(role, undefined)).toBe('Roles: Engineer removed');
  });

  it('lists each change to a role under the name it was saved under', () => {
    expect(roleWords(role, { ...role, name: 'Dev', costFactor: 1.2, active: false })).toBe(
      'Roles: Engineer renamed to Dev, cost factor set to 1.2, deactivated',
    );
  });

  it('says "updated" when nothing visible changed', () => {
    expect(countryWords(country, { ...country })).toBe('Countries: Germany updated');
  });

  it('words a team being created, renamed and deactivated', () => {
    expect(teamWords(undefined, team)).toBe('Payments: team created');
    expect(teamWords(team, { ...team, name: 'Billing' })).toBe('Payments: team renamed to Billing');
    expect(teamWords(team, { ...team, active: false })).toBe('Payments: team deactivated');
  });
});
