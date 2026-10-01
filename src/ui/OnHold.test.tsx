import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultBrandPack } from '../brand/defaultBrand';
import type { Country, GateRecord, Initiative, Membership, Person, Role } from '../data/types';
import { BrandProvider } from '../state/BrandContext';
import { RepositoryProvider } from '../state/DataContext';
import { TooltipProvider } from '@/components/ui/tooltip';
import { InitiativeDetail } from './InitiativeDetail';
import { rootListing } from '../sync/testing/rootListing';

const twenty = Array(12).fill(20);
const roles: Role[] = [{ id: 'dev', name: 'Developer', abbreviation: 'Dev', costFactor: 0.8, active: true }];
const countries: Country[] = [{ id: 'de', name: 'Germany', active: true, ratesByYear: [{ year: 2026, dayRate: 500, workingDaysByMonth: twenty }] }];
const ana: Person = { id: 'ana', name: 'Ana Ruiz', countryId: 'de', roleId: 'dev', capacityPct: 100, active: true };
const membership: Membership = { id: 'm1', personId: 'ana', teamId: 't1', teamFtePct: 100, active: true };

const [discoveryId, validationId] = defaultBrandPack.process.map((p) => p.id);
const [g1, g2] = defaultBrandPack.process.map((p) => p.exitGate);
const discoveryPassed: GateRecord = { outcome: 'passed', passedOn: '2026-01-01', checklist: g1.checklistItems.map((i) => ({ ...i, status: 'complete', note: '' })) };

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const file = (content: unknown, sha: string) => json({ content: btoa(JSON.stringify(content)), sha });

let initiative: Initiative;
let puts: { message: string; content: Initiative }[] = [];

const initiativeWith = (overrides: Partial<Initiative> = {}): Initiative => ({
  id: 'i1',
  name: 'Checkout Redesign',
  teamId: 't1',
  status: 'Active',
  gates: { [discoveryId]: discoveryPassed },
  phases: { [validationId]: { startDate: '2026-10-01', endDate: '2026-11-30', allocations: [{ id: 'a1', personId: 'ana', allocationPct: 50 }] } },
  ...overrides,
});

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
      if (url.includes('/contents/initiatives/i2.json')) return file({ ...initiative, id: 'i2', name: 'Fraud Detection Upgrade' }, 'i2');
      if (url.includes('/contents/initiatives')) {
        return json([
          { name: 'i1.json', path: 'initiatives/i1.json', sha: 'sha-i1', type: 'file' },
          { name: 'i2.json', path: 'initiatives/i2.json', sha: 'sha-i2', type: 'file' },
        ]);
      }
      return json({ message: 'Not Found' }, 404);
    }),
  );
});
afterAll(() => vi.unstubAllGlobals());
afterEach(cleanup);
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 8, 24, 12));
  puts = [];
});
afterEach(() => vi.useRealTimers());

const page = (id: string) => (
  <BrandProvider brand={defaultBrandPack}>
    <TooltipProvider>
      <RepositoryProvider token="token">
        <InitiativeDetail id={id} />
      </RepositoryProvider>
    </TooltipProvider>
  </BrandProvider>
);
const renderPage = () => render(page('i1'));

const bar = () => document.getElementById('magic-bar')!;

