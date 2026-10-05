import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultBrandPack } from '../brand/defaultBrand';
import type { Country, Initiative, Membership, Person, Role } from '../data/types';
import { BrandProvider } from '../state/BrandContext';
import { RepositoryProvider, useRepository } from '../state/DataContext';
import type { Repository } from '../sync/Repository';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/sonner';
import { InitiativeDetail } from './InitiativeDetail';
import { rootListing } from '../sync/testing/rootListing';
import { subjectOf } from '../sync/testing/commitMessage';
import { findPhases, phases } from '../test/phases';

// One country: €500/day, 20 working days every month of 2026 and 2027. One role, factor 0.8.
const twenty = Array(12).fill(20);
const roles: Role[] = [{ id: 'dev', name: 'Developer', abbreviation: 'Dev', costFactor: 0.8, active: true }];
const countries: Country[] = [
  {
    id: 'de',
    name: 'Germany',
    code: 'DE',
    active: true,
    ratesByYear: [
      { year: 2026, dayRate: 500, workingDaysByMonth: twenty },
      { year: 2027, dayRate: 600, workingDaysByMonth: twenty },
    ],
  },
];
const person = (id: string, name: string, extra: Partial<Person> = {}): Person => ({
  id,
  name,
  countryId: 'de',
  roleId: 'dev',
  capacityPct: 100,
  active: true,
  ...extra,
});
const ana = person('ana', 'Ana Ruiz');
const cai = person('cai', 'Cai Wu', { customRole: { active: true, label: 'Fractional CTO', costFactor: 1, dayRatesByYear: [{ year: 2026, dayRate: 900 }] } });
const outsider = person('out', 'Olga Nord');
const membership = (id: string, personId: string, teamFtePct: number): Membership => ({ id, personId, teamId: 't1', teamFtePct, active: true });

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const file = (content: unknown, sha: string) => json({ content: btoa(JSON.stringify(content)), sha });

let initiative: Initiative;
let others: Initiative[] = [];
let members: Membership[];
let puts: { message: string; content: Initiative }[] = [];

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
        puts.push({ message: subjectOf(body.message), content: JSON.parse(atob(body.content)) });
        return json({ content: { sha: 'next' } });
      }
      if (new URL(url).pathname.endsWith('/contents/')) return rootListing();
      if (url.includes('/contents/dataset.json')) {
        return file({ schemaVersion: 1, processIdentity: defaultBrandPack.processIdentity, ratesReviewed: true }, 'd');
      }
      if (url.includes('/contents/roles.json')) return file(roles, 'r');
      if (url.includes('/contents/countries.json')) return file(countries, 'c');
      if (url.includes('/contents/teams.json')) return file([{ id: 't1', name: 'Payments', active: true }, { id: 't2', name: 'Platform', active: true }], 't');
      if (url.includes('/contents/people.json')) return file([ana, cai, outsider], 'p');
      if (url.includes('/contents/memberships.json')) return file(members, 'm');
      const otherFile = others.find((o) => url.includes(`/contents/initiatives/${o.id}.json`));
      if (otherFile) return file(otherFile, 'o');
      if (url.endsWith('/contents/initiatives.json') || url.includes('/contents/initiatives/i1.json')) return file(initiative, 'i');
      if (url.includes('/contents/initiatives')) return json([{ name: 'i1.json', path: 'initiatives/i1.json', sha: 'sha-i1', type: 'file' }, ...others.map((o) => ({ name: `${o.id}.json`, path: `initiatives/${o.id}.json`, sha: `sha-${o.id}`, type: 'file' }))]);
      return json({ message: 'Not Found' }, 404);
    }),
  );
});
afterAll(() => vi.unstubAllGlobals());
// A debounced save still pending when a test ends lands in that test, not in the next one's `puts`.
afterEach(async () => {
  await repository?.flushPending();
  cleanup();
});
beforeEach(() => {
  initiative = { id: 'i1', name: 'Payments API', teamId: 't1', status: 'Active' };
  members = [membership('m1', 'ana', 60), membership('m2', 'cai', 50)];
  others = [];
  puts = [];
});

/** The page's repository, so pending saves can be flushed after each test. */
let repository: Repository | undefined;
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

async function typeDate(user: ReturnType<typeof userEvent.setup>, label: string, text: string) {
  const field = await screen.findByRole('textbox', { name: label });
  await user.clear(field);
  await user.type(field, `${text}{Enter}`);
}

/** Adds a person from the roster under the table: their chip, named "Add <name>, <n>% free. <role> …" (§5.4). */
async function addPerson(user: ReturnType<typeof userEvent.setup>, optionName: string) {
  const person = optionName.split(' · ')[0];
  const roster = await screen.findByRole('group', { name: 'Add people to Validation' });
  await user.click(within(roster).getByRole('button', { name: (name) => name.startsWith(`Add ${person}`) }));
}

const validationRow = () => phases().getByRole('button', { name: /^Validation/ });

