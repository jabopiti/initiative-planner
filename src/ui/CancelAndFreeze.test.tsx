import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultBrandPack } from '../brand/defaultBrand';
import type { Country, GateRecord, Initiative, Membership, Person, Role } from '../data/types';
import { BrandProvider } from '../state/BrandContext';
import { RepositoryProvider } from '../state/DataContext';
import { TooltipProvider } from '@/components/ui/tooltip';
import { InitiativeDetail } from './InitiativeDetail';
import { fakeOnDemand, seedFiles } from '../sync/testing/fakeGithub';

const twenty = Array(12).fill(20);
const roles: Role[] = [{ id: 'dev', name: 'Developer', abbreviation: 'Dev', costFactor: 0.8, active: true }];
const countries: Country[] = [{ id: 'de', name: 'Germany', code: 'DE', active: true, ratesByYear: [{ year: 2026, dayRate: 500, workingDaysByMonth: twenty }] }];
const ana: Person = { id: 'ana', name: 'Ana Ruiz', countryId: 'de', roleId: 'dev', capacityPct: 100, active: true };
const membership: Membership = { id: 'm1', personId: 'ana', teamId: 't1', teamFtePct: 100, active: true };

const [discoveryId, validationId] = defaultBrandPack.process.map((p) => p.id);
const [g1] = defaultBrandPack.process.map((p) => p.exitGate);
const passed = (gate: (typeof defaultBrandPack.process)[number]['exitGate']): GateRecord => ({
  outcome: 'passed',
  passedOn: '2026-01-01',
  checklist: gate.checklistItems.map((i) => ({ ...i, status: 'complete', note: '' })),
});

let initiative: Initiative;

const initiativeWith = (overrides: Partial<Initiative> = {}): Initiative => ({
  id: 'i1',
  name: 'Fraud Detection Upgrade',
  teamId: 't1',
  status: 'Active',
  gates: { [discoveryId]: passed(g1) },
  phases: {
    [validationId]: {
      startDate: '2026-07-01',
      endDate: '2026-08-31',
      allocations: [{ id: 'a1', personId: 'ana', allocationPct: 50 }],
      costItems: [{ id: 'c1', label: 'Licences', amount: 1000, timing: 'spread' }],
    },
  },
  ...overrides,
});

const served = fakeOnDemand((fake) => seedFiles(fake, { ratesReviewed: true, roles, countries, teams: [{ id: 't1', name: 'Platform', active: true }], people: [ana], memberships: [membership], initiatives: [initiative] }));
/** Each commit the fake accepted: its subject and the initiative's new content. */
const puts = () => served.subjects<Initiative>();

beforeAll(() => {
  Element.prototype.scrollIntoView = () => {};
});
afterEach(cleanup);
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 8, 24, 12));
});
afterEach(() => vi.useRealTimers());

const renderPage = () =>
  render(
    <BrandProvider brand={defaultBrandPack}>
      <TooltipProvider>
        <RepositoryProvider token="token">
          <InitiativeDetail id="i1" />
        </RepositoryProvider>
      </TooltipProvider>
    </BrandProvider>,
  );

const closed = (): Initiative =>
  initiativeWith({ status: 'Closed', gates: Object.fromEntries(defaultBrandPack.process.map((p) => [p.id, passed(p.exitGate)])) });

describe('Cancel (§8.4)', () => {
  it('lists Put on hold and Cancel for an Active initiative, and cancels in one click with its own commit (AC1)', async () => {
    const user = userEvent.setup();
    initiative = initiativeWith();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Actions' }));
    expect(screen.getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['Put on hold', 'Duplicate', 'Reopen G1', 'Cancel initiative']);
    await user.click(screen.getByRole('menuitem', { name: 'Cancel initiative' }));

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    await vi.waitFor(() => expect(puts()).toHaveLength(1), { timeout: 3000 });
    expect(puts()[0].message).toBe('Fraud Detection Upgrade: cancelled');
    expect(puts()[0].content.status).toBe('Cancelled');
  });

  it('lists Resume and Cancel for an On Hold initiative', async () => {
    const user = userEvent.setup();
    initiative = initiativeWith({ status: 'On Hold' });
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Actions' }));
    expect(screen.getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['Resume', 'Duplicate', 'Reopen G1', 'Cancel initiative']);
  });
});

