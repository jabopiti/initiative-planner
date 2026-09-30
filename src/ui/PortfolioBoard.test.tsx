import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { defaultBrandPack } from '../brand/defaultBrand';
import { buildBaselineDataset } from '../data/baseline';
import type { Initiative, Person, Team } from '../data/types';
import { BrandProvider } from '../state/BrandContext';
import { RepositoryProvider, useRepositoryState } from '../state/DataContext';
import { NeedsAttentionProvider } from '../state/NeedsAttentionContext';
import { TooltipProvider } from '@/components/ui/tooltip';
import { PortfolioBoard } from './PortfolioBoard';
import { rootListing } from '../sync/testing/rootListing';

const baseline = buildBaselineDataset(defaultBrandPack);
const { process } = defaultBrandPack;
const [discoveryId, validationId] = process.map((p) => p.id);

const teams: Team[] = [{ id: 't1', name: 'Platform', active: true }];
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
afterEach(cleanup);

function Gated() {
  const { status } = useRepositoryState();
  if (status === 'loading') return null;
  return <PortfolioBoard />;
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
  await screen.findAllByRole('link', { name: /Big One|Small One|Gap One|A very long/ });
}

/** A board card, not the Needs attention strip's link to the same initiative (strip links sit in list items). */
const card = (name: string | RegExp) => screen.getAllByRole('link', { name }).find((a) => !a.closest('li'))!;

describe('Portfolio board cards (§5.2)', () => {
  it('shows team · owner, the compact estimate and the real approval track', async () => {
    await renderBoard([big]);
    const c = card(/Big One/);
    expect(within(c).getByText('Platform · Ana Ruiz')).toBeTruthy();
    expect(within(c).getByText('€412 k')).toBeTruthy();
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
    expect(within(card(/Gap One/)).getByText('€4.2 M')).toBeTruthy();
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
    expect(screen.getByText('2 · €530 k')).toBeTruthy();
    expect(screen.getAllByText('0 · €0').length).toBeGreaterThan(0);
    await user.hover(screen.getByText('2 · €530 k'));
    expect((await screen.findAllByText('€530,000')).length).toBeGreaterThan(0);
  });
});
