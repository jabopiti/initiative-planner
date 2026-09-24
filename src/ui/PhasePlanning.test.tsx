import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultBrandPack } from '../brand/defaultBrand';
import type { Country, Initiative, Membership, Person, Role } from '../data/types';
import { BrandProvider } from '../state/BrandContext';
import { RepositoryProvider } from '../state/DataContext';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/sonner';
import { InitiativeDetail } from './InitiativeDetail';

// One country: €500/day, 20 working days every month of 2026 and 2027. One role, factor 0.8.
const twenty = Array(12).fill(20);
const roles: Role[] = [{ id: 'dev', name: 'Developer', abbreviation: 'Dev', costFactor: 0.8, active: true }];
const countries: Country[] = [
  {
    id: 'de',
    name: 'Germany',
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
        puts.push({ message: body.message, content: JSON.parse(atob(body.content)) });
        return json({ content: { sha: 'next' } });
      }
      if (url.includes('/contents/dataset.json')) {
        return file({ schemaVersion: 1, processIdentity: defaultBrandPack.processIdentity, ratesReviewed: true }, 'd');
      }
      if (url.includes('/contents/roles.json')) return file(roles, 'r');
      if (url.includes('/contents/countries.json')) return file(countries, 'c');
      if (url.includes('/contents/teams.json')) return file([{ id: 't1', name: 'Payments', active: true }], 't');
      if (url.includes('/contents/people.json')) return file([ana, cai, outsider], 'p');
      if (url.includes('/contents/memberships.json')) return file(members, 'm');
      const otherFile = others.find((o) => url.includes(`/contents/initiatives/${o.id}.json`));
      if (otherFile) return file(otherFile, 'o');
      if (url.endsWith('/contents/initiatives.json') || url.includes('/contents/initiatives/i1.json')) return file(initiative, 'i');
      if (url.includes('/contents/initiatives')) return json([{ name: 'i1.json', path: 'initiatives/i1.json' }, ...others.map((o) => ({ name: `${o.id}.json`, path: `initiatives/${o.id}.json` }))]);
      return json({ message: 'Not Found' }, 404);
    }),
  );
});
afterAll(() => vi.unstubAllGlobals());
afterEach(cleanup);
beforeEach(() => {
  initiative = { id: 'i1', name: 'Payments API', teamId: 't1', status: 'Active' };
  members = [membership('m1', 'ana', 60), membership('m2', 'cai', 50)];
  others = [];
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

async function typeDate(user: ReturnType<typeof userEvent.setup>, label: string, text: string) {
  const field = await screen.findByRole('textbox', { name: label });
  await user.clear(field);
  await user.type(field, `${text}{Enter}`);
}

async function addPerson(user: ReturnType<typeof userEvent.setup>, optionName: string) {
  await user.click(await screen.findByRole('combobox', { name: 'Add person to Validation' }));
  // With a period set the option also carries "N% free" after the name.
  await user.click(await screen.findByRole('option', { name: new RegExp(`^${optionName}`) }));
}

const validationRow = () => screen.getByRole('button', { name: /^Validation/ });

describe('Phases: plan a costed phase and see its cost (§5.4, §7.1)', () => {
  it('lists every phase, opens the first costed one, and marks the others', async () => {
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Phases' })).toBeInTheDocument();
    expect(screen.getAllByText('· not costed')).toHaveLength(2); // Discovery and Rollout
    expect(validationRow()).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: /^Development/ })).toHaveAttribute('aria-expanded', 'false');
    expect(validationRow()).toHaveTextContent('Set period');
    expect(screen.getByText("Who works on Validation? Add a team member to see this phase's cost.")).toBeInTheDocument();
  });

  it('shows the total as working days × Allocation % × day rate × role factor once the period is set', async () => {
    const user = userEvent.setup();
    renderPage();
    await addPerson(user, 'Ana Ruiz · Developer'); // before the period: no cost yet
    const row = screen.getByRole('row', { name: /Ana Ruiz/ });
    expect(within(row).getByLabelText('Allocation % for Ana Ruiz')).toHaveValue(60); // her Team FTE %
    expect(within(row).getAllByText('—')).toHaveLength(2);
    expect(validationRow()).toHaveTextContent('—');

    await typeDate(user, 'Validation start date', '01.10.2026');
    await typeDate(user, 'Validation end date', '30.11.2026');
    // 40 days × 60% × 500 × 0.8 = 9,600
    expect(within(row).getByText('€9,600')).toBeInTheDocument();
    expect(within(row).getByText('24.0')).toBeInTheDocument();
    expect(validationRow()).toHaveTextContent('1 Oct – 30 Nov 2026');
    expect(validationRow()).toHaveTextContent('€9,600');

    const pct = within(row).getByLabelText('Allocation % for Ana Ruiz');
    await user.clear(pct);
    await user.type(pct, '50');
    await user.keyboard('{Enter}');
    expect(within(row).getByText('€8,000')).toBeInTheDocument();
    expect(validationRow()).toHaveTextContent('€8,000');
  });

  describe('Allocation % refuses out-of-range entries inline (§9.9)', () => {
    async function allocationField(user: ReturnType<typeof userEvent.setup>) {
      renderPage();
      await addPerson(user, 'Ana Ruiz · Developer');
      const row = screen.getByRole('row', { name: /Ana Ruiz/ });
      return { row, pct: within(row).getByLabelText('Allocation % for Ana Ruiz') };
    }

    it.each([['120'], ['-5'], ['abc'], ['']])('refuses %j: nothing is saved, the field stays invalid with the message', async (typed) => {
      const user = userEvent.setup();
      const { row, pct } = await allocationField(user);
      await user.clear(pct);
      if (typed) await user.type(pct, typed);
      await user.keyboard('{Enter}');

      const message = within(row).getByRole('alert');
      expect(message).toHaveTextContent('Enter a percentage from 0 to 100.');
      expect(pct).toBeInvalid();
      expect(pct).toHaveAccessibleDescription('Enter a percentage from 0 to 100.');
      if (typed === '120' || typed === '-5') expect(pct).toHaveValue(Number(typed));

      // Leaving the field repeats the refusal rather than reverting.
      await user.tab();
      expect(within(row).getByRole('alert')).toBeInTheDocument();
      expect(pct).toBeInvalid();
    });

    it('puts the last saved value back on Esc and clears the message', async () => {
      const user = userEvent.setup();
      const { row, pct } = await allocationField(user);
      await user.clear(pct);
      await user.type(pct, '120');
      await user.keyboard('{Enter}');
      expect(within(row).getByRole('alert')).toBeInTheDocument();

      await user.keyboard('{Escape}');
      expect(pct).toHaveValue(60);
      expect(pct).not.toBeInvalid();
      expect(within(row).queryByRole('alert')).not.toBeInTheDocument();
    });

    it('saves a corrected value and clears the message', async () => {
      const user = userEvent.setup();
      const { row, pct } = await allocationField(user);
      await user.clear(pct);
      await user.type(pct, '120');
      await user.keyboard('{Enter}');
      await user.clear(pct);
      await user.type(pct, '50');
      await user.keyboard('{Enter}');

      expect(within(row).queryByRole('alert')).not.toBeInTheDocument();
      expect(pct).not.toBeInvalid();
      expect(pct).toHaveValue(50);
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
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('combobox', { name: 'Add person to Validation' }));
    expect(await screen.findByRole('option', { name: 'Ana Ruiz · Developer' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Olga Nord/ })).not.toBeInTheDocument();
    await user.keyboard('{Escape}');
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

  it('opens the calendar when the date field is clicked, follows what is typed, and fills the field from a picked day', async () => {
    const user = userEvent.setup();
    renderPage();
    const field = await screen.findByRole('textbox', { name: 'Validation start date' });
    expect(field).toHaveAttribute('placeholder', 'dd.mm.yyyy');
    await user.click(field);
    expect(await screen.findByText('Or type a date, e.g. 26.06.2026')).toBeInTheDocument();
    expect(field).toHaveFocus(); // the cursor stays in the field: typing still works

    await user.type(field, '01.10.2026'); // the calendar moves to October 2026
    await user.click(within(await screen.findByRole('grid')).getByRole('button', { name: /October 15th/ }));
    expect(field).toHaveValue('15.10.2026');
    expect(screen.queryByText('Or type a date, e.g. 26.06.2026')).not.toBeInTheDocument();
    expect(validationRow()).toHaveTextContent('Set period'); // only the start is set so far
  });

  it('closes the calendar with Escape and keeps what was typed', async () => {
    const user = userEvent.setup();
    renderPage();
    const field = await screen.findByRole('textbox', { name: 'Validation start date' });
    await user.click(field);
    await screen.findByText('Or type a date, e.g. 26.06.2026');
    await user.keyboard('{Escape}');
    expect(screen.queryByText('Or type a date, e.g. 26.06.2026')).not.toBeInTheDocument();
  });

  it('moves into the calendar with the down arrow, and a day picked by keyboard fills the field', async () => {
    const user = userEvent.setup();
    renderPage();
    const field = await screen.findByRole('textbox', { name: 'Validation start date' });
    await user.type(field, '01.10.2026');
    await user.keyboard('{ArrowDown}');
    await vi.waitFor(() => expect(within(screen.getByRole('grid')).getAllByRole('button').includes(document.activeElement as HTMLElement)).toBe(true));
    await user.keyboard('{Enter}');
    expect(field).toHaveValue('01.10.2026'); // the focused day was the typed date, now picked
    expect(field).toHaveFocus();
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
    expect(validationRow()).toHaveTextContent('7 Sep – 30 Sep 2026');
    await typeDate(user, 'Validation end date', '08.01.2027');
    expect(validationRow()).toHaveTextContent('7 Sep 2026 – 8 Jan 2027');
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
    expect(within(row).getByLabelText('Allocation % for Ana Ruiz')).toHaveValue(50);
    expect(screen.getByRole('textbox', { name: 'Validation start date' })).toHaveValue('01.10.2026');
    expect(validationRow()).toHaveTextContent('€8,000');
  });
});

describe('Default plan (§5.11)', () => {
  const developmentRow = () => screen.getByRole('button', { name: /^Development/ });
  const suggested = {
    validation: { startDate: '2026-09-24', endDate: '2026-12-23', allocations: [] },
    development: { startDate: '2026-12-24', endDate: '2027-06-23', allocations: [] },
  };

  it('shows the suggested dates with a note, no Set period prompt, and no total yet', async () => {
    initiative = { ...initiative, phases: suggested, defaultPlan: true };
    renderPage();
    expect(await screen.findByText('Suggested dates, starting today. Adjust them, then add people to see the cost.')).toBeInTheDocument();
    expect(validationRow()).toHaveTextContent('24 Sep – 23 Dec 2026');
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
  const optionTexts = () => screen.getAllByRole('option').map((o) => o.textContent);

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 8, 24, 12));
    initiative = { ...initiative, phases: { [validationId]: { ...thisPeriod, allocations: [] } } };
  });
  afterEach(() => vi.useRealTimers());

  async function openPicker(user: ReturnType<typeof userEvent.setup>) {
    await user.click(await screen.findByRole('combobox', { name: 'Add person to Validation' }));
  }

  it('lists members with their free capacity, the most free first', async () => {
    others = [elsewhere('ana', 70)]; // Ana: 30 left of Capacity %; Cai: his 50 Team FTE %
    const user = userEvent.setup();
    renderPage();
    await openPicker(user);
    expect(optionTexts()).toEqual(['Cai Wu · Fractional CTO50% free', 'Ana Ruiz · Developer30% free']);
  });

  it('breaks a tie by name', async () => {
    members = [membership('m1', 'ana', 50), membership('m2', 'cai', 50)];
    const user = userEvent.setup();
    renderPage();
    await openPicker(user);
    expect(optionTexts()).toEqual(['Ana Ruiz · Developer50% free', 'Cai Wu · Fractional CTO50% free']);
  });

  it('keeps someone fully committed elsewhere in the list, at 0% free', async () => {
    others = [elsewhere('ana', 100)];
    const user = userEvent.setup();
    renderPage();
    await openPicker(user);
    expect(optionTexts()).toEqual(['Cai Wu · Fractional CTO50% free', 'Ana Ruiz · Developer0% free']);
    await user.click(screen.getByRole('option', { name: /^Ana Ruiz/ }));
    expect(within(screen.getByRole('row', { name: /Ana Ruiz/ })).getByLabelText('Allocation % for Ana Ruiz')).toHaveValue(0);
  });

  it('prefills Allocation % with the free capacity, and it stays editable', async () => {
    others = [elsewhere('ana', 70)];
    const user = userEvent.setup();
    renderPage();
    await openPicker(user);
    await user.click(screen.getByRole('option', { name: /^Ana Ruiz/ }));
    const pct = within(screen.getByRole('row', { name: /Ana Ruiz/ })).getByLabelText('Allocation % for Ana Ruiz');
    expect(pct).toHaveValue(30);
    await user.clear(pct);
    await user.type(pct, '45{Enter}');
    expect(pct).toHaveValue(45);
  });

  it('counts only the months of this phase', async () => {
    others = [elsewhere('ana', 70, '2026-12-01', '2026-12-31')]; // Provisional as well, but also outside October to November
    const user = userEvent.setup();
    renderPage();
    await openPicker(user);
    expect(optionTexts()).toEqual(['Ana Ruiz · Developer60% free', 'Cai Wu · Fractional CTO50% free']);
  });

  it('leaves out a Provisional phase: one that starts more than a month ahead', async () => {
    others = [elsewhere('ana', 90, '2026-11-01', '2026-11-30')];
    const user = userEvent.setup();
    renderPage();
    await openPicker(user);
    expect(optionTexts()[0]).toBe('Ana Ruiz · Developer60% free');
  });

  it('leaves out an initiative that is not Active', async () => {
    others = [{ ...elsewhere('ana', 90), status: 'On Hold' }];
    const user = userEvent.setup();
    renderPage();
    await openPicker(user);
    expect(optionTexts()[0]).toBe('Ana Ruiz · Developer60% free');
  });

  it('asks for the period, and lists members by name with no figures, when there is none', async () => {
    initiative = { ...initiative, phases: undefined };
    const user = userEvent.setup();
    renderPage();
    await openPicker(user);
    expect(screen.getByText('Set the period to see who has room.')).toBeInTheDocument();
    expect(optionTexts()).toEqual(['Ana Ruiz · Developer', 'Cai Wu · Fractional CTO']);
  });
});
