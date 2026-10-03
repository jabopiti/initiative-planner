import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { Screen } from '../App';
import { defaultBrandPack } from '../brand/defaultBrand';
import { buildBaselineDataset } from '../data/baseline';
import type { Initiative, Membership, Person } from '../data/types';
import { BrandProvider } from '../state/BrandContext';
import { RepositoryProvider } from '../state/DataContext';
import { NeedsAttentionProvider } from '../state/NeedsAttentionContext';
import { TooltipProvider } from '@/components/ui/tooltip';
import { NeedsAttentionStrip } from './NeedsAttentionStrip';
import { rootListing } from '../sync/testing/rootListing';

/** Slice 050: every Needs attention link lands on its own target (§5.2, §8.5), and no state carries between initiatives. */

const baseline = buildBaselineDataset(defaultBrandPack);
const [discovery, validation, development] = defaultBrandPack.process;
const ana: Person = { id: 'ana', name: 'Ana Ruiz', countryId: baseline.countries[0].id, roleId: baseline.roles[0].id, capacityPct: 100, active: true };
const members: Membership[] = [{ id: 'm1', personId: 'ana', teamId: 't1', teamFtePct: 100, active: true }];
const allocations = [{ id: 'a1', personId: 'ana', allocationPct: 100 }];
const passed = (passedOn: string) => ({ outcome: 'passed' as const, passedOn, checklist: [] });
const allComplete = (items: { id: string }[]) => Object.fromEntries(items.map((item) => [item.id, { status: 'complete' as const, note: '' }]));

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const file = (content: unknown, sha: string) => json({ content: btoa(JSON.stringify(content)), sha });

let initiatives: Initiative[] = [];

