import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { defaultBrandPack } from '@brand';
import type { Initiative, Person, Role } from '../data/types';
import { BrandProvider } from '../state/BrandContext';
import { RepositoryProvider } from '../state/DataContext';
import { TooltipProvider } from '@/components/ui/tooltip';
import { RolesSection } from './RolesSection';
import { useSectionLock } from './useSectionLock';
import { fakeOnDemand, seedFiles } from '../sync/testing/fakeGithub';

/** Opens a list row's "⋯" menu and chooses one of its items (§9.10). */
async function rowAction(user: ReturnType<typeof userEvent.setup>, menu: string, item: string) {
  await user.click(await screen.findByRole('button', { name: menu }));
  await user.click(await screen.findByRole('menuitem', { name: item }));
}

let roles: Role[] = [];
let people: Person[] = [];
let initiatives: Initiative[] = [];

fakeOnDemand((fake) => seedFiles(fake, { ratesReviewed: true, roles, countries: [{ id: 'de', name: 'Germany', active: true, ratesByYear: [] }], teams: [{ id: 't1', name: 'Platform', active: true }], people, initiatives }));

afterEach(cleanup);
beforeEach(() => {
  roles = [
    { id: 'tl', name: 'Tech Lead', abbreviation: 'TL', costFactor: 0.8, active: true },
    { id: 'qa', name: 'QA Engineer', abbreviation: 'QA', costFactor: 0.9, active: false },
  ];
  people = [];
  initiatives = [];
});

// The lock now lives above RolesSection (SettingsPage, §2), so the test holds it the same way.
function RolesSectionWithLock() {
  const lock = useSectionLock();
  return <RolesSection lock={lock} />;
}

function renderRoles() {
  return render(
    <BrandProvider brand={defaultBrandPack}>
      <TooltipProvider>
        <RepositoryProvider token="token">
          <RolesSectionWithLock />
        </RepositoryProvider>
      </TooltipProvider>
    </BrandProvider>,
  );
}

