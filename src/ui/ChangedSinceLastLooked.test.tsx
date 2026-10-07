import { cleanup, render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cacheScope, SeenCache } from '../cache/db';
import { defaultBrandPack } from '../brand/defaultBrand';
import { buildBaselineDataset } from '../data/baseline';
import { formatSince, keyFigureSnapshot, seenRecord, type SeenRecord } from '../data/seen';
import type { Initiative, Person, Team } from '../data/types';
import { BrandProvider } from '../state/BrandContext';
import { RepositoryProvider, useRepositoryState } from '../state/DataContext';
import { NeedsAttentionProvider } from '../state/NeedsAttentionContext';
import { SeenProvider, useInitiativeVisit } from '../state/SeenContext';
import { TooltipProvider } from '@/components/ui/tooltip';
import { InitiativesTable } from './InitiativesTable';
import { PortfolioBoard } from './PortfolioBoard';
import { resetSessionFilters } from './sessionFilters';
import { fakeOnDemand, seedFiles } from '../sync/testing/fakeGithub';

const baseline = buildBaselineDataset(defaultBrandPack);
const { process } = defaultBrandPack;
const validationId = process[1].id;
const data = { roles: baseline.roles, countries: baseline.countries };

const teams: Team[] = [{ id: 't1', name: 'Platform', active: true }];
const people: Person[] = [];
const plan = (amount: number) => ({
  [validationId]: { startDate: '2026-01-01', endDate: '2026-01-31', allocations: [], costItems: [{ id: 'c1', label: 'Licences', amount, timing: 'month' as const, month: '2026-02' }] },
});
const checkout: Initiative = { id: 'co', name: 'Checkout Redesign', teamId: 't1', status: 'Active', phases: plan(394_800) };
const fraud: Initiative = { id: 'fr', name: 'Fraud Detection Upgrade', teamId: 't1', status: 'Active', phases: plan(128_000) };
const paused: Initiative = { id: 'pa', name: 'Paused One', teamId: 't1', status: 'On Hold', phases: plan(50_000) };
const never: Initiative = { id: 'nv', name: 'Never Opened', teamId: 't1', status: 'Active' };

let initiatives: Initiative[] = [];
const scope = cacheScope(defaultBrandPack.github);
const DAY = 86_400_000;

/** What the user saw of `initiative` `daysAgo` days ago, when its grand estimate was `estimate`. */
const seenAs = (initiative: Initiative, estimate: number, daysAgo: number): SeenRecord => {
  const figures = { ...keyFigureSnapshot(initiative, process, people, data), estimate };
  return { ...seenRecord(initiative, figures, Date.now() - daysAgo * DAY) };
};
const seenNow = (initiative: Initiative): SeenRecord => seenRecord(initiative, keyFigureSnapshot(initiative, process, people, data), Date.now());

fakeOnDemand((fake) => seedFiles(fake, { teams, people, initiatives }));

beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.scrollIntoView = () => {};
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
});
afterEach(async () => {
  cleanup();
  resetSessionFilters();
  vi.restoreAllMocks();
  await new SeenCache(scope).clear();
});

function Gated({ children }: { children: ReactNode }) {
  const { status } = useRepositoryState();
  return status === 'loading' ? null : children;
}

const providers = (children: ReactNode) => (
  <BrandProvider brand={defaultBrandPack}>
    <TooltipProvider>
      <RepositoryProvider token="token">
        <SeenProvider>
          <NeedsAttentionProvider>
            <Gated>{children}</Gated>
          </NeedsAttentionProvider>
        </SeenProvider>
      </RepositoryProvider>
    </TooltipProvider>
  </BrandProvider>
);

async function seed(records: [string, SeenRecord][]) {
  await new SeenCache(scope).putMany(records);
}