describe('Actions menu (§5.4)', () => {
  it('lists Put on hold for an Active initiative, and puts it on hold in one click with its own commit (AC1, AC2)', async () => {
    const user = userEvent.setup();
    initiative = initiativeWith();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Actions' }));
    expect(screen.getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['Put on hold', 'Cancel']);
    await user.click(screen.getByRole('menuitem', { name: 'Put on hold' }));

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument(); // no confirmation
    await vi.waitFor(() => expect(puts).toHaveLength(1), { timeout: 3000 });
    expect(puts[0].message).toBe('Checkout Redesign: put on hold');
    expect(puts[0].content.status).toBe('On Hold');
  });

  it('lists Resume, not Put on hold, for an On Hold initiative, whose chip carries the status text (AC3)', async () => {
    const user = userEvent.setup();
    initiative = initiativeWith({ status: 'On Hold' });
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Actions' }));
    expect(screen.getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['Resume', 'Cancel']);
    expect(screen.getAllByText('On Hold').length).toBeGreaterThan(0);
  });

  it('resumes from the menu with its own commit (AC6)', async () => {
    const user = userEvent.setup();
    initiative = initiativeWith({ status: 'On Hold' });
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Resume' }));

    await vi.waitFor(() => expect(puts).toHaveLength(1), { timeout: 3000 });
    expect(puts[0].message).toBe('Checkout Redesign: resumed');
    expect(puts[0].content.status).toBe('Active');
    expect(within(bar()).queryByText('On hold')).not.toBeInTheDocument();
  });

  it('has no Actions button for a Closed initiative, since no action applies (AC10)', async () => {
    initiative = initiativeWith({ status: 'Closed' });
    renderPage();

    await screen.findByRole('heading', { level: 1, name: 'Checkout Redesign' });
    expect(screen.queryByRole('button', { name: 'Actions' })).not.toBeInTheDocument();
  });

  it('opens with Enter, walks items with the arrow keys and Esc returns focus to the button (AC11)', async () => {
    const user = userEvent.setup();
    initiative = initiativeWith();
    renderPage();

    const button = await screen.findByRole('button', { name: 'Actions' });
    button.focus();
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('menuitem', { name: 'Put on hold' })).toBeInTheDocument();
    await user.keyboard('{ArrowDown}');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menuitem')).not.toBeInTheDocument();
    expect(button).toHaveFocus();
  });
});

describe('Magic bar while On Hold (§5.4, §8.4)', () => {
  it('shows "On hold" and Resume, with Pass gate muted, and no overrun while the phase is past its end date (AC4, AC9)', async () => {
    initiative = initiativeWith({
      status: 'On Hold',
      phases: { [validationId]: { startDate: '2020-07-01', endDate: '2020-08-31', allocations: [] } },
    });
    renderPage();

    await screen.findByLabelText('Initiative name');
    expect(within(bar()).getByText('On hold')).toBeInTheDocument();
    expect(within(bar()).getByRole('button', { name: 'Resume' })).toBeInTheDocument();
    expect(within(bar()).queryByText(/overrun/)).not.toBeInTheDocument();
    expect(within(bar()).queryByRole('button', { name: /Extend/ })).not.toBeInTheDocument();
  });

  it('names the initiative and the gate when the muted Pass gate is selected, and passes nothing (AC5)', async () => {
    const user = userEvent.setup();
    initiative = initiativeWith({ status: 'On Hold' });
    renderPage();

    await screen.findByLabelText('Initiative name');
    await user.click(within(bar()).getByRole('button', { name: 'Pass gate' }));

    expect(within(bar()).getByText(`Checkout Redesign is on hold. Resume it to pass ${g2.label}.`)).toBeInTheDocument();
    expect(within(bar()).getByRole('button', { name: 'Resume' })).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 1300));
    expect(puts).toHaveLength(0);
  });

  it('Resume in the bar makes the initiative Active again, focus on Pass gate (AC6)', async () => {
    const user = userEvent.setup();
    initiative = initiativeWith({ status: 'On Hold' });
    renderPage();

    await screen.findByLabelText('Initiative name');
    await user.click(within(bar()).getByRole('button', { name: 'Resume' }));

    await vi.waitFor(() => expect(puts).toHaveLength(1), { timeout: 3000 });
    expect(puts[0].message).toBe('Checkout Redesign: resumed');
    expect(within(bar()).queryByText('On hold')).not.toBeInTheDocument();
    expect(within(bar()).getByRole('button', { name: 'Pass gate' })).toHaveFocus();
  });

  it('keeps every header field editable while On Hold (AC7)', async () => {
    initiative = initiativeWith({ status: 'On Hold' });
    renderPage();

    expect(await screen.findByLabelText('Initiative name')).toBeEnabled();
    expect(screen.getByLabelText('Description')).toBeEnabled();
  });

  it('does not carry a selected Pass gate over to another On Hold initiative when the route changes', async () => {
    const user = userEvent.setup();
    initiative = initiativeWith({ status: 'On Hold' });
    const { rerender } = renderPage();

    await screen.findByLabelText('Initiative name');
    await user.click(within(bar()).getByRole('button', { name: 'Pass gate' }));
    expect(within(bar()).getByText(/Checkout Redesign is on hold/)).toBeInTheDocument();

    rerender(page('i2'));
    expect(await screen.findByDisplayValue('Fraud Detection Upgrade')).toBeInTheDocument();
    expect(within(bar()).getByText('On hold')).toBeInTheDocument();
  });
});
