import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultBrandPack } from '../brand/defaultBrand';
import type { Country, Initiative, Membership, Person, Role } from '../data/types';
import { BrandProvider } from '../state/BrandContext';
import { RepositoryProvider } from '../state/DataContext';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/sonner';
import { InitiativeDetail } from './InitiativeDetail';
import { rootListing } from '../sync/testing/rootListing';

// One country: €500/day, 20 working days every month of 2026. One role, factor 0.8.
const twenty = Array(12).fill(20);
const roles: Role[] = [{ id: 'dev', name: 'Developer', abbreviation: 'Dev', costFactor: 0.8, active: true }];
const countries: Country[] = [
  { id: 'de', name: 'Germany', active: true, ratesByYear: [{ year: 2026, dayRate: 500, workingDaysByMonth: twenty }] },
];
const ana: Person = { id: 'ana', name: 'Ana Ruiz', countryId: 'de', roleId: 'dev', capacityPct: 100, active: true };
const validationId = defaultBrandPack.process[1].id;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const file = (content: unknown, sha: string) => json({ content: btoa(JSON.stringify(content)), sha });

let initiative: Initiative;
let members: Membership[];

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      if ((init.method ?? 'GET') === 'PUT') return json({ content: { sha: 'next' } });
      if (new URL(url).pathname.endsWith('/contents/')) return rootListing();
      if (url.includes('/contents/dataset.json')) {
        return file({ schemaVersion: 1, processIdentity: defaultBrandPack.processIdentity, ratesReviewed: true }, 'd');
      }
      if (url.includes('/contents/roles.json')) return file(roles, 'r');
      if (url.includes('/contents/countries.json')) return file(countries, 'c');
      if (url.includes('/contents/teams.json')) return file([{ id: 't1', name: 'Payments', active: true }], 't');
      if (url.includes('/contents/people.json')) return file([ana], 'p');
      if (url.includes('/contents/memberships.json')) return file(members, 'm');
      if (url.endsWith('/contents/initiatives.json') || url.includes('/contents/initiatives/i1.json')) return file(initiative, 'i');
      if (url.includes('/contents/initiatives')) return json([{ name: 'i1.json', path: 'initiatives/i1.json', sha: 'sha-i1', type: 'file' }]);
      return json({ message: 'Not Found' }, 404);
    }),
  );
});
afterAll(() => vi.unstubAllGlobals());
afterEach(cleanup);
beforeEach(() => {
  members = [{ id: 'm1', personId: 'ana', teamId: 't1', teamFtePct: 100, active: true }];
  // Validation: Oct–Dec 2026, Ana at 50% (20 days × 50% × 500 × 0.8 = 4,000 a month).
  initiative = {
    id: 'i1',
    name: 'Payments API',
    teamId: 't1',
    status: 'Active',
    phases: { [validationId]: { startDate: '2026-10-01', endDate: '2026-12-31', allocations: [{ id: 'a1', personId: 'ana', allocationPct: 50 }] } },
  };
  // "Today" is mid-November: October has closed, November and December have not.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 15, 12));
});
afterEach(() => vi.useRealTimers());

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

const validationRow = () => screen.getByRole('button', { name: /^Validation/ });
const actualsTable = async () => within(await screen.findByRole('table', { name: 'Validation actuals' }));
const monthRow = (table: ReturnType<typeof within>, month: string) => table.getByRole('row', { name: new RegExp(`^${month}`) });

describe('Record actuals for a closed month (§7.3, §5.4)', () => {
  it('shows a closed month using the estimate, and an open month as not closed yet', async () => {
    renderPage();
    const table = await actualsTable();
    const oct = monthRow(table, 'Oct 2026');
    expect(within(oct).getByText('€4,000 · using the estimate')).toBeInTheDocument();
    expect(within(oct).getByRole('button', { name: 'Record the estimate as the actual for Validation Oct 2026' })).toBeInTheDocument();

    const dec = monthRow(table, 'Dec 2026');
    expect(within(dec).getByText('not closed yet')).toBeInTheDocument();
    expect(within(dec).queryByRole('spinbutton')).not.toBeInTheDocument();
    expect(within(dec).queryByRole('button')).not.toBeInTheDocument();
  });

  it('records the estimate as the actual in one click', async () => {
    const user = userEvent.setup();
    renderPage();
    const table = await actualsTable();
    const oct = monthRow(table, 'Oct 2026');
    await user.click(within(oct).getByRole('button', { name: 'Record the estimate as the actual for Validation Oct 2026' }));

    expect(within(oct).queryByText('using the estimate')).not.toBeInTheDocument();
    expect(within(oct).queryByRole('button')).not.toBeInTheDocument();
    expect(within(oct).getByLabelText('Actual for Validation Oct 2026')).toHaveValue(4000);
  });

  it('records a typed amount instead of the estimate, overriding it', async () => {
    const user = userEvent.setup();
    renderPage();
    const table = await actualsTable();
    const oct = monthRow(table, 'Oct 2026');
    const override = within(oct).getByLabelText('Override the actual for Validation Oct 2026');
    await user.type(override, '5250{Enter}');

    expect(within(oct).queryByText('using the estimate')).not.toBeInTheDocument();
    expect(within(oct).getByLabelText('Actual for Validation Oct 2026')).toHaveValue(5250);
  });

  it('keeps a recorded actual editable', async () => {
    const user = userEvent.setup();
    renderPage();
    const table = await actualsTable();
    const oct = monthRow(table, 'Oct 2026');
    await user.click(within(oct).getByRole('button', { name: 'Record the estimate as the actual for Validation Oct 2026' }));

    const field = within(oct).getByLabelText('Actual for Validation Oct 2026');
    await user.clear(field);
    await user.type(field, '4800{Enter}');
    expect(field).toHaveValue(4800);
  });

  it('shows "using the estimate" even when the estimate is exactly €0', async () => {
    initiative = { ...initiative, phases: { [validationId]: { startDate: '2026-10-01', endDate: '2026-10-31', allocations: [] } } };
    renderPage();
    const table = await actualsTable();
    const oct = monthRow(table, 'Oct 2026');
    expect(within(oct).getByText('€0 · using the estimate')).toBeInTheDocument();
    expect(within(oct).getByRole('button', { name: 'Record the estimate as the actual for Validation Oct 2026' })).toBeInTheDocument();
  });

  it('moves the phase header from Estimate to Forecast to Actual as closed months are recorded', async () => {
    // Sep–Nov 2026, "today" mid-December: every month of the period has closed.
    initiative = {
      ...initiative,
      phases: { [validationId]: { startDate: '2026-09-01', endDate: '2026-11-30', allocations: [{ id: 'a1', personId: 'ana', allocationPct: 50 }] } },
    };
    vi.setSystemTime(new Date(2026, 11, 15, 12));
    const user = userEvent.setup();
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Phases' })).toBeInTheDocument();
    expect(validationRow()).toHaveTextContent('Estimate');
    expect(validationRow()).toHaveTextContent('€12,000'); // 3 months × €4,000, pure estimate

    const table = await actualsTable();
    const recordButton = (month: string) => within(monthRow(table, month)).getByRole('button', { name: `Record the estimate as the actual for Validation ${month}` });
    await user.click(recordButton('Sep 2026'));
    expect(validationRow()).toHaveTextContent('Forecast');
    expect(validationRow()).toHaveTextContent('€12,000'); // the recorded month matched its estimate

    await user.click(recordButton('Oct 2026'));
    await user.click(recordButton('Nov 2026'));
    expect(validationRow()).toHaveTextContent('Actual');
    expect(validationRow()).toHaveTextContent('€12,000');
  });
});