describe('Phases: plan a costed phase and see its cost (§5.4, §7.1)', () => {
  it('lists every phase, opens the first costed one, and marks the others', async () => {
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Phases' })).toBeInTheDocument();
    expect(screen.getAllByText('· not costed')).toHaveLength(2); // Discovery and Rollout
    expect(validationRow()).toHaveAttribute('aria-expanded', 'true');
    expect(phases().getByRole('button', { name: /^Development/ })).toHaveAttribute('aria-expanded', 'false');
    expect(validationRow()).toHaveTextContent('Set period');
    expect(screen.getByText("Who works on Validation? Add a team member to see this phase's cost.")).toBeInTheDocument();
  });

  it('shows the total as working days × Allocation % × day rate × role factor once the period is set', async () => {
    const user = userEvent.setup();
    renderPage();
    await addPerson(user, 'Ana Ruiz · Developer'); // before the period: no cost yet
    const row = screen.getByRole('row', { name: /Ana Ruiz/ });
    expect(within(row).getByRole('slider', { name: 'Allocation % for Ana Ruiz' })).toHaveAttribute('aria-valuenow', '60'); // her Team FTE %
    expect(within(row).getAllByText('—')).toHaveLength(2);
    expect(validationRow()).toHaveTextContent('—');

    await typeDate(user, 'Validation start date', '01.10.2026');
    await typeDate(user, 'Validation end date', '30.11.2026');
    // 40 days × 60% × 500 × 0.8 = 9,600
    expect(within(row).getByText('€9,600')).toBeInTheDocument();
    expect(within(row).getByText('24.0')).toBeInTheDocument();
    expect(validationRow()).toHaveTextContent('1 Oct – 30 Nov 2026');
    expect(validationRow()).toHaveTextContent('€9,600');

    within(row).getByRole('slider', { name: 'Allocation % for Ana Ruiz' }).focus();
    await user.keyboard('50{Enter}');
    expect(within(row).getByText('€8,000')).toBeInTheDocument();
    expect(validationRow()).toHaveTextContent('€8,000');
  });

  describe('Allocation % on the load bar (§5.4, §9.5)', () => {
    async function allocationBar(user: ReturnType<typeof userEvent.setup>) {
      renderPage();
      await addPerson(user, 'Ana Ruiz · Developer'); // at her Team FTE %, 60
      await vi.waitFor(() => expect(puts.map((p) => p.message)).toEqual(['Payments API: Ana Ruiz added to Validation at 60%']), { timeout: 3000 }); // the add, saved on its own
      const row = screen.getByRole('row', { name: /Ana Ruiz/ });
      return { row, bar: within(row).getByRole('slider', { name: 'Allocation % for Ana Ruiz' }) };
    }
    /** Writes after the add. */
    const allocationPuts = () => puts.slice(1);

    it('steps by 5% with the arrow keys, Home gives 0% and End 100%, and saves once on Enter', async () => {
      const user = userEvent.setup();
      const { bar } = await allocationBar(user);
      bar.focus();
      await user.keyboard('{ArrowRight}');
      expect(bar).toHaveAttribute('aria-valuenow', '65');
      await user.keyboard('{Home}');
      expect(bar).toHaveAttribute('aria-valuenow', '0');
      await user.keyboard('{End}');
      expect(bar).toHaveAttribute('aria-valuenow', '100');
      expect(allocationPuts()).toEqual([]); // nothing saved while stepping
      await user.keyboard('{ArrowLeft}{Enter}');
      await vi.waitFor(() => expect(allocationPuts()).toHaveLength(1), { timeout: 3000 });
      expect(Object.values(allocationPuts()[0].content.phases ?? {})[0]?.allocations[0].allocationPct).toBe(95);
    });

    it('takes typed digits, ignores one that would pass 100, and saves on blur', async () => {
      const user = userEvent.setup();
      const { bar } = await allocationBar(user);
      bar.focus();
      await user.keyboard('4');
      expect(bar).toHaveAttribute('aria-valuenow', '4');
      await user.keyboard('09'); // 409 would pass 100: the 9 is ignored
      expect(bar).toHaveAttribute('aria-valuenow', '40');
      await user.tab();
      expect(bar).toHaveAttribute('aria-valuenow', '40');
      await vi.waitFor(() => expect(allocationPuts()).toHaveLength(1), { timeout: 3000 });
    });

    it('puts the saved value back on Esc', async () => {
      const user = userEvent.setup();
      const { bar } = await allocationBar(user);
      bar.focus();
      await user.keyboard('{ArrowRight}{ArrowRight}{Escape}');
      expect(bar).toHaveAttribute('aria-valuenow', '60');
      await user.tab();
      expect(allocationPuts()).toEqual([]);
    });

    it('sets a stop in one click', async () => {
      const user = userEvent.setup();
      const { bar, row } = await allocationBar(user);
      await user.click(within(row).getByRole('button', { name: 'Set Ana Ruiz to 25%' }));
      expect(bar).toHaveAttribute('aria-valuenow', '25');
      await vi.waitFor(() => expect(allocationPuts()).toHaveLength(1), { timeout: 3000 });
    });
  });

  it("prorates a mid-month start by the share of that month's weekdays covered", async () => {
    const user = userEvent.setup();
    renderPage();
    await addPerson(user, 'Ana Ruiz · Developer');
    await typeDate(user, 'Validation start date', '16.10.2026'); // 11 of October's 22 weekdays
    await typeDate(user, 'Validation end date', '30.11.2026');
    // (10 + 20) days × 60% × 500 × 0.8 = 7,200
    expect(validationRow()).toHaveTextContent('€7,200');
  });

  it('costs a custom-role person at their own day rate, without the role factor', async () => {
    const user = userEvent.setup();
    renderPage();
    await addPerson(user, 'Cai Wu · Fractional CTO');
    await typeDate(user, 'Validation start date', '01.10.2026');
    await typeDate(user, 'Validation end date', '30.11.2026');
    // 40 days × 50% × 900 = 18,000
    expect(validationRow()).toHaveTextContent('€18,000');
  });

  it('only offers the initiative team’s members, and says so', async () => {
    renderPage();
    const roster = await screen.findByRole('group', { name: 'Add people to Validation' });
    expect(within(roster).getByRole('button', { name: /^Add Ana Ruiz/ })).toBeInTheDocument();
    expect(within(roster).queryByRole('button', { name: /Olga Nord/ })).not.toBeInTheDocument();
    expect(screen.getByText('Only members of Payments can be allocated.')).toBeInTheDocument();
  });

  it('points to the team page when the team has no active members', async () => {
    members = [];
    renderPage();
    expect(await screen.findByText(/Payments has no active members yet/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: "the team's page" })).toHaveAttribute('href', '#/teams/t1');
  });

  it('removes an allocation and puts it back with Undo', async () => {
    const user = userEvent.setup();
    renderPage();
    await addPerson(user, 'Ana Ruiz · Developer');
    await user.click(screen.getByRole('button', { name: 'Remove Ana Ruiz from Validation' }));
    expect(screen.queryByRole('row', { name: /Ana Ruiz/ })).not.toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: 'Undo' }));
    expect(await screen.findByRole('row', { name: /Ana Ruiz/ })).toBeInTheDocument();
  });

  it('warns, and costs nothing, when the end date is before the start date', async () => {
    const user = userEvent.setup();
    renderPage();
    await addPerson(user, 'Ana Ruiz · Developer');
    await typeDate(user, 'Validation start date', '30.11.2026');
    await typeDate(user, 'Validation end date', '01.10.2026');
    expect(screen.getByText("The end date is before the start date, so this phase isn't costed yet.")).toBeInTheDocument();
    expect(validationRow()).toHaveTextContent('—');
  });

  it('says so when typed text is not a date, and keeps what was typed', async () => {
    const user = userEvent.setup();
    renderPage();
    await typeDate(user, 'Validation start date', 'soon');
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't read that date. Try 26.06.2026.");
    expect(screen.getByRole('textbox', { name: 'Validation start date' })).toHaveValue('soon');
  });

  const footer = () => screen.getByRole('dialog', { name: 'Validation period' });
  const day = (name: RegExp) => within(footer()).getByRole('button', { name });

  it('takes a typed date in either half, and the calendar follows it (§9.11)', async () => {
    const user = userEvent.setup();
    renderPage();
    const start = await screen.findByRole('textbox', { name: 'Validation start date' });
    await user.click(start);
    expect(within(footer()).getByText('Pick a start date, or type one.')).toBeInTheDocument();
    expect(start).toHaveFocus(); // the cursor stays in the field: typing still works
    await user.type(start, '3 Sep 2026');
    expect(within(footer()).getByText('September 2026')).toBeInTheDocument();
    expect(within(footer()).getByText('From 3 Sept 2026 · pick an end date')).toBeInTheDocument();

    const end = screen.getByRole('textbox', { name: 'Validation end date' });
    await user.click(end);
    await user.type(end, '30.10.2026');
    expect(within(footer()).getByText('3 Sept – 30 Oct 2026 · 1 month 28 days · 38 working days (DE)')).toBeInTheDocument();
  });

  it('previews the range as the pointer moves, with its length and working days, and saves it in one commit on Done', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(await screen.findByRole('textbox', { name: 'Validation start date' }), '01.09.2026');
    await user.click(day(/September 1st/)); // picks the start; the end is next
    await user.click(within(footer()).getByRole('button', { name: /Go to the Next Month/i }));
    await user.hover(day(/October 31st/));
    expect(within(footer()).getByText('1 Sept – 31 Oct 2026 · 2 months · 40 working days (DE)')).toBeInTheDocument();
    await user.click(day(/October 31st/));
    await user.click(within(footer()).getByRole('button', { name: 'Done' }));

    // Picks write nothing of their own: the one write carries only the period's note.
    const periodPuts = () => puts.filter((p) => p.message.includes('Validation period set to Sep'));
    await vi.waitFor(() => expect(periodPuts()).toHaveLength(1), { timeout: 3000 });
    expect(periodPuts()[0].message).toBe('Payments API: Validation period set to Sep–Oct');
    expect(periodPuts()[0].content.phases?.validation).toMatchObject({ startDate: '2026-09-01', endDate: '2026-10-31' });
    expect(screen.queryByRole('dialog', { name: 'Validation period' })).not.toBeInTheDocument();
  });

  it('sets whole months from the start with a length shortcut', async () => {
    const user = userEvent.setup();
    renderPage();
    const start = await screen.findByRole('textbox', { name: 'Validation start date' });
    await user.click(start);
    expect(within(footer()).getByRole('button', { name: '3 months' })).toBeDisabled(); // no start yet
    await user.type(start, '01.09.2026');
    await user.click(within(footer()).getByRole('button', { name: '3 months' }));
    expect(screen.getByRole('textbox', { name: 'Validation end date' })).toHaveValue('30/11/2026');
    expect(within(footer()).getByText(/^1 Sept – 30 Nov 2026 · 3 months/)).toBeInTheDocument();
  });

  it('discards the change on Escape, a click outside or Tab out, and writes nothing', async () => {
    const user = userEvent.setup();
    renderPage();
    const start = await screen.findByRole('textbox', { name: 'Validation start date' });
    await user.type(start, '01.09.2026');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Validation period' })).not.toBeInTheDocument();
    expect(start).toHaveValue('');

    await user.type(start, '01.09.2026');
    await user.click(screen.getByRole('heading', { name: 'Phases' }));
    expect(screen.queryByRole('dialog', { name: 'Validation period' })).not.toBeInTheDocument();
    expect(start).toHaveValue('');

    await user.type(start, '01.09.2026');
    await user.tab(); // into End: still the same control
    expect(screen.getByRole('dialog', { name: 'Validation period' })).toBeInTheDocument();
    await user.tab(); // out of it
    expect(screen.queryByRole('dialog', { name: 'Validation period' })).not.toBeInTheDocument();
    expect(start).toHaveValue('');

    await new Promise((resolve) => setTimeout(resolve, 1200));
    expect(puts.filter((p) => p.message.includes('Sep'))).toEqual([]);
  });

  it('moves into the calendar with the down arrow, and Enter there picks the day for the half being set', async () => {
    // Pinned so today falls outside the typed month; otherwise the calendar would give tabindex 0 to today's cell instead of the 1st.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 8, 24, 12));
    try {
      const user = userEvent.setup();
      renderPage();
      const start = await screen.findByRole('textbox', { name: 'Validation start date' });
      await user.type(start, '01.10.2026');
      await user.keyboard('{ArrowDown}');
      await vi.waitFor(() => expect(within(screen.getByRole('grid', { name: 'October 2026' })).getAllByRole('button').includes(document.activeElement as HTMLElement)).toBe(true));
      await user.keyboard('{ArrowRight}{Enter}');
      expect(start).toHaveValue('02/10/2026');
      await user.keyboard('{ArrowRight}{ArrowRight}{Enter}'); // the end is next
      expect(screen.getByRole('textbox', { name: 'Validation end date' })).toHaveValue('04/10/2026');
    } finally {
      vi.useRealTimers();
    }
  });

  it('highlights the period first, then the people, then nothing', async () => {
    const user = userEvent.setup();
    renderPage();
    expect(await screen.findByText('Set the period to calculate cost.')).toBeInTheDocument();
    const periodBox = () => screen.getByRole('textbox', { name: 'Validation start date' }).closest('[data-highlight]');
    const peopleBox = () => screen.getByText(/^Who works on Validation\?/).closest('div');
    expect(periodBox()).not.toBeNull();
    expect(peopleBox()).not.toHaveAttribute('data-highlight');
    expect(validationRow()).toHaveTextContent('Set period');
    expect(validationRow()).toHaveTextContent('· Add people');

    await typeDate(user, 'Validation start date', '01.10.2026');
    await typeDate(user, 'Validation end date', '30.11.2026');
    expect(screen.queryByText('Set the period to calculate cost.')).not.toBeInTheDocument();
    expect(peopleBox()).toHaveAttribute('data-highlight', 'true');
    expect(validationRow()).not.toHaveTextContent('Set period');
    expect(validationRow()).toHaveTextContent('· Add people');

    await addPerson(user, 'Ana Ruiz · Developer');
    expect(screen.queryByText(/^Who works on Validation\?/)).not.toBeInTheDocument();
    expect(validationRow()).not.toHaveTextContent('Add people');
  });

  it('shows the year once in the header when the period stays in one year, and twice when it crosses years', async () => {
    const user = userEvent.setup();
    renderPage();
    await typeDate(user, 'Validation start date', '07.09.2026');
    await typeDate(user, 'Validation end date', '30.09.2026');
    expect(validationRow()).toHaveTextContent('7 Sept – 30 Sept 2026');
    await typeDate(user, 'Validation end date', '08.01.2027');
    expect(validationRow()).toHaveTextContent('7 Sept 2026 – 8 Jan 2027');
  });

  it('shows the same period, allocations and total after a reload', async () => {
    initiative = {
      ...initiative,
      phases: {
        [defaultBrandPack.process[1].id]: {
          startDate: '2026-10-01',
          endDate: '2026-11-30',
          allocations: [{ id: 'a1', personId: 'ana', allocationPct: 50 }],
        },
      },
    };
    renderPage();
    const row = await screen.findByRole('row', { name: /Ana Ruiz/ });
    expect(within(row).getByRole('slider', { name: 'Allocation % for Ana Ruiz' })).toHaveAttribute('aria-valuenow', '50');
    expect(screen.getByRole('textbox', { name: 'Validation start date' })).toHaveValue('01/10/2026');
    expect(validationRow()).toHaveTextContent('€8,000');
  });
});