describe('A Cancelled initiative (§8.4, §9.9)', () => {
  it('shows the Cancelled chip and the frozen strip with Reopen, and hides the magic bar (AC2, AC10)', async () => {
    initiative = initiativeWith({ status: 'Cancelled' });
    renderPage();

    expect(await screen.findByText('Cancelled. Notes and actuals can still be recorded.')).toBeInTheDocument();
    expect(screen.getByText('Cancelled')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reopen Fraud Detection Upgrade' })).toHaveTextContent('Reopen');
    expect(document.getElementById('magic-bar')).toBeNull();
  });

  it('lists only Duplicate and Reopen in the Actions menu, and offers no gate reopen (AC8)', async () => {
    const user = userEvent.setup();
    initiative = initiativeWith({ status: 'Cancelled' });
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Actions' }));
    expect(screen.getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['Duplicate', 'Reopen']);
    expect(screen.queryByRole('button', { name: /Reopen G1/ })).not.toBeInTheDocument();
  });

  it('shows every field but notes and actuals read-only (AC4)', async () => {
    initiative = initiativeWith({ status: 'Cancelled', description: '' });
    renderPage();

    expect(await screen.findByRole('heading', { level: 1, name: 'Fraud Detection Upgrade' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Initiative name')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Description')).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Owner' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /Team/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /Add person/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Add cost item/ })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/start date/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Allocation % for/)).not.toBeInTheDocument();
    expect(screen.queryByRole('radiogroup', { name: /Status of/ })).not.toBeInTheDocument();
    expect(screen.getByText('Licences')).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();
  });

  it('records a checklist note, keeping the status (AC5)', async () => {
    const user = userEvent.setup();
    initiative = initiativeWith({ status: 'Cancelled' });
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Add note for "Business case approved"' }));
    await user.type(screen.getByLabelText("Note"), 'Risk withdrew sign-off{Enter}');

    await vi.waitFor(() => expect(puts()).toHaveLength(1), { timeout: 3000 });
    expect(puts()[0].message).toBe('Fraud Detection Upgrade: note on "Business case approved" changed');
    expect(puts()[0].content.checklist?.[validationId]?.['g2-business-case']).toEqual({ status: 'incomplete', note: 'Risk withdrew sign-off' });
    expect(screen.getByRole('button', { name: 'Edit note for "Business case approved"' })).toBeInTheDocument();
  });

  it('refuses to clear a Tentative item’s note', async () => {
    const user = userEvent.setup();
    initiative = initiativeWith({ status: 'Cancelled', checklist: { [validationId]: { 'g2-business-case': { status: 'tentative', note: 'Waiting on Risk' } } } });
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Edit note for "Business case approved"' }));
    await user.clear(screen.getByLabelText("Note"));
    await user.keyboard('{Enter}');
    expect(screen.getByText('Enter a note.')).toBeInTheDocument();
  });

  it('keeps a note opened while frozen a note-only save after Reopen, so the status does not turn Tentative', async () => {
    const user = userEvent.setup();
    initiative = initiativeWith({ status: 'Cancelled', checklist: { [validationId]: { 'g2-business-case': { status: 'complete', note: '' } } } });
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Add note for "Business case approved"' }));
    await user.click(screen.getByRole('button', { name: 'Reopen Fraud Detection Upgrade' }));
    await vi.waitFor(() => expect(puts()).toHaveLength(1), { timeout: 3000 });
    await user.type(screen.getByLabelText("Note"), 'Signed off by Risk{Enter}');

    await vi.waitFor(() => expect(puts()).toHaveLength(2), { timeout: 3000 });
    expect(puts()[1].message).toBe('Fraud Detection Upgrade: note on "Business case approved" changed');
    expect(puts()[1].content.checklist?.[validationId]?.['g2-business-case']).toEqual({ status: 'complete', note: 'Signed off by Risk' });
  });

  it('saves a Tentative note opened before the initiative was cancelled as a note alone, not losing it', async () => {
    const user = userEvent.setup();
    initiative = initiativeWith();
    renderPage();

    const row = (await screen.findByText('Business case approved')).closest('li')!;
    await user.click(within(row).getByRole('radio', { name: 'Tentative' }));
    await user.click(screen.getByRole('button', { name: 'Actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Cancel initiative' }));
    await vi.waitFor(() => expect(puts()).toHaveLength(1), { timeout: 3000 });
    await user.type(screen.getByLabelText("Note"), 'Waiting on Risk{Enter}');

    await vi.waitFor(() => expect(puts()).toHaveLength(2), { timeout: 3000 });
    expect(puts()[1].content.checklist?.[validationId]?.['g2-business-case']).toEqual({ status: 'incomplete', note: 'Waiting on Risk' });
  });

  it('records a month’s actual (AC5)', async () => {
    const user = userEvent.setup();
    initiative = initiativeWith({ status: 'Cancelled' });
    renderPage();

    await user.click(await screen.findByRole('button', { name: /^Record €.* as the actual for Validation Jul 2026$/ }));
    await vi.waitFor(() => expect(puts()).toHaveLength(1), { timeout: 3000 });
    expect(puts()[0].message).toMatch(/^Fraud Detection Upgrade: Validation actual for Jul 2026 recorded/);
  });

  it('Reopen in the strip makes it Active, also after On Hold, and every field editable again (AC7)', async () => {
    const user = userEvent.setup();
    initiative = initiativeWith({ status: 'Cancelled' });
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Reopen Fraud Detection Upgrade' }));
    await vi.waitFor(() => expect(puts()).toHaveLength(1), { timeout: 3000 });
    expect(puts()[0].message).toBe('Fraud Detection Upgrade: reopened');
    expect(puts()[0].content.status).toBe('Active');
    expect(screen.getByLabelText('Initiative name')).toBeEnabled();
    expect(screen.queryByText(/Notes and actuals can still be recorded/)).not.toBeInTheDocument();
  });

  it('Reopen in the Actions menu does the same (AC7)', async () => {
    const user = userEvent.setup();
    initiative = initiativeWith({ status: 'Cancelled' });
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Reopen' }));
    await vi.waitFor(() => expect(puts()).toHaveLength(1), { timeout: 3000 });
    expect(puts()[0].content.status).toBe('Active');
  });
});

describe('A Closed initiative (§8.4)', () => {
  it('shows the lock chip and the strip with Reopen G4, the only gate reopen on the page (AC3)', async () => {
    initiative = closed();
    renderPage();

    expect(await screen.findByText('Closed after G4. Notes and actuals can still be recorded.')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Reopen/ })).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Reopen G4 of Fraud Detection Upgrade' })).toHaveTextContent('Reopen G4');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Actions' }));
    expect(screen.getByRole('menuitem', { name: 'Reopen G4' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Initiative name')).not.toBeInTheDocument();
  });

  it('Reopen G4 reverses the final gate and makes it Active', async () => {
    const user = userEvent.setup();
    initiative = closed();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Reopen G4 of Fraud Detection Upgrade' }));
    await vi.waitFor(() => expect(puts()).toHaveLength(1), { timeout: 3000 });
    expect(puts()[0].content.status).toBe('Active');
    expect(screen.getByLabelText('Initiative name')).toBeEnabled();
  });
});
