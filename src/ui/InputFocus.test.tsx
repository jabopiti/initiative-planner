import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { defaultBrandPack } from '../brand/defaultBrand';
import { buildBaselineDataset } from '../data/baseline';
import { BrandProvider } from '../state/BrandContext';
import { RepositoryProvider } from '../state/DataContext';
import { NewInitiativeUIProvider } from '../state/NewInitiativeUIContext';
import { NewInitiativeControl } from './NewInitiativeControl';
import { PeopleOverview } from './PeopleOverview';
import { TeamsOverview } from './TeamsOverview';

const baseline = buildBaselineDataset(defaultBrandPack);
const teams = [{ id: 't1', name: 'Payments', active: true }];

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}
function file(content: unknown, sha: string): Response {
  return json({ content: btoa(JSON.stringify(content)), sha });
}

function stubGithub() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      if ((init.method ?? 'GET') === 'PUT') return json({ content: { sha: 'next' } });
      if (url.includes('/contents/dataset.json')) return file(baseline.datasetFlags, 'd');
      if (url.includes('/contents/roles.json')) return file(baseline.roles, 'r');
      if (url.includes('/contents/countries.json')) return file(baseline.countries, 'c');
      if (url.includes('/contents/teams.json')) return file(teams, 't');
      if (url.includes('/contents/people.json')) return file([], 'p');
      if (url.includes('/contents/memberships.json')) return file([], 'm');
      return json({ message: 'Not Found' }, 404);
    }),
  );
}

function renderWith(ui: React.ReactNode) {
  return render(
    <BrandProvider brand={defaultBrandPack}>
      <RepositoryProvider token="token">
        <NewInitiativeUIProvider>{ui}</NewInitiativeUIProvider>
      </RepositoryProvider>
    </BrandProvider>,
  );
}

// The debounced writer commits after the test ends, so the stub must outlive each test.
beforeAll(stubGithub);
afterAll(() => vi.unstubAllGlobals());
afterEach(cleanup);

describe('name inputs take keyboard focus (shadcn Input receives ref, React 19)', () => {
  it('Teams overview: New team focuses the name field', async () => {
    const user = userEvent.setup();
    renderWith(<TeamsOverview />);
    await user.click(await screen.findByRole('button', { name: 'New team' }));
    await vi.waitFor(() => expect(screen.getByPlaceholderText('Team name')).toHaveFocus());
  });

  it('New initiative control: opening focuses the name field', async () => {
    const user = userEvent.setup();
    renderWith(<NewInitiativeControl />);
    await user.click(await screen.findByRole('button', { name: 'New initiative' }));
    expect(screen.getByPlaceholderText('Initiative name')).toHaveFocus();
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