describe('Default plan (§5.11)', () => {
  const developmentRow = () => phases().getByRole('button', { name: /^Development/ });
  const suggested = {
    validation: { startDate: '2026-09-24', endDate: '2026-12-23', allocations: [] },
    development: { startDate: '2026-12-24', endDate: '2027-06-23', allocations: [] },
  };

  it('shows the suggested dates with a note, no Set period prompt, and no total yet', async () => {
    initiative = { ...initiative, phases: suggested, defaultPlan: true };
    renderPage();
    expect(await screen.findByText('Suggested dates, starting today. Adjust them, then add people to see the cost.')).toBeInTheDocument();
    expect(validationRow()).toHaveTextContent('24 Sept – 23 Dec 2026');
    expect(developmentRow()).toHaveTextContent('24 Dec 2026 – 23 Jun 2027');
    expect(validationRow()).not.toHaveTextContent('Set period');
    expect(screen.queryByText('Set the period to calculate cost.')).not.toBeInTheDocument();
    expect(validationRow()).toHaveTextContent('· Add people');
    expect(validationRow()).toHaveTextContent('—'); // dates but no people: no €0
    expect(validationRow()).not.toHaveTextContent('€');
  });

  it('highlights Add people on the first costed phase only', async () => {
    initiative = { ...initiative, phases: suggested, defaultPlan: true };
    const user = userEvent.setup();
    renderPage();
    await screen.findByText(/^Who works on Validation\?/);
    expect(screen.getByText(/^Who works on Validation\?/).closest('div')).toHaveAttribute('data-highlight', 'true');
    await user.click(developmentRow());
    expect(screen.getByText(/^Who works on Development\?/).closest('div')).not.toHaveAttribute('data-highlight');

    await addPerson(user, 'Ana Ruiz · Developer'); // Validation is planned: the next step moves on
    expect(screen.getByText(/^Who works on Development\?/).closest('div')).toHaveAttribute('data-highlight', 'true');
  });

  it('drops the note on the first edit and moves no other phase', async () => {
    initiative = { ...initiative, phases: suggested, defaultPlan: true };
    const user = userEvent.setup();
    renderPage();
    await typeDate(user, 'Validation end date', '31.12.2026');
    expect(screen.queryByText(/^Suggested dates/)).not.toBeInTheDocument();
    expect(developmentRow()).toHaveTextContent('24 Dec 2026 – 23 Jun 2027');
  });

  it('warns on the later phase when it starts before the previous one ends, and moves nothing', async () => {
    initiative = { ...initiative, phases: suggested, defaultPlan: true };
    const user = userEvent.setup();
    renderPage();
    await typeDate(user, 'Validation end date', '31.12.2026');
    expect(developmentRow()).toContainElement(screen.getByRole('img', { name: 'Overlaps Validation' }));
    await user.click(developmentRow());
    expect(screen.getByText('Starts before Validation ends (31 Dec 2026). The two phases overlap.')).toBeInTheDocument();
    // The picker says so too, before anything is saved, and Done still saves.
    await user.click(screen.getByRole('textbox', { name: 'Development start date' }));
    const picker = screen.getByRole('dialog', { name: 'Development period' });
    expect(within(picker).getByText('Starts before Validation ends (31 Dec 2026). The two phases overlap.')).toBeInTheDocument();
    expect(within(picker).getByRole('button', { name: 'Right after Validation' })).toBeInTheDocument();
    expect(validationRow()).not.toContainElement(screen.queryByRole('img', { name: /Overlaps/ }));
    expect(developmentRow()).toHaveTextContent('24 Dec 2026 – 23 Jun 2027');
  });

  it('shows no overlap warning for back-to-back phases', async () => {
    initiative = { ...initiative, phases: suggested, defaultPlan: true };
    renderPage();
    await screen.findByRole('heading', { name: 'Phases' });
    expect(screen.queryByRole('img', { name: /Overlaps/ })).not.toBeInTheDocument();
  });

  it('leaves an initiative made before this slice with its Set period prompt and no note', async () => {
    renderPage();
    expect(await screen.findByText('Set the period to calculate cost.')).toBeInTheDocument();
    expect(validationRow()).toHaveTextContent('Set period');
    expect(screen.queryByText(/^Suggested dates/)).not.toBeInTheDocument();
  });
});