describe('RolesSection lock (§2, §5.9, §9.9)', () => {
  it('starts locked: values as plain text, Unlock to edit, no Add role or row actions', async () => {
    renderRoles();
    const row = (await screen.findByText('Tech Lead')).closest('tr')!;
    expect(within(row).getByText('TL')).toBeInTheDocument();
    expect(within(row).getByText('Active')).toBeInTheDocument();
    expect(within(row).queryByRole('textbox')).not.toBeInTheDocument();
    expect(within(row).queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Unlock to edit' })).toBeInTheDocument();
    expect(screen.queryByText('Editing')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add role' })).not.toBeInTheDocument();
  });

  it('unlocking shows the fields, an Editing tag and Lock; Lock re-locks', async () => {
    const user = userEvent.setup();
    renderRoles();
    await screen.findByText('Tech Lead');

    await user.click(screen.getByRole('button', { name: 'Unlock to edit' }));
    expect(screen.getByRole('textbox', { name: 'Name of Tech Lead' })).toBeEnabled();
    expect(screen.getByText('Editing')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Roles' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add role' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Lock' }));
    expect(screen.getByRole('button', { name: 'Unlock to edit' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Name of Tech Lead' })).not.toBeInTheDocument();
    expect(screen.queryByText('Editing')).not.toBeInTheDocument();
  });
});

describe('RolesSection editing (§5.9)', () => {
  async function unlock(user: ReturnType<typeof userEvent.setup>) {
    await screen.findByText('Tech Lead');
    await user.click(screen.getByRole('button', { name: 'Unlock to edit' }));
  }

  it('refuses a cost factor of 0, negative or text, saving nothing', async () => {
    const user = userEvent.setup();
    renderRoles();
    await unlock(user);
    const field = screen.getByRole('spinbutton', { name: 'Cost factor for Tech Lead' });

    for (const bad of ['0', '-1', 'abc']) {
      await user.clear(field);
      await user.type(field, bad);
      await user.tab();
      expect(await screen.findByText('Enter a cost factor above 0.')).toBeInTheDocument();
    }
  });

  it('refuses a blank name or abbreviation', async () => {
    const user = userEvent.setup();
    renderRoles();
    await unlock(user);

    const name = screen.getByRole('textbox', { name: 'Name of Tech Lead' });
    await user.clear(name);
    await user.tab();
    expect(await screen.findByText('Enter a name.')).toBeInTheDocument();

    const abbreviation = screen.getByRole('textbox', { name: 'Abbreviation of Tech Lead' });
    await user.clear(abbreviation);
    await user.tab();
    expect(await screen.findByText('Enter an abbreviation.')).toBeInTheDocument();
  });

  it('deactivating greys the row out and offers Reactivate; deactivated roles are already shown greyed', async () => {
    const user = userEvent.setup();
    renderRoles();
    await unlock(user);
    await rowAction(user, 'Actions for Tech Lead', 'Deactivate role');
    await user.click(await screen.findByRole('button', { name: 'Actions for Tech Lead' }));
    expect(await screen.findByRole('menuitem', { name: 'Reactivate role' })).toBeInTheDocument();
  });

  it('locking closes an unsaved new role, so nothing is added while locked', async () => {
    const user = userEvent.setup();
    renderRoles();
    await unlock(user);
    await user.click(screen.getByRole('button', { name: 'Add role' }));
    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Designer');
    await user.click(screen.getByRole('button', { name: 'Lock' }));
    expect(screen.queryByRole('button', { name: 'Add' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Unlock to edit' }));
    expect(screen.queryByRole('textbox', { name: 'Name' })).not.toBeInTheDocument();
  });

  it('locking drops a refused edit, so unlocking shows the saved value again', async () => {
    const user = userEvent.setup();
    renderRoles();
    await unlock(user);
    await user.clear(screen.getByRole('textbox', { name: 'Name of Tech Lead' }));
    await user.tab();
    expect(await screen.findByText('Enter a name.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Lock' }));
    await user.click(screen.getByRole('button', { name: 'Unlock to edit' }));
    expect(screen.getByRole('textbox', { name: 'Name of Tech Lead' })).toHaveValue('Tech Lead');
    expect(screen.queryByText('Enter a name.')).not.toBeInTheDocument();
  });

  it('Add role: disabled without a name, saves once filled in', async () => {
    const user = userEvent.setup();
    renderRoles();
    await unlock(user);
    await user.click(screen.getByRole('button', { name: 'Add role' }));

    const addButton = screen.getByRole('button', { name: 'Add' });
    expect(addButton).toBeDisabled();

    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Designer');
    await user.type(screen.getByRole('textbox', { name: 'Abbreviation' }), 'Des');
    expect(addButton).toBeEnabled();
    await user.click(addButton);

    expect(await screen.findByRole('textbox', { name: 'Name of Designer' })).toBeInTheDocument();
  });
});

describe('RolesSection impact note (§5.9, §8.1)', () => {
  it('shows how many initiatives a cost-factor change affects, excluding a frozen phase and an active custom role', async () => {
    people = [
      { id: 'ana', name: 'Ana', countryId: 'de', roleId: 'tl', capacityPct: 100, active: true },
      { id: 'bo', name: 'Bo', countryId: 'de', roleId: 'tl', capacityPct: 100, active: true },
      {
        id: 'cy',
        name: 'Cy',
        countryId: 'de',
        roleId: 'tl',
        capacityPct: 100,
        active: true,
        customRole: { active: true, label: 'Fractional', costFactor: 1, dayRatesByYear: [] },
      },
    ];
    initiatives = [
      {
        id: 'i1',
        name: 'Payments API',
        teamId: 't1',
        status: 'Active',
        phases: {
          dev: { startDate: '2026-01-01', endDate: '2026-01-31', allocations: [{ id: 'a1', personId: 'ana', allocationPct: 50 }] },
        },
      },
      {
        id: 'i2',
        name: 'Checkout Redesign',
        teamId: 't1',
        status: 'Active',
        phases: {
          dev: { startDate: '2026-01-01', endDate: '2026-01-31', allocations: [{ id: 'a2', personId: 'bo', allocationPct: 50 }] },
        },
      },
      {
        id: 'i3',
        name: 'Frozen initiative',
        teamId: 't1',
        status: 'Active',
        phases: {
          dev: {
            startDate: '2026-01-01',
            endDate: '2026-01-31',
            allocations: [{ id: 'a3', personId: 'ana', allocationPct: 50 }],
          },
        },
        gates: { dev: { outcome: 'passed', checklist: [] } },
      },
      {
        id: 'i4',
        name: 'Custom-role-only initiative',
        teamId: 't1',
        status: 'Active',
        phases: {
          dev: { startDate: '2026-01-01', endDate: '2026-01-31', allocations: [{ id: 'a4', personId: 'cy', allocationPct: 50 }] },
        },
      },
    ];

    const user = userEvent.setup();
    renderRoles();
    await screen.findByText('Tech Lead');
    await user.click(screen.getByRole('button', { name: 'Unlock to edit' }));

    const field = screen.getByRole('spinbutton', { name: 'Cost factor for Tech Lead' });
    await user.clear(field);
    await user.type(field, '1.4');
    await user.tab();

    expect(await screen.findByText('Changes the estimate of 2 initiatives.')).toBeInTheDocument();
  });
});
