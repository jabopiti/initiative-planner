import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultBrandPack } from '../brand/defaultBrand';
import { buildBaselineDataset } from '../data/baseline';
import { BrandProvider } from '../state/BrandContext';
import { RepositoryProvider } from '../state/DataContext';
import { TooltipProvider } from '@/components/ui/tooltip';
import { PeopleOverview } from './PeopleOverview';
import { TeamsOverview } from './TeamsOverview';
import { fakeOnDemand, seedFiles } from '../sync/testing/fakeGithub';

const baseline = buildBaselineDataset(defaultBrandPack);
const teams = [{ id: 't1', name: 'Payments', active: true }];

const served = fakeOnDemand((fake) => seedFiles(fake, { dataset: baseline.datasetFlags, roles: baseline.roles, countries: baseline.countries, teams, people: [], memberships: [] }));

function stubGithub() {
  vi.stubGlobal('fetch', served.fetch);
}

function renderWith(ui: React.ReactNode) {
  return render(
    <BrandProvider brand={defaultBrandPack}>
      <TooltipProvider>
        <RepositoryProvider token="token">{ui}</RepositoryProvider>
      </TooltipProvider>
    </BrandProvider>,
  );
}

// The debounced writer commits after the test ends, so the stub must outlive each test.
beforeAll(stubGithub);
afterAll(() => vi.unstubAllGlobals());
beforeEach(() => served.reset());
afterEach(cleanup);

describe('name inputs take keyboard focus (shadcn Input receives ref, React 19)', () => {
  it('Teams overview: New team focuses the name field', async () => {
    const user = userEvent.setup();
    renderWith(<TeamsOverview />);
    await user.click(await screen.findByRole('button', { name: 'New team' }));
    await vi.waitFor(() => expect(screen.getByRole('textbox', { name: 'Team name' })).toHaveFocus());
  });

  it('People overview: adding a person returns focus to the quick-add name field', async () => {
    const user = userEvent.setup();
    renderWith(<PeopleOverview />);
    const nameField = await screen.findByPlaceholderText('Add a person by name');
    await user.type(nameField, 'Ada');
    await user.click(screen.getByRole('button', { name: 'Add person' }));
    expect(nameField).toHaveFocus();
  });
});
