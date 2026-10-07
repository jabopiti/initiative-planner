import { act, cleanup, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultBrandPack } from '../brand/defaultBrand';
import { buildBaselineDataset } from '../data/baseline';
import type { Initiative, Membership, Person, Team } from '../data/types';
import { BrandProvider } from '../state/BrandContext';
import { RepositoryProvider, useRepositoryState } from '../state/DataContext';
import { NeedsAttentionProvider } from '../state/NeedsAttentionContext';
import { TooltipProvider } from '@/components/ui/tooltip';
import { PortfolioBoard } from './PortfolioBoard';
import { NO_FILTERS } from '../data/initiativeList';
import { PORTFOLIO_DEFAULTS, type PortfolioFilters } from '../data/portfolio';
import { resetGettingStartedDismissal } from './gettingStartedDismissal';
import { resetSessionFilters, useSessionFilters } from './sessionFilters';
import { fakeOnDemand, seedFiles } from '../sync/testing/fakeGithub';

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

let initiatives: Initiative[] = [];
let memberships: Membership[] = [];

const served = fakeOnDemand((fake) => seedFiles(fake, { dataset: baseline.datasetFlags, roles: baseline.roles, countries: baseline.countries, teams, people, memberships, initiatives }));

beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.scrollIntoView = () => {};
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('fetch', served.fetch);
});
afterAll(() => vi.unstubAllGlobals());
beforeEach(() => served.reset());
afterEach(() => {
  cleanup();
  resetSessionFilters();
  resetGettingStartedDismissal();
  memberships = [];
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
    expect(within(screen.getByRole('link', { name: /Create a team/ }).closest('li')!).getByText('(done)')).toBeInTheDocument();
  });

  it('collapses to a chip first in the toolbar row at three of four done', async () => {
    memberships = [{ id: 'm1', personId: 'ana', teamId: 't1', teamFtePct: 100, active: true }];
    await renderBoard([big]);
    expect(screen.queryByRole('heading', { name: 'Getting started' })).toBeNull();
    const chip = screen.getByRole('button', { name: 'Getting started · 3 of 4 done' });
    expect(chip.compareDocumentPosition(screen.getByRole('button', { name: 'Team' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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
    // The full track badge, letter and name, on the card too (§9.10).
    expect(within(c).getByText((_, el) => el?.textContent === 'E Elevated')).toBeTruthy();
  });

  it('shows the miniature bullet bar beside the estimate, past the scale’s end clipped (§5.2, slice 059)', async () => {
    await renderBoard([big, small]);
    const bar = within(card(/Big One/)).getByTestId('bullet-bar');
    expect(bar).toHaveAttribute('aria-hidden', 'true'); // the figure beside it is the text
    expect(within(bar).getAllByTestId('bullet-band')).toHaveLength(3);
    expect(within(bar).getByTestId('bullet-clipped')).toBeInTheDocument(); // €412k past €400k
    expect(within(card(/Small One/)).getByTestId('bullet-estimate').style.width).toBe('29.5%'); // €118k of €400k
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
    expect(within(card(/Gap One/)).getByText('No approval track')).toHaveClass('border-dashed');
    expect(within(card(/Gap One/)).getByText('€4.2M')).toBeTruthy();
  });

  it('gives a long name in full as its tooltip text', async () => {
    const user = userEvent.setup();
    await renderBoard([long]);
    await user.hover(screen.getByText(longName));
    expect((await screen.findAllByText(longName)).length).toBeGreaterThan(1);
  });
});

describe('Portfolio board column headers (§5.2, §9.10)', () => {
  it('shows the phase icon and label, the count as a pill and the compact sum, with the full sum as a tooltip', async () => {
    const user = userEvent.setup();
    await renderBoard([big, small]);
    const validation = process.find((p) => p.id === validationId)!;
    const column = screen.getByRole('group', { name: validation.label });
    expect(within(column).getByText(validation.label).parentElement!.querySelector('svg')).toBeTruthy();
    // The pill shows the bare number; screen readers hear it with its noun.
    expect(within(column).getByText((_, el) => el?.tagName === 'SPAN' && el.textContent === '2 initiatives' && el.firstChild?.textContent === '2')).toBeTruthy();
    await user.hover(within(column).getByText('€530k'));
    expect((await screen.findAllByText('€530,000')).length).toBeGreaterThan(0);
  });

  it('holds a dashed placeholder naming the phase in an empty column, which stays visible', async () => {
    await renderBoard([big, small]);
    const rollout = process[process.length - 1];
    const column = screen.getByRole('group', { name: rollout.label });
    expect(within(column).getByText(`No initiatives in ${rollout.label}`)).toBeTruthy();
    expect(within(column).getByText('€0')).toBeTruthy();
  });
});

describe('Portfolio page shell (§9.8)', () => {
  it('opens with a visible "Portfolio" title, and the count and Copy table in the filter row', async () => {
    await renderBoard([big, small]);
    expect(screen.getByRole('heading', { level: 1, name: 'Portfolio' })).toBeVisible();
    const row = screen.getByRole('button', { name: 'Status: Active' }).parentElement!.parentElement!;
    expect(within(row).getByText('2 of 2 initiatives')).toBeTruthy();
    expect(within(row).getByRole('button', { name: 'Copy table' })).toBeTruthy();
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
    await pick(user, /^Status/, 'On hold');
    expect(chipButton('Status: 2')).toBeInTheDocument();
    expect(within(card(/Held One/)).getByRole('img', { name: 'On hold' })).toBeInTheDocument();
    expect(within(card(/Big One/)).queryByRole('img', { name: 'On hold' })).toBeNull();
  });

  it('clears every chip but Status, which returns to Active', async () => {
    const user = userEvent.setup();
    await renderBoard([big, held, later]);
    await pick(user, /^Team/, 'Growth');
    await pick(user, /^Status/, 'On hold');
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
    // The bar stays on the lifetime grand estimate, like the badge (slice 059).
    const lifetime = within(card(/Later One/)).getByTestId('bullet-estimate').style.width;
    await pickYear(user, 'All years');
    expect(within(card(/Later One/)).getByTestId('bullet-estimate').style.width).toBe(lifetime);
    await pickYear(user, '2027');
    expect(within(screen.getByRole('group', { name: 'Validation' })).getAllByText('€30k')).toHaveLength(2); // column sum and card
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
    expect(within(screen.getByText(/^Total cost/)).getByText('€222k')).toBeInTheDocument();
    const deviation = screen.getByText('+€4k');
    expect(deviation).toHaveClass('text-warning-text');
  });

  it('keeps the columns and offers Clear filters when nothing matches, with the metrics at €0', async () => {
    const user = userEvent.setup();
    await renderBoard([big, later]);
    await pick(user, /^Team/, 'Growth');
    await pickYear(user, '2026');
    expect(screen.getByText('No initiatives match these filters.')).toBeInTheDocument();
    expect(screen.getAllByText(/^No initiatives in /)).toHaveLength(process.length);
    expect(screen.getByText('0 of 2 initiatives')).toBeInTheDocument();
    expect(screen.getAllByText('€0').length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByRole('button', { name: 'Copy table' })).not.toBeInTheDocument();
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
    await user.click(screen.getByRole('button', { name: 'Copy table' }));
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
