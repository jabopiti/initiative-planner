import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultBrandPack } from '../brand/defaultBrand';
import { trackedYears } from '../data/cost';
import { Repository } from './Repository';
import { fakeGithub, seedFiles } from './testing/fakeGithub';

describe('Repository — the clock it is given', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function openAt(now: Date) {
    const fake = fakeGithub();
    seedFiles(fake, { roles: [], countries: [] });
    vi.stubGlobal('fetch', fake.fetchMock);
    const repo = new Repository(defaultBrandPack, 'token', () => now);
    await repo.initialize();
    return repo;
  }

  it('dates a new country’s rates, and a new initiative, by its clock', async () => {
    const now = new Date(2031, 5, 15);
    const repo = await openAt(now);

    const country = repo.createCountry({ name: 'Norway', code: 'NO', dayRate: 900 });
    expect(country.ratesByYear.map((r) => r.year)).toEqual(trackedYears(now));

    const team = repo.createTeam('Platform');
    const initiative = await repo.createInitiative('Checkout', team.id);
    const startDates = Object.values(initiative.phases ?? {}).map((plan) => plan.startDate);
    expect(startDates.some((d) => d?.startsWith('2031-'))).toBe(true);
  });

  it('still lets a call name its own date', async () => {
    const repo = await openAt(new Date(2031, 5, 15));
    const country = repo.createCountry({ name: 'Norway', code: 'NO', dayRate: 900 }, new Date(2026, 0, 1));
    expect(country.ratesByYear.map((r) => r.year)).toEqual(trackedYears(new Date(2026, 0, 1)));
  });
});
