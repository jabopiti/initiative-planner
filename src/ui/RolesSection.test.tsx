import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultBrandPack } from '../brand/defaultBrand';
import type { Initiative, Person, Role } from '../data/types';
import { BrandProvider } from '../state/BrandContext';
import { RepositoryProvider } from '../state/DataContext';
import { TooltipProvider } from '@/components/ui/tooltip';
import { rootListing } from '../sync/testing/rootListing';
import { RolesSection } from './RolesSection';
import { useSectionLock } from './useSectionLock';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const file = (content: unknown, sha: string) => json({ content: btoa(JSON.stringify(content)), sha });

let roles: Role[] = [];
let people: Person[] = [];
let initiatives: Initiative[] = [];

beforeAll(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      if ((init.method ?? 'GET') === 'PUT') return json({ content: { sha: 'next' } });
      if (new URL(url).pathname.endsWith('/contents/')) return rootListing();
      if (url.includes('/contents/dataset.json')) return file({ schemaVersion: 1, processIdentity: defaultBrandPack.processIdentity, ratesReviewed: true }, 'd');
      if (url.includes('/contents/roles.json')) return file(roles, 'r');
      if (url.includes('/contents/countries.json')) return file([], 'c');
      if (url.includes('/contents/teams.json')) return file([], 't');
      if (url.includes('/contents/people.json')) return file(people, 'p');
      if (url.includes('/contents/memberships.json')) return file([], 'm');
      const hit = initiatives.find((i) => url.includes(`/contents/initiatives/${i.id}.json`));
      if (hit) return file(hit, `sha-${hit.id}`);
      if (url.includes('/contents/initiatives')) {
        return json(initiatives.map((i) => ({ name: `${i.id}.json`, path: `initiatives/${i.id}.json`, sha: `sha-${i.id}`, type: 'file' })));
      }
      return json({ message: 'Not Found' }, 404);
    }),
  );
});
afterAll(() => vi.unstubAllGlobals());
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

describe('RolesSection lock (§2, §9.9)', () => {
  it('starts locked: fields disabled, hint shown, button reads Locked', async () => {
    renderRoles();
    expect(await screen.findByRole('textbox', { name: 'Name of Tech Lead' })).toBeDisabled();
    expect(screen.getByText('Locked. Unlock to edit.')).toBeInTheDocument();
    const button = screen.getByRole('button', { name: 'Locked' });
    expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Add role' })).toBeDisabled();
  });

  it('unlocking enables fields and flips the button; clicking again re-locks', async () => {
    const user = userEvent.setup();
    renderRoles();
    await screen.findByRole('textbox', { name: 'Name of Tech Lead' });

    await user.click(screen.getByRole('button', { name: 'Locked' }));
    expect(screen.getByRole('button', { name: 'Unlocked' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByText('Locked. Unlock to edit.')).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Name of Tech Lead' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'Unlocked' }));
    expect(screen.getByRole('button', { name: 'Locked' })).toBeInTheDocument();
    expect(screen.getByText('Locked. Unlock to edit.')).toBeInTheDocument();
  });
});

describe('RolesSection editing (§5.9)', () => {
  async function unlock(user: ReturnType<typeof userEvent.setup>) {
    await screen.findByRole('textbox', { name: 'Name of Tech Lead' });
    await user.click(screen.getByRole('button', { name: 'Locked' }));
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
    await user.click(screen.getByRole('button', { name: 'Deactivate Tech Lead' }));
    expect(await screen.findByRole('button', { name: 'Reactivate Tech Lead' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reactivate QA Engineer' })).toBeInTheDocument();
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
    await screen.findByRole('textbox', { name: 'Name of Tech Lead' });
    await user.click(screen.getByRole('button', { name: 'Locked' }));

    const field = screen.getByRole('spinbutton', { name: 'Cost factor for Tech Lead' });
    await user.clear(field);
    await user.type(field, '1.4');
    await user.tab();

    expect(await screen.findByText('Changes the estimate of 2 initiatives.')).toBeInTheDocument();
  });
});
