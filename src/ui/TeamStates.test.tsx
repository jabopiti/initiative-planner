import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultBrandPack } from '../brand/defaultBrand';
import { buildBaselineDataset } from '../data/baseline';
import { BrandProvider } from '../state/BrandContext';
import { RepositoryProvider } from '../state/DataContext';
import { TooltipProvider } from '@/components/ui/tooltip';
import { NewInitiativeControl } from './NewInitiativeControl';
import { PortfolioBoard } from './PortfolioBoard';
import { TeamDetail } from './TeamDetail';
import { fakeOnDemand, seedFiles } from '../sync/testing/fakeGithub';

const baseline = buildBaselineDataset(defaultBrandPack);
const ACTIVE = { id: 't1', name: 'Payments', active: true };
const INACTIVE = { id: 't2', name: 'Retired', active: false };

let teams: { id: string; name: string; active: boolean }[] = [];

const served = fakeOnDemand((fake) => seedFiles(fake, { dataset: baseline.datasetFlags, roles: baseline.roles, countries: baseline.countries, teams, people: [], memberships: [] }));

beforeAll(() => {
  vi.stubGlobal('fetch', served.fetch);
});
afterAll(() => vi.unstubAllGlobals());
afterEach(cleanup);
beforeEach(() => {
  served.reset();
  teams = [];
  window.location.hash = '';
});

function renderWith(ui: React.ReactNode) {
  return render(
    <BrandProvider brand={defaultBrandPack}>
      <TooltipProvider>
        <RepositoryProvider token="token">{ui}</RepositoryProvider>
      </TooltipProvider>
    </BrandProvider>,
  );
}

describe('Portfolio empty state names the missing prerequisite (§9.4)', () => {
  it('no team: the welcome card instead, its one action Create a team, which opens Teams', async () => {
    const user = userEvent.setup();
    renderWith(<PortfolioBoard />);
    expect(await screen.findByRole('heading', { name: /^Welcome to/ })).toBeInTheDocument();
    expect(screen.queryByText('No initiatives yet')).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Getting started' })).toBeNull();
    expect(screen.getAllByRole('button')).toHaveLength(1); // no Dismiss for now: the card is the empty state
    await user.click(screen.getByRole('button', { name: 'Create a team' }));
    expect(window.location.hash).toBe('#/teams');
  });

  it('teams exist but none is active: says so and offers Reactivate a team, which opens Teams', async () => {
    const user = userEvent.setup();
    teams = [INACTIVE];
    renderWith(<PortfolioBoard />);
    expect(await screen.findByText('All your teams are inactive.')).toBeInTheDocument();
    expect(screen.getByText('No initiatives yet')).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(2); // the empty state's one primary action, and the strip's Dismiss for now
    await user.click(screen.getByRole('button', { name: 'Reactivate a team' }));
    expect(window.location.hash).toBe('#/teams');
  });

  it('an active team: no reason line, and Create your first initiative opens the draft', async () => {
    const user = userEvent.setup();
    teams = [ACTIVE, INACTIVE];
    renderWith(<PortfolioBoard />);
    await user.click(await screen.findByRole('button', { name: 'Create your first initiative' }));
    expect(window.location.hash).toBe('#/initiatives/new');
    expect(screen.getByText('No initiatives yet')).toBeInTheDocument();
    expect(screen.queryByText('No teams yet.')).not.toBeInTheDocument();
    expect(screen.queryByText('All your teams are inactive.')).not.toBeInTheDocument();
  });
});

describe('The top-bar button names the next step (§5.1)', () => {
  it('no team: Create a team, opening Teams', async () => {
    const user = userEvent.setup();
    renderWith(<NewInitiativeControl />);
    const button = await screen.findByRole('button', { name: 'Create a team' });
    expect(button).toBeEnabled();
    await user.click(button);
    expect(window.location.hash).toBe('#/teams');
  });

  it('teams exist but none is active: Reactivate a team, opening Teams', async () => {
    const user = userEvent.setup();
    teams = [INACTIVE];
    renderWith(<NewInitiativeControl />);
    const button = await screen.findByRole('button', { name: 'Reactivate a team' });
    expect(button).toBeEnabled();
    await user.click(button);
    expect(window.location.hash).toBe('#/teams');
  });

  it('an active team: New initiative, opening the draft', async () => {
    const user = userEvent.setup();
    teams = [ACTIVE];
    renderWith(<NewInitiativeControl />);
    const button = await screen.findByRole('button', { name: 'New initiative' });
    expect(button).toBeEnabled();
    await user.click(button);
    expect(window.location.hash).toBe('#/initiatives/new');
  });

  it('follows a reactivation made on the team detail', async () => {
    const user = userEvent.setup();
    teams = [INACTIVE];
    renderWith(
      <>
        <NewInitiativeControl />
        <TeamDetail id="t2" />
      </>,
    );
    await screen.findByRole('button', { name: 'Reactivate a team' });
    await user.click(screen.getByRole('button', { name: 'Reactivate team' }));
    await vi.waitFor(() => expect(document.querySelector('[data-new-initiative]')).toHaveTextContent('New initiative'));
  });
});

describe('Team detail: deactivate and reactivate (§5.8, §9.3)', () => {
  it('deactivates with one click and shows an Inactive chip', async () => {
    const user = userEvent.setup();
    teams = [ACTIVE];
    renderWith(<TeamDetail id="t1" />);
    expect(await screen.findByRole('heading', { name: 'Payments' })).toBeInTheDocument();
    expect(screen.queryByText('Inactive')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Deactivate team' }));

    expect(screen.getByText('Inactive')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Deactivate team' })).not.toBeInTheDocument();
  });

  it('reactivates an inactive team and drops the chip', async () => {
    const user = userEvent.setup();
    teams = [INACTIVE];
    renderWith(<TeamDetail id="t2" />);
    expect(await screen.findByText('Inactive')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Reactivate team' }));

    expect(screen.queryByText('Inactive')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Deactivate team' })).toBeInTheDocument();
  });
});
