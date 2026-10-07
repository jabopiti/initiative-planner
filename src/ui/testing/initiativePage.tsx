import { cleanup, render } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, vi } from 'vitest';
import { defaultBrandPack } from '../../brand/defaultBrand';
import type { Country, GateRecord, Initiative, Membership, Person, Role } from '../../data/types';
import { BrandProvider } from '../../state/BrandContext';
import { RepositoryProvider } from '../../state/DataContext';
import { rootListing } from '../../sync/testing/rootListing';
import { subjectOf } from '../../sync/testing/commitMessage';
import { InitiativeDetail } from '../InitiativeDetail';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/sonner';
import { contentsBacked } from '../../sync/testing/contentsBacked';

// One initiative page (i1, team Platform, Ana Ruiz on it) against a stubbed GitHub, for tests of the page as a whole.

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

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const file = (content: unknown, sha: string) => json({ content: btoa(JSON.stringify(content)), sha });

/**
 * Registers the stubbed GitHub (serving `initiative()` as i1) and a fixed today, 24 Sep 2026, for the calling test
 * file. `puts` collects each commit's subject and content, emptied before every test.
 */
export function initiativePageHarness(initiative: () => Initiative) {
  const puts: { message: string; content: Initiative }[] = [];

  beforeAll(() => {
    Element.prototype.scrollIntoView = () => {};
    // Radix Select (the starting-phase picker) asks for pointer capture, which jsdom lacks.
    Element.prototype.hasPointerCapture = () => false;
    vi.stubGlobal(
      'fetch',
      contentsBacked(vi.fn(async (url: string, init: RequestInit = {}) => {
        if ((init.method ?? 'GET') === 'PUT') {
          const body = JSON.parse(String(init.body)) as { message: string; content: string };
          puts.push({ message: subjectOf(body.message), content: JSON.parse(atob(body.content)) });
          return json({ content: { sha: 'next' } });
        }
        if (new URL(url).pathname.endsWith('/contents/')) return rootListing();
        if (url.includes('/contents/dataset.json')) return file({ schemaVersion: 1, processIdentity: defaultBrandPack.processIdentity, ratesReviewed: true }, 'd');
        if (url.includes('/contents/roles.json')) return file(roles, 'r');
        if (url.includes('/contents/countries.json')) return file(countries, 'c');
        if (url.includes('/contents/teams.json')) return file([{ id: 't1', name: 'Platform', active: true }], 't');
        if (url.includes('/contents/people.json')) return file([ana], 'p');
        if (url.includes('/contents/memberships.json')) return file([membership], 'm');
        if (url.includes('/contents/initiatives/i1.json')) return file(initiative(), 'i');
        if (url.includes('/contents/initiatives')) return json([{ name: 'i1.json', path: 'initiatives/i1.json', sha: 'sha-i1', type: 'file' }]);
        return json({ message: 'Not Found' }, 404);
      })),
    );
  });
  afterAll(() => vi.unstubAllGlobals());
  afterEach(cleanup);
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 8, 24, 12));
    puts.length = 0;
  });
  afterEach(() => vi.useRealTimers());

  const renderPage = () =>
    render(
      <BrandProvider brand={defaultBrandPack}>
        <TooltipProvider>
          <RepositoryProvider token="token">
            <InitiativeDetail id="i1" />
            <Toaster />
          </RepositoryProvider>
        </TooltipProvider>
      </BrandProvider>,
    );

  return { puts, renderPage };
}
