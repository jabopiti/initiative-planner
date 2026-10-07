import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { defaultBrandPack } from '../brand/defaultBrand';
import { weekdaysByMonth } from '../data/rates';
import type { Country, Initiative, Person } from '../data/types';
import { BrandProvider } from '../state/BrandContext';
import { RepositoryProvider } from '../state/DataContext';
import { TooltipProvider } from '@/components/ui/tooltip';
import { CountriesSection } from './CountriesSection';
import { useSectionLock } from './useSectionLock';
import { subjectOf } from '../sync/testing/commitMessage';
import { fakeOnDemand, seedFiles } from '../sync/testing/fakeGithub';

/** Opens a list row's "⋯" menu and chooses one of its items (§9.10). */
async function rowAction(user: ReturnType<typeof userEvent.setup>, menu: string, item: string) {
  await user.click(await screen.findByRole('button', { name: menu }));
  await user.click(await screen.findByRole('menuitem', { name: item }));
}

let countries: Country[] = [];
let people: Person[] = [];
let initiatives: Initiative[] = [];
let ratesReviewed = false;

const served = fakeOnDemand((fake) => seedFiles(fake, { ratesReviewed, roles: [{ id: 'dev', name: 'Developer', abbreviation: 'Dev', costFactor: 1, active: true }], countries, teams: [{ id: 't', name: 'Platform', active: true }], people, initiatives }));
/** Each commit the fake accepted: the file, its subject and its new content. */
const puts = () => served.accepted().map((p) => ({ path: p.path, message: subjectOf(p.message), content: p.content }));

afterEach(cleanup);

const year = (y: number, dayRate: number, workingDaysByMonth = weekdaysByMonth(y)) => ({ year: y, dayRate, workingDaysByMonth });

beforeEach(() => {
  ratesReviewed = false;
  countries = [
    { id: 'de', name: 'Germany', code: 'DE', active: true, ratesByYear: [year(2026, 1000), year(2027, 1000), year(2028, 1000)] },
    { id: 'es', name: 'Spain', code: 'ES', active: true, ratesByYear: [year(2026, 800), year(2027, 800), year(2028, 800)] },
  ];
  people = [{ id: 'ana', name: 'Ana Ruiz', countryId: 'de', roleId: 'dev', capacityPct: 100, active: true }];
  initiatives = [];
});

const TODAY = new Date(2026, 8, 30);

function Section() {
  const lock = useSectionLock();
  return <CountriesSection lock={lock} today={TODAY} />;
}

async function renderSection({ unlock = false } = {}) {
  const user = userEvent.setup();
  render(
    <BrandProvider brand={defaultBrandPack}>
      <TooltipProvider>
        <RepositoryProvider token="token">
          <Section />
        </RepositoryProvider>
      </TooltipProvider>
    </BrandProvider>,
  );
  await screen.findByText('€1,000 / day (2026)');
  if (unlock) await user.click(screen.getByRole('button', { name: 'Unlock to edit' }));
  return user;
}

const saved = async (path: string) => {
  await waitFor(() => expect(puts().some((p) => p.path === path)).toBe(true));
  return puts().filter((p) => p.path === path);
};

/** The one many-file commit made: a first rate edit also marks the rates reviewed, both files together (§10.3). */
const jointCommit = async () => {
  await waitFor(() => expect(served.fake().graphqlCommits).toHaveLength(1));
  const [commit] = served.fake().graphqlCommits;
  return { ...commit, message: subjectOf(commit.message) };
};

