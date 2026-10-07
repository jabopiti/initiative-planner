import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultBrandPack } from '../brand/defaultBrand';
import type { Country, GateRecord, Initiative, Membership, Person, Role } from '../data/types';
import { BrandProvider } from '../state/BrandContext';
import { RepositoryProvider, useRepository } from '../state/DataContext';
import type { Repository } from '../sync/Repository';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/sonner';
import { InitiativeDetail } from './InitiativeDetail';
import { rootListing } from '../sync/testing/rootListing';
import { findPhases, phases } from '../test/phases';
import { contentsBacked } from '../sync/testing/contentsBacked';

const twenty = Array(12).fill(20);
const roles: Role[] = [{ id: 'dev', name: 'Developer', abbreviation: 'Dev', costFactor: 0.8, active: true }];
const countries: Country[] = [
  { id: 'de', name: 'Germany', code: 'DE', active: true, ratesByYear: [{ year: 2026, dayRate: 500, workingDaysByMonth: twenty }] },
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
    contentsBacked(vi.fn(async (url: string, init: RequestInit = {}) => {
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
    })),
  );
});
afterAll(() => vi.unstubAllGlobals());
afterEach(cleanup);
beforeEach(() => {
  members = [membership('m1', 'ana', 100)];
  puts = [];
});

/** The page's repository, for a test to act as another client or a race would. */
let repository: Repository;
function GrabRepository() {
  repository = useRepository();
  return null;
}

