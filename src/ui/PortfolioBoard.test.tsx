import { act, cleanup, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultBrandPack } from '../brand/defaultBrand';
import { buildBaselineDataset } from '../data/baseline';
import type { Initiative, Person, Team } from '../data/types';
import { BrandProvider } from '../state/BrandContext';
import { RepositoryProvider, useRepositoryState } from '../state/DataContext';
import { NeedsAttentionProvider } from '../state/NeedsAttentionContext';
import { TooltipProvider } from '@/components/ui/tooltip';
import { PortfolioBoard } from './PortfolioBoard';
import { rootListing } from '../sync/testing/rootListing';
import { NO_FILTERS } from '../data/initiativeList';
import { PORTFOLIO_DEFAULTS, type PortfolioFilters } from '../data/portfolio';
import { resetGettingStartedDismissal } from './gettingStartedDismissal';
import { resetSessionFilters, useSessionFilters } from './sessionFilters';

const baseline = buildBaselineDataset(defaultBrandPack);
const { process } = defaultBrandPack;
const [discoveryId, validationId] = process.map((p) => p.id);

const teams: Team[] = [
  { id: 't1', name: 'Platform', active: true },
  { id: 't2', name: 'Growth', active: true },
];
const person = (id: string, name: string, active = true): Person => ({ id, name, countryId: baseline.countries[0].id, roleId: baseline.roles[0].id, capacityPct: 100, active });
const people = [person('ana', 'Ana Ruiz'), person('old', 'Olga Old', false)];

const passed = (ids: string[]) => Object.fromEntries(ids.map((id) => [id, { outcome: 'passed' as const, passedOn: '2025-12-01', checklist: [] }]));
const item = (amount: number) => ({ id: 'c1', label: 'Licences', amount, timing: 'month' as const, month: '2026-02' });
/** A validation-phase plan whose cost is exactly `amount`, and whose end date has long passed (Overrun). */
const plan = (amount: number) => ({ [validationId]: { startDate: '2026-01-01', endDate: '2026-01-31', allocations: [], costItems: [item(amount)] } });

const big: Initiative = { id: 'big', name: 'Big One', teamId: 't1', ownerId: 'ana', status: 'Active', gates: passed([discoveryId]), phases: plan(412_000) };
const small: Initiative = { id: 'sm', name: 'Small One', teamId: 't1', ownerId: 'old', status: 'Active', gates: passed([discoveryId]), phases: plan(118_000) };
const longName = 'A very long initiative name that cannot possibly fit in one narrow board column';
const long: Initiative = { id: 'lg', name: longName, teamId: 't1', status: 'Active' };
const gap: Initiative = { id: 'gp', name: 'Gap One', teamId: 't1', ownerId: 'ana', status: 'Active', gates: passed([discoveryId]), phases: plan(4_210_000) };

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const file = (content: unknown, sha: string) => json({ content: btoa(JSON.stringify(content)), sha });
let initiatives: Initiative[] = [];

beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.scrollIntoView = () => {};
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (new URL(url).pathname.endsWith('/contents/')) return rootListing();
      if (url.includes('/contents/dataset.json')) return file(baseline.datasetFlags, 'd');
      if (url.includes('/contents/roles.json')) return file(baseline.roles, 'r');
      if (url.includes('/contents/countries.json')) return file(baseline.countries, 'c');
      if (url.includes('/contents/teams.json')) return file(teams, 't');
      if (url.includes('/contents/people.json')) return file(people, 'p');
      if (url.includes('/contents/memberships.json')) return file([], 'm');
      const match = /\/contents\/initiatives\/(.+)\.json$/.exec(new URL(url).pathname);
      if (match) {
        const found = initiatives.find((i) => i.id === match[1]);
        return found ? file(found, `sha-${match[1]}`) : json({ message: 'Not Found' }, 404);
      }
      if (url.includes('/contents/initiatives')) return json(initiatives.map((i) => ({ name: `${i.id}.json`, path: `initiatives/${i.id}.json`, sha: `sha-${i.id}`, type: 'file' })));
      return json({ message: 'Not Found' }, 404);
    }),
  );
});
afterAll(() => vi.unstubAllGlobals());
afterEach(() => {
  cleanup();
  resetSessionFilters();
  resetGettingStartedDismissal();
});

/** Shows the Initiatives table's filters, to prove the Portfolio's are kept apart. */
function TableFiltersProbe() {
  const [filters] = useSessionFilters('initiatives', NO_FILTERS);
  return <output data-testid="table-filters">{JSON.stringify(filters)}</output>;
}

