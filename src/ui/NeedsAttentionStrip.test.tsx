import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultBrandPack } from '@brand';
import { buildBaselineDataset } from '../data/baseline';
import type { Initiative, Membership, Person } from '../data/types';
import { BrandProvider } from '../state/BrandContext';
import { RepositoryProvider, useRepositoryState } from '../state/DataContext';
import { NeedsAttentionProvider } from '../state/NeedsAttentionContext';
import { TooltipProvider } from '@/components/ui/tooltip';
import { InitiativeDetail } from './InitiativeDetail';
import { PortfolioBoard } from './PortfolioBoard';
import { TopBar } from './TopBar';
import { fakeOnDemand, seedFiles } from '../sync/testing/fakeGithub';

const baseline = buildBaselineDataset(defaultBrandPack);
const [discoveryId, validationId] = defaultBrandPack.process.map((p) => p.id);
const [g1] = defaultBrandPack.process.map((p) => p.exitGate);

const ana: Person = { id: 'ana', name: 'Ana Ruiz', countryId: baseline.countries[0].id, roleId: baseline.roles[0].id, capacityPct: 100, active: true };
const members: Membership[] = [{ id: 'm1', personId: 'ana', teamId: 't1', teamFtePct: 100, active: true }];

let initiatives: Initiative[] = [];

const served = fakeOnDemand((fake) => seedFiles(fake, { roles: baseline.roles, countries: baseline.countries, teams: [{ id: 't1', name: 'Platform', active: true }], people: [ana], memberships: members, initiatives }));

beforeAll(() => {
  Element.prototype.scrollIntoView = () => {};
});
afterEach(cleanup);
beforeEach(() => {
  window.location.hash = '';
});

/** Mirrors App.tsx's own gate (Screen only mounts a route once the dataset is no longer loading), since this
 * test mounts InitiativeDetail directly rather than through the router. */
function GatedInitiativeDetail(props: { id: string; focus?: string | null }) {
  const { status } = useRepositoryState();
  if (status === 'loading') return null;
  return <InitiativeDetail {...props} />;
}

function renderWith(ui: React.ReactNode) {
  return render(
    <BrandProvider brand={defaultBrandPack}>
      <TooltipProvider>
        <RepositoryProvider token="token">
          <NeedsAttentionProvider>{ui}</NeedsAttentionProvider>
        </RepositoryProvider>
      </TooltipProvider>
    </BrandProvider>,
  );
}

const overrunInitiative: Initiative = {
  id: 'ov',
  name: 'Overrun Co',
  teamId: 't1',
  status: 'Active',
  gates: { [discoveryId]: { outcome: 'passed', passedOn: '2025-12-01', checklist: [] } },
  phases: { [validationId]: { startDate: '2026-01-01', endDate: '2026-01-31', allocations: [{ id: 'a1', personId: 'ana', allocationPct: 50 }] } },
};

const readyInitiative: Initiative = {
  id: 'rd',
  name: 'Ready Co',
  teamId: 't1',
  status: 'Active',
  checklist: { [discoveryId]: Object.fromEntries(g1.checklistItems.map((item) => [item.id, { status: 'complete', note: '' }])) },
};

describe('Needs attention strip (§5.2, §8.5)', () => {
  it('shows one item per Active initiative, ranked Overrun before Ready, and excludes an On Hold one', async () => {
    initiatives = [readyInitiative, overrunInitiative, { ...overrunInitiative, id: 'oh', name: 'On Hold Co', status: 'On Hold' }];
    renderWith(<PortfolioBoard />);

    const strip = await screen.findByRole('heading', { name: 'Needs attention' });
    const section = strip.closest('section')!;
    const rows = within(section).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText('Overrun')).toBeInTheDocument();
    expect(within(rows[0]).getByText('Overrun Co')).toBeInTheDocument();
    expect(within(rows[0]).getByText(/Validation is \d+ days overrun/)).toBeInTheDocument();
    expect(within(rows[1]).getByText('Ready')).toBeInTheDocument();
    expect(within(rows[1]).getByText(/All requirements met/)).toBeInTheDocument();
    expect(screen.queryByText('On Hold Co')).not.toBeInTheDocument();

    // The name links to the initiative, scrolled and focused at the place matching its kind (§5.2).
    const link = within(rows[0]).getByRole('link', { name: 'Overrun Co' });
    expect(link).toHaveAttribute('href', `#/initiatives/ov?focus=phase-row-${validationId}`);
  });

  it('shows only the top three, with "Show n more" revealing the rest in place', async () => {
    initiatives = [0, 1, 2, 3].map((n) => ({ ...overrunInitiative, id: `ov${n}`, name: `Overrun Co ${n}` }));
    const user = userEvent.setup();
    renderWith(<PortfolioBoard />);

    const section = (await screen.findByRole('heading', { name: 'Needs attention' })).closest('section')!;
    expect(within(section).getAllByRole('listitem')).toHaveLength(3);
    const more = screen.getByRole('button', { name: 'Show 1 more' });
    await user.click(more);
    expect(within(section).getAllByRole('listitem')).toHaveLength(4);
    expect(screen.queryByRole('button', { name: /Show/ })).not.toBeInTheDocument();
  });

  it('is absent when no Active initiative has anything to show', async () => {
    initiatives = [];
    renderWith(<PortfolioBoard />);
    await screen.findByText('No initiatives yet');
    expect(screen.queryByRole('heading', { name: 'Needs attention' })).not.toBeInTheDocument();
  });

  it("shows the count on the Initiatives nav item, hidden when there's nothing to show (§5.1)", async () => {
    initiatives = [overrunInitiative, readyInitiative];
    renderWith(
      <>
        <TopBar route="/portfolio" />
        <PortfolioBoard />
      </>,
    );
    await screen.findByRole('heading', { name: 'Needs attention' }); // proves the dataset has loaded
    const nav = screen.getByRole('link', { name: /Initiatives/ });
    expect(within(nav).getByText('2')).toBeInTheDocument();
    cleanup();

    for (const { id } of initiatives) served.fake().remove(`initiatives/${id}.json`);
    renderWith(
      <>
        <TopBar route="/portfolio" />
        <PortfolioBoard />
      </>,
    );
    await screen.findByText('No initiatives yet'); // proves the (empty) dataset has loaded
    const navEmpty = screen.getByRole('link', { name: 'Initiatives' });
    expect(within(navEmpty).queryByText(/^\d+$/)).not.toBeInTheDocument();
  });

  it('a strip link scrolls and moves focus to the matching place on arrival (§9.5)', async () => {
    initiatives = [overrunInitiative];
    renderWith(<GatedInitiativeDetail id="ov" focus={`phase-row-${validationId}`} />);
    await screen.findByText('Cost summary'); // proves the page has loaded
    const phaseRow = document.getElementById(`phase-row-${validationId}`)!;
    const toggle = within(phaseRow).getByRole('button', { name: /^Validation/ });
    await vi.waitFor(() => expect(document.activeElement).toBe(toggle));
  });
});