beforeAll(() => {
  Element.prototype.scrollIntoView = () => {};
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-03-15T12:00:00'));
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      if ((init.method ?? 'GET') === 'PUT') return json({ content: { sha: 'next' } });
      if (new URL(url).pathname.endsWith('/contents/')) return rootListing();
      if (url.includes('/contents/dataset.json')) return file(baseline.datasetFlags, 'd');
      if (url.includes('/contents/roles.json')) return file(baseline.roles, 'r');
      if (url.includes('/contents/countries.json')) return file(baseline.countries, 'c');
      if (url.includes('/contents/teams.json')) return file([{ id: 't1', name: 'Platform', active: true }], 't');
      if (url.includes('/contents/people.json')) return file([ana], 'p');
      if (url.includes('/contents/memberships.json')) return file(members, 'm');
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
afterAll(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
afterEach(cleanup);

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

/** Follows the strip's link for the one initiative given, through App's own route, and returns the focused element. */
async function followStripLink(initiative: Initiative, kind: string): Promise<HTMLElement> {
  initiatives = [initiative];
  renderWith(<NeedsAttentionStrip />);
  const strip = await screen.findByRole('region', { name: 'Needs attention' });
  expect(within(strip).getByText(kind)).toBeInTheDocument();
  const href = within(strip).getByRole('link', { name: initiative.name }).getAttribute('href')!;
  cleanup();

  renderWith(<Screen route={href.slice(1)} />);
  await screen.findByRole('region', { name: 'Magic bar' });
  let focused: HTMLElement | null = null;
  await vi.waitFor(() => {
    focused = document.activeElement as HTMLElement;
    expect(focused).not.toBe(document.body);
  });
  return focused!;
}

const base = (id: string, overrides: Partial<Initiative>): Initiative => ({ id, name: `Initiative ${id}`, teamId: 't1', status: 'Active', ...overrides });

describe('Needs attention deep links (§5.2, §8.5, slice 050)', () => {
  it('Escalated lands in the cost summary', async () => {
    const initiative = base('esc', {
      gates: {
        [discovery.id]: passed('2025-12-01'),
        [validation.id]: { ...passed('2026-02-01'), recordedGrandEstimate: 1_000, recordedApprovalTrack: { id: 'light', name: 'Light', severity: 1 } },
      },
      phases: {
        [validation.id]: { startDate: '2026-01-01', endDate: '2026-01-31', allocations, actualMonths: { '2026-01': 1_000 } },
        [development.id]: { startDate: '2026-03-01', endDate: '2027-12-31', allocations: [{ id: 'a1', personId: 'ana', allocationPct: 100 }] },
      },
    });
    const focused = await followStripLink(initiative, 'Escalated');
    expect(document.getElementById('cost-summary-section')).toContainElement(focused);
  });

  it('Overrun lands on the overrun phase row', async () => {
    const initiative = base('ov', { gates: { [discovery.id]: passed('2025-12-01') }, phases: { [validation.id]: { startDate: '2026-01-01', endDate: '2026-01-31', allocations } } });
    const focused = await followStripLink(initiative, 'Overrun');
    expect(document.getElementById(`phase-row-${validation.id}`)).toContainElement(focused);
  });

  it('Overdue opens the phase and lands on the missing actual', async () => {
    const initiative = base('od', {
      gates: { [discovery.id]: passed('2025-12-01'), [validation.id]: passed('2026-02-01') },
      phases: {
        [validation.id]: { startDate: '2026-01-01', endDate: '2026-01-31', allocations },
        [development.id]: { startDate: '2026-02-01', endDate: '2026-06-30', allocations },
      },
    });
    const focused = await followStripLink(initiative, 'Overdue');
    expect(document.getElementById(`actual-${validation.id}-2026-01`)).toContainElement(focused);
  });

  it('Due on the end date with only a Tentative item open lands on that item', async () => {
    const [business, cost, technical] = validation.exitGate.checklistItems;
    const initiative = base('due', {
      gates: { [discovery.id]: passed('2025-12-01') },
      phases: {
        [validation.id]: { startDate: '2026-03-01', endDate: '2026-03-15', allocations },
        [development.id]: { startDate: '2026-04-01', endDate: '2026-06-30', allocations },
      },
      checklist: { [validation.id]: { ...allComplete([business, cost]), [technical.id]: { status: 'tentative', note: 'Load test pending' } } },
    });
    const focused = await followStripLink(initiative, 'Due');
    expect(document.getElementById(`checklist-${validation.id}-${technical.id}`)).toContainElement(focused);
  });

  it('Ready lands on Pass gate, not on Skip beside it', async () => {
    const initiative = base('rd', { checklist: { [discovery.id]: allComplete(discovery.exitGate.checklistItems) } });
    const focused = await followStripLink(initiative, 'Ready');
    expect(screen.getByRole('button', { name: `Skip ${discovery.exitGate.label}` })).toBeInTheDocument();
    expect(focused).toBe(screen.getByRole('button', { name: 'Pass gate' }));
  });

  it('the Ready target is Pass gate also while "Start at a later phase" is offered', async () => {
    initiatives = [base('fresh', {})];
    renderWith(<Screen route="/initiatives/fresh?focus=pass-gate" />);
    await screen.findByRole('button', { name: 'Start at a later phase' });
    await vi.waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Pass gate' })));
  });
});

describe('moving between initiatives (slice 050)', () => {
  it('a Delete confirmation open on one initiative does not reappear on the next one opened', async () => {
    initiatives = [base('a', { name: 'Checkout Redesign' }), base('b', { name: 'Payments API' })];
    const user = userEvent.setup();
    const view = renderWith(<Screen route="/initiatives/a" />);
    await user.click(await screen.findByRole('button', { name: 'Actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Delete Checkout Redesign?');

    view.rerender(
      <BrandProvider brand={defaultBrandPack}>
        <TooltipProvider>
          <RepositoryProvider token="token">
            <NeedsAttentionProvider>
              <Screen route="/initiatives/b" />
            </NeedsAttentionProvider>
          </RepositoryProvider>
        </TooltipProvider>
      </BrandProvider>,
    );
    await screen.findByRole('heading', { name: 'Payments API' });
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
});
