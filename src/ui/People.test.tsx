import { useState } from 'react';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { defaultBrandPack } from '../brand/defaultBrand';
import { buildBaselineDataset } from '../data/baseline';
import { BrandProvider } from '../state/BrandContext';
import { RepositoryProvider } from '../state/DataContext';
import { TooltipProvider } from '@/components/ui/tooltip';
import { PeopleOverview } from './PeopleOverview';
import { TeamDetail } from './TeamDetail';

const baseline = buildBaselineDataset(defaultBrandPack);
const teams = [
  { id: 't1', name: 'Payments', active: true },
  { id: 't2', name: 'Platform', active: true },
];

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}
function file(content: unknown, sha: string): Response {
  return json({ content: btoa(JSON.stringify(content)), sha });
}

/** A repository whose data branch already holds the baseline plus two teams; every write succeeds. */
function stubGithub() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? 'GET';
      if (method === 'PUT') return json({ content: { sha: 'next' } });
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

let goTo: (view: string) => void = () => {};

function Harness() {
  const [view, setView] = useState('people');
  goTo = setView;
  return view === 'people' ? <PeopleOverview /> : <TeamDetail id={view} />;
}

async function renderApp() {
  render(
    <BrandProvider brand={defaultBrandPack}>
      <TooltipProvider>
        <RepositoryProvider token="token">
          <Harness />
        </RepositoryProvider>
      </TooltipProvider>
    </BrandProvider>,
  );
  await screen.findByPlaceholderText('Add a person by name');
}

async function addPerson(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.type(screen.getByPlaceholderText('Add a person by name'), name);
  await user.click(screen.getByRole('button', { name: 'Add person' }));
}

// The debounced writer commits after the test ends, so the stub must outlive each test.
beforeAll(stubGithub);
afterAll(() => vi.unstubAllGlobals());
afterEach(cleanup);

describe('People overview and team members (slice 004)', () => {
  it('shows an empty state, then a quick-added person with default country, role and 100% capacity', async () => {
    const user = userEvent.setup();
    await renderApp();
    expect(screen.getByText('No people yet. Type a name above to add the first one.')).toBeInTheDocument();

    await addPerson(user, 'Ada Lovelace');

    const row = screen.getByRole('row', { name: /Ada Lovelace/ });
    expect(within(row).getByText('100%')).toBeInTheDocument();
    expect(within(row).getByText(baseline.countries[0].name)).toBeInTheDocument();
    expect(within(row).getByText(baseline.roles[0].name)).toBeInTheDocument();
    expect(within(row).getByText('Active')).toBeInTheDocument();
  });

  it('hides a deactivated person under the default filter, and Show all brings them back', async () => {
    const user = userEvent.setup();
    await renderApp();
    await addPerson(user, 'Grace Hopper');

    await user.click(screen.getByRole('button', { name: 'Deactivate Grace Hopper' }));

    expect(screen.queryByRole('row', { name: /Grace Hopper/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Show all' }));
    expect(screen.getByRole('row', { name: /Grace Hopper/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reactivate Grace Hopper' })).toBeInTheDocument();
  });

  it('defaults a first membership to full capacity, then caps a second at what is unclaimed', async () => {
    const user = userEvent.setup();
    await renderApp();
    await addPerson(user, 'Linus Torvalds');

    // Team detail: pick the existing person, who lands at their full 100%.
    goTo('t1');
    await user.type(await screen.findByRole('combobox', { name: 'Add member' }), 'Linus');
    await user.click(screen.getByRole('button', { name: /Linus Torvalds/ }));
    const fte = await screen.findByRole('spinbutton', { name: 'Team FTE % for Linus Torvalds' });
    expect(fte).toHaveValue(100);

    // The team detail may lower it; the second team then gets only the remainder.
    await user.clear(fte);
    await user.type(fte, '60');
    goTo('t2');
    await user.type(await screen.findByRole('combobox', { name: 'Add member' }), 'Linus');
    await user.click(screen.getByRole('button', { name: /Linus Torvalds/ }));
    expect(await screen.findByRole('spinbutton', { name: 'Team FTE % for Linus Torvalds' })).toHaveValue(40);

    // Person panel: the second membership can't be raised past 40%.
    goTo('people');
    await user.click(await screen.findByRole('button', { name: 'Linus Torvalds' }));
    const panel = screen.getByRole('complementary', { name: 'Linus Torvalds details' });
    expect(within(panel).getByText('100% of 100% claimed')).toBeInTheDocument();
    const second = within(panel).getByRole('spinbutton', { name: 'Team FTE % for Platform' });
    await user.clear(second);
    await user.type(second, '90');
    expect(within(panel).getByText('Max 40%. Other teams hold the rest.')).toBeInTheDocument();
    expect(within(panel).getByText('No capacity left to add to another team.')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('row', { name: /Linus Torvalds/ })).toHaveTextContent('Payments, Platform'));
  });

  it('closes the panel with Escape', async () => {
    const user = userEvent.setup();
    await renderApp();
    await addPerson(user, 'Margaret Hamilton');
    await user.click(screen.getByRole('button', { name: 'Margaret Hamilton' }));
    expect(screen.getByRole('complementary', { name: 'Margaret Hamilton details' })).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Margaret Hamilton' })).toHaveFocus());
  });
});
