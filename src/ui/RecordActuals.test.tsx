import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultBrandPack } from '../brand/defaultBrand';
import type { Country, Initiative, Membership, Person, Role } from '../data/types';
import { BrandProvider } from '../state/BrandContext';
import { RepositoryProvider } from '../state/DataContext';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/sonner';
import { InitiativeDetail } from './InitiativeDetail';
import { phases } from '../test/phases';
import { fakeOnDemand, seedFiles } from '../sync/testing/fakeGithub';

// One country: €500/day, 20 working days every month of 2026. One role, factor 0.8.
const twenty = Array(12).fill(20);
const roles: Role[] = [{ id: 'dev', name: 'Developer', abbreviation: 'Dev', costFactor: 0.8, active: true }];
const countries: Country[] = [
  { id: 'de', name: 'Germany', code: 'DE', active: true, ratesByYear: [{ year: 2026, dayRate: 500, workingDaysByMonth: twenty }] },
];
const ana: Person = { id: 'ana', name: 'Ana Ruiz', countryId: 'de', roleId: 'dev', capacityPct: 100, active: true };
const validationId = defaultBrandPack.process[1].id;

let initiative: Initiative;
let members: Membership[];

fakeOnDemand((fake) => seedFiles(fake, { ratesReviewed: true, roles, countries, teams: [{ id: 't1', name: 'Payments', active: true }], people: [ana], memberships: members, initiatives: [initiative] }));

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
});
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

const validationRow = () => phases().getByRole('button', { name: /^Validation/ });
const actualsTable = async () => within(await screen.findByRole('table', { name: 'Validation actuals' }));
const monthRow = (table: ReturnType<typeof within>, month: string) => table.getByRole('row', { name: new RegExp(`^${month}`) });

const recordName = (month: string, amount = '€4,000') => `Record ${amount} as the actual for Validation ${month}`;