describe('Countries & rates list (§5.9)', () => {
  it('shows each country with the current year’s day rate; opening one closes the other', async () => {
    const user = await renderSection();
    expect(screen.getByText('€800 / day (2026)')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Show Germany’s rates' }));
    expect(screen.getByRole('table', { name: 'Germany rates by year' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Show Spain’s rates' }));
    expect(screen.queryByRole('table', { name: 'Germany rates by year' })).not.toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Spain rates by year' })).toBeInTheDocument();
  });

  it('has a row per tracked year with a day rate and twelve working-day cells prefilled with weekdays', async () => {
    const user = await renderSection({ unlock: true });
    await user.click(screen.getByRole('button', { name: 'Show Germany’s rates' }));
    const table = screen.getByRole('table', { name: 'Germany rates by year' });
    expect(within(table).getAllByRole('rowheader').map((th) => th.textContent)).toEqual(['2026', '2027', '2028']);
    expect(within(table).getByRole('textbox', { name: 'Day rate 2027, Germany' })).toHaveValue('1000');
    expect(within(table).getByRole('spinbutton', { name: 'Working days in Mar 2027, Germany' })).toHaveValue(23);
    expect(within(table).getAllByRole('spinbutton', { name: /^Working days in .* 2027/ })).toHaveLength(12);
  });

  it('marks a cell that differs from the weekdays, and Reset to weekdays restores the whole row', async () => {
    countries[0].ratesByYear[1] = year(2027, 1000, weekdaysByMonth(2027).map((d, i) => (i === 3 ? 19 : d)));
    const user = await renderSection({ unlock: true });
    await user.click(screen.getByRole('button', { name: 'Show Germany’s rates' }));

    expect(screen.getByRole('spinbutton', { name: 'Working days in Apr 2027, Germany, differs from 22 weekdays' })).toHaveValue(19);
    expect(screen.getByRole('button', { name: 'Reset to weekdays for 2026' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Reset to weekdays for 2027' }));

    expect(screen.getByRole('spinbutton', { name: 'Working days in Apr 2027, Germany' })).toHaveValue(22);
    expect(await jointCommit()).toMatchObject({
      message: 'Germany: working days in 2027 reset to weekdays; Rates marked as reviewed',
      files: ['countries.json', 'dataset.json'],
    });
  });

  it('shows years that left the window in a collapsed, read-only Earlier years row', async () => {
    countries[0].ratesByYear.unshift(year(2025, 950));
    const user = await renderSection({ unlock: true });
    await user.click(screen.getByRole('button', { name: 'Show Germany’s rates' }));

    const earlier = screen.getByRole('button', { name: 'Earlier years (2025)' });
    expect(earlier).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('€950')).not.toBeInTheDocument();
    await user.click(earlier);
    expect(screen.getByText('€950')).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: /2025/ })).not.toBeInTheDocument();
  });

  it('is read-only while locked, and editable once unlocked', async () => {
    const user = await renderSection();
    expect(screen.queryByText('Editing')).not.toBeInTheDocument();
    await user.click(screen.getByText('Germany'));
    expect(screen.getByRole('table', { name: 'Germany rates by year' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Reset to weekdays/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add country' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Actions for Germany' })).not.toBeInTheDocument();
    expect(screen.getAllByText('Active').length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: 'Unlock to edit' }));
    expect(screen.getByText('Editing')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add country' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Day rate 2026, Germany' })).toBeEnabled();
    expect(screen.getByRole('textbox', { name: 'Name of Germany' })).toBeEnabled();
  });

  it.each(['32', '-1', '2.5'])('refuses %s working days inline', async (typed) => {
    const user = await renderSection({ unlock: true });
    await user.click(screen.getByRole('button', { name: 'Show Germany’s rates' }));
    const april = screen.getByRole('spinbutton', { name: 'Working days in Apr 2027, Germany' });
    await user.clear(april);
    await user.type(april, `${typed}{Enter}`);
    expect(screen.getByRole('alert')).toHaveTextContent('Enter whole days from 0 to 30.');
    expect(puts()).toHaveLength(0);
    expect(served.fake().graphqlCommits).toHaveLength(0);
  });

  it('refuses a negative day rate inline', async () => {
    const user = await renderSection({ unlock: true });
    await user.click(screen.getByRole('button', { name: 'Show Germany’s rates' }));
    const rate = screen.getByRole('textbox', { name: 'Day rate 2027, Germany' });
    await user.clear(rate);
    await user.type(rate, '-5{Enter}');
    expect(screen.getByRole('alert')).toHaveTextContent("An amount can't be below 0.");
  });

  it('adds a country with its day rate for every tracked year and weekday working days', async () => {
    const user = await renderSection({ unlock: true });
    await user.click(screen.getByRole('button', { name: 'Add country' }));
    expect(screen.getByText('Used for 2026, 2027 and 2028. Working days start as the weekdays of each month.')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Code' })).toHaveAccessibleDescription('Code: e.g. DE. Shown where space is short, such as the period picker.');
    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Portugal');
    await user.type(screen.getByRole('textbox', { name: 'Code' }), 'PT');
    await user.type(screen.getByRole('textbox', { name: 'Day rate' }), '600');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    const [put] = await saved('countries.json');
    expect(put.message).toBe('Countries: Portugal added');
    const portugal = (put.content as Country[]).find((c) => c.name === 'Portugal')!;
    expect(portugal.code).toBe('PT');
    expect(portugal.ratesByYear.map((r) => [r.year, r.dayRate])).toEqual([
      [2026, 600],
      [2027, 600],
      [2028, 600],
    ]);
    expect(portugal.ratesByYear[2].workingDaysByMonth).toEqual(weekdaysByMonth(2028));
  });

  it('refuses a new country without a code (§6)', async () => {
    const user = await renderSection({ unlock: true });
    await user.click(screen.getByRole('button', { name: 'Add country' }));
    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Portugal');
    await user.type(screen.getByRole('textbox', { name: 'Day rate' }), '600');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByText('Enter a code.')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'New country' })).toBeInTheDocument();
  });

  it("edits a country's code beside its name, and shows it as text while locked", async () => {
    const user = await renderSection({ unlock: true });
    const code = screen.getByRole('textbox', { name: 'Code of Spain' });
    expect(code).toHaveValue('ES');
    await user.clear(code);
    await user.type(code, 'ESP{Enter}');
    const [put] = await saved('countries.json');
    expect(put.message).toBe('Countries: Spain code set to ESP');
    expect((put.content as Country[]).find((c) => c.name === 'Spain')!.code).toBe('ESP');
  });

  it('locking closes an unsaved new country, so nothing is added while locked', async () => {
    const user = await renderSection({ unlock: true });
    await user.click(screen.getByRole('button', { name: 'Add country' }));
    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Portugal');
    await user.click(screen.getByRole('button', { name: 'Lock' }));
    expect(screen.queryByRole('group', { name: 'New country' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Unlock to edit' }));
    expect(screen.queryByRole('group', { name: 'New country' })).not.toBeInTheDocument();
  });

  it('a failed rates save shows once, at the top of the country, with its own Retry', async () => {
    served.fake().failGraphql({ status: 500 }); // the first rate edit's commit, which also marks the rates reviewed
    const user = await renderSection({ unlock: true });
    await user.click(screen.getByRole('button', { name: 'Show Germany’s rates' }));
    const april = screen.getByRole('spinbutton', { name: 'Working days in Apr 2027, Germany' });
    await user.clear(april);
    await user.type(april, '19{Enter}');

    expect(await screen.findByRole('button', { name: 'Retry saving Germany’s rates' }, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^Retry/ })).toHaveLength(1);
  });

  it('renames and deactivates a country', async () => {
    const user = await renderSection({ unlock: true });
    const name = screen.getByRole('textbox', { name: 'Name of Spain' });
    await user.clear(name);
    await user.type(name, '{Enter}');
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a name.');
    await user.type(name, 'España{Enter}');
    await rowAction(user, 'Actions for España', 'Deactivate country');

    const messages = (await saved('countries.json')).map((p) => p.message);
    expect(messages.join('; ')).toMatch(/Countries: Spain renamed to España/);
    await user.click(screen.getByRole('button', { name: 'Actions for España' }));
    expect(await screen.findByRole('menuitem', { name: 'Reactivate country' })).toBeInTheDocument();
  });
});

