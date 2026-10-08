import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultBrandPack } from '@brand';
import { buildBaselineDataset } from '../data/baseline';
import type { Initiative, Membership, Person, Team } from '../data/types';
import { BrandProvider } from '../state/BrandContext';
import { RepositoryProvider, useRepositoryState } from '../state/DataContext';
import { NeedsAttentionProvider } from '../state/NeedsAttentionContext';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { InitiativesTable } from './InitiativesTable';
import { resetSessionFilters } from './sessionFilters';
import { fakeOnDemand, seedFiles } from '../sync/testing/fakeGithub';

const baseline = buildBaselineDataset(defaultBrandPack);
const { process } = defaultBrandPack;
const [discoveryId, validationId] = process.map((p) => p.id);
const finalPhase = process[process.length - 1];
const [g1] = process.map((p) => p.exitGate);

const teams: Team[] = [
  { id: 't1', name: 'Platform', active: true },
  { id: 't2', name: 'Growth', active: false },
];
const person = (id: string, name: string, active = true): Person => ({ id, name, countryId: baseline.countries[0].id, roleId: baseline.roles[0].id, capacityPct: 100, active });
const people = [person('ana', 'Ana Ruiz'), person('old', 'Olga Old', false)];
const members: Membership[] = [{ id: 'm1', personId: 'ana', teamId: 't1', teamFtePct: 100, active: true }];

const passed = (ids: string[]) => Object.fromEntries(ids.map((id) => [id, { outcome: 'passed' as const, passedOn: '2025-12-01', checklist: [] }]));
const overrunPlan = { [validationId]: { startDate: '2026-01-01', endDate: '2026-01-31', allocations: [{ id: 'a1', personId: 'ana', allocationPct: 50 }] } };

const overrun: Initiative = { id: 'ov', name: 'Overrun Co', teamId: 't1', ownerId: 'ana', status: 'Active', gates: passed([discoveryId]), phases: overrunPlan };
const ready: Initiative = {
  id: 'rd',
  name: 'Ready Co',
  teamId: 't1',
  status: 'Active',
  checklist: { [discoveryId]: Object.fromEntries(g1.checklistItems.map((item) => [item.id, { status: 'complete', note: '' }])) },
};
const quiet: Initiative = { id: 'qu', name: 'Alpha Quiet', teamId: 't2', ownerId: 'old', status: 'Active' };
const onHold: Initiative = { ...overrun, id: 'oh', name: 'On Hold Co', status: 'On Hold' };
const cancelled: Initiative = { ...overrun, id: 'ca', name: 'Cancelled Co', status: 'Cancelled' };
const closed: Initiative = { id: 'cl', name: 'Closed Co', teamId: 't1', status: 'Closed', gates: passed(process.map((p) => p.id)) };

let initiatives: Initiative[] = [];
let written: Record<string, string> = {};

fakeOnDemand((fake) => seedFiles(fake, { roles: baseline.roles, countries: baseline.countries, teams, people, memberships: members, initiatives }));

beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.scrollIntoView = () => {};
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
});
afterEach(cleanup);
beforeEach(() => {
  window.location.hash = '';
  written = {};
  resetSessionFilters();
});

const readBlob = (blob: Blob) =>
  new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.readAsText(blob);
  });

/** userEvent.setup() installs its own clipboard stub, so ours goes in after it. */
function setupUser() {
  const user = userEvent.setup();
  class FakeClipboardItem {
    constructor(public items: Record<string, Blob>) {}
  }
  vi.stubGlobal('ClipboardItem', FakeClipboardItem);
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: {
      write: async (items: { items: Record<string, Blob> }[]) => {
        for (const [type, blob] of Object.entries(items[0].items)) written[type] = await readBlob(blob);
      },
    },
  });
  return user;
}

/** Mirrors App.tsx's own gate: a route mounts only once the dataset is no longer loading. */
function Gated() {
  const { status } = useRepositoryState();
  if (status === 'loading') return null;
  return <InitiativesTable />;
}

function tree() {
  return (
    <BrandProvider brand={defaultBrandPack}>
      <TooltipProvider>
        <RepositoryProvider token="token">
          <NeedsAttentionProvider>
            <Gated />
          </NeedsAttentionProvider>
        </RepositoryProvider>
        <Toaster />
      </TooltipProvider>
    </BrandProvider>
  );
}

async function renderTable(list: Initiative[]) {
  initiatives = list;
  const view = render(tree());
  await screen.findByRole('heading', { name: 'Initiatives' });
  return view;
}

const chipButton = (label: string | RegExp) => screen.getAllByRole('button', { name: label }).find((b) => b.dataset.slot === 'popover-trigger')!;
const header = (label: string) => within(screen.getByRole('columnheader', { name: label })).getByRole('button');
const bodyRows = () => screen.getAllByRole('row').slice(1);
const names = () => bodyRows().map((r) => within(r).getAllByRole('cell')[0].textContent);
const rowOf = (name: string) => bodyRows().find((r) => within(r).getAllByRole('cell')[0].textContent === name)!;
const cell = (name: string, col: number) => within(rowOf(name)).getAllByRole('cell')[col];

