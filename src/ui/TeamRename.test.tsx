import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import { defaultBrandPack } from '../brand/defaultBrand';
import { buildBaselineDataset } from '../data/baseline';
import { BrandProvider } from '../state/BrandContext';
import { RepositoryProvider } from '../state/DataContext';
import { TooltipProvider } from '@/components/ui/tooltip';
import { TeamDetail } from './TeamDetail';
import { TeamsOverview } from './TeamsOverview';
import { fakeOnDemand, seedFiles } from '../sync/testing/fakeGithub';

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(() => 'id'), { error: vi.fn(), dismiss: vi.fn() }) }));

const baseline = buildBaselineDataset(defaultBrandPack);
const teams = [
  { id: 't1', name: 'Platform', active: true },
  { id: 't2', name: 'Payments', active: false },
];
const people = [{ id: 'p1', name: 'Mara Voss', countryId: baseline.countries[0].id, roleId: baseline.roles[0].id, capacityPct: 100, active: true }];
const memberships = [{ id: 'm1', personId: 'p1', teamId: 't1', teamFtePct: 40, active: true }];

fakeOnDemand((fake) => seedFiles(fake, { roles: baseline.roles, countries: baseline.countries, teams, people, memberships }));

afterEach(cleanup);
beforeEach(() => {
  window.location.hash = '';
  vi.mocked(toast).mockClear();
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

describe('Rename a team (§5.8)', () => {
  it('commits a new name on Enter and shows it', async () => {
    const user = userEvent.setup();
    renderWith(<TeamDetail id="t1" />);
    const field = await screen.findByRole('textbox', { name: 'Team name' });
    await user.clear(field);
    await user.type(field, 'Platform Core{Enter}');
    expect(field).toHaveValue('Platform Core');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('refuses an empty name and a duplicate one, keeping the text', async () => {
    const user = userEvent.setup();
    renderWith(<TeamDetail id="t1" />);
    const field = await screen.findByRole('textbox', { name: 'Team name' });
    await user.clear(field);
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter a name.');
    await user.type(field, 'payments{Enter}');
    expect(screen.getByRole('alert')).toHaveTextContent('A team named Payments already exists.');
    expect(field).toHaveValue('payments');
  });

  it('refuses a duplicate when creating a team', async () => {
    const user = userEvent.setup();
    renderWith(<TeamsOverview />);
    await user.click(await screen.findByRole('button', { name: 'New team' }));
    await user.type(screen.getByRole('textbox', { name: 'Team name' }), 'platform');
    await user.click(screen.getByRole('button', { name: 'Create' }));
    expect(screen.getByRole('alert')).toHaveTextContent('A team named Platform already exists.');
  });
});

describe('Undo removing a membership (§5.11)', () => {
  it('offers Undo on the team detail and puts the member back with the same Team FTE %', async () => {
    const user = userEvent.setup();
    renderWith(<TeamDetail id="t1" />);
    await user.click(await screen.findByRole('button', { name: 'Actions for Mara Voss in this team' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Remove from team' }));
    expect(screen.queryByRole('button', { name: 'Actions for Mara Voss in this team' })).not.toBeInTheDocument();
    const options = vi.mocked(toast).mock.calls[0][1] as { action: { label: string; onClick: () => void }; duration: number };
    expect(options.action.label).toBe('Undo');
    expect(options.duration).toBe(10_000);
    options.action.onClick();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Actions for Mara Voss in this team' })).toBeInTheDocument());
    expect(screen.getByLabelText('Team FTE % for Mara Voss')).toHaveValue(40);
  });
});
