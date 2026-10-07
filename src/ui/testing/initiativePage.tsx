import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, vi } from 'vitest';
import { defaultBrandPack } from '../../brand/defaultBrand';
import type { Country, GateRecord, Initiative, Membership, Person, Role } from '../../data/types';
import { BrandProvider } from '../../state/BrandContext';
import { RepositoryProvider } from '../../state/DataContext';
import { fakeOnDemand, seedFiles } from '../../sync/testing/fakeGithub';
import { InitiativeDetail } from '../InitiativeDetail';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/sonner';

// One initiative page (i1, team Platform, Ana Ruiz on it) against the fake GitHub, for tests of the page as a whole.

const twenty = Array(12).fill(20);
const roles: Role[] = [{ id: 'dev', name: 'Developer', abbreviation: 'Dev', costFactor: 0.8, active: true }];
const countries: Country[] = [
  { id: 'de', name: 'Germany', code: 'DE', active: true, ratesByYear: [{ year: 2026, dayRate: 500, workingDaysByMonth: twenty }] },
];
const ana: Person = { id: 'ana', name: 'Ana Ruiz', countryId: 'de', roleId: 'dev', capacityPct: 100, active: true };
const membership: Membership = { id: 'm1', personId: 'ana', teamId: 't1', teamFtePct: 100, active: true };

export const [discoveryId, validationId, developmentId] = defaultBrandPack.process.map((p) => p.id);
export const [g1] = defaultBrandPack.process.map((p) => p.exitGate);
export const discoveryPassed: GateRecord = { outcome: 'passed', passedOn: '2026-01-01', checklist: g1.checklistItems.map((i) => ({ ...i, status: 'complete', note: '' })) };

/**
 * Registers the fake GitHub (serving `initiative()` as i1, read when a test first reaches it) and a fixed today, 24 Sep 2026, for the calling test
 * file. `puts()` lists each accepted commit's subject and content, a new fake before every test.
 */
export function initiativePageHarness(initiative: () => Initiative) {
  const served = fakeOnDemand((fake) =>
    seedFiles(fake, {
      ratesReviewed: true,
      roles,
      countries,
      teams: [{ id: 't1', name: 'Platform', active: true }],
      people: [ana],
      memberships: [membership],
    }),
  );
  const puts = () => served.subjects<Initiative>();

  beforeAll(() => {
    Element.prototype.scrollIntoView = () => {};
    // Radix Select (the starting-phase picker) asks for pointer capture, which jsdom lacks.
    Element.prototype.hasPointerCapture = () => false;
  });
  afterEach(cleanup);
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 8, 24, 12));
  });
  afterEach(() => vi.useRealTimers());

  /** Renders the page on i1 as `initiative()` gives it now, committed to the fake as another writer would. */
  const renderPage = () => {
    served.fake().seed('initiatives/i1.json', initiative());
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
  };

  return { puts, renderPage };
}