async function pick(user: ReturnType<typeof userEvent.setup>, chipLabel: string, option: string) {
  await user.click(chipButton(new RegExp(`^${chipLabel}`)));
  await user.click(await screen.findByRole('checkbox', { name: option }));
  await user.keyboard('{Escape}');
}

describe('Initiatives table (§5.3)', () => {
  it('lists every status with all columns, and marks only Active initiatives that need attention', async () => {
    await renderTable([overrun, ready, onHold, cancelled, closed]);
    expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Name', 'Team', 'Owner', 'Phase', 'Grand estimate', 'Approval track', 'Status', 'Needs attention']);
    expect(names().sort()).toEqual(['Cancelled Co', 'Closed Co', 'On Hold Co', 'Overrun Co', 'Ready Co']);
    expect(screen.getByText('5 initiatives')).toBeInTheDocument();
    expect(cell('Overrun Co', 1)).toHaveTextContent('Platform');
    expect(cell('Overrun Co', 2)).toHaveTextContent('Ana Ruiz');
    expect(cell('Ready Co', 2)).toHaveTextContent('—');
    expect(cell('Overrun Co', 6)).toHaveTextContent('Active');

    for (const name of ['On Hold Co', 'Cancelled Co', 'Closed Co']) expect(within(rowOf(name)).queryByRole('img')).not.toBeInTheDocument();
    expect(within(rowOf('Overrun Co')).getByRole('img', { name: 'Overrun' })).toBeInTheDocument();
    expect(within(rowOf('Ready Co')).getByRole('img', { name: 'Ready' })).toBeInTheDocument();
  });

  it('shows a Closed initiative in its final phase', async () => {
    await renderTable([closed]);
    expect(cell('Closed Co', 3)).toHaveTextContent(finalPhase.label);
  });

  it('shows the kind and reason in the marker tooltip', async () => {
    const user = userEvent.setup();
    await renderTable([overrun]);
    await user.hover(within(rowOf('Overrun Co')).getByRole('img', { name: 'Overrun' }));
    expect((await screen.findAllByText(/^Overrun: Validation is \d+ days overrun/))[0]).toBeInTheDocument();
  });

  it('marks an inactive owner and an inactive team', async () => {
    await renderTable([quiet]);
    expect(cell('Alpha Quiet', 2)).toHaveTextContent('Olga Old (inactive)');
  });

  it('sorts attention items first in priority order, then by name', async () => {
    await renderTable([quiet, ready, overrun]);
    expect(names()).toEqual(['Overrun Co', 'Ready Co', 'Alpha Quiet']);
  });

  it('sorts by a header, reverses on the second click, and keeps ties in their relative order', async () => {
    const user = userEvent.setup();
    const a: Initiative = { id: 'x1', name: 'Bravo', teamId: 't1', status: 'Active' };
    const b: Initiative = { id: 'x2', name: 'Alpha', teamId: 't1', status: 'Active' };
    const c: Initiative = { id: 'x3', name: 'Charlie', teamId: 't2', status: 'On Hold' };
    await renderTable([a, b, c]);
    expect(names()).toEqual(['Alpha', 'Bravo', 'Charlie']);

    await user.click(header('Status'));
    expect(names()).toEqual(['Alpha', 'Bravo', 'Charlie']);
    await user.click(header('Status'));
    expect(names()).toEqual(['Charlie', 'Alpha', 'Bravo']);

    await user.click(header('Name'));
    expect(names()).toEqual(['Alpha', 'Bravo', 'Charlie']);
    await user.click(header('Name'));
    expect(names()).toEqual(['Charlie', 'Bravo', 'Alpha']);
  });

  it('opens the initiative on a row click and on Enter on the name link', async () => {
    const user = userEvent.setup();
    await renderTable([overrun, ready]);
    await user.click(cell('Ready Co', 1));
    expect(window.location.hash).toBe('#/initiatives/rd');

    window.location.hash = '';
    const link = within(rowOf('Overrun Co')).getByRole('link', { name: 'Overrun Co' });
    expect(link).toHaveAttribute('href', '#/initiatives/ov');
    link.focus();
    await user.keyboard('{Enter}');
    expect(window.location.hash).toBe('#/initiatives/ov');
  });
});