function Gated() {
  const { status } = useRepositoryState();
  if (status === 'loading') return null;
  return (
    <>
      <PortfolioBoard />
      <TableFiltersProbe />
    </>
  );
}

async function renderBoard(list: Initiative[], brand = defaultBrandPack) {
  initiatives = list;
  render(
    <BrandProvider brand={brand}>
      <TooltipProvider>
        <RepositoryProvider token="token">
          <NeedsAttentionProvider>
            <Gated />
          </NeedsAttentionProvider>
        </RepositoryProvider>
      </TooltipProvider>
    </BrandProvider>,
  );
  await screen.findByRole('button', { name: 'Status: Active' });
}

describe('Getting started strip on the Portfolio (§5.2)', () => {
  it('shows above the empty state, with the steps the data has already done checked', async () => {
    initiatives = [];
    render(
      <BrandProvider brand={defaultBrandPack}>
        <TooltipProvider>
          <RepositoryProvider token="token">
            <NeedsAttentionProvider>
              <Gated />
            </NeedsAttentionProvider>
          </RepositoryProvider>
        </TooltipProvider>
      </BrandProvider>,
    );
    const strip = await screen.findByRole('heading', { name: 'Getting started' });
    expect(screen.getByText('No initiatives yet')).toBeInTheDocument();
    expect(strip.compareDocumentPosition(screen.getByText('No initiatives yet')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(screen.getByRole('link', { name: /Create a team/ }).closest('li')!).getByText('Done')).toBeInTheDocument();
  });

  it('shows above the Needs attention strip once initiatives exist', async () => {
    await renderBoard([big]);
    const strip = screen.getByRole('heading', { name: 'Getting started' });
    expect(strip.compareDocumentPosition(screen.getByRole('heading', { name: 'Needs attention' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

/** A board card, not the Needs attention strip's link to the same initiative (strip links sit in list items). */
const card = (name: string | RegExp) => screen.getAllByRole('link', { name }).find((a) => !a.closest('li'))!;

describe('Portfolio board cards (§5.2)', () => {
  it('shows team · owner, the compact estimate and the real approval track', async () => {
    await renderBoard([big]);
    const c = card(/Big One/);
    expect(within(c).getByText('Platform · Ana Ruiz')).toBeTruthy();
    expect(within(c).getByText('€412k')).toBeTruthy();
    expect(within(c).getByText('Elevated')).toBeTruthy();
  });

  it('names a missing owner and marks a deactivated one', async () => {
    await renderBoard([long, small]);
    expect(within(card(new RegExp(longName))).getByText('Platform · No owner')).toBeTruthy();
    expect(within(card(/Small One/)).getByText('Platform · Olga Old (inactive)')).toBeTruthy();
  });

  it('shows the Overrun marker with the kind as its accessible name, and none without an item', async () => {
    await renderBoard([big, long]);
    expect(within(card(/Big One/)).getByRole('img', { name: 'Overrun' })).toBeTruthy();
    expect(within(card(new RegExp(longName))).queryByRole('img')).toBeNull();
  });

  it('reads "No approval track" when no band covers the total', async () => {
    const gapped = { ...defaultBrandPack, approvalTracks: defaultBrandPack.approvalTracks.filter((t) => t.id !== 'elevated') };
    await renderBoard([gap], gapped);
    expect(within(card(/Gap One/)).getByText('No approval track')).toBeTruthy();
    expect(within(card(/Gap One/)).getByText('€4.2M')).toBeTruthy();
  });

  it('gives a long name in full as its tooltip text', async () => {
    const user = userEvent.setup();
    await renderBoard([long]);
    await user.hover(screen.getByText(longName));
    expect((await screen.findAllByText(longName)).length).toBeGreaterThan(1);
  });
});

describe('Portfolio board column headers (§5.2)', () => {
  it('shows count and compact sum, with the full sum as a tooltip, and 0 · €0 for an empty column', async () => {
    const user = userEvent.setup();
    await renderBoard([big, small]);
    const validation = process.find((p) => p.id === validationId)!;
    expect(screen.getByText(validation.label)).toBeTruthy();
    expect(screen.getByText('2 · €530k')).toBeTruthy();
    expect(screen.getAllByText('0 · €0').length).toBeGreaterThan(0);
    await user.hover(screen.getByText('2 · €530k'));
    expect((await screen.findAllByText('€530,000')).length).toBeGreaterThan(0);
  });
});

/** Over: €100k estimated for Feb 2026, €104k recorded — deviation +€4k. */
const over: Initiative = {
  id: 'ov',
  name: 'Over One',
  teamId: 't1',
  ownerId: 'ana',
  status: 'Active',
  gates: passed([discoveryId]),
  phases: { [validationId]: { startDate: '2026-02-01', endDate: '2026-02-28', allocations: [], costItems: [item(100_000)], actualMonths: { '2026-02': 104_000 } } },
};
const held: Initiative = { id: 'hd', name: 'Held One', teamId: 't1', status: 'On Hold', gates: passed([discoveryId]), phases: plan(50_000) };
const later: Initiative = {
  id: 'lt',
  name: 'Later One',
  teamId: 't2',
  status: 'Active',
  gates: passed([discoveryId]),
  phases: { [validationId]: { startDate: '2027-03-01', endDate: '2027-03-31', allocations: [], costItems: [{ id: 'c2', label: 'Hardware', amount: 30_000, timing: 'month', month: '2027-03' }] } },
};

const chipButton = (label: string | RegExp) => screen.getByRole('button', { name: label });
const cardNames = () => screen.queryAllByRole('link').filter((a) => !a.closest('li')).map((a) => a.textContent);
const shownCard = (name: string) => cardNames().some((t) => t?.startsWith(name));

async function pick(user: ReturnType<typeof userEvent.setup>, chipLabel: RegExp, option: string) {
  await user.click(chipButton(chipLabel));
  await user.click(await screen.findByRole('checkbox', { name: option }));
  await user.keyboard('{Escape}');
}

async function pickYear(user: ReturnType<typeof userEvent.setup>, year: string) {
  await user.click(chipButton(/^Year/));
  await user.click(await screen.findByRole('menuitemradio', { name: year }));
}

describe('Portfolio filters (§5.2, §9.11)', () => {
  it('shows the six chips with Status on Active, the count over every initiative, and no Clear filters', async () => {
    await renderBoard([big, held, later]);
    for (const label of ['Team', 'Phase', 'Year', 'Initiatives', 'Approval track', 'Status: Active']) expect(chipButton(label)).toBeInTheDocument();
    expect(shownCard('Held One')).toBe(false);
    expect(screen.getByText('2 of 3 initiatives')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument();
  });

  it('shows On Hold initiatives with their status icon once Status is widened', async () => {
    const user = userEvent.setup();
    await renderBoard([big, held]);
    await pick(user, /^Status/, 'On Hold');
    expect(chipButton('Status: 2')).toBeInTheDocument();
    expect(within(card(/Held One/)).getByRole('img', { name: 'On Hold' })).toBeInTheDocument();
    expect(within(card(/Big One/)).queryByRole('img', { name: 'On Hold' })).toBeNull();
  });

  it('clears every chip but Status, which returns to Active', async () => {
    const user = userEvent.setup();
    await renderBoard([big, held, later]);
    await pick(user, /^Team/, 'Growth');
    await pick(user, /^Status/, 'On Hold');
    expect(chipButton('Team: Growth')).toBeInTheDocument();
    expect(cardNames()).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(chipButton('Team')).toBeInTheDocument();
    expect(chipButton('Status: Active')).toBeInTheDocument();
    expect(shownCard('Held One')).toBe(false);
  });

  it('keeps its filters apart from the Initiatives table’s', async () => {
    const user = userEvent.setup();
    await renderBoard([big, later]);
    await pick(user, /^Team/, 'Growth');
    expect(screen.getByTestId('table-filters')).toHaveTextContent(JSON.stringify(NO_FILTERS));
  });

  it('narrows the Initiatives chip by typing, and shows only the ticked ones', async () => {
    const user = userEvent.setup();
    await renderBoard([big, small, later]);
    await user.click(chipButton('Initiatives'));
    await user.type(await screen.findByRole('textbox', { name: 'Search initiatives' }), 'one');
    expect(screen.getAllByRole('checkbox')).toHaveLength(3);
    await user.clear(screen.getByRole('textbox', { name: 'Search initiatives' }));
    await user.type(screen.getByRole('textbox', { name: 'Search initiatives' }), 'big');
    expect(screen.getAllByRole('checkbox')).toHaveLength(1);
    await user.click(screen.getByRole('checkbox', { name: 'Big One' }));
    await user.clear(screen.getByRole('textbox', { name: 'Search initiatives' }));
    await user.click(screen.getByRole('checkbox', { name: 'Later One' }));
    await user.keyboard('{Escape}');
    expect(chipButton('Initiatives: 2')).toBeInTheDocument();
    expect(shownCard('Big One') && shownCard('Later One') && !shownCard('Small One')).toBe(true);
  });

  it('scopes cards, column sums and metrics to the chosen year, hides initiatives without cost in it, and keeps the track badge', async () => {
    const user = userEvent.setup();
    await renderBoard([big, later]);
    await pickYear(user, '2027');
    expect(chipButton('Year: 2027')).toBeInTheDocument();
    expect(cardNames()).toHaveLength(1);
    expect(within(card(/Later One/)).getByText('€30k')).toBeInTheDocument();
    expect(screen.getByText('1 · €30k')).toBeInTheDocument();
    await pickYear(user, '2026');
    expect(within(card(/Big One/)).getByText('€412k')).toBeInTheDocument();
    expect(within(card(/Big One/)).getByText('Elevated')).toBeInTheDocument();
    expect(shownCard('Later One')).toBe(false);
    await pickYear(user, 'All years');
    expect(chipButton('Year')).toBeInTheDocument();
    expect(cardNames()).toHaveLength(2);
  });

  it('states Total cost and a signed Deviation for what is shown, overspend in Warning', async () => {
    await renderBoard([small, over]);
    expect(screen.getByText('€222k')).toBeInTheDocument();
    const deviation = screen.getByText('+€4k');
    expect(deviation).toHaveClass('text-warning-text');
  });

  it('keeps the columns and offers Clear filters when nothing matches, with the metrics at €0', async () => {
    const user = userEvent.setup();
    await renderBoard([big, later]);
    await pick(user, /^Team/, 'Growth');
    await pickYear(user, '2026');
    expect(screen.getByText('No initiatives match these filters.')).toBeInTheDocument();
    expect(screen.getAllByText('0 · €0')).toHaveLength(process.length);
    expect(screen.getByText('0 of 2 initiatives')).toBeInTheDocument();
    expect(screen.getAllByText('€0').length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByRole('button', { name: 'Copy' })).not.toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: 'Clear filters' })[1]);
    expect(cardNames()).toHaveLength(2);
  });

  it('drops a pick that no longer exists, such as an initiative deleted since', async () => {
    const { result } = renderHook(() => useSessionFilters<PortfolioFilters>('portfolio', PORTFOLIO_DEFAULTS));
    act(() => result.current[1]({ ...PORTFOLIO_DEFAULTS, initiative: ['gone'] }));
    await renderBoard([big, later]);
    expect(chipButton('Initiatives')).toBeInTheDocument();
    expect(cardNames()).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument();
  });

  it('is back to its defaults after a reload', async () => {
    const user = userEvent.setup();
    await renderBoard([big, later]);
    await pick(user, /^Team/, 'Growth');
    act(() => resetSessionFilters());
    expect(chipButton('Team')).toBeInTheDocument();
    expect(chipButton('Status: Active')).toBeInTheDocument();
  });
});

describe('Portfolio Copy (§5.2, §9.2)', () => {
  let written: Record<string, string> = {};
  beforeEach(() => {
    written = {};
    vi.stubGlobal('ClipboardItem', class { constructor(public items: Record<string, Blob>) {} });
  });

  it('copies the shown initiatives in board order, then the two metrics, with full amounts', async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        write: async (items: { items: Record<string, Blob> }[]) => {
          for (const [type, blob] of Object.entries(items[0].items)) written[type] = await blob.text();
        },
      },
    });
    await renderBoard([small, over, later]);
    await pickYear(user, '2026');
    await user.click(screen.getByRole('button', { name: 'Copy' }));
    await waitFor(() => expect(written['text/plain']).toBeDefined());
    const validation = process.find((p) => p.id === validationId)!.label;
    expect(written['text/plain'].split('\n')).toEqual([
      'Name\tTeam\tOwner\tPhase\tCost in 2026\tApproval track\tStatus',
      `Small One\tPlatform\tOlga Old (inactive)\t${validation}\t€118,000\tStandard\tActive`,
      `Over One\tPlatform\tAna Ruiz\t${validation}\t€104,000\tStandard\tActive`,
      '',
      'Total cost\t\t\t\t€222,000\t\t',
      'Deviation\t\t\t\t+€4,000\t\t',
    ]);
    expect(written['text/html']).toContain('<th>Cost in 2026</th>');
  });
});
