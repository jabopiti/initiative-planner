import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultBrandPack } from '../brand/defaultBrand';
import type { Country, GateRecord, Initiative, Membership, Person, Role } from '../data/types';
import { BrandProvider } from '../state/BrandContext';
import { RepositoryProvider } from '../state/DataContext';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/sonner';
import { InitiativeDetail } from './InitiativeDetail';
import { rootListing } from '../sync/testing/rootListing';

const twenty = Array(12).fill(20);
const roles: Role[] = [{ id: 'dev', name: 'Developer', abbreviation: 'Dev', costFactor: 0.8, active: true }];
const countries: Country[] = [
  { id: 'de', name: 'Germany', active: true, ratesByYear: [{ year: 2026, dayRate: 500, workingDaysByMonth: twenty }] },
];
const ana: Person = { id: 'ana', name: 'Ana Ruiz', countryId: 'de', roleId: 'dev', capacityPct: 100, active: true };
const membership: Membership = { id: 'm1', personId: 'ana', teamId: 't1', teamFtePct: 100, active: true };

const [discoveryId, validationId, developmentId] = defaultBrandPack.process.map((p) => p.id);
const [g1] = defaultBrandPack.process.map((p) => p.exitGate);
const discoveryPassed: GateRecord = { outcome: 'passed', passedOn: '2026-01-01', checklist: g1.checklistItems.map((i) => ({ ...i, status: 'complete', note: '' })) };

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const file = (content: unknown, sha: string) => json({ content: btoa(JSON.stringify(content)), sha });

let initiative: Initiative;
let puts: { message: string; content: Initiative }[] = [];

beforeAll(() => {
  Element.prototype.scrollIntoView = () => {};
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      if ((init.method ?? 'GET') === 'PUT') {
        const body = JSON.parse(String(init.body)) as { message: string; content: string };
        puts.push({ message: body.message, content: JSON.parse(atob(body.content)) });
        return json({ content: { sha: 'next' } });
      }
      if (new URL(url).pathname.endsWith('/contents/')) return rootListing();
      if (url.includes('/contents/dataset.json')) return file({ schemaVersion: 1, processIdentity: defaultBrandPack.processIdentity, ratesReviewed: true }, 'd');
      if (url.includes('/contents/roles.json')) return file(roles, 'r');
      if (url.includes('/contents/countries.json')) return file(countries, 'c');
      if (url.includes('/contents/teams.json')) return file([{ id: 't1', name: 'Platform', active: true }], 't');
      if (url.includes('/contents/people.json')) return file([ana], 'p');
      if (url.includes('/contents/memberships.json')) return file([membership], 'm');
      if (url.includes('/contents/initiatives/i1.json')) return file(initiative, 'i');
      if (url.includes('/contents/initiatives')) return json([{ name: 'i1.json', path: 'initiatives/i1.json', sha: 'sha-i1', type: 'file' }]);
      return json({ message: 'Not Found' }, 404);
    }),
  );
});
afterAll(() => vi.unstubAllGlobals());
afterEach(cleanup);
beforeEach(() => {
  puts = [];
});

function renderPage() {
  return render(
    <BrandProvider brand={defaultBrandPack}>
      <TooltipProvider>
        <RepositoryProvider token="token">
          <InitiativeDetail id="i1" />
          <Toaster />
        </RepositoryProvider>
      </TooltipProvider>
    </BrandProvider>,
  );
}

describe('Extend an overrun phase by one month (§5.11)', () => {
  it('offers the extend action only in the overrun state (AC1)', async () => {
    initiative = {
      id: 'i1',
      name: 'Checkout Redesign',
      teamId: 't1',
      status: 'Active',
      gates: { [discoveryId]: discoveryPassed },
      phases: { [validationId]: { startDate: '2020-07-01', endDate: '2020-08-31', allocations: [{ id: 'a1', personId: 'ana', allocationPct: 50 }] } },
    };
    renderPage();

    expect(await screen.findByText(/Validation is \d+ days overrun/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Extend Validation by one month' })).toBeInTheDocument();
  });

  it('does not offer the extend action outside the overrun state', async () => {
    initiative = {
      id: 'i1',
      name: 'Checkout Redesign',
      teamId: 't1',
      status: 'Active',
      gates: { [discoveryId]: discoveryPassed },
      phases: { [validationId]: { startDate: '2026-10-01', endDate: '2026-11-30', allocations: [{ id: 'a1', personId: 'ana', allocationPct: 50 }] } },
    };
    renderPage();

    await screen.findByRole('heading', { name: /Gate \/ Checklist/ });
    expect(screen.queryByRole('button', { name: /Extend .* by one month/ })).not.toBeInTheDocument();
  });

  it('moves the end date a month later in one commit naming the new date, applying the month-end rule (AC2, AC3)', async () => {
    const user = userEvent.setup();
    initiative = {
      id: 'i1',
      name: 'Checkout Redesign',
      teamId: 't1',
      status: 'Active',
      gates: { [discoveryId]: discoveryPassed },
      phases: {
        [validationId]: { startDate: '2020-07-01', endDate: '2020-08-31', allocations: [{ id: 'a1', personId: 'ana', allocationPct: 50 }] },
        [developmentId]: { startDate: '2020-09-01', endDate: '2020-10-31', allocations: [] },
      },
    };
    renderPage();

    const extend = await screen.findByRole('button', { name: 'Extend Validation by one month' });
    await user.click(extend);

    await vi.waitFor(() => expect(puts.some((p) => p.message.includes('Validation extended to'))).toBe(true));
    const put = puts.find((p) => p.message.includes('Validation extended to'))!;
    expect(put.message).toBe('Checkout Redesign: Validation extended to 30 Sep 2020');
    expect(put.content.phases![validationId].endDate).toBe('2020-09-30'); // 31 Aug (last day) -> 30 Sep (next month's last day)
    expect(put.content.phases![developmentId]).toEqual(initiative.phases![developmentId]); // later phase untouched (AC4)
  });

  it('still shows the overrun state and the action when the phase remains overrun after extending (AC5)', async () => {
    const user = userEvent.setup();
    initiative = {
      id: 'i1',
      name: 'Checkout Redesign',
      teamId: 't1',
      status: 'Active',
      gates: { [discoveryId]: discoveryPassed },
      phases: { [validationId]: { startDate: '2020-01-01', endDate: '2020-01-31', allocations: [{ id: 'a1', personId: 'ana', allocationPct: 50 }] } },
    };
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Extend Validation by one month' }));

    expect(await screen.findByText(/Validation is \d+ days overrun/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Extend Validation by one month' })).toBeInTheDocument();
  });
});