describe('Initiative name: edited in place (§5.4)', () => {
  it('saves a new name on Enter with a commit naming the old and new name', async () => {
    const user = userEvent.setup();
    initiative = { ...initiative, phases: { validation: { startDate: '2026-09-24', endDate: '2026-12-23', allocations: [] } } };
    renderPage();
    const field = await screen.findByRole('textbox', { name: 'Initiative name' });
    expect(field).toHaveValue('Payments API');
    await user.clear(field);
    await user.type(field, 'Payments API v2{Enter}');
    // Find it among the puts: an earlier test's debounced commit can land in this test's list.
    const renamed = () => puts.find((p) => p.message.includes('renamed'));
    await vi.waitFor(() => expect(renamed()).toBeDefined(), { timeout: 3000 });
    expect(renamed()!.message).toBe('Payments API: renamed to Payments API v2');
    expect(renamed()!.content.name).toBe('Payments API v2');
  });

  it('Esc cancels an edit in progress: the old name comes back and nothing is committed', async () => {
    const user = userEvent.setup();
    renderPage();
    const field = await screen.findByRole('textbox', { name: 'Initiative name' });
    await user.type(field, ' draft');
    expect(field).toHaveValue('Payments API draft');
    await user.keyboard('{Escape}');
    expect(field).toHaveValue('Payments API');
    await user.tab();
    expect(puts.some((p) => p.message.includes('renamed'))).toBe(false);
  });

  it('refuses an empty name and puts the previous one back', async () => {
    const user = userEvent.setup();
    renderPage();
    const field = await screen.findByRole('textbox', { name: 'Initiative name' });
    await user.clear(field);
    await user.tab();
    expect(field).toHaveValue('Payments API');
    expect(puts.some((p) => p.message.includes('renamed'))).toBe(false);
  });
});