describe('Changed since you last looked on the Portfolio (§9.9)', () => {
  it('marks only opened initiatives that changed, and counts them with the earliest last visit', async () => {
    initiatives = [checkout, fraud, never];
    await seed([['co', seenAs(checkout, 381_600, 3)], ['fr', seenNow(fraud)]]);
    render(providers(<PortfolioBoard />));

    const since = formatSince(Date.now() - 3 * DAY, new Date());
    expect(await screen.findByText(`1 initiative changed since you last looked, ${since}`)).toBeInTheDocument();
    expect(screen.getAllByRole('img', { name: 'Changed since you last looked' })).toHaveLength(1);
    expect(screen.getByRole('img', { name: 'Changed since you last looked' }).closest('a')).toHaveTextContent('Checkout Redesign');
  });

  it('counts a changed initiative the filters hide, and Mark as seen clears every one', async () => {
    initiatives = [checkout, paused];
    await seed([['co', seenAs(checkout, 381_600, 1)], ['pa', seenAs(paused, 40_000, 5)]]);
    render(providers(<PortfolioBoard />));

    const since = formatSince(Date.now() - 5 * DAY, new Date());
    expect(await screen.findByText(`2 initiatives changed since you last looked, ${since}`)).toBeInTheDocument();
    expect(screen.getAllByRole('img', { name: 'Changed since you last looked' })).toHaveLength(1); // On Hold is filtered out of the board

    await userEvent.click(screen.getByRole('button', { name: 'Mark as seen' }));
    expect(screen.queryByText(/changed since you last looked/)).toBeNull();
    expect(screen.queryByRole('img', { name: 'Changed since you last looked' })).toBeNull();
    await waitFor(async () => expect((await new SeenCache(scope).all()).get('pa')?.figures.estimate).toBe(50_000));
  });

  it('marks the row in the Initiatives table too', async () => {
    initiatives = [checkout, fraud];
    await seed([['co', seenAs(checkout, 381_600, 0)], ['fr', seenNow(fraud)]]);
    render(providers(<InitiativesTable />));

    expect((await screen.findByRole('img', { name: 'Changed since you last looked' })).closest('tr')).toHaveTextContent('Checkout Redesign');
  });

  it('marks nothing and fails nothing when the store cannot be read', async () => {
    const read = vi.spyOn(SeenCache.prototype, 'all').mockRejectedValue(new Error('blocked'));
    initiatives = [checkout];
    render(providers(<PortfolioBoard />));

    await screen.findByRole('button', { name: 'Status: Active' });
    await waitFor(() => expect(read).toHaveBeenCalled());
    expect(screen.queryByText(/changed since you last looked/)).toBeNull();
    expect(screen.queryByRole('img', { name: 'Changed since you last looked' })).toBeNull();
  });

  it('never names who made a change', async () => {
    initiatives = [checkout];
    await seed([['co', seenAs(checkout, 381_600, 2)]]);
    render(providers(<PortfolioBoard />));

    const line = await screen.findByText(/changed since you last looked/);
    expect(line.textContent).not.toMatch(/\bby\b/i);
  });
});

describe('Opening an initiative (§9.9)', () => {
  const visit = (initiative: Initiative) => renderHook(() => useInitiativeVisit(initiative), { wrapper: ({ children }) => providers(children) });

  it('gives the figures that changed since the last look, and records what the user now sees', async () => {
    initiatives = [checkout];
    await seed([['co', seenAs(checkout, 381_600, 2)]]);
    const { result } = visit(checkout);

    await waitFor(() => expect(result.current).toEqual({ estimate: 381_600 }));
    await waitFor(async () => expect((await new SeenCache(scope).all()).get('co')?.figures.estimate).toBe(394_800));
  });

  it('records the user\'s own edit while the page is open, and shows no previous value for it', async () => {
    initiatives = [fraud];
    await seed([['fr', seenNow(fraud)]]);
    const { result, rerender } = renderHook(({ initiative }) => useInitiativeVisit(initiative), { initialProps: { initiative: fraud }, wrapper: ({ children }) => providers(children) });
    await waitFor(() => expect(result.current).toEqual({}));

    rerender({ initiative: { ...fraud, name: 'Fraud Detection', phases: plan(200_000) } });

    await waitFor(async () => expect((await new SeenCache(scope).all()).get('fr')?.figures.estimate).toBe(200_000));
    expect(result.current).toEqual({});
  });

  it('shows no previous value for an initiative never opened, and records it', async () => {
    initiatives = [never];
    const { result } = visit(never);

    await waitFor(() => expect(result.current).toEqual({}));
    await waitFor(async () => expect((await new SeenCache(scope).all()).has('nv')).toBe(true));
  });

  it('keeps nothing and shows nothing when the store cannot be read', async () => {
    const read = vi.spyOn(SeenCache.prototype, 'all').mockRejectedValue(new Error('blocked'));
    initiatives = [checkout];
    const { result } = visit(checkout);

    await waitFor(() => expect(read).toHaveBeenCalled());
    expect(result.current).toBeNull();
  });
});
