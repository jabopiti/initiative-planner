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
import { TeamDetail } from './TeamDetail';
import { TeamsOverview } from './TeamsOverview';

// Today is 24 Sep 2026: phases starting in Sep or Oct 2026 are Confirmed, later ones Provisional (§4).
const baseline = buildBaselineDataset(defaultBrandPack);
const [role] = baseline.roles;
const [country] = baseline.countries;
const person = (id: string, name: string, extra: Partial<Person> = {}): Person => ({ id, name, roleId: role.id, countryId: country.id, capacityPct: 100, active: true, ...extra });
const member = (personId: string, teamId: string, teamFtePct: number, active = true): Membership => ({ id: `m-${personId}-${teamId}`, personId, teamId, teamFtePct, active });
const plan = (startDate: string, endDate: string, ...allocations: [string, number][]) => ({
  startDate,
  endDate,
  allocations: allocations.map(([personId, allocationPct], i) => ({ id: `a-${personId}-${i}`, personId, allocationPct })),
});

let teams: Team[];
let people: Person[];
let memberships: Membership[];
let initiatives: Initiative[];

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const file = (content: unknown, sha: string) => json({ content: btoa(JSON.stringify(content)), sha });

beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
  Element.prototype.scrollIntoView = () => {};
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      if ((init.method ?? 'GET') === 'PUT') return json({ content: { sha: 'next' } });
      if (url.includes('/contents/dataset.json')) return file(baseline.datasetFlags, 'd');
      if (url.includes('/contents/roles.json')) return file(baseline.roles, 'r');
      if (url.includes('/contents/countries.json')) return file(baseline.countries, 'c');
      if (url.includes('/contents/teams.json')) return file(teams, 't');
      if (url.includes('/contents/people.json')) return file(people, 'p');
      if (url.includes('/contents/memberships.json')) return file(memberships, 'm');
      const one = initiatives.find((i) => url.includes(`/contents/initiatives/${i.id}.json`));
      if (one) return file(one, `i-${one.id}`);
      if (url.includes('/contents/initiatives')) return json(initiatives.map((i) => ({ name: `${i.id}.json`, path: `initiatives/${i.id}.json` })));
      return json({ message: 'Not Found' }, 404);
    }),
  );
});
afterAll(() => vi.unstubAllGlobals());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

let written: Record<string, string> = {};
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 8, 24, 10) });
  written = {};
  vi.stubGlobal('ClipboardItem', class { constructor(public items: Record<string, Blob>) {} });
  teams = [
    { id: 't1', name: 'Payments', active: true },
    { id: 't2', name: 'Platform', active: true },
  ];
  people = [person('ana', 'Ana Ruiz'), person('bo', 'Bo Lind'), person('cy', 'Cy Ode')];
  memberships = [member('ana', 't1', 60), member('ana', 't2', 40), member('bo', 't1', 50)];
  initiatives = [
    {
      id: 'i1',
      name: 'Payments API',
      teamId: 't1',
      status: 'Active',
      phases: {
        validation: plan('2026-09-01', '2026-11-30', ['ana', 70], ['bo', 40], ['cy', 20]),
        development: plan('2027-03-01', '2027-03-31', ['ana', 30]),
      },
    },
    { id: 'i2', name: 'Data lake', teamId: 't2', status: 'Active', phases: { validation: plan('2026-10-01', '2026-10-31', ['ana', 40]) } },
  ];
  window.location.hash = '';
});

const readBlob = (blob: Blob) =>
  new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.readAsText(blob);
  });

/** userEvent.setup() installs its own clipboard stub, so ours goes in after it. */
function setupUser() {
  const user = userEvent.setup({ advanceTimers: () => {} });
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: {
      write: async (items: { items: Record<string, Blob> }[]) => {
        for (const [type, blob] of Object.entries(items[0].items)) written[type] = await readBlob(blob);
      },
    },
  });
  return user;
}

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

