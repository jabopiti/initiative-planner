import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultBrandPack } from '../brand/defaultBrand';
import type { Country, Initiative, Membership, Person, Role, Team } from '../data/types';
import { BrandProvider } from '../state/BrandContext';
import { RepositoryProvider } from '../state/DataContext';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/sonner';
import { InitiativeDetail } from './InitiativeDetail';
import { rootListing } from '../sync/testing/rootListing';

// One country: €500/day, 20 working days every month of 2026. One role, factor 0.8: 100% for a month costs €8,000.
const roles: Role[] = [{ id: 'dev', name: 'Developer', abbreviation: 'Dev', costFactor: 0.8, active: true }];
const countries: Country[] = [{ id: 'de', name: 'Germany', active: true, ratesByYear: [{ year: 2026, dayRate: 500, workingDaysByMonth: Array(12).fill(20) }] }];
const teams: Team[] = [
  { id: 't1', name: 'Payments', active: true },
  { id: 't2', name: 'Growth', active: true },
  { id: 't3', name: 'Legacy', active: false },
];
const person = (id: string, name: string, extra: Partial<Person> = {}): Person => ({ id, name, countryId: 'de', roleId: 'dev', capacityPct: 100, active: true, ...extra });
const ana = person('ana', 'Ana Ruiz');
const cai = person('cai', 'Cai Wu');
const dev = person('dev', 'Dev Rao');
const membership = (personId: string, teamId: string, active = true): Membership => ({ id: `${personId}-${teamId}`, personId, teamId, teamFtePct: 60, active });

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const file = (content: unknown, sha: string) => json({ content: btoa(JSON.stringify(content)), sha });

let initiative: Initiative;
let members: Membership[];
let puts: { message: string; content: Initiative }[] = [];

const withAllocations = (allocations: { personId: string; pct: number }[]): Initiative => ({
  ...initiative,
  phases: {
    validation: {
      startDate: '2026-10-01',
      endDate: '2026-11-30',
      allocations: allocations.map((a, i) => ({ id: `a${i}`, personId: a.personId, allocationPct: a.pct })),
    },
  },
});