describe('Add person lists free capacity, most free first (§5.11, §7.2)', () => {
  const validationId = defaultBrandPack.process[1].id;
  const thisPeriod = { startDate: '2026-10-01', endDate: '2026-11-30' };
  // Another team's Active initiative holding `pct` of `personId` in October, in a phase that is not its current one.
  const elsewhere = (personId: string, pct: number, start = '2026-10-01', end = '2026-10-31'): Initiative => ({
    id: 'i2',
    name: 'Ledger',
    teamId: 't2',
    status: 'Active',
    phases: { [validationId]: { startDate: start, endDate: end, allocations: [{ id: 'x', personId, allocationPct: pct }] } },
  });
  /** The roster's chips, as their accessible names up to the detail: "Add Ana Ruiz, 30% free". */
  const optionTexts = () =>
    within(screen.getByRole('group', { name: 'Add people to Validation' }))
      .getAllByRole('button', { name: /^Add / })
      .map((chip) => chip.getAttribute('aria-label')!.split('. ')[0]);
  const chip = (name: string) => screen.getByRole('button', { name: (n) => n.startsWith(`Add ${name}`) });

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 8, 24, 12));
    initiative = { ...initiative, phases: { [validationId]: { ...thisPeriod, allocations: [] } } };
  });
  afterEach(() => vi.useRealTimers());

  async function openPicker(_user: ReturnType<typeof userEvent.setup>) {
    await screen.findByRole('group', { name: 'Add people to Validation' });
  }

  it('lists members with their free capacity, the most free first', async () => {
    others = [elsewhere('ana', 70)]; // Ana: 30 left of Capacity %; Cai: his 50 Team FTE %
    const user = userEvent.setup();
    renderPage();
    await openPicker(user);
    expect(optionTexts()).toEqual(['Add Cai Wu, 50% free', 'Add Ana Ruiz, 30% free']);
  });

  it('breaks a tie by name', async () => {
    members = [membership('m1', 'ana', 50), membership('m2', 'cai', 50)];
    const user = userEvent.setup();
    renderPage();
    await openPicker(user);
    expect(optionTexts()).toEqual(['Add Ana Ruiz, 50% free', 'Add Cai Wu, 50% free']);
  });

  it('keeps someone fully committed elsewhere in the list, at 0% free', async () => {
    others = [elsewhere('ana', 100)];
    const user = userEvent.setup();
    renderPage();
    await openPicker(user);
    expect(optionTexts()).toEqual(['Add Cai Wu, 50% free', 'Add Ana Ruiz, 0% free']);
    await user.click(chip('Ana Ruiz'));
    expect(within(screen.getByRole('row', { name: /Ana Ruiz/ })).getByRole('slider', { name: 'Allocation % for Ana Ruiz' })).toHaveAttribute('aria-valuenow', '0');
  });

  it('prefills Allocation % with the free capacity, and it stays editable', async () => {
    others = [elsewhere('ana', 70)];
    const user = userEvent.setup();
    renderPage();
    await openPicker(user);
    await user.click(chip('Ana Ruiz'));
    const pct = within(screen.getByRole('row', { name: /Ana Ruiz/ })).getByRole('slider', { name: 'Allocation % for Ana Ruiz' });
    expect(pct).toHaveAttribute('aria-valuenow', '30');
    pct.focus();
    await user.keyboard('45{Enter}');
    expect(pct).toHaveAttribute('aria-valuenow', '45');
  });

  it('leaves out a Provisional phase: one that starts more than a month ahead', async () => {
    others = [elsewhere('ana', 90, '2026-11-01', '2026-11-30')];
    const user = userEvent.setup();
    renderPage();
    await openPicker(user);
    expect(optionTexts()[0]).toBe('Add Ana Ruiz, 60% free');
  });

  it('asks for a fixed period when the end date is before the start date', async () => {
    initiative = { ...initiative, phases: { [validationId]: { startDate: '2026-11-30', endDate: '2026-10-01', allocations: [] } } };
    const user = userEvent.setup();
    renderPage();
    await openPicker(user);
    expect(screen.getByText('Fix the period to see who has room.')).toBeInTheDocument();
    expect(optionTexts()).toEqual(['Add Ana Ruiz', 'Add Cai Wu']);
  });

  it('asks for the period, and lists members by name with no figures, when there is none', async () => {
    initiative = { ...initiative, phases: undefined };
    const user = userEvent.setup();
    renderPage();
    await openPicker(user);
    expect(screen.getByText('Set the period to see who has room.')).toBeInTheDocument();
    expect(optionTexts()).toEqual(['Add Ana Ruiz', 'Add Cai Wu']);
  });
});