function renderPage() {
  return render(
    <BrandProvider brand={defaultBrandPack}>
      <TooltipProvider>
        <RepositoryProvider token="token">
          <GrabRepository />
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
    expect(within(screen.getByRole('region', { name: /Gate \/ Checklist/ })).getByText('3 of 4 complete')).toBeInTheDocument(); // estimates met + 2 complete + 1 incomplete, of 4 requirements
    const passButton = screen.getByRole('button', { name: /^Pass gate/ });
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
    await user.click(screen.getByRole('button', { name: /^Pass gate/ }));

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

    await within(await screen.findByRole('region', { name: /Gate \/ Checklist/ })).findByText('4 of 4 complete');
    // Validation: 40 days × 50% × 500 × 0.8 = 8,000. Development: 40 days × 50% × 500 × 0.8 = 8,000 (fixture countries fix 20 workdays/month). Grand estimate 16,000.
    expect(screen.getByText('Grand estimate')).toBeInTheDocument();
    expect(screen.getByText('€16,000')).toBeInTheDocument();
    expect(screen.queryByText(/Approved at/)).not.toBeInTheDocument();

    const passButton = screen.getByRole('button', { name: /^Pass gate/ });
    await user.click(passButton); // one click, no confirmation dialog appears anywhere

    expect(await screen.findByText(/^Passed G2/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reopen' })).toBeInTheDocument();
    // The stepper's Validation step fills and its tick draws in (slice 059).
    const step = screen.getByRole('img', { name: 'Validation, done' });
    expect(step).toHaveClass('motion-safe:animate-step-fill');
    expect(step.querySelector('path')).toHaveClass('motion-safe:animate-draw');
    await vi.waitFor(() => expect(puts.some((p) => p.message.includes('G2 passed'))).toBe(true), { timeout: 3000 });
    expect(puts.find((p) => p.message.includes('G2 passed'))!.message).toContain('€16,000');

    // Cost summary now shows the recorded figure as "approved at" (AC4).
    expect(screen.getByText('Approved at G2: €16,000')).toBeInTheDocument();
    expect(screen.getByText('Unchanged since G2')).toBeInTheDocument(); // grand estimate and approved-at match

    // Validation shows frozen and locked; its inputs are gone.
    const validationRow = phases().getByRole('button', { name: /^Validation/ });
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

    expect(await screen.findByText(/^Approved at G2:/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Reopen G2' }));

    await vi.waitFor(() => expect(puts.some((p) => p.message.includes('G2 reopened'))).toBe(true), { timeout: 3000 });
    expect(screen.queryByText(/^Approved at G2:/)).not.toBeInTheDocument();
    expect(await screen.findByRole('textbox', { name: 'Validation start date' })).toHaveValue('01/10/2026'); // editable again

    // Checklist note kept, not reset (AC5).
    expect(await screen.findByRole('heading', { name: /Gate \/ Checklist — G2/ })).toBeInTheDocument();
    expect(screen.getByText('Revisit after sign-off')).toBeInTheDocument();
  });

  it('lists no Reopen item before any gate has a record', async () => {
    initiative = { id: 'i1', name: 'Checkout Redesign', teamId: 't1', status: 'Active' };
    renderPage();

    await screen.findByRole('heading', { name: /Gate \/ Checklist — G1/ });
    // The Actions menu offers Put on hold and Cancel, so it is there, with no Reopen in it.
    await userEvent.setup().click(screen.getByRole('button', { name: 'Actions' }));
    expect(screen.queryByRole('menuitem', { name: /^Reopen/ })).not.toBeInTheDocument();
  });

  it('reopens one gate per click: G2, then G1, and leaves On Hold as it is', async () => {
    const user = userEvent.setup();
    initiative = {
      id: 'i1',
      name: 'Checkout Redesign',
      teamId: 't1',
      status: 'On Hold',
      gates: { [discoveryId]: discoveryPassed, [validationId]: { ...discoveryPassed, passedOn: '2026-11-30' } },
      phases: { [validationId]: bothPlanned[validationId] },
    };
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Reopen G2' }));
    await user.click(await screen.findByRole('button', { name: 'Actions' }));
    expect(screen.queryByRole('menuitem', { name: 'Reopen G2' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('menuitem', { name: 'Reopen G1' }));

    await vi.waitFor(() => expect(puts.some((p) => p.message.includes('G1 reopened'))).toBe(true), { timeout: 3000 });
    const last = puts[puts.length - 1];
    expect(last.content.status).toBe('On Hold');
    expect(last.content.gates ?? {}).toEqual({});
  });
});

describe('a frozen phase refuses what the page no longer offers (§5.11, §8.1)', () => {
  const g2Complete = { [validationId]: Object.fromEntries(g2.checklistItems.map((i) => [i.id, { status: 'complete' as const, note: '' }])) };

  it('passing the gate withdraws the Undo of an allocation just removed from the phase', async () => {
    const user = userEvent.setup();
    const validation = { ...bothPlanned[validationId], costItems: [{ id: 'c1', label: 'Licences', amount: 1000, timing: 'spread' as const }] };
    initiative = { id: 'i1', name: 'Checkout Redesign', teamId: 't1', status: 'Active', gates: { [discoveryId]: discoveryPassed }, phases: { ...bothPlanned, [validationId]: validation }, checklist: g2Complete };
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Remove Ana Ruiz from Validation' }));
    expect(await screen.findByRole('button', { name: 'Undo' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^Pass gate/ }));

    expect(await screen.findByText(/^Passed G2/)).toBeInTheDocument();
    await vi.waitFor(() => expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument());
  });

  it('says a change the freeze overtook was not saved, until dismissed', async () => {
    const user = userEvent.setup();
    const frozenSnapshot = { startDate: '2026-10-01', endDate: '2026-11-30', allocations: [], costItems: [], estimateByMonth: {} };
    initiative = {
      id: 'i1',
      name: 'Checkout Redesign',
      teamId: 't1',
      status: 'Active',
      gates: { [discoveryId]: discoveryPassed, [validationId]: { outcome: 'passed', passedOn: '2026-11-30', frozenSnapshot, checklist: [] } },
      phases: { [validationId]: bothPlanned[validationId] },
    };
    renderPage();
    await (await findPhases()).findByRole('button', { name: /^Validation/ });

    act(() => repository.setPhasePeriod('i1', validationId, { startDate: '2026-10-01', endDate: '2026-12-31' }));

    expect(await screen.findByRole('alert')).toHaveTextContent("G2 was passed while you were editing, so your last change to Validation wasn't saved.");
    await user.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText(/your last change to Validation/)).not.toBeInTheDocument();
  });

  it('names each frozen allocation as its snapshot costed it, and falls back to today’s data for an older snapshot', async () => {
    const user = userEvent.setup();
    const frozenSnapshot = {
      startDate: '2026-10-01',
      endDate: '2026-11-30',
      allocations: [
        { id: 'a1', personId: 'ana', allocationPct: 50, cost: 8000, personName: 'Ana Ruiz', roleName: 'Product Manager', countryName: 'Germany', costFactor: 0.8, months: {} },
        { id: 'a2', personId: 'gone', allocationPct: 20, cost: 3200, personName: 'Bea Holm', roleName: 'Tech Lead', countryName: 'Germany', costFactor: 0.8, months: {} },
        { id: 'a3', personId: 'ana', allocationPct: 10, cost: 1600 },
      ],
      costItems: [],
      estimateByMonth: { '2026-10': 6400, '2026-11': 6400 },
    };
    initiative = {
      id: 'i1',
      name: 'Checkout Redesign',
      teamId: 't1',
      status: 'Active',
      gates: { [discoveryId]: discoveryPassed, [validationId]: { outcome: 'passed', passedOn: '2026-11-30', recordedGrandEstimate: 12800, frozenSnapshot, checklist: [] } },
      phases: { [validationId]: bothPlanned[validationId] },
    };
    renderPage();
    const validation = await (await findPhases()).findByRole('button', { name: /^Validation/ });
    if (validation.getAttribute('aria-expanded') !== 'true') await user.click(validation);

    const table = await screen.findByRole('table', { name: 'Frozen allocations' });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows[0]).toHaveTextContent('Ana RuizProduct Manager'); // as costed, not today's Developer
    expect(rows[1]).toHaveTextContent('Bea HolmTech Lead'); // gone since, still named
    expect(rows[2]).toHaveTextContent('Ana RuizDeveloper'); // an older snapshot: today's data
  });
});

describe('the checklist control (§5.4, slice 059)', () => {
  it('reads Incomplete, Tentative, Complete with the status icon at the left; the selected segment is checked and tinted in its role', async () => {
    const user = userEvent.setup();
    initiative = {
      id: 'i1',
      name: 'Checkout Redesign',
      teamId: 't1',
      status: 'Active',
      gates: { [discoveryId]: discoveryPassed },
      phases: bothPlanned,
      checklist: { [validationId]: { [g2.checklistItems[0].id]: { status: 'complete', note: '' } } },
    };
    renderPage();
    const name = g2.checklistItems[0].name;
    await screen.findByRole('heading', { name: /Gate \/ Checklist — G2/ });
    const control = screen.getByLabelText(`Status of "${name}"`);
    expect(control).toHaveAttribute('role', 'radiogroup');
    const segments = within(control).getAllByRole('radio');
    expect(segments.map((s) => s.textContent)).toEqual(['Incomplete', 'Tentative', 'Complete']);
    const complete = within(control).getByRole('radio', { name: 'Complete' });
    expect(complete).toHaveAttribute('aria-checked', 'true');
    expect(complete).toHaveClass('data-[state=on]:bg-met-tint');
    // The status icon sits before the name, in the Met role.
    const row = control.closest('li')!;
    expect(row.querySelector('svg')).toHaveClass('text-met-text');

    // Tentative shows selected while its note is open; Esc reverts to the saved status.
    await user.click(within(control).getByRole('radio', { name: 'Tentative' }));
    expect(within(control).getByRole('radio', { name: 'Tentative' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('textbox', { name: 'Why tentative?' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('textbox', { name: 'Why tentative?' })).not.toBeInTheDocument();
    expect(within(control).getByRole('radio', { name: 'Complete' })).toHaveAttribute('aria-checked', 'true');
  });
});
