import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultBrandPack } from '../brand/defaultBrand';
import { buildBaselineDataset } from '../data/baseline';
import { BrandProvider } from '../state/BrandContext';
import { RepositoryProvider } from '../state/DataContext';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { PeopleOverview } from './PeopleOverview';
import { TeamDetail } from './TeamDetail';
import { TeamsOverview } from './TeamsOverview';
import { sortRows } from './tableSort';
import { rootListing } from '../sync/testing/rootListing';

const baseline = buildBaselineDataset(defaultBrandPack);
const [roleA, roleB] = baseline.roles;
const [country] = baseline.countries;
const LONG = 'Bartholomew Maximilian Featherstonehaugh-Cholmondeley the Third';

const teams = [
  { id: 't1', name: 'Platform', active: true },
  { id: 't2', name: 'Payments', active: true },
];
const person = (id: string, name: string, roleId: string, capacityPct = 100, active = true) => ({
  id,
  name,
  roleId,
  countryId: country.id,
  capacityPct,
  active,
});
const people = [
  person('p1', 'Cleo', roleA.id),
  person('p2', 'Ada', roleB.id, 50),
  person('p3', 'Bea', roleA.id),
  person('p4', LONG, roleB.id, 80, false),
];
const memberships = [
  { id: 'm1', personId: 'p1', teamId: 't1', teamFtePct: 60, active: true },
  { id: 'm2', personId: 'p2', teamId: 't1', teamFtePct: 40, active: true },
  { id: 'm3', personId: 'p3', teamId: 't1', teamFtePct: 60, active: true },
];

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const file = (content: unknown, sha: string) => json({ content: btoa(JSON.stringify(content)), sha });

beforeAll(() => {
  // Radix Select needs these pointer/scroll APIs, which jsdom lacks.
  Element.prototype.hasPointerCapture = () => false;
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
      return json({ message: 'Not Found' }, 404);
    }),
  );
});
afterAll(() => vi.unstubAllGlobals());
afterEach(cleanup);

let written: Record<string, string> = {};
let clipboardFails = false;
beforeEach(() => {
  written = {};
  clipboardFails = false;
  class FakeClipboardItem {
    constructor(public items: Record<string, Blob>) {}
  }
  vi.stubGlobal('ClipboardItem', FakeClipboardItem);
});

const readBlob = (blob: Blob) =>
  new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.readAsText(blob);
  });

/** userEvent.setup() installs its own clipboard stub, so ours goes in after it. */
function setupUser() {
  const user = userEvent.setup();
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: {
      write: async (items: { items: Record<string, Blob> }[]) => {
        if (clipboardFails) throw new Error('denied');
        for (const [type, blob] of Object.entries(items[0].items)) written[type] = await readBlob(blob);
      },
    },
  });
  return user;
}

function renderView(view: React.ReactNode, ready: string | RegExp) {
  render(
    <BrandProvider brand={defaultBrandPack}>
      <TooltipProvider>
        <RepositoryProvider token="token">{view}</RepositoryProvider>
        <Toaster />
      </TooltipProvider>
    </BrandProvider>,
  );
  return screen.findByText(ready);
}

const nameColumn = () =>
  screen
    .getAllByRole('row')
    .slice(1)
    .map((r) => within(r).getAllByRole('cell')[0].textContent);

describe('sortRows', () => {
  it('is stable: equal values keep the default order, in both directions', () => {
    const rows = [
      { n: 'a', v: 1 },
      { n: 'b', v: 1 },
      { n: 'c', v: 0 },
    ];
    const cols = { n: (r: (typeof rows)[number]) => r.n, v: (r: (typeof rows)[number]) => r.v };
    expect(sortRows(rows, cols, 'v', 'asc', 'n').map((r) => r.n)).toEqual(['c', 'a', 'b']);
    expect(sortRows(rows, cols, 'v', 'desc', 'n').map((r) => r.n)).toEqual(['a', 'b', 'c']);
  });
});

