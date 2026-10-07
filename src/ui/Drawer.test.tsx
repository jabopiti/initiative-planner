import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultBrandPack } from '../brand/defaultBrand';
import { buildBaselineDataset } from '../data/baseline';
import { BrandProvider } from '../state/BrandContext';
import { RepositoryProvider } from '../state/DataContext';
import { TooltipProvider } from '@/components/ui/tooltip';
import { TeamDetail } from './TeamDetail';
import { TeamsOverview } from './TeamsOverview';
import { fakeOnDemand, seedFiles } from '../sync/testing/fakeGithub';

const baseline = buildBaselineDataset(defaultBrandPack);
const person = (id: string, name: string, active: boolean) => ({
  id,
  name,
  roleId: baseline.roles[0].id,
  countryId: baseline.countries[0].id,
  capacityPct: 100,
  active,
});
const teams = [{ id: 't1', name: 'Platform', active: true }];
const people = [person('p1', 'Ada', true), person('p2', 'Bea', false)];
const memberships = [
  { id: 'm1', personId: 'p1', teamId: 't1', teamFtePct: 60, active: true },
  { id: 'm2', personId: 'p2', teamId: 't1', teamFtePct: 40, active: true },
];

const served = fakeOnDemand((fake) => seedFiles(fake, { dataset: baseline.datasetFlags, roles: baseline.roles, countries: baseline.countries, teams, people, memberships }));

beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.scrollIntoView = () => {};
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('fetch', served.fetch);
});
afterAll(() => vi.unstubAllGlobals());
beforeEach(() => served.reset());
afterEach(cleanup);

function renderView(view: React.ReactNode) {
  render(
    <BrandProvider brand={defaultBrandPack}>
      <TooltipProvider>
        <RepositoryProvider token="token">{view}</RepositoryProvider>
      </TooltipProvider>
    </BrandProvider>,
  );
}

describe('person drawer and locking (review feedback)', () => {
  it('opens the person drawer from a team member name, and locks an inactive person', async () => {
    const user = userEvent.setup();
    renderView(<TeamDetail id="t1" />);
    await user.click(await screen.findByRole('button', { name: 'Ada' }));
    const active = await screen.findByRole('dialog', { name: 'Ada' });
    expect(within(active).getByRole('textbox', { name: 'Name' })).toBeEnabled();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Bea' }));
    const inactive = await screen.findByRole('dialog', { name: 'Bea' });
    expect(within(inactive).getByRole('textbox', { name: 'Name' })).toBeDisabled();
    expect(within(inactive).getByRole('spinbutton', { name: 'Capacity %' })).toBeDisabled();
  });

  it('freezes Team FTE % for an inactive person', async () => {
    renderView(<TeamDetail id="t1" />);
    expect(await screen.findByRole('spinbutton', { name: 'Team FTE % for Ada' })).toBeEnabled();
    expect(screen.getByRole('spinbutton', { name: 'Team FTE % for Bea' })).toBeDisabled();
  });

  it('opens the drawer from anywhere in a member row, but not from its inputs', async () => {
    const user = userEvent.setup();
    renderView(<TeamDetail id="t1" />);
    await user.click(await screen.findByRole('spinbutton', { name: 'Team FTE % for Ada' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(within(screen.getByRole('row', { name: /Ada/ })).getAllByRole('cell')[1]);
    expect(await screen.findByRole('dialog', { name: 'Ada' })).toBeInTheDocument();
  });

  it('opens a team when anywhere in its row is clicked', async () => {
    const user = userEvent.setup();
    renderView(<TeamsOverview />);
    await user.click((await screen.findAllByRole('cell'))[1]);
    expect(window.location.hash).toBe('#/teams/t1');
  });
});