describe('Rates are correct (§5.9, §5.2)', () => {
  it('confirms the rates while locked, then the header reads Rates reviewed', async () => {
    const user = await renderSection();
    await user.click(screen.getByRole('button', { name: 'Rates are correct' }));
    expect(screen.getByText('Rates reviewed')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Rates are correct' })).not.toBeInTheDocument();
    const [put] = await saved('dataset.json');
    expect(put.message).toBe('Rates confirmed as correct');
  });

  it('is not offered once the rates are reviewed', async () => {
    ratesReviewed = true;
    await renderSection();
    expect(screen.getByText('Rates reviewed')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Rates are correct' })).not.toBeInTheDocument();
  });

  it('any rate edit marks the rates reviewed and notes its impact at the top of the country', async () => {
    initiatives = [
      {
        id: 'pay',
        name: 'Payments API',
        teamId: 't',
        status: 'Active',
        phases: { dev: { startDate: '2027-03-01', endDate: '2027-05-31', allocations: [{ id: 'a1', personId: 'ana', allocationPct: 50 }] } },
      },
    ];
    const user = await renderSection({ unlock: true });
    await user.click(screen.getByRole('button', { name: 'Show Germany’s rates' }));
    const rate = screen.getByRole('textbox', { name: 'Day rate 2027, Germany' });
    await user.clear(rate);
    await user.type(rate, '740{Enter}');

    expect(screen.getByText('2027 day rate: changes the estimate of 1 initiative.')).toBeInTheDocument();
    expect(screen.getByText('Rates reviewed')).toBeInTheDocument();

    const june = screen.getByRole('spinbutton', { name: 'Working days in Jun 2027, Germany' });
    await user.clear(june);
    await user.type(june, '20{Enter}');
    expect(screen.getByText('Jun 2027 working days: changes no estimates.')).toBeInTheDocument();

    expect(await jointCommit()).toMatchObject({ message: 'Germany: 2027 day rate set to €740; Rates marked as reviewed', files: ['countries.json', 'dataset.json'] });
    const [juneCommit] = await saved('countries.json');
    expect(juneCommit.message).toBe('Germany: working days in Jun 2027 set to 20');
  });
});
