import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultBrandPack } from '../brand/defaultBrand';
import { buildBaselineDataset } from '../data/baseline';
import type { Initiative, Membership, Person, Team } from '../data/types';
import { BrandProvider } from '../state/BrandContext';
import { RepositoryProvider } from '../state/DataContext';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { InitiativeDetail } from './InitiativeDetail';
import { PeopleOverview } from './PeopleOverview';
import { TeamDetail } from './TeamDetail';
import { TeamsOverview } from './TeamsOverview';
import { rootListing } from '../sync/testing/rootListing';

const baseline = buildBaselineDataset(defaultBrandPack);
const [role] = baseline.roles;
const [country] = baseline.countries;

const person = (id: string, name: string, active = true): Person => ({
  id,
  name,
  roleId: role.id,
  countryId: country.id,
  capacityPct: 100,
  active,
});
const member = (personId: string, teamId: string, active = true): Membership => ({
  id: `m-${personId}-${teamId}`,
  personId,
  teamId,
  teamFtePct: 30,
  active,
});

let teams: Team[];
let people: Person[];
let memberships: Membership[];
const initiative: Initiative = { id: 'i1', name: 'Payments API', teamId: 't1', status: 'Active' };

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const file = (content: unknown, sha: string) => json({ content: btoa(JSON.stringify(content)), sha });

beforeAll(() => {
  // Radix Select needs these pointer/scroll APIs, which jsdom lacks.
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
  Element.prototype.scrollIntoView = () => {};
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      if ((init.method ?? 'GET') === 'PUT') return json({ content: { sha: 'next' } });
      if (new URL(url).pathname.endsWith('/contents/')) return rootListing();
      if (url.includes('/contents/dataset.json')) return file(baseline.datasetFlags, 'd');
      if (url.includes('/contents/roles.json')) return file(baseline.roles, 'r');
      if (url.includes('/contents/countries.json')) return file(baseline.countries, 'c');
      if (url.includes('/contents/teams.json')) return file(teams, 't');
      if (url.includes('/contents/people.json')) return file(people, 'p');
      if (url.includes('/contents/memberships.json')) return file(memberships, 'm');
      if (url.endsWith('/contents/initiatives.json') || url.includes('/contents/initiatives/i1.json')) return file(initiative, 'i');
      if (url.includes('/contents/initiatives')) return json([{ name: 'i1.json', path: 'initiatives/i1.json', sha: 'sha-i1', type: 'file' }]);
      return json({ message: 'Not Found' }, 404);
    }),
  );
});
afterAll(() => vi.unstubAllGlobals());
afterEach(cleanup);

beforeEach(() => {
  teams = [
    { id: 't1', name: 'Payments', active: true },
    { id: 't2', name: 'Platform', active: true },
  ];
  // Payments has three people, Ben deactivated; Platform has two active ones.
  people = [person('ana', 'Ana Ruiz'), person('ben', 'Ben Ito', false), person('cai', 'Cai Wu'), person('dee', 'Dee Fox'), person('eli', 'Eli Roe')];
  memberships = [
    member('ana', 't1'),
    member('ben', 't1'),
    member('cai', 't1'),
    member('dee', 't2'),
    member('eli', 't2'),
    member('eli', 't1', false), // an inactive membership of an active person
  ];
  window.location.hash = '';
});

function renderView(view: React.ReactNode) {
  return render(
    <BrandProvider brand={defaultBrandPack}>
      <TooltipProvider>
        <RepositoryProvider token="token">
          {view}
          <Toaster />
        </RepositoryProvider>
      </TooltipProvider>
    </BrandProvider>,
  );
}

const rowFor = (name: string) => screen.getByRole('row', { name: new RegExp(`^${name}`) });
const cells = (row: HTMLElement) => within(row).getAllByRole('cell');
const teamNames = () =>
  screen
    .getAllByRole('row')
    .slice(1)
    .map((r) => cells(r)[0].textContent);

describe('team size counts only active people (§5.7)', () => {
  it('the overview shows the active count while the team detail still lists everyone, the inactive one greyed', async () => {
    renderView(
      <>
        <TeamsOverview />
        <TeamDetail id="t1" />
      </>,
    );
    await screen.findByText('Platform');
    expect(cells(rowFor('Payments'))[1]).toHaveTextContent('2');
    expect(cells(rowFor('Platform'))[1]).toHaveTextContent('2');

    const detail = await screen.findByRole('region', { name: 'Members' });
    const ben = within(detail).getByRole('row', { name: /Ben Ito/ });
    expect(within(detail).getAllByRole('row')).toHaveLength(1 + 4); // header, Ana, Ben, Cai, Eli (inactive membership)
    expect(ben).toHaveClass('text-text-secondary');
  });

  it('sorts by the active counts', async () => {
    const user = userEvent.setup();
    people = [...people, person('fay', 'Fay Lund'), person('gus', 'Gus Ode')];
    memberships = [...memberships, member('fay', 't2'), member('gus', 't2')]; // Platform: 4, Payments: 2
    renderView(<TeamsOverview />);
    await screen.findByText('Platform');
    await user.click(screen.getByRole('button', { name: 'Members' }));
    expect(teamNames()).toEqual(['Payments', 'Platform']);
    await user.click(screen.getByRole('button', { name: 'Members' }));
    expect(teamNames()).toEqual(['Platform', 'Payments']);
  });

  it('copies the active count', async () => {
    const user = userEvent.setup();
    let text = '';
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        write: async (items: { items: Record<string, Blob> }[]) => {
          text = await items[0].items['text/plain'].text();
        },
      },
    });
    vi.stubGlobal('ClipboardItem', class { constructor(public items: Record<string, Blob>) {} });
    renderView(<TeamsOverview />);
    await screen.findByText('Platform');
    await user.click(screen.getByRole('button', { name: 'Copy' }));
    expect(await screen.findByText('Copied 2 teams')).toBeInTheDocument();
    expect(text.split('\n')[1]).toMatch(/^Payments\t2\t/);
  });

  it('deactivating a person lowers the count at once', async () => {
    const user = userEvent.setup();
    people = people.map((p) => (p.id === 'ben' ? { ...p, active: true } : p));
    renderView(
      <>
        <TeamsOverview />
        <PeopleOverview />
      </>,
    );
    expect(await within(await screen.findByRole('row', { name: /^Payments/ })).findByText('3')).toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: 'Deactivate Ben Ito' }));
    expect(cells(rowFor('Payments'))[1]).toHaveTextContent('2');
  });
});

describe('the phase picker lists the people the size counts (§7.2)', () => {
  it('offers active members of an active membership only, not the deactivated person', async () => {
    const user = userEvent.setup();
    renderView(<InitiativeDetail id="i1" />);
    await user.click(await screen.findByRole('combobox', { name: 'Add person to Validation' }));
    const options = (await screen.findAllByRole('option')).map((o) => o.textContent);
    expect(options).toEqual([expect.stringContaining('Ana Ruiz'), expect.stringContaining('Cai Wu')]);
  });
});