describe('Cost items: priced costs that are not people time (§4, §5.4, §7.1)', () => {
  const id = defaultBrandPack.process[1].id; // Validation, the open phase
  const planned = (costItems: CostItemFixture[] = [], period: { startDate?: string; endDate?: string } = { startDate: '2026-10-01', endDate: '2026-11-30' }) => {
    initiative = { ...initiative, phases: { [id]: { ...period, allocations: [{ id: 'a1', personId: 'ana', allocationPct: 50 }], costItems } } };
  };
  type CostItemFixture = NonNullable<Initiative['phases']>[string]['costItems'] extends (infer T)[] | undefined ? T : never;
  const pen: CostItemFixture = { id: 'c1', label: 'Penetration test', amount: 12000, timing: 'month', month: '2026-10' };
  const licence: CostItemFixture = { id: 'c2', label: 'Load-testing licence', amount: 6000, timing: 'spread' };
  // An earlier test's Undo toast would otherwise still be on screen.
  beforeEach(() => void toast.dismiss());
  // A person costs €8,000 (40 days × 50% × 500 × 0.8) over the period.
  const added = () => puts.find((p) => p.message.includes(' added to Validation at €'));

  async function openDraft(user: ReturnType<typeof userEvent.setup>) {
    await user.click(await screen.findByRole('button', { name: 'Add cost item to Validation' }));
    return screen.getByRole('group', { name: 'New cost item for Validation' });
  }

  it('says a phase has none, with the one action', async () => {
    planned();
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Cost items' })).toBeInTheDocument();
    expect(screen.getByText('No cost items yet —')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add cost item to Validation' })).toBeInTheDocument();
  });

  it('drops the amount refusal as the amount is edited, bringing the "Saves as" line back', async () => {
    const user = userEvent.setup();
    planned();
    renderPage();
    const draft = await openDraft(user);
    await user.type(within(draft).getByRole('combobox', { name: 'Label' }), 'Licences');
    const amount = within(draft).getByRole('textbox', { name: 'Amount' });
    await user.type(amount, 'abc');
    await user.click(within(draft).getByRole('button', { name: 'Add' }));
    expect(within(draft).getByRole('alert')).toHaveTextContent("Can't read that as an amount");
    await user.clear(amount);
    await user.type(amount, '3 × 4k');
    expect(within(draft).queryByRole('alert')).not.toBeInTheDocument();
    expect(within(draft).getByText('Saves as €12,000')).toBeInTheDocument();
  });

  it('takes a sum as the amount, shows what it saves as and saves the result', async () => {
    const user = userEvent.setup();
    planned();
    renderPage();
    const draft = await openDraft(user);
    await user.type(within(draft).getByRole('combobox', { name: 'Label' }), 'Licences');
    await user.type(within(draft).getByRole('textbox', { name: 'Amount' }), '3 × 4k');
    expect(within(draft).getByText('Saves as €12,000')).toBeInTheDocument();
    await user.click(within(draft).getByRole('button', { name: 'Add' }));

    const row = screen.getByRole('row', { name: /Licences/ });
    expect(within(row).getByLabelText('Amount for Licences')).toHaveValue('12000');
    await vi.waitFor(() => expect(added()).toBeDefined(), { timeout: 3000 });
    expect(added()!.message).toBe('Payments API: Licences added to Validation at €12,000');
    expect(added()!.content.phases![id].costItems).toEqual([{ id: expect.any(String), label: 'Licences', amount: 12000, timing: 'spread' }]);
  });

  it('adds a one-month item in one commit, and the phase total includes it', async () => {
    const user = userEvent.setup();
    planned();
    renderPage();
    const draft = await openDraft(user);
    await user.type(within(draft).getByRole('combobox', { name: 'Label' }), 'Penetration test');
    await user.type(within(draft).getByRole('textbox', { name: 'Amount' }), '12000');
    await user.click(within(draft).getByRole('radio', { name: /^Nov 2026,/ }));
    expect(within(draft).getByRole('textbox', { name: 'Month' })).toHaveValue('Nov 2026');
    expect(puts.some((p) => p.message.includes(' added to Validation at €'))).toBe(false); // nothing saved before Add
    await user.click(within(draft).getByRole('button', { name: 'Add' }));

    const row = screen.getByRole('row', { name: /Penetration test/ });
    expect(within(row).getByLabelText('Amount for Penetration test')).toHaveValue('12000');
    expect(within(row).getByRole('radio', { name: /^Nov 2026,/ })).toBeChecked();
    expect(within(row).getByLabelText('Month for Penetration test')).toHaveValue('Nov 2026');
    expect(screen.queryByRole('group', { name: 'New cost item for Validation' })).not.toBeInTheDocument();
    expect(validationRow()).toHaveTextContent('€20,000'); // 8,000 people + 12,000 item

    await vi.waitFor(() => expect(added()).toBeDefined(), { timeout: 3000 });
    expect(added()!.message).toBe('Payments API: Penetration test added to Validation at €12,000');
    expect(added()!.content.phases![id].costItems).toEqual([{ id: expect.any(String), label: 'Penetration test', amount: 12000, timing: 'month', month: '2026-11' }]);
  });

  it('times a cost on the period\'s months: each month shows what it receives, a month alone takes all of it', async () => {
    const user = userEvent.setup();
    planned([], { startDate: '2026-10-01', endDate: '2027-03-31' });
    renderPage();
    const draft = await openDraft(user);
    await user.type(within(draft).getByRole('combobox', { name: 'Label' }), 'Load-testing licences');
    const strip = within(draft).getByRole('radiogroup', { name: 'When' });
    expect(within(strip).getByRole('radio', { name: 'Oct 2026, receives nothing' })).toHaveTextContent('—');
    await user.type(within(draft).getByRole('textbox', { name: 'Amount' }), '12k');
    expect(within(strip).getAllByRole('radio', { name: /receives €2,000$/ })).toHaveLength(6);
    expect(within(strip).getByRole('radio', { name: 'Oct 2026, receives €2,000' })).toHaveTextContent('€2k');

    await user.click(within(strip).getByRole('radio', { name: /^Nov 2026,/ }));
    expect(within(strip).getByRole('radio', { name: 'Nov 2026, receives €12,000' })).toHaveTextContent('€12k');
    expect(within(strip).getByRole('radio', { name: 'Dec 2026, receives nothing' })).toHaveTextContent('—');
    await user.click(within(draft).getByRole('button', { name: 'Add' }));
    await vi.waitFor(() => expect(added()).toBeDefined(), { timeout: 3000 });
    expect(added()!.content.phases![id].costItems).toEqual([{ id: expect.any(String), label: 'Load-testing licences', amount: 12000, timing: 'month', month: '2026-11' }]);
  });

  it('keeps the One month / Spread toggle while the phase has no valid period', async () => {
    const user = userEvent.setup();
    planned([], {});
    renderPage();
    const draft = await openDraft(user);
    expect(within(draft).getByRole('radio', { name: 'Spread over the phase' })).toBeChecked();
    expect(within(draft).queryByRole('radio', { name: /receives/ })).not.toBeInTheDocument();
    await user.click(within(draft).getByRole('radio', { name: 'One month' }));
    expect(within(draft).getByRole('textbox', { name: 'Month' })).toBeInTheDocument();
  });

  it('adds a spread item by default, needing only a label and an amount', async () => {
    const user = userEvent.setup();
    planned();
    renderPage();
    const draft = await openDraft(user);
    expect(within(draft).getByRole('radio', { name: 'Spread over the phase' })).toBeChecked();
    expect(within(draft).getByRole('textbox', { name: 'Month' })).toHaveValue(''); // the month input waits beside the strip
    await user.type(within(draft).getByRole('combobox', { name: 'Label' }), 'Load-testing licence');
    await user.type(within(draft).getByRole('textbox', { name: 'Amount' }), '6000{Enter}');
    expect(screen.getByRole('row', { name: /Load-testing licence/ })).toBeInTheDocument();
    expect(validationRow()).toHaveTextContent('€14,000');
    await vi.waitFor(() => expect(added()).toBeDefined(), { timeout: 3000 });
    expect(added()!.content.phases![id].costItems).toEqual([{ id: expect.any(String), label: 'Load-testing licence', amount: 6000, timing: 'spread' }]); // no month the user never chose
  });

  it.each([
    ['no label and no amount', '', '', ['Enter a label.', 'Enter an amount of 0 or more.']],
    ['a label and a negative amount', 'Penetration test', '-5', ["An amount can't be below 0."]],
    ['a label and an empty amount', 'Penetration test', '', ['Enter an amount of 0 or more.']],
    ['an amount and a blank label', '   ', '100', ['Enter a label.']],
  ])('refuses %s inline and saves nothing', async (_name, label, amount, messages) => {
    const user = userEvent.setup();
    planned();
    renderPage();
    const draft = await openDraft(user);
    if (label) await user.type(within(draft).getByRole('combobox', { name: 'Label' }), label);
    if (amount) await user.type(within(draft).getByRole('textbox', { name: 'Amount' }), amount);
    await user.click(within(draft).getByRole('button', { name: 'Add' }));
    expect(within(draft).getAllByRole('alert').map((a) => a.textContent)).toEqual(messages);
    expect(screen.queryByRole('table', { name: 'Validation cost items' })).not.toBeInTheDocument();
    expect(added()).toBeUndefined();
  });

  it('closes the draft on Cancel and on Esc without saving', async () => {
    const user = userEvent.setup();
    planned();
    renderPage();
    const draft = await openDraft(user);
    await user.type(within(draft).getByRole('combobox', { name: 'Label' }), 'Penetration');
    await user.click(within(draft).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('group', { name: 'New cost item for Validation' })).not.toBeInTheDocument();
    await openDraft(user);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('group', { name: 'New cost item for Validation' })).not.toBeInTheDocument();
    expect(added()).toBeUndefined();
  });

  describe('label suggestions (§5.11)', () => {
    const earlier = (id: string, startDate: string, costItems: CostItemFixture[]): Initiative => ({
      id,
      name: id,
      teamId: 't1',
      status: 'Active',
      phases: { [defaultBrandPack.process[0].id]: { startDate, endDate: '2026-02-28', allocations: [], costItems } },
    });
    const draftLabel = (draft: HTMLElement) => within(draft).getByRole('combobox', { name: 'Label' });

    it('lists earlier labels, most used first, with uses, amount and timing, and announces the count', async () => {
      const user = userEvent.setup();
      planned();
      others = [
        earlier('i2', '2026-01-01', [{ id: 'x1', label: 'Penetration test', amount: 9000, timing: 'month', month: '2026-01' }, { id: 'x2', label: 'Pension fee', amount: 100, timing: 'spread' }]),
        earlier('i3', '2026-03-01', [{ id: 'x3', label: 'penetration test ', amount: 12000, timing: 'month', month: '2026-03' }]),
      ];
      renderPage();
      const draft = await openDraft(user);
      await user.type(draftLabel(draft), 'pen');
      const options = await screen.findAllByRole('option');
      expect(options.map((o) => o.textContent)).toEqual(['penetration test2× · €12,000 · One month', 'Pension fee1× · €100 · Spread']);
      expect(screen.getByRole('status')).toHaveTextContent('2 suggestions');
      expect(draftLabel(draft)).toHaveAttribute('aria-expanded', 'true');
    });

    it('prefills label, amount and timing from the most recent use, leaves the month empty, and saves nothing until Add', async () => {
      const user = userEvent.setup();
      planned();
      others = [earlier('i2', '2026-03-01', [{ id: 'x1', label: 'Penetration test', amount: 12000, timing: 'month', month: '2026-03' }])];
      renderPage();
      const draft = await openDraft(user);
      await user.type(draftLabel(draft), 'pen');
      await user.click(await screen.findByRole('option', { name: /Penetration test/ }));
      expect(draftLabel(draft)).toHaveValue('Penetration test');
      expect(within(draft).getByRole('textbox', { name: 'Amount' })).toHaveValue('12000');
      expect(within(draft).getByRole('radio', { name: 'Spread over the phase' })).not.toBeChecked();
      expect(within(draft).getByRole('textbox', { name: 'Month' })).toHaveValue('');
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

      await user.click(within(draft).getByRole('button', { name: 'Add' }));
      expect(within(draft).getByRole('alert')).toHaveTextContent('Enter a month.');
      expect(added()).toBeUndefined();
      await user.type(within(draft).getByRole('textbox', { name: 'Month' }), 'Nov 2026{Enter}');
      expect(within(draft).queryByRole('alert')).not.toBeInTheDocument();
      await user.click(within(draft).getByRole('button', { name: 'Add' }));
      await vi.waitFor(() => expect(added()).toBeDefined(), { timeout: 3000 });
      expect(added()!.content.phases![id].costItems).toEqual([{ id: expect.any(String), label: 'Penetration test', amount: 12000, timing: 'month', month: '2026-11' }]);
    });

    it('moves with the arrow keys, chooses with Enter, and Esc closes the list before the row, keeping the text', async () => {
      const user = userEvent.setup();
      planned();
      others = [earlier('i2', '2026-01-01', [{ id: 'x1', label: 'Penetration test', amount: 1, timing: 'spread' }, { id: 'x2', label: 'Pension fee', amount: 2, timing: 'spread' }])];
      renderPage();
      const draft = await openDraft(user);
      await user.type(draftLabel(draft), 'pen');
      expect(screen.getAllByRole('option').every((o) => o.getAttribute('aria-selected') === 'false')).toBe(true); // nothing highlighted yet
      await user.keyboard('{Escape}');
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      expect(draftLabel(draft)).toHaveValue('pen');
      expect(screen.getByRole('group', { name: 'New cost item for Validation' })).toBeInTheDocument();

      await user.keyboard('{ArrowDown}'); // reopens
      await user.keyboard('{ArrowDown}{ArrowDown}');
      expect(screen.getByRole('option', { name: /Pension fee/ })).toHaveAttribute('aria-selected', 'true');
      await user.keyboard('{Enter}');
      expect(draftLabel(draft)).toHaveValue('Pension fee');
      expect(within(draft).getByRole('textbox', { name: 'Amount' })).toHaveValue('2');
    });

    it('shows no list for text no earlier label contains', async () => {
      const user = userEvent.setup();
      planned();
      others = [earlier('i2', '2026-01-01', [{ id: 'x1', label: 'Penetration test', amount: 1, timing: 'spread' }])];
      renderPage();
      const draft = await openDraft(user);
      await user.type(draftLabel(draft), 'zzz');
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      expect(draftLabel(draft)).toHaveAttribute('aria-expanded', 'false');
    });
  });

  it('edits an item in place: label and amount on Enter, with refusals', async () => {
    const user = userEvent.setup();
    planned([licence]);
    renderPage();
    const row = await screen.findByRole('row', { name: /Load-testing licence/ });
    const amount = within(row).getByLabelText('Amount for Load-testing licence');
    await user.clear(amount);
    await user.type(amount, '-1{Enter}');
    expect(within(row).getByRole('alert')).toHaveTextContent("An amount can't be below 0.");
    await user.clear(amount);
    await user.type(amount, '9000{Enter}');
    expect(within(row).queryByRole('alert')).not.toBeInTheDocument();
    expect(validationRow()).toHaveTextContent('€17,000');

    const label = within(row).getByLabelText('Label of Load-testing licence');
    await user.clear(label);
    await user.type(label, '{Enter}');
    expect(within(row).getByRole('alert')).toHaveTextContent('Enter a label.');
    await user.type(label, 'Licence{Enter}');
    expect(screen.getByLabelText('Label of Licence')).toBeInTheDocument();
    const set = () => puts.find((p) => p.message.includes('amount set'));
    await vi.waitFor(() => expect(set()).toBeDefined(), { timeout: 3000 });
    // The two edits landed in one commit, named once.
    expect(set()!.message).toBe('Payments API: Validation cost item Load-testing licence renamed to Licence, amount set to €9,000');
  });

  it('treats a label that only gained a space as unchanged: the saved label comes back and nothing is committed', async () => {
    const user = userEvent.setup();
    planned([licence]);
    renderPage();
    const label = await screen.findByLabelText('Label of Load-testing licence');
    await user.type(label, ' {Enter}');
    expect(label).toHaveValue('Load-testing licence');
    await user.tab();
    expect(puts.some((p) => p.message.includes('renamed'))).toBe(false);
  });

  it('switches an item between one month and spread on the month strip', async () => {
    const user = userEvent.setup();
    planned([pen]);
    renderPage();
    const row = await screen.findByRole('row', { name: /Penetration test/ });
    expect(within(row).getByRole('radio', { name: /^Oct 2026,/ })).toBeChecked();
    await user.click(within(row).getByRole('radio', { name: 'Spread over the phase' }));
    expect(within(row).getByLabelText('Month for Penetration test')).toHaveValue('');
    await user.click(within(row).getByRole('radio', { name: /^Nov 2026,/ }));
    expect(within(row).getByLabelText('Month for Penetration test')).toHaveValue('Nov 2026');
    expect(within(row).getByRole('radio', { name: 'Spread over the phase' })).not.toBeChecked();
  });

  it('picks a month from the popover and refuses text that is not a month', async () => {
    const user = userEvent.setup();
    planned([pen]);
    renderPage();
    const row = await screen.findByRole('row', { name: /Penetration test/ });
    const month = within(row).getByLabelText('Month for Penetration test');
    await user.click(month);
    await user.click(await screen.findByRole('button', { name: 'Next year' }));
    await user.click(screen.getByRole('button', { name: 'Jan 2027' }));
    expect(month).toHaveValue('Jan 2027');
    expect(within(row).getByText("Jan 2027 is outside the phase's period. It still counts.")).toBeInTheDocument();

    await user.clear(month);
    await user.type(month, 'soon{Enter}');
    expect(within(row).getByRole('alert')).toHaveTextContent('Enter a month such as Sept 2026.');
    expect(month).toHaveValue('soon');
  });

  it('keeps counting an item whose month lies outside the period, and warns', async () => {
    planned([{ ...pen, month: '2027-03' }, licence]);
    renderPage();
    const row = await screen.findByRole('row', { name: /Penetration test/ });
    expect(within(row).getByText("Mar 2027 is outside the phase's period. It still counts.")).toBeInTheDocument();
    expect(screen.getByRole('row', { name: /Load-testing licence/ })).not.toHaveTextContent('outside');
    expect(validationRow()).toHaveTextContent('€26,000'); // 8,000 + 12,000 + 6,000
  });

  it('warns once the period is shortened past an item’s month', async () => {
    const user = userEvent.setup();
    planned([pen]);
    renderPage();
    const row = await screen.findByRole('row', { name: /Penetration test/ });
    expect(within(row).queryByText(/outside the phase/)).not.toBeInTheDocument();
    await typeDate(user, 'Validation start date', '01.11.2026');
    expect(within(row).getByText("Oct 2026 is outside the phase's period. It still counts.")).toBeInTheDocument();
    expect(validationRow()).toHaveTextContent('€16,000'); // 4,000 people (November only) + 12,000
  });

  it('lists items without a period but costs nothing and does not warn', async () => {
    planned([pen, licence], {});
    renderPage();
    expect(await screen.findByRole('row', { name: /Penetration test/ })).toBeInTheDocument();
    expect(screen.getByRole('row', { name: /Load-testing licence/ })).toBeInTheDocument();
    expect(validationRow()).toHaveTextContent('—');
    expect(screen.queryByText(/outside the phase/)).not.toBeInTheDocument();
  });

  it('removes an item and puts it back where it was with Undo', async () => {
    const user = userEvent.setup();
    planned([pen, licence]);
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Remove Penetration test from Validation' }));
    expect(screen.queryByRole('row', { name: /Penetration test/ })).not.toBeInTheDocument();
    expect(validationRow()).toHaveTextContent('€14,000');
    await user.click(await screen.findByRole('button', { name: 'Undo' }));
    await screen.findByLabelText('Label of Penetration test');
    expect(screen.getAllByLabelText(/^Label of /).map((field) => (field as HTMLInputElement).value)).toEqual(['Penetration test', 'Load-testing licence']);
    expect(validationRow()).toHaveTextContent('€26,000');
  });
});