describe('People overview sorting and copy (slice 004c)', () => {
  it('starts sorted by name; a header click sorts, a second reverses, and aria-sort announces it', async () => {
    const user = setupUser();
    await renderView(<PeopleOverview />, 'Ada');
    expect(nameColumn()).toEqual(['Ada', 'Bea', 'Cleo']);
    expect(screen.getByRole('columnheader', { name: 'Name' })).toHaveAttribute('aria-sort', 'ascending');

    await user.click(screen.getByRole('button', { name: 'Capacity' }));
    expect(nameColumn()).toEqual(['Ada', 'Bea', 'Cleo']); // 50, then 100 and 100 in name order
    expect(screen.getByRole('columnheader', { name: 'Capacity' })).toHaveAttribute('aria-sort', 'ascending');
    expect(screen.getByRole('columnheader', { name: 'Name' })).not.toHaveAttribute('aria-sort');

    await user.click(screen.getByRole('button', { name: 'Capacity' }));
    expect(nameColumn()).toEqual(['Bea', 'Cleo', 'Ada']); // ties Bea, Cleo keep their order
    expect(screen.getByRole('columnheader', { name: 'Capacity' })).toHaveAttribute('aria-sort', 'descending');
  });

  it('sorts with the keyboard alone', async () => {
    const user = setupUser();
    await renderView(<PeopleOverview />, 'Ada');
    screen.getByRole('button', { name: 'Name' }).focus();
    await user.keyboard('{Enter}');
    expect(nameColumn()).toEqual(['Cleo', 'Bea', 'Ada']);
    expect(screen.getByRole('columnheader', { name: 'Name' })).toHaveAttribute('aria-sort', 'descending');
  });

  it('cuts long names and offers the full name in a tooltip', async () => {
    const user = setupUser();
    await renderView(<PeopleOverview />, 'Ada');
    await user.click(screen.getByRole('combobox', { name: 'Show people' }));
    await user.click(await screen.findByRole('option', { name: 'All' }));
    const long = await screen.findByText(LONG);
    expect(long).toHaveClass('truncate');
    await user.hover(long);
    expect(await screen.findAllByText(LONG)).not.toHaveLength(1);
  });

  it('copies exactly the shown rows and columns, as plain text and HTML, and confirms', async () => {
    const user = setupUser();
    await renderView(<PeopleOverview />, 'Ada');
    await user.click(screen.getByRole('button', { name: 'Capacity' }));
    await user.click(screen.getByRole('button', { name: 'Copy' }));
    // The confirmation appears once the async clipboard write has finished.
    expect(await screen.findByText('Copied 3 people')).toBeInTheDocument();

    expect(written['text/plain']).toBe(
      [
        'Name\tRole\tCountry\tTeam(s)\tCapacity\tStatus',
        `Ada\t${roleB.name}\t${country.name}\tPlatform\t50%\tActive`,
        `Bea\t${roleA.name}\t${country.name}\tPlatform\t100%\tActive`,
        `Cleo\t${roleA.name}\t${country.name}\tPlatform\t100%\tActive`,
      ].join('\n'),
    );
    expect(written['text/html']).toContain('<th>Team(s)</th>');
    expect(written['text/html']).not.toContain(LONG); // inactive people are filtered out
  });

  it('shows an error when the clipboard refuses', async () => {
    const user = setupUser();
    clipboardFails = true;
    await renderView(<PeopleOverview />, 'Ada');
    await user.click(screen.getByRole('button', { name: 'Copy' }));
    expect(await screen.findByText("Couldn't copy. Your browser blocked clipboard access.")).toBeInTheDocument();
  });
});

describe('Teams overview and Members list (slice 004c)', () => {
  it('lists teams by name, sortable by members, and copies them', async () => {
    const user = setupUser();
    await renderView(<TeamsOverview />, 'Payments');
    expect(nameColumn()).toEqual(['Payments', 'Platform']);
    await user.click(screen.getByRole('button', { name: 'Members' }));
    await user.click(screen.getByRole('button', { name: 'Members' }));
    expect(nameColumn()).toEqual(['Platform', 'Payments']);

    await user.click(screen.getByRole('button', { name: 'Copy' }));
    expect(await screen.findByText('Copied 2 teams')).toBeInTheDocument();
    expect(written['text/plain'].split('\n')[1]).toMatch(/^Platform\t3\t/);
  });

  it('sorts members by name, then Team FTE %, and copies them', async () => {
    const user = setupUser();
    await renderView(<TeamDetail id="t1" />, 'Ada');
    expect(nameColumn()).toEqual(['Ada', 'Bea', 'Cleo']);
    await user.click(screen.getByRole('button', { name: 'Team FTE %' }));
    expect(nameColumn()).toEqual(['Ada', 'Bea', 'Cleo']);
    await user.click(screen.getByRole('button', { name: 'Team FTE %' }));
    expect(nameColumn()).toEqual(['Bea', 'Cleo', 'Ada']);

    await user.click(screen.getByRole('button', { name: 'Copy' }));
    expect(await screen.findByText('Copied 3 members')).toBeInTheDocument();
    expect(written['text/plain']).toBe(
      ['Name\tRole\tTeam FTE %', `Bea\t${roleA.name}\t60%`, `Cleo\t${roleA.name}\t60%`, `Ada\t${roleB.name}\t40%`].join('\n'),
    );
  });
});