beforeAll(() => {
  // Radix Select needs these pointer/scroll APIs, which jsdom lacks.
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
      if (url.includes('/contents/teams.json')) return file(teams, 't');
      if (url.includes('/contents/people.json')) return file([ana, cai, dev], 'p');
      if (url.includes('/contents/memberships.json')) return file(members, 'm');
      if (url.endsWith('/contents/initiatives.json') || url.includes('/contents/initiatives/i1.json')) return file(initiative, 'i');
      if (url.includes('/contents/initiatives')) return json([{ name: 'i1.json', path: 'initiatives/i1.json', sha: 'sha-i1', type: 'file' }]);
      return json({ message: 'Not Found' }, 404);
    }),
  );
});
afterAll(() => vi.unstubAllGlobals());
afterEach(cleanup);
beforeEach(() => {
  initiative = { id: 'i1', name: 'Payments API', teamId: 't1', status: 'Active' };
  // Ana is on both teams; Cai only on Payments; Dev on Payments and, inactively, on Growth.
  members = [membership('ana', 't1'), membership('cai', 't1'), membership('dev', 't1'), membership('ana', 't2'), membership('dev', 't2', false)];
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

const teamControl = () => screen.findByRole('combobox', { name: 'Team' });
const teamChanges = () => puts.filter((p) => p.message.includes('team changed'));

async function chooseTeam(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(await teamControl());
  await user.click(await screen.findByRole('option', { name }));
}

describe('Change an initiative’s team (§5.4, §7.2)', () => {
  it('changes it at once, without a confirmation, when no open phase holds an allocation', async () => {
    const user = userEvent.setup();
    renderPage();
    await chooseTeam(user, 'Growth');
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(await teamControl()).toHaveTextContent('Growth');
    await vi.waitFor(() => expect(teamChanges()).toHaveLength(1), { timeout: 3000 });
    expect(teamChanges()[0].message).toBe('Payments API: team changed from Payments to Growth');
    expect(teamChanges()[0].content.teamId).toBe('t2');
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument();
  });

  it('offers the active teams, and the current one whatever its state', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await teamControl());
    expect((await screen.findAllByRole('option')).map((o) => o.textContent)).toEqual(['Payments', 'Growth']);
  });

  it('shows a deactivated current team, and offers the active ones', async () => {
    initiative.teamId = 't3';
    const user = userEvent.setup();
    renderPage();
    expect(await teamControl()).toHaveTextContent('Legacy');
    await user.click(await teamControl());
    expect((await screen.findAllByRole('option')).map((o) => o.textContent)).toEqual(['Payments', 'Growth', 'Legacy']);
  });

  describe('when open phases hold allocations of people who are not on the new team', () => {
    beforeEach(() => {
      initiative = withAllocations([
        { personId: 'ana', pct: 50 },
        { personId: 'cai', pct: 50 },
        { personId: 'dev', pct: 25 },
      ]);
    });

    it('asks first: names who goes, how many allocations and what they cost, who stays, and changes nothing yet', async () => {
      const user = userEvent.setup();
      renderPage();
      await chooseTeam(user, 'Growth');

      const confirmation = await screen.findByRole('alertdialog', { name: 'Change team to Growth?' });
      expect(confirmation).toHaveAccessibleDescription(
        "Cai Wu and Dev Rao aren't active members of Growth. Their 2 allocations in Validation will be removed (planned cost €12,000). Ana Ruiz is on both teams and stays.",
      );
      // Cai: 40 days × 50% × 500 × 0.8 = 8,000; Dev (inactive membership): 40 × 25% × 500 × 0.8 = 4,000 → 12,000
      expect(confirmation).toHaveTextContent('€12,000');
      expect(await teamControl()).toHaveTextContent('Payments');
      expect(screen.getByRole('row', { name: /Cai Wu/ })).toBeInTheDocument();
      await new Promise((resolve) => setTimeout(resolve, 1200));
      expect(teamChanges()).toHaveLength(0);
    });

    it('moves focus to Change team, the first action, and Cancel follows it', async () => {
      const user = userEvent.setup();
      renderPage();
      await chooseTeam(user, 'Growth');
      const confirmation = await screen.findByRole('alertdialog');
      const buttons = within(confirmation).getAllByRole('button');
      expect(buttons.map((b) => b.textContent)).toEqual(['Change team', 'Cancel']);
      expect(buttons[0]).toHaveFocus();
    });

    it('Cancel leaves the team and every allocation as they were, and focus goes back to the team control', async () => {
      const user = userEvent.setup();
      renderPage();
      await chooseTeam(user, 'Growth');
      await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Cancel' }));
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      expect(await teamControl()).toHaveTextContent('Payments');
      expect(await teamControl()).toHaveFocus();
      expect(screen.getAllByRole('row', { name: /Ruiz|Wu|Rao/ })).toHaveLength(3);
      expect(teamChanges()).toHaveLength(0);
    });

    it('Esc cancels it too', async () => {
      const user = userEvent.setup();
      renderPage();
      await chooseTeam(user, 'Growth');
      await screen.findByRole('alertdialog');
      await user.keyboard('{Escape}');
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      expect(await teamControl()).toHaveTextContent('Payments');
    });

    it('choosing the current team again closes the confirmation and leaves everything as it was', async () => {
      const user = userEvent.setup();
      renderPage();
      await chooseTeam(user, 'Growth');
      await screen.findByRole('alertdialog');
      expect(await teamControl()).toHaveTextContent('Payments');
      await user.click(await teamControl());
      // The current team stays the selected one in the list.
      expect(await screen.findByRole('option', { name: 'Payments' })).toHaveAttribute('aria-selected', 'true');
      await user.click(screen.getByRole('option', { name: 'Payments' }));
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      expect(await teamControl()).toHaveTextContent('Payments');
      expect(await teamControl()).toHaveFocus();
      expect(screen.getAllByRole('row', { name: /Ruiz|Wu|Rao/ })).toHaveLength(3);
    });

    it('choosing the current team with the keyboard closes it too', async () => {
      const user = userEvent.setup();
      renderPage();
      await chooseTeam(user, 'Growth');
      await screen.findByRole('alertdialog');
      (await teamControl()).focus();
      await user.keyboard('{Enter}'); // opens the list with the current team highlighted
      await screen.findByRole('option', { name: 'Payments' });
      await user.keyboard('{Enter}');
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      expect(await teamControl()).toHaveTextContent('Payments');
    });

    it('Change team applies it in one commit that names both teams and the count, and Undo brings everything back', async () => {
      const user = userEvent.setup();
      renderPage();
      await chooseTeam(user, 'Growth');
      await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Change team' }));

      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      expect(await teamControl()).toHaveTextContent('Growth');
      expect(await teamControl()).toHaveFocus();
      const rows = screen.getAllByRole('row', { name: /Ruiz|Wu|Rao/ });
      expect(rows).toHaveLength(1);
      expect(rows[0]).toHaveTextContent('Ana Ruiz');
      expect(screen.getByText('Team changed to Growth, 2 allocations removed.')).toBeInTheDocument();

      await vi.waitFor(() => expect(teamChanges()).toHaveLength(1), { timeout: 3000 });
      expect(teamChanges()[0].message).toBe('Payments API: team changed from Payments to Growth, 2 allocations removed');
      expect(teamChanges()[0].content.phases?.validation.allocations.map((a) => a.personId)).toEqual(['ana']);

      await user.click(screen.getByRole('button', { name: 'Undo' }));
      expect(await teamControl()).toHaveTextContent('Payments');
      expect(screen.getAllByRole('row', { name: /Ruiz|Wu|Rao/ })).toHaveLength(3);
      await vi.waitFor(() => expect(puts.some((p) => p.message.includes('changed back'))).toBe(true), { timeout: 3000 });
    });
  });

  it('leaves the allocations alone, and asks nothing, when everyone allocated is on both teams', async () => {
    initiative = withAllocations([{ personId: 'ana', pct: 50 }]);
    const user = userEvent.setup();
    renderPage();
    await chooseTeam(user, 'Growth');
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(await teamControl()).toHaveTextContent('Growth');
    expect(screen.getByRole('row', { name: /Ana Ruiz/ })).toBeInTheDocument();
  });

  it('says a single person and a single allocation in the singular, and drops the cost when none is known', async () => {
    initiative = { ...withAllocations([{ personId: 'cai', pct: 50 }]) };
    initiative.phases!.validation.endDate = undefined;
    const user = userEvent.setup();
    renderPage();
    await chooseTeam(user, 'Growth');
    expect(await screen.findByRole('alertdialog')).toHaveAccessibleDescription(
      "Cai Wu isn't an active member of Growth. Their allocation in Validation will be removed.",
    );
  });

  it('shows the team of a Closed or Cancelled initiative, and cannot change it', async () => {
    initiative.status = 'Closed';
    renderPage();
    expect(await screen.findByText('Payments')).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Team' })).not.toBeInTheDocument();
  });

  it('lets an On hold initiative change team', async () => {
    initiative.status = 'On Hold';
    renderPage();
    expect(await teamControl()).toBeEnabled();
  });
});