describe('Copy allocations from the previous costed phase (§5.11)', () => {
  const [, validation, development] = defaultBrandPack.process;
  const plan = (allocations: { id: string; personId: string; allocationPct: number }[]) => ({ startDate: '2026-10-01', endDate: '2026-11-30', allocations });
  // Validation is open too, so row and field queries are scoped to Development's body.
  const developmentBody = () => within(document.getElementById(`phase-${development.id}`)!);
  const copyButton = () => screen.queryByRole('button', { name: 'Copy from Validation' });
  async function openDevelopment(user: ReturnType<typeof userEvent.setup>) {
    await user.click(await (await findPhases()).findByRole('button', { name: /^Development/ }));
  }

  it('copies each active member with the same Allocation % in one commit, and names who was skipped until the next edit', async () => {
    members = [membership('m1', 'ana', 60), { ...membership('m2', 'cai', 50), active: false }];
    initiative = {
      ...initiative,
      phases: { [validation.id]: plan([{ id: 'a1', personId: 'ana', allocationPct: 45 }, { id: 'a2', personId: 'cai', allocationPct: 30 }]), [development.id]: { allocations: [] } },
    };
    const user = userEvent.setup();
    renderPage();
    await openDevelopment(user);
    await user.click(await screen.findByRole('button', { name: 'Copy from Validation' }));

    expect(within(await developmentBody().findByRole('row', { name: /Ana Ruiz/ })).getByRole('slider', { name: 'Allocation % for Ana Ruiz' })).toHaveAttribute('aria-valuenow', '45');
    expect(screen.getByText('Not copied: Cai Wu, no longer on Payments.')).toBeInTheDocument();
    expect(copyButton()).not.toBeInTheDocument();

    const pct = developmentBody().getByRole('slider', { name: 'Allocation % for Ana Ruiz' });
    pct.focus();
    await user.keyboard('50{Enter}');
    expect(screen.queryByText(/Not copied/)).not.toBeInTheDocument();
  });

  it('says so and writes nothing when everyone was skipped, and keeps the offer', async () => {
    members = [{ ...membership('m1', 'ana', 60), active: false }];
    initiative = {
      ...initiative,
      phases: { [validation.id]: plan([{ id: 'a1', personId: 'ana', allocationPct: 45 }]), [development.id]: { allocations: [] } },
    };
    const user = userEvent.setup();
    renderPage();
    await openDevelopment(user);
    await user.click(await screen.findByRole('button', { name: 'Copy from Validation' }));
    expect(screen.getByText('Nothing copied. Not copied: Ana Ruiz, no longer on Payments.')).toBeInTheDocument();
    expect(copyButton()).toBeInTheDocument();
    expect(puts).toEqual([]);
  });

  it('is not offered when the previous phase is empty, for the first costed phase, or when the phase has people', async () => {
    initiative = { ...initiative, phases: { [validation.id]: plan([]), [development.id]: { allocations: [] } } };
    const user = userEvent.setup();
    const { unmount } = renderPage();
    await openDevelopment(user);
    expect(await screen.findByText(/Who works on Development/)).toBeInTheDocument();
    expect(copyButton()).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Copy from/ })).not.toBeInTheDocument();
    unmount();

    initiative = { ...initiative, phases: { [validation.id]: plan([{ id: 'a1', personId: 'ana', allocationPct: 45 }]), [development.id]: plan([{ id: 'a2', personId: 'cai', allocationPct: 20 }]) } };
    renderPage();
    await openDevelopment(user);
    expect(await developmentBody().findByRole('row', { name: /Cai Wu/ })).toBeInTheDocument();
    expect(copyButton()).not.toBeInTheDocument();
  });
});