describe('Initiatives table filters (§9.11)', () => {
  it('filters by status through the chip, and shows the count, the narrowed total and Clear filters', async () => {
    const user = userEvent.setup();
    await renderTable([overrun, ready, onHold]);
    expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument();

    await user.click(chipButton('Status'));
    expect(await screen.findByRole('textbox', { name: 'Search status' })).toHaveFocus();
    expect(screen.getAllByRole('checkbox')).toHaveLength(4);
    await user.click(screen.getByRole('checkbox', { name: 'On hold' }));

    expect(names()).toEqual(['On Hold Co']);
    expect(screen.getByRole('button', { name: 'Status: On hold' })).toBeInTheDocument();
    expect(screen.getByText(/^1 of 3 initiatives/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear filters' })).toBeInTheDocument();
  });

  it('lists only choices matching the search text', async () => {
    const user = userEvent.setup();
    await renderTable([overrun]);
    await user.click(chipButton('Status'));
    await user.type(await screen.findByRole('textbox', { name: 'Search status' }), 'can');
    expect(screen.getAllByRole('checkbox')).toHaveLength(1);
    expect(screen.getByRole('checkbox', { name: 'Cancelled' })).toBeInTheDocument();
  });

  it('offers inactive teams and people, marked, and a No owner choice', async () => {
    const user = userEvent.setup();
    await renderTable([overrun]);
    await user.click(chipButton('Team'));
    expect(await screen.findByRole('checkbox', { name: 'Growth (inactive)' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await user.click(chipButton('Owner'));
    expect(await screen.findByRole('checkbox', { name: 'Olga Old (inactive)' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'No owner' })).toBeInTheDocument();
  });

  it('is AND across chips and OR within a chip', async () => {
    const user = userEvent.setup();
    await renderTable([overrun, ready, quiet, onHold, closed]);
    await pick(user, 'Status', 'Active');
    await pick(user, 'Status', 'On hold');
    expect(names().sort()).toEqual(['Alpha Quiet', 'On Hold Co', 'Overrun Co', 'Ready Co']);
    await pick(user, 'Team', 'Growth (inactive)');
    expect(names()).toEqual(['Alpha Quiet']);
    expect(screen.getByText(/^1 of 5 initiatives/)).toBeInTheDocument();
  });

  it('keeps filters across unmount and remount, and clears them on reset', async () => {
    const user = userEvent.setup();
    const view = await renderTable([overrun, onHold]);
    await pick(user, 'Status', 'On hold');
    view.unmount();

    render(tree());
    await screen.findByRole('heading', { name: 'Initiatives' });
    expect(names()).toEqual(['On Hold Co']);
    expect(screen.getByRole('button', { name: 'Status: On hold' })).toBeInTheDocument();

    act(() => resetSessionFilters());
    expect(names().sort()).toEqual(['On Hold Co', 'Overrun Co']);
  });

  it('clears every chip with Clear filters', async () => {
    const user = userEvent.setup();
    await renderTable([overrun, quiet, onHold]);
    await pick(user, 'Status', 'On hold');
    await pick(user, 'Team', 'Platform');
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(names()).toHaveLength(3);
    expect(chipButton('Status')).toBeInTheDocument();
    expect(chipButton('Team')).toBeInTheDocument();
    expect(screen.getByText('3 initiatives')).toBeInTheDocument();
  });

  it('shows the no-match state with a Clear filters action', async () => {
    const user = userEvent.setup();
    await renderTable([overrun]);
    await pick(user, 'Status', 'Closed');
    expect(screen.getByText('No initiatives match these filters.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    const buttons = screen.getAllByRole('button', { name: 'Clear filters' });
    await user.click(buttons[buttons.length - 1]);
    expect(names()).toEqual(['Overrun Co']);
  });
});

describe('Initiatives table copy (§9.2)', () => {
  it('copies exactly the rows and columns shown, sort and filter applied, with full amounts', async () => {
    const user = setupUser();
    await renderTable([overrun, ready, onHold, quiet]);
    await pick(user, 'Status', 'Active');
    await user.click(header('Name'));
    await user.click(screen.getByRole('button', { name: 'Copy table' }));
    expect(await screen.findByText('Copied 3 initiatives')).toBeInTheDocument();

    const lines = written['text/plain'].split('\n').map((l) => l.split('\t'));
    expect(lines[0]).toEqual(['Name', 'Team', 'Owner', 'Phase', 'Grand estimate', 'Approval track', 'Status', 'Needs attention']);
    expect(lines.slice(1).map((l) => l[0])).toEqual(['Alpha Quiet', 'Overrun Co', 'Ready Co']);
    expect(lines[1].slice(1, 3)).toEqual(['Growth', 'Olga Old (inactive)']);
    expect(lines[2][7]).toBe('Overrun');
    expect(lines[3][7]).toBe('Ready');
    expect(lines[3][2]).toBe('—');
    expect(lines[2][4]).toMatch(/\d/);
    expect(lines[2][4]).not.toMatch(/[kM]$/);
    expect(written['text/html']).toContain('<table');
  });

  it('writes the status as the table shows it', async () => {
    const user = setupUser();
    await renderTable([onHold]);
    await user.click(screen.getByRole('button', { name: 'Copy table' }));
    await screen.findByText('Copied 1 initiative');
    expect(written['text/plain'].split('\n')[1].split('\t')[6]).toBe('On hold');
  });
});