describe('Record actuals for a closed month (§7.3, §5.4)', () => {
  it('shows a closed month using the estimate, and folds the months not closed yet into one line with their total', async () => {
    renderPage();
    const table = await actualsTable();
    const oct = monthRow(table, 'Oct 2026');
    expect(within(oct).getByText('€4,000 · using the estimate')).toBeInTheDocument();
    expect(within(oct).getByRole('button', { name: recordName('Oct 2026') })).toHaveTextContent('Record €4,000');
    expect(within(oct).getByRole('button', { name: 'Different amount for Validation Oct 2026' })).toHaveTextContent('Different amount');
    expect(within(oct).getByRole('cell', { name: '—' })).toBeInTheDocument();

    expect(table.queryByRole('row', { name: /^Nov 2026/ })).not.toBeInTheDocument();
    expect(table.queryByRole('row', { name: /^Dec 2026/ })).not.toBeInTheDocument();
    expect(screen.getByText('Nov 2026 – Dec 2026 · 2 months not closed yet · €8,000 estimated')).toBeInTheDocument();
  });

  it('records the estimate as the actual in one click, "On estimate" and Change in its place', async () => {
    const user = userEvent.setup();
    renderPage();
    const table = await actualsTable();
    const oct = monthRow(table, 'Oct 2026');
    await user.click(within(oct).getByRole('button', { name: recordName('Oct 2026') }));

    expect(within(oct).queryByText('using the estimate')).not.toBeInTheDocument();
    expect(within(oct).getAllByRole('cell', { name: '€4,000' })).toHaveLength(2); // the estimate and the actual
    expect(within(oct).getByText('On estimate')).toBeInTheDocument();
    expect(within(oct).queryByRole('button', { name: /^Record/ })).not.toBeInTheDocument();
    expect(within(oct).getByRole('button', { name: 'Change the actual for Validation Oct 2026' })).toBeInTheDocument();
  });

  it('records a typed amount with Different amount, and shows the signed difference', async () => {
    const user = userEvent.setup();
    renderPage();
    const table = await actualsTable();
    const oct = monthRow(table, 'Oct 2026');
    await user.click(within(oct).getByRole('button', { name: 'Different amount for Validation Oct 2026' }));
    const override = within(oct).getByLabelText('Override the actual for Validation Oct 2026');
    expect(override).toHaveFocus();
    expect(override).toHaveAttribute('placeholder', 'Actual');
    await user.type(override, '4.58k{Enter}');

    expect(within(oct).queryByText('using the estimate')).not.toBeInTheDocument();
    expect(within(oct).getByRole('cell', { name: '€4,580' })).toBeInTheDocument();
    expect(within(oct).getByText('+€580')).toBeInTheDocument();
  });

  it('shows an actual under the estimate with a minus sign', async () => {
    const user = userEvent.setup();
    renderPage();
    const table = await actualsTable();
    const oct = monthRow(table, 'Oct 2026');
    await user.click(within(oct).getByRole('button', { name: 'Different amount for Validation Oct 2026' }));
    await user.type(within(oct).getByLabelText('Override the actual for Validation Oct 2026'), '3750{Enter}');
    expect(within(oct).getByText('−€250')).toBeInTheDocument();
  });

  it('puts the buttons back when Different amount is left with nothing typed, or cancelled with Esc', async () => {
    const user = userEvent.setup();
    renderPage();
    const table = await actualsTable();
    const oct = monthRow(table, 'Oct 2026');
    await user.click(within(oct).getByRole('button', { name: 'Different amount for Validation Oct 2026' }));
    await user.tab();
    expect(within(oct).getByRole('button', { name: recordName('Oct 2026') })).toBeInTheDocument();

    await user.click(within(oct).getByRole('button', { name: 'Different amount for Validation Oct 2026' }));
    await user.keyboard('{Escape}');
    expect(within(oct).getByRole('button', { name: recordName('Oct 2026') })).toBeInTheDocument();
  });

  it('changes a recorded actual with Change', async () => {
    const user = userEvent.setup();
    renderPage();
    const table = await actualsTable();
    const oct = monthRow(table, 'Oct 2026');
    await user.click(within(oct).getByRole('button', { name: recordName('Oct 2026') }));
    await user.click(within(oct).getByRole('button', { name: 'Change the actual for Validation Oct 2026' }));

    const field = within(oct).getByLabelText('Actual for Validation Oct 2026');
    expect(field).toHaveValue('4000');
    await user.clear(field);
    await user.type(field, '4800{Enter}');
    expect(within(oct).getByRole('cell', { name: '€4,800' })).toBeInTheDocument();
    expect(within(oct).getByText('+€800')).toBeInTheDocument();
    expect(within(oct).getByRole('button', { name: 'Change the actual for Validation Oct 2026' })).toBeInTheDocument();
  });

  it('shows "using the estimate" even when the estimate is exactly €0', async () => {
    initiative = { ...initiative, phases: { [validationId]: { startDate: '2026-10-01', endDate: '2026-10-31', allocations: [] } } };
    renderPage();
    const table = await actualsTable();
    const oct = monthRow(table, 'Oct 2026');
    expect(within(oct).getByText('€0 · using the estimate')).toBeInTheDocument();
    expect(within(oct).getByRole('button', { name: recordName('Oct 2026', '€0') })).toBeInTheDocument();
  });

  it('reads a single month not closed yet in the singular, and shows no table while none has closed', async () => {
    initiative = { ...initiative, phases: { [validationId]: { startDate: '2026-11-01', endDate: '2026-11-30', allocations: [{ id: 'a1', personId: 'ana', allocationPct: 50 }] } } };
    renderPage();
    expect(await screen.findByText('Nov 2026 · 1 month not closed yet · €4,000 estimated')).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: 'Validation actuals' })).not.toBeInTheDocument();
  });

  it('moves the phase header from Estimate to Forecast to Actual as closed months are recorded', async () => {
    // Sept–Nov 2026, "today" mid-December: every month of the period has closed.
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
    const recordButton = (month: string) => within(monthRow(table, month)).getByRole('button', { name: recordName(month) });
    await user.click(recordButton('Sept 2026'));
    expect(validationRow()).toHaveTextContent('Forecast');
    expect(validationRow()).toHaveTextContent('€12,000'); // the recorded month matched its estimate

    await user.click(recordButton('Oct 2026'));
    await user.click(recordButton('Nov 2026'));
    expect(validationRow()).toHaveTextContent('Actual');
    expect(validationRow()).toHaveTextContent('€12,000');
  });
});
