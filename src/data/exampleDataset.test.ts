import { describe, expect, it } from 'vitest';
import { defaultBrandPack } from '../brand/defaultBrand';
import { buildBaselineDataset } from './baseline';
import { buildExampleData } from './exampleDataset';
import { currentPhaseId } from './gate';

const baseline = () => buildBaselineDataset(defaultBrandPack);
const today = new Date(2026, 9, 15); // 15 Oct 2026

describe('buildExampleData (§2, §5.9)', () => {
  it('builds the example teams, people and memberships on the dataset’s own roles and countries', () => {
    const { roles, countries } = baseline();
    const data = buildExampleData(defaultBrandPack, { roles, countries }, today);
    expect(data.teams.map((t) => t.name)).toEqual(['Platform', 'Growth']);
    expect(data.people).toHaveLength(9);
    expect(data.memberships).toHaveLength(9);
    const mara = data.people.find((p) => p.name === 'Mara Voss')!;
    expect(mara.roleId).toBe(roles.find((r) => r.abbreviation === 'PM')!.id);
    expect(mara.countryId).toBe(countries.find((c) => c.name === 'Germany')!.id);
    expect(data.addedRoles).toBe(false);
    expect(data.addedCountries).toBe(false);
    expect(data.roles).toEqual(roles);
  });

  it('puts the initiatives in their phases, earlier gates passed with a frozen snapshot', () => {
    const { roles, countries } = baseline();
    const data = buildExampleData(defaultBrandPack, { roles, countries }, today);
    const phaseOf = (name: string) => currentPhaseId(data.initiatives.find((i) => i.name === name)!, defaultBrandPack.process);
    expect(phaseOf('Checkout Redesign')).toBe('development');
    expect(phaseOf('Fraud Detection Upgrade')).toBe('discovery');
    expect(phaseOf('Onboarding Flow v2')).toBe('validation');

    const checkout = data.initiatives.find((i) => i.name === 'Checkout Redesign')!;
    const g2 = checkout.gates!.validation;
    expect(g2.outcome).toBe('passed');
    expect(g2.passedOn).toBe('2026-10-01');
    expect(g2.frozenSnapshot!.startDate).toBe('2026-07-01');
    expect(g2.frozenSnapshot!.endDate).toBe('2026-09-30');
    expect(g2.recordedGrandEstimate).toBeGreaterThan(0);
    expect(g2.recordedApprovalTrack).not.toBeUndefined();
  });

  it('dates the phases relative to the month it is loaded in', () => {
    const { roles, countries } = baseline();
    const data = buildExampleData(defaultBrandPack, { roles, countries }, new Date(2027, 1, 3));
    const onboarding = data.initiatives.find((i) => i.name === 'Onboarding Flow v2')!;
    expect(onboarding.phases!.validation.startDate).toBe('2027-01-01');
    expect(onboarding.phases!.validation.endDate).toBe('2027-03-31');
    expect(onboarding.phases!.development.endDate).toBe('2027-09-30');
  });

  it('adds a role or country it needs that is missing or inactive, from the fresh-install baseline', () => {
    const { roles, countries } = baseline();
    const edited = roles.map((r) => (r.abbreviation === 'XD' ? { ...r, active: false } : r)).filter((r) => r.abbreviation !== 'TL');
    const data = buildExampleData(defaultBrandPack, { roles: edited, countries: countries.filter((c) => c.name !== 'Spain') }, today);
    expect(data.addedRoles).toBe(true);
    expect(data.addedCountries).toBe(true);
    expect(data.roles.filter((r) => r.abbreviation === 'XD').map((r) => r.active)).toEqual([false, true]);
    expect(data.roles.some((r) => r.abbreviation === 'TL' && r.active)).toBe(true);
    expect(data.countries.find((c) => c.name === 'Spain')!.ratesByYear[0].dayRate).toBe(800);
    const lucia = data.people.find((p) => p.name === 'Lucía Ramos')!;
    expect(data.roles.find((r) => r.id === lucia.roleId)!.active).toBe(true);
  });
});
