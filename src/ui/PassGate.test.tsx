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
const membership = (id: string, personId: string, teamFtePct: number): Membership => ({ id, personId, teamId: 't1', teamFtePct, active: true });

const [discoveryId, validationId, developmentId] = defaultBrandPack.process.map((p) => p.id);
const [g1, g2] = defaultBrandPack.process.map((p) => p.exitGate);

const discoveryPassed: GateRecord = { outcome: 'passed', passedOn: '2026-01-01', checklist: g1.checklistItems.map((i) => ({ ...i, status: 'complete', note: '' })) };

/** Validation and Development both planned: satisfies G2's estimate check on its own and every costed phase ahead. */
const bothPlanned = {
  [validationId]: { startDate: '2026-10-01', endDate: '2026-11-30', allocations: [{ id: 'a1', personId: 'ana', allocationPct: 50 }] },
  [developmentId]: { startDate: '2026-12-01', endDate: '2027-01-31', allocations: [{ id: 'a2', personId: 'ana', allocationPct: 50 }] },
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const file = (content: unknown, sha: string) => json({ content: btoa(JSON.stringify(content)), sha });

let initiative: Initiative;
let members: Membership[];
let puts: { message: string; content: Initiative }[] = [];

beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
  Element.prototype.scrollIntoView = () => {};
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
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
      if (url.includes('/contents/memberships.json')) return file(members, 'm');
      if (url.includes('/contents/initiatives/i1.json')) return file(initiative, 'i');
      if (url.includes('/contents/initiatives')) return json([{ name: 'i1.json', path: 'initiatives/i1.json', sha: 'sha-i1', type: 'file' }]);
      return json({ message: 'Not Found' }, 404);
    }),
  );
});
afterAll(() => vi.unstubAllGlobals());
afterEach(cleanup);
beforeEach(() => {
  members = [membership('m1', 'ana', 100)];
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

describe('Pass a gate with its checklist (§8.1)', () => {
  it('refuses Pass gate on an Incomplete checklist item, naming it (AC1)', async () => {
    const user = userEvent.setup();
    initiative = {
      id: 'i1',
      name: 'Checkout Redesign',
      teamId: 't1',
      status: 'Active',
      gates: { [discoveryId]: discoveryPassed },
      phases: bothPlanned,
      checklist: { [validationId]: { [g2.checklistItems[0].id]: { status: 'complete', note: '' }, [g2.checklistItems[2].id]: { status: 'complete', note: '' } } },
    };
    renderPage();

    expect(await screen.findByRole('heading', { name: /Gate \/ Checklist — G2/ })).toBeInTheDocument();
    expect(screen.getByText('3 of 4 complete')).toBeInTheDocument(); // estimates met + 2 complete + 1 incomplete, of 4 requirements
    const passButton = screen.getByRole('button', { name: 'Pass gate' });
    await user.click(passButton);

    expect(puts.some((p) => p.message.includes('G2 passed'))).toBe(false);
    expect(screen.getByText(`"${g2.checklistItems[1].name}" is not resolved`)).toBeInTheDocument();
  });

  it('refuses Pass gate when a costed phase still ahead has no period or allocation, naming it (AC2)', async () => {
    const user = userEvent.setup();
    initiative = {
      id: 'i1',
      name: 'Checkout Redesign',
      teamId: 't1',
      status: 'Active',
      gates: { [discoveryId]: discoveryPassed },
      phases: { [validationId]: bothPlanned[validationId] }, // Development left unplanned
      checklist: { [validationId]: Object.fromEntries(g2.checklistItems.map((i) => [i.id, { status: 'complete', note: '' }])) },
    };
    renderPage();

    await screen.findByRole('heading', { name: /Gate \/ Checklist — G2/ });
    await user.click(screen.getByRole('button', { name: 'Pass gate' }));

    expect(puts.some((p) => p.message.includes('G2 passed'))).toBe(false);
    expect(screen.getByText('Development needs a complete period and at least one allocation or cost item')).toBeInTheDocument();
  });

  it('passes in one click, no confirmation, once everything is met (AC3), freezing the phase and recording the cost summary (AC4)', async () => {
    const user = userEvent.setup();
    initiative = {
      id: 'i1',
      name: 'Checkout Redesign',
      teamId: 't1',
      status: 'Active',
      gates: { [discoveryId]: discoveryPassed },
      phases: bothPlanned,
      checklist: { [validationId]: Object.fromEntries(g2.checklistItems.map((i) => [i.id, { status: 'complete', note: '' }])) },
    };
    renderPage();

    await screen.findByText('4 of 4 complete');
    // Validation: 40 days × 50% × 500 × 0.8 = 8,000. Development: 40 days × 50% × 500 × 0.8 = 8,000 (fixture countries fix 20 workdays/month). Grand estimate 16,000.
    expect(screen.getByText('Grand estimate')).toBeInTheDocument();
    expect(screen.getByText('€16,000')).toBeInTheDocument();
    expect(screen.queryByText(/Approved at/)).not.toBeInTheDocument();

    const passButton = screen.getByRole('button', { name: 'Pass gate' });
    await user.click(passButton); // one click, no confirmation dialog appears anywhere

    expect(await screen.findByText(/^Passed G2/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reopen' })).toBeInTheDocument();
    await vi.waitFor(() => expect(puts.some((p) => p.message.includes('G2 passed'))).toBe(true), { timeout: 3000 });
    expect(puts.find((p) => p.message.includes('G2 passed'))!.message).toContain('€16,000');

    // Cost summary now shows the recorded figure as "approved at" (AC4).
    expect(screen.getByText('Approved at (G2)')).toBeInTheDocument();
    expect(screen.getAllByText('€16,000').length).toBeGreaterThan(1); // grand estimate and approved-at match, nothing changed since

    // Validation shows frozen and locked; its inputs are gone.
    const validationRow = screen.getByRole('button', { name: /^Validation/ });
    expect(validationRow).toHaveTextContent('Frozen');
    expect(screen.queryByRole('textbox', { name: 'Validation start date' })).not.toBeInTheDocument();

    // Development, now current, gets its own Gate / Checklist panel; Validation's is gone.
    expect(await screen.findByRole('heading', { name: /Gate \/ Checklist — G3/ })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /Gate \/ Checklist — G2/ })).not.toBeInTheDocument();
  });

  it('reopens the gate: clears the record, discards the frozen snapshot, and keeps checklist notes (AC5)', async () => {
    const user = userEvent.setup();
    const frozenSnapshot = {
      startDate: '2026-10-01',
      endDate: '2026-11-30',
      allocations: [{ id: 'a1', personId: 'ana', allocationPct: 50, cost: 8000 }],
      costItems: [],
      estimateByMonth: { '2026-10': 4000, '2026-11': 4000 },
    };
    initiative = {
      id: 'i1',
      name: 'Checkout Redesign',
      teamId: 't1',
      status: 'Active',
      gates: {
        [discoveryId]: discoveryPassed,
        [validationId]: {
          outcome: 'passed',
          passedOn: '2026-11-30',
          recordedGrandEstimate: 8000,
          recordedApprovalTrack: { id: 'light', name: 'Light', severity: 1 },
          frozenSnapshot,
          checklist: g2.checklistItems.map((i) => ({ ...i, status: 'complete', note: '' })),
        },
      },
      phases: { [validationId]: bothPlanned[validationId] },
      checklist: { [validationId]: { [g2.checklistItems[0].id]: { status: 'tentative', note: 'Revisit after sign-off' } } },
    };
    renderPage();

    expect(await screen.findByText('Approved at (G2)')).toBeInTheDocument();
    const reopen = screen.getAllByRole('button', { name: /^Reopen G2/ })[0];
    await user.click(reopen);

    await vi.waitFor(() => expect(puts.some((p) => p.message.includes('G2 reopened'))).toBe(true), { timeout: 3000 });
    expect(screen.queryByText('Approved at (G2)')).not.toBeInTheDocument();
    expect(await screen.findByRole('textbox', { name: 'Validation start date' })).toHaveValue('01.10.2026'); // editable again

    // Checklist note kept, not reset (AC5).
    expect(await screen.findByRole('heading', { name: /Gate \/ Checklist — G2/ })).toBeInTheDocument();
    expect(screen.getByText('Revisit after sign-off')).toBeInTheDocument();
  });
});
