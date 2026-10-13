/**
 * Shared scaffold for the capacity tests (§5.8, §7.2): one dataset, a fake GitHub that serves it, and the render
 * helpers. Call `installCapacityFixture()` at the top of a test file; tests then change `fixture` before rendering.
 * Today is 24 Sep 2026: phases starting in Sep or Oct 2026 are Confirmed, later ones Provisional (§4).
 */
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, vi } from 'vitest';
import { defaultBrandPack } from '@brand';
import { buildBaselineDataset } from '../data/baseline';
import type { Initiative, Membership, Person, Team } from '../data/types';
import { BrandProvider } from '../state/BrandContext';
import { RepositoryProvider } from '../state/DataContext';
import { fakeOnDemand, seedFiles } from '../sync/testing/fakeGithub';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';

const baseline = buildBaselineDataset(defaultBrandPack);
const [role] = baseline.roles;
const [country] = baseline.countries;

export const person = (id: string, name: string, extra: Partial<Person> = {}): Person => ({ id, name, roleId: role.id, countryId: country.id, capacityPct: 100, active: true, ...extra });
export const member = (personId: string, teamId: string, teamFtePct: number, active = true): Membership => ({ id: `m-${personId}-${teamId}`, personId, teamId, teamFtePct, active });
export const plan = (startDate: string, endDate: string, ...allocations: [string, number][]) => ({
  startDate,
  endDate,
  allocations: allocations.map(([personId, allocationPct], i) => ({ id: `a-${personId}-${i}`, personId, allocationPct })),
});

export const fixture: { teams: Team[]; people: Person[]; memberships: Membership[]; initiatives: Initiative[] } = {
  teams: [],
  people: [],
  memberships: [],
  initiatives: [],
};

let served: ReturnType<typeof fakeOnDemand>;

/** Every write the repository accepted, in order: its commit message and the file's new content. */
export const puts = () => served.accepted();

/** The fake GitHub behind this test, made from `fixture` at its first request: change files on it once it exists. */
export const github = () => served.fake();

/** What the last Copy put on the clipboard, by MIME type. */
export const written: Record<string, string> = {};

function resetFixture() {
  fixture.teams = [
    { id: 't1', name: 'Payments', active: true },
    { id: 't2', name: 'Platform', active: true },
  ];
  fixture.people = [person('ana', 'Ana Ruiz'), person('bo', 'Bo Lind'), person('cy', 'Cy Ode')];
  // Cy has no membership: their allocation on Payments outlived it.
  fixture.memberships = [member('ana', 't1', 60), member('ana', 't2', 40), member('bo', 't1', 50)];
  fixture.initiatives = [
    {
      id: 'i1',
      name: 'Payments API',
      teamId: 't1',
      status: 'Active',
      phases: {
        validation: plan('2026-09-01', '2026-11-30', ['ana', 70], ['bo', 40], ['cy', 20]),
        development: plan('2027-03-01', '2027-03-31', ['ana', 30]),
      },
    },
    { id: 'i2', name: 'Data lake', teamId: 't2', status: 'Active', phases: { validation: plan('2026-10-01', '2026-10-31', ['ana', 40]) } },
  ];
}

/** Registers the hooks that stub the network with a fake GitHub and reset the dataset and date before each test. */
export function installCapacityFixture() {
  served = fakeOnDemand((fake) =>
    seedFiles(fake, { roles: baseline.roles, countries: baseline.countries, teams: fixture.teams, people: fixture.people, memberships: fixture.memberships, initiatives: fixture.initiatives }),
  );
  beforeAll(() => {
    // Radix Select needs these pointer/scroll APIs, which jsdom lacks.
    Element.prototype.hasPointerCapture = () => false;
    Element.prototype.setPointerCapture = () => {};
    Element.prototype.releasePointerCapture = () => {};
    Element.prototype.scrollIntoView = () => {};
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 8, 24, 10) });
    for (const key of Object.keys(written)) delete written[key];
    vi.stubGlobal('ClipboardItem', class { constructor(public items: Record<string, Blob>) {} });
    resetFixture();
    window.location.hash = '';
  });
}

const readBlob = (blob: Blob) =>
  new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.readAsText(blob);
  });

/** userEvent.setup() installs its own clipboard stub, so ours goes in after it. */
export function setupUser() {
  const user = userEvent.setup({ advanceTimers: () => {} });
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

export function renderView(view: React.ReactNode) {
  return render(
    <BrandProvider brand={defaultBrandPack}>
      <TooltipProvider>
        <RepositoryProvider token="token">
          {view}
          <Toaster />
        </RepositoryProvider>
      </TooltipProvider>
    </BrandProvider>,
  );
}

export const grid = async () => within(await screen.findByRole('region', { name: 'Capacity' }));
export const cell = (g: ReturnType<typeof within>, name: string, month: string) => g.getByRole('button', { name: new RegExp(`^${name}, ${month}`) });
/** A cell with the full Warning wash (§5.8). */
export const tinted = (el: HTMLElement) => el.querySelector('[data-testid="heat-fill"]')?.classList.contains('bg-heat-over') === true;
/** How far up a cell's accent or Warning wash rises, in % of the cell; 0 without one. */
export const fillShare = (el: HTMLElement) => Number(el.querySelector<HTMLElement>('[data-testid="heat-fill"]')?.dataset.share ?? 0);
