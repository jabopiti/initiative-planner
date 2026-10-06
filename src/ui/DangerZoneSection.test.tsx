import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultBrandPack } from '../brand/defaultBrand';
import { buildBaselineDataset } from '../data/baseline';
import type { DatasetFlags, Initiative, Team } from '../data/types';
import { BrandProvider } from '../state/BrandContext';
import { RepositoryProvider } from '../state/DataContext';
import { FIXTURE_COUNTRY, FIXTURE_ROLE, fakeGithub, initiative, person, seedDataset, type Fake } from '../sync/testing/fakeGithub';
import { TooltipProvider } from '@/components/ui/tooltip';
import { resetLine } from './resetLine';
import { SettingsPage } from './SettingsPage';

const { navigate } = vi.hoisted(() => ({ navigate: vi.fn() }));
vi.mock('../router/useHashRoute', async (original) => ({ ...(await original<object>()), navigate }));

/** Slice 032: Settings' Danger zone (§5.9) — Load example data and Reset, behind the section lock (§2). */

let fake: Fake;
const team: Team = { id: 't1', name: 'Platform', active: true };

function renderDangerZone(seeded: Parameters<typeof seedDataset>[1] = {}) {
  fake = fakeGithub();
  seedDataset(fake, seeded);
  const baseline = buildBaselineDataset(defaultBrandPack);
  fake.seed('roles.json', [...baseline.roles, FIXTURE_ROLE]);
  fake.seed('countries.json', [...baseline.countries, FIXTURE_COUNTRY]);
  render(
    <BrandProvider brand={defaultBrandPack}>
      <TooltipProvider>
        <RepositoryProvider token="token">
          <SettingsPage section="danger-zone" />
        </RepositoryProvider>
      </TooltipProvider>
    </BrandProvider>,
  );
  return userEvent.setup();
}

async function unlock(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Unlock to edit' }));
}

beforeEach(() => navigate.mockReset());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Danger zone (§5.9)', () => {
  it('starts locked: each action’s heading and description, no buttons until unlocked', async () => {
    const user = renderDangerZone();
    expect(await screen.findByRole('heading', { name: 'Danger zone', level: 2 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Load example data', level: 3 })).toBeInTheDocument();
    expect(screen.getByText('Returns the dataset to a fresh install.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Load example data' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reset' })).not.toBeInTheDocument();

    await unlock(user);
    expect(screen.getByRole('button', { name: 'Load example data' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reset' })).toBeInTheDocument();
  });

  it('loads example data into an empty dataset in one commit and opens the Portfolio', async () => {
    const user = renderDangerZone();
    await unlock(user);
    const load = screen.getByRole('button', { name: 'Load example data' });
    expect(load).toBeEnabled();
    expect(screen.queryByText('Reset first')).toBeNull();

    await user.click(load);

    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith('/portfolio'));
    expect(fake.gitCommits.map((c) => c.message)).toEqual(['Example data loaded']);
  });

  it('disables Load example data with "Reset first" while the dataset has data', async () => {
    const user = renderDangerZone({ teams: [team] });
    await unlock(user);
    expect(await screen.findByText('Reset first')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Load example data' })).toBeDisabled();
  });

  it('asks inline before a Reset, counting what it removes, and Cancel closes it', async () => {
    const initiatives: Initiative[] = [initiative({ teamId: 't1' }), initiative({ id: 'i2', teamId: 't1' }), initiative({ id: 'i3', teamId: 't1' })];
    const user = renderDangerZone({ teams: [team, { ...team, id: 't2', active: false }], people: [person('p1', 'Ana')], initiatives });
    await unlock(user);
    await screen.findByText('Reset first');

    await user.click(screen.getByRole('button', { name: 'Reset' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Reset the dataset' });
    expect(dialog).toHaveTextContent(
      "This removes 3 initiatives, 1 person and 2 teams, and sets roles, countries and rates back to their defaults. This can't be undone.",
    );
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(fake.gitCommits).toEqual([]);
  });

  it('Confirm reset returns the dataset to the baseline in one commit and opens the Portfolio', async () => {
    const user = renderDangerZone({ teams: [team], initiatives: [initiative()], ratesReviewed: true });
    await unlock(user);
    await screen.findByText('Reset first');
    await user.click(screen.getByRole('button', { name: 'Reset' }));
    await user.click(screen.getByRole('button', { name: 'Confirm reset' }));

    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith('/portfolio'));
    expect(fake.gitCommits.map((c) => c.message)).toEqual(['Dataset reset']);
    expect(fake.has('initiatives/i1.json')).toBe(false);
    expect(fake.read<DatasetFlags>('dataset.json').ratesReviewed).toBe(false);
  });

  it('says why a Reset failed, under the confirmation', async () => {
    const user = renderDangerZone({ teams: [team] });
    await unlock(user);
    await screen.findByText('Reset first');
    fake.failGraphql({ status: 403 });
    await user.click(screen.getByRole('button', { name: 'Reset' }));
    await user.click(screen.getByRole('button', { name: 'Confirm reset' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/^Not reset: .+\.$/);
    expect(navigate).not.toHaveBeenCalled();
  });
});

describe('resetLine (§9.9)', () => {
  it('leaves zero counts out and uses the singular for one', () => {
    expect(resetLine(1, 0, 2)).toBe("This removes 1 initiative and 2 teams, and sets roles, countries and rates back to their defaults. This can't be undone.");
    expect(resetLine(0, 0, 0)).toBe("This sets roles, countries and rates back to their defaults. This can't be undone.");
  });
});
