import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultBrandPack } from '../brand/defaultBrand';
import type { Country, GateRecord, Initiative, Person, Role, Team } from '../data/types';
import { BrandProvider } from '../state/BrandContext';
import { RepositoryProvider } from '../state/DataContext';
import { TooltipProvider } from '@/components/ui/tooltip';
import { InitiativeDetail } from './InitiativeDetail';
import { fakeOnDemand, seedFiles } from '../sync/testing/fakeGithub';

const roles: Role[] = [{ id: 'dev', name: 'Developer', abbreviation: 'Dev', costFactor: 1, active: true }];
const countries: Country[] = [{ id: 'de', name: 'Germany', code: 'DE', active: true, ratesByYear: [2026, 2027].map((year) => ({ year, dayRate: 500, workingDaysByMonth: Array(12).fill(20) })) }];
const teams: Team[] = [{ id: 't1', name: 'Platform', active: true }];
const mara: Person = { id: 'mara', name: 'Mara Voss', countryId: 'de', roleId: 'dev', capacityPct: 100, active: true };
const passed: GateRecord = { outcome: 'passed', passedOn: '2026-07-01', checklist: [] };

/** Discovery and Validation passed, Development current: Validation May–Jul 2026, Development Aug 2026 – Jan 2027. */
const checkout: Initiative = {
  id: 'i1',
  name: 'Checkout Redesign',
  teamId: 't1',
  status: 'Active',
  gates: { discovery: passed, validation: passed },
  phases: {
    validation: { startDate: '2026-05-01', endDate: '2026-07-31', allocations: [{ id: 'a1', personId: 'mara', allocationPct: 50 }] },
    development: { startDate: '2026-08-01', endDate: '2027-01-31', allocations: [{ id: 'a2', personId: 'mara', allocationPct: 100 }] },
  },
};

let initiative: Initiative;

fakeOnDemand((fake) => seedFiles(fake, { ratesReviewed: true, roles, countries, teams, people: [mara], initiatives: [initiative] }));

beforeAll(() => {
  Element.prototype.scrollIntoView = () => {};
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
});
afterEach(cleanup);
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 4, 12));
  initiative = checkout;
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

const strip = async () => within(await screen.findByRole('group', { name: 'Phases over time' }));
const segments = async () => (await strip()).getAllByRole('button').map((b) => b.getAttribute('aria-label'));

describe('Time strip (§5.4)', () => {
  it('names each phase with its state, period and full cost, in phase order', async () => {
    renderPage();
    const names = await segments();
    expect(names).toHaveLength(4);
    expect(names[0]).toBe('Discovery, done, not costed');
    expect(names[1]).toMatch(/^Validation, done, .*2026, €15,000$/);
    expect(names[2]).toMatch(/^Development, current, .*2026 – .*2027, €60,000$/);
    expect(names[3]).toBe('Rollout, ahead, not costed');
  });

  it('shows the compact cost on a dated phase, "Not costed" on a phase the process doesn\'t cost, and "No period yet" on one without dates', async () => {
    initiative = { ...checkout, phases: { validation: checkout.phases!.validation } };
    renderPage();
    const s = await strip();
    expect(s.getByRole('button', { name: /^Validation/ })).toHaveTextContent('€15k');
    expect(s.getByRole('button', { name: /^Discovery/ })).toHaveTextContent('Not costed');
    expect(s.getByRole('button', { name: 'Development, current, no period yet' })).toHaveTextContent('No period yet');
  });

  it('opens a collapsed phase and moves focus to it when its segment is selected', async () => {
    const user = userEvent.setup();
    renderPage();
    const toggle = await screen.findByRole('button', { name: /^Validation/, expanded: false });
    await user.click((await strip()).getByRole('button', { name: /^Validation/ }));
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(toggle).toHaveFocus();
  });

  it('moves focus to a phase the process doesn\'t cost', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click((await strip()).getByRole('button', { name: /^Rollout/ }));
    expect(document.getElementById('phase-row-rollout')).toHaveFocus();
  });

  it('moves focus to the current phase\'s row, not into its gate checklist, when the process doesn\'t cost it', async () => {
    const user = userEvent.setup();
    initiative = { ...checkout, gates: {} };
    renderPage();
    await user.click((await strip()).getByRole('button', { name: /^Discovery/ }));
    expect(document.getElementById('phase-row-discovery')).toHaveFocus();
  });

  it('shows on a Closed initiative too, every phase done', async () => {
    initiative = { ...checkout, status: 'Closed', gates: { discovery: passed, validation: passed, development: passed, rollout: passed } };
    renderPage();
    expect((await segments()).map((n) => n?.split(', ')[1])).toEqual(['done', 'done', 'done', 'done']);
  });
});