const grid = async () => within(await screen.findByRole('region', { name: 'Capacity' }));
const cell = (g: ReturnType<typeof within>, name: string, month: string) => g.getByRole('button', { name: new RegExp(`^${name}, ${month}`) });
const tinted = (el: HTMLElement) => el.classList.contains('bg-warning-tint');

describe('the capacity grid on the team detail (§5.8)', () => {
  it('shows a column per month from the current month to the last allocation, and each member with their Team FTE %', async () => {
    renderView(<TeamDetail id="t1" />);
    const g = await grid();
    expect(g.getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Name', 'Sep 26', 'Oct 26', 'Nov 26', 'Dec 26', 'Jan 27', 'Feb 27', 'Mar 27']);
    const ana = g.getByRole('rowheader', { name: /Ana Ruiz/ });
    expect(ana).toHaveTextContent('Team FTE 60%');
    expect(g.getByRole('rowheader', { name: /Bo Lind/ })).toHaveTextContent('Team FTE 50%');
  });

  it('tints a cell above the Team FTE %, with the ceiling named in its label', async () => {
    renderView(<TeamDetail id="t1" />);
    const g = await grid();
    const sep = cell(g, 'Ana Ruiz', 'Sep 2026');
    expect(sep).toHaveTextContent('70%');
    expect(tinted(sep)).toBe(true);
    expect(sep).toHaveAccessibleName(/over Team FTE %/);
    expect(sep).not.toHaveAccessibleName(/over Capacity %/);
    expect(within(sep).getByTestId('over-team-fte')).toBeInTheDocument();
    expect(within(sep).queryByTestId('over-capacity')).not.toBeInTheDocument();
  });

  it('shows the over-Capacity % icon when all teams together are over, and both when both apply', async () => {
    renderView(<TeamDetail id="t1" />);
    const g = await grid();
    const oct = cell(g, 'Ana Ruiz', 'Oct 2026');
    expect(tinted(oct)).toBe(true);
    expect(oct).toHaveAccessibleName(/over Team FTE %.*over Capacity %/);
    expect(within(oct).getByTestId('over-team-fte')).toBeInTheDocument();
    expect(within(oct).getByTestId('over-capacity')).toBeInTheDocument();
  });

  it('tints nothing that is within both ceilings, and reads an empty month as a dash', async () => {
    renderView(<TeamDetail id="t1" />);
    const g = await grid();
    for (const month of ['Sep 2026', 'Oct 2026', 'Nov 2026']) expect(tinted(cell(g, 'Bo Lind', month))).toBe(false);
    const dec = cell(g, 'Ana Ruiz', 'Dec 2026');
    expect(dec).toHaveTextContent('–');
    expect(tinted(dec)).toBe(false);
  });

  it('tints no cell at all when nobody is over', async () => {
    memberships = [member('ana', 't1', 90), member('bo', 't1', 50)];
    initiatives = [initiatives[0]];
    initiatives[0].phases!.validation.allocations = [{ id: 'a1', personId: 'ana', allocationPct: 50 }];
    renderView(<TeamDetail id="t1" />);
    const g = await grid();
    expect(g.getAllByRole('button').filter((b) => tinted(b))).toEqual([]);
  });

  it('shows a Provisional allocation as a lighter figure that is counted toward nothing', async () => {
    renderView(<TeamDetail id="t1" />);
    const g = await grid();
    const mar = cell(g, 'Ana Ruiz', 'Mar 2027');
    expect(mar).toHaveTextContent('–');
    expect(mar).toHaveTextContent('+30%');
    expect(mar).toHaveAccessibleName(/\+30% provisional/);
    expect(tinted(mar)).toBe(false);
    expect(g.getByText('Provisional, not counted', { exact: false })).toBeInTheDocument();
  });

  it('lists the contributing initiatives when a warned cell is selected, other teams included', async () => {
    const user = setupUser();
    renderView(<TeamDetail id="t1" />);
    const g = await grid();
    await user.click(cell(g, 'Ana Ruiz', 'Oct 2026'));
    const detail = within(screen.getByRole('region', { name: 'Capacity detail' }));
    expect(detail.getByText('Over Team FTE %: 70% on Payments initiatives, Team FTE % is 60%.')).toBeInTheDocument();
    expect(detail.getByText('Over Capacity %: 110% across all teams, Capacity % is 100%.')).toBeInTheDocument();
    expect(detail.getByRole('link', { name: 'Payments API' })).toHaveAttribute('href', '#/initiatives/i1');
    const lake = detail.getByRole('link', { name: 'Data lake' });
    expect(lake.closest('li')).toHaveTextContent('Platform');
    expect(lake.closest('li')).toHaveTextContent('40%');
  });

  it('lists the Provisional allocations apart from the counted ones', async () => {
    const user = setupUser();
    renderView(<TeamDetail id="t1" />);
    const g = await grid();
    await user.click(cell(g, 'Ana Ruiz', 'Mar 2027'));
    const detail = within(screen.getByRole('region', { name: 'Capacity detail' }));
    expect(detail.getByText('Not counted (Provisional)')).toBeInTheDocument();
    expect(detail.getByRole('link', { name: 'Payments API' }).closest('li')).toHaveTextContent('30%');
  });

  it('says so when a selected cell is within both ceilings', async () => {
    const user = setupUser();
    renderView(<TeamDetail id="t1" />);
    const g = await grid();
    await user.click(cell(g, 'Bo Lind', 'Sep 2026'));
    expect(within(screen.getByRole('region', { name: 'Capacity detail' })).getByText('No warnings this month.')).toBeInTheDocument();
  });

  it('shows the months over each ceiling when a row is selected', async () => {
    const user = setupUser();
    renderView(<TeamDetail id="t1" />);
    const g = await grid();
    await user.click(g.getByRole('button', { name: 'All months for Ana Ruiz' }));
    const detail = within(screen.getByRole('region', { name: 'Capacity detail' }));
    expect(detail.getByText('Over Team FTE % in Sep – Nov 2026.')).toBeInTheDocument();
    expect(detail.getByText('Over Capacity % in Oct 2026.')).toBeInTheDocument();
    expect(detail.getByRole('link', { name: 'Data lake' })).toBeInTheDocument();
  });

  it('names Team FTE %s that add up to more than the Capacity %', async () => {
    const user = setupUser();
    memberships = [member('ana', 't1', 60), member('ana', 't2', 60), member('bo', 't1', 50)];
    renderView(<TeamDetail id="t1" />);
    const g = await grid();
    await user.click(g.getByRole('button', { name: 'All months for Ana Ruiz' }));
    expect(within(screen.getByRole('region', { name: 'Capacity detail' })).getByText("Ana Ruiz's Team FTE %s add up to 120%, more than their 100% Capacity %.")).toBeInTheDocument();
  });

  it('gives an allocation that outlived the membership a row of its own', async () => {
    const user = setupUser();
    renderView(<TeamDetail id="t1" />);
    const g = await grid();
    const cy = g.getByRole('rowheader', { name: /Cy Ode/ });
    expect(cy).toHaveTextContent('No longer a member');
    expect(cy).not.toHaveTextContent('Team FTE');
    await user.click(g.getByRole('button', { name: 'All months for Cy Ode' }));
    const detail = within(screen.getByRole('region', { name: 'Capacity detail' }));
    expect(detail.getByText(/Cy Ode is no longer a member of Payments/)).toBeInTheDocument();
    expect(detail.getByText(/stay and keep costing/)).toBeInTheDocument();
  });

  it('still names Team FTE %s over the Capacity % when nothing is allocated yet', async () => {
    initiatives = [];
    memberships = [member('ana', 't1', 70), member('ana', 't2', 50)];
    renderView(<TeamDetail id="t1" />);
    const g = await grid();
    expect(g.getByText("Nothing allocated yet. Allocate members to an initiative's phase and their months appear here.")).toBeInTheDocument();
    expect(g.getByText("Ana Ruiz's Team FTE %s add up to 120%, more than their 100% Capacity %.")).toBeInTheDocument();
  });

  it('closes the detail', async () => {
    const user = setupUser();
    renderView(<TeamDetail id="t1" />);
    const g = await grid();
    await user.click(cell(g, 'Bo Lind', 'Sep 2026'));
    await user.click(screen.getByRole('button', { name: 'Close details' }));
    expect(screen.queryByRole('region', { name: 'Capacity detail' })).not.toBeInTheDocument();
  });

  it('says so when there are no members, and when nothing is allocated', async () => {
    memberships = [];
    initiatives = [];
    people = [];
    const first = renderView(<TeamDetail id="t1" />);
    expect(await screen.findByText('No members yet. Add members to see their capacity.')).toBeInTheDocument();
    first.unmount();

    people = [person('ana', 'Ana Ruiz')];
    memberships = [member('ana', 't1', 60)];
    renderView(<TeamDetail id="t1" />);
    expect(await screen.findByText("Nothing allocated yet. Allocate members to an initiative's phase and their months appear here.")).toBeInTheDocument();
  });

  it('copies the shown months, figures and warning markers', async () => {
    const user = setupUser();
    renderView(<TeamDetail id="t1" />);
    await grid();
    await user.click(screen.getByRole('button', { name: 'Copy capacity' }));
    expect(await screen.findByText('Copied 3 people')).toBeInTheDocument();
    const lines = written['text/plain'].split('\n');
    expect(lines[0]).toBe('Name\tTeam FTE %\tSep 26\tOct 26\tNov 26\tDec 26\tJan 27\tFeb 27\tMar 27');
    expect(lines[1]).toBe('Ana Ruiz\t60%\t70% (over Team FTE %)\t70% (over Team FTE %, over Capacity %)\t70% (over Team FTE %)\t–\t–\t–\t– +30% provisional');
    expect(lines[2]).toBe('Bo Lind\t50%\t40%\t40%\t40%\t–\t–\t–\t–');
    expect(lines[3]).toBe('Cy Ode\tNo longer a member\t20%\t20%\t20%\t–\t–\t–\t–');
    expect(written['text/html']).toContain('<th>Oct 26</th>');
  });
});

describe('allocation rows on the initiative page (§5.4)', () => {
  it('say in words when the person is over a ceiling in a month of the phase, or no longer on the team', async () => {
    renderView(<InitiativeDetail id="i1" />);
    const table = within(await screen.findByRole('table', { name: 'Validation allocations' }));
    const ana = table.getByRole('row', { name: /Ana Ruiz/ });
    expect(ana).toHaveTextContent('Over Team FTE % in Sep – Nov 2026');
    expect(ana).toHaveTextContent('Over Capacity % in Oct 2026');
    expect(table.getByRole('row', { name: /Cy Ode/ })).toHaveTextContent('No longer a member of Payments');
    const bo = table.getByRole('row', { name: /Bo Lind/ });
    expect(bo).not.toHaveTextContent('Over');
    expect(bo).not.toHaveTextContent('No longer');
  });
});

describe('the Teams overview marker (§5.7)', () => {
  it('marks a team with a member who has a capacity warning', async () => {
    renderView(<TeamsOverview />);
    const payments = await screen.findByRole('row', { name: /Payments/ });
    expect(within(payments).getByRole('img', { name: 'Capacity warning' })).toBeInTheDocument();
    // Ana is within her Team FTE % on Platform (40% of 40%), but over her Capacity % across both teams.
    expect(within(screen.getByRole('row', { name: /Platform/ })).getByRole('img', { name: 'Capacity warning' })).toBeInTheDocument();
  });

  it('leaves a team without warnings unmarked', async () => {
    memberships = [member('ana', 't1', 90), member('bo', 't1', 50)];
    initiatives = [{ ...initiatives[0], phases: { validation: plan('2026-09-01', '2026-11-30', ['ana', 50], ['bo', 40]) } }];
    renderView(<TeamsOverview />);
    const payments = await screen.findByRole('row', { name: /Payments/ });
    expect(within(payments).queryByRole('img', { name: 'Capacity warning' })).not.toBeInTheDocument();
  });
});
