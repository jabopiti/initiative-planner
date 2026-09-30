import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultBrandPack } from '../brand/defaultBrand';
import { weekdaysByMonth } from '../data/rates';
import type { Country, Initiative, Person } from '../data/types';
import { BrandProvider } from '../state/BrandContext';
import { RepositoryProvider } from '../state/DataContext';
import { TooltipProvider } from '@/components/ui/tooltip';
import { rootListing } from '../sync/testing/rootListing';
import { CountriesSection } from './CountriesSection';
import { useSectionLock } from './useSectionLock';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const file = (content: unknown, sha: string) => json({ content: btoa(JSON.stringify(content)), sha });

let countries: Country[] = [];
let people: Person[] = [];
let initiatives: Initiative[] = [];
let ratesReviewed = false;
let countriesUnreachable = false;
const puts: { path: string; message: string; content: unknown }[] = [];

beforeAll(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      if ((init.method ?? 'GET') === 'PUT') {
        if (countriesUnreachable && url.includes('/contents/countries.json')) return json({ message: 'Server Error' }, 500);
        const body = JSON.parse(init.body as string) as { message: string; content: string };
        puts.push({ path: new URL(url).pathname.split('/contents/')[1], message: body.message, content: JSON.parse(atob(body.content)) });
        return json({ content: { sha: `next-${puts.length}` } });
      }
      if (new URL(url).pathname.endsWith('/contents/')) return rootListing();
      if (url.includes('/contents/dataset.json')) return file({ schemaVersion: 1, processIdentity: defaultBrandPack.processIdentity, ratesReviewed }, 'd');
      if (url.includes('/contents/roles.json')) return file([{ id: 'dev', name: 'Developer', abbreviation: 'Dev', costFactor: 1, active: true }], 'r');
      if (url.includes('/contents/countries.json')) return file(countries, 'c');
      if (url.includes('/contents/teams.json')) return file([], 't');
      if (url.includes('/contents/people.json')) return file(people, 'p');
      if (url.includes('/contents/memberships.json')) return file([], 'm');
      const hit = initiatives.find((i) => url.includes(`/contents/initiatives/${i.id}.json`));
      if (hit) return file(hit, `sha-${hit.id}`);
      if (url.includes('/contents/initiatives')) {
        return json(initiatives.map((i) => ({ name: `${i.id}.json`, path: `initiatives/${i.id}.json`, sha: `sha-${i.id}`, type: 'file' })));
      }
      return json({ message: 'Not Found' }, 404);
    }),
  );
});
afterAll(() => vi.unstubAllGlobals());
afterEach(cleanup);

const year = (y: number, dayRate: number, workingDaysByMonth = weekdaysByMonth(y)) => ({ year: y, dayRate, workingDaysByMonth });

beforeEach(() => {
  puts.length = 0;
  ratesReviewed = false;
  countriesUnreachable = false;
  countries = [
    { id: 'de', name: 'Germany', active: true, ratesByYear: [year(2026, 1000), year(2027, 1000), year(2028, 1000)] },
    { id: 'es', name: 'Spain', active: true, ratesByYear: [year(2026, 800), year(2027, 800), year(2028, 800)] },
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
  if (unlock) await user.click(screen.getByRole('button', { name: 'Locked' }));
  return user;
}

const saved = async (path: string) => {
  await waitFor(() => expect(puts.some((p) => p.path === path)).toBe(true), { timeout: 3000 });
  return puts.filter((p) => p.path === path);
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
    expect(within(table).getByRole('spinbutton', { name: 'Day rate 2027, Germany' })).toHaveValue(1000);
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
    const [put] = await saved('countries.json');
    expect(put.message).toBe('Germany: working days in 2027 reset to weekdays');
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
    expect(screen.queryByRole('spinbutton', { name: /2025/ })).not.toBeInTheDocument();
  });

  it('is read-only while locked, and editable once unlocked', async () => {
    const user = await renderSection();
    expect(screen.getByText('Locked. Unlock to edit.')).toBeInTheDocument();
    await user.click(screen.getByText('Germany'));
    expect(screen.getByRole('table', { name: 'Germany rates by year' })).toBeInTheDocument();
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Reset to weekdays/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add country' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Deactivate Germany' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Locked' }));
    expect(screen.getByRole('spinbutton', { name: 'Day rate 2026, Germany' })).toBeEnabled();
    expect(screen.getByRole('textbox', { name: 'Name of Germany' })).toBeEnabled();
  });

  it.each(['32', '-1', '2.5'])('refuses %s working days inline', async (typed) => {
    const user = await renderSection({ unlock: true });
    await user.click(screen.getByRole('button', { name: 'Show Germany’s rates' }));
    const april = screen.getByRole('spinbutton', { name: 'Working days in Apr 2027, Germany' });
    await user.clear(april);
    await user.type(april, `${typed}{Enter}`);
    expect(screen.getByRole('alert')).toHaveTextContent('Enter whole days from 0 to 30.');
    expect(puts).toHaveLength(0);
  });

  it('refuses a negative day rate inline', async () => {
    const user = await renderSection({ unlock: true });
    await user.click(screen.getByRole('button', { name: 'Show Germany’s rates' }));
    const rate = screen.getByRole('spinbutton', { name: 'Day rate 2027, Germany' });
    await user.clear(rate);
    await user.type(rate, '-5{Enter}');
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a day rate of 0 or more.');
  });

  it('adds a country with its day rate for every tracked year and weekday working days', async () => {
    const user = await renderSection({ unlock: true });
    await user.click(screen.getByRole('button', { name: 'Add country' }));
    expect(screen.getByText('Used for 2026, 2027 and 2028. Working days start as the weekdays of each month.')).toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Portugal');
    await user.type(screen.getByRole('spinbutton', { name: 'Day rate' }), '600');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    const [put] = await saved('countries.json');
    expect(put.message).toBe('Countries: Portugal added');
    const portugal = (put.content as Country[]).find((c) => c.name === 'Portugal')!;
    expect(portugal.ratesByYear.map((r) => [r.year, r.dayRate])).toEqual([
      [2026, 600],
      [2027, 600],
      [2028, 600],
    ]);
    expect(portugal.ratesByYear[2].workingDaysByMonth).toEqual(weekdaysByMonth(2028));
  });

  it('locking closes an unsaved new country, so nothing is added while locked', async () => {
    const user = await renderSection({ unlock: true });
    await user.click(screen.getByRole('button', { name: 'Add country' }));
    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Portugal');
    await user.click(screen.getByRole('button', { name: 'Unlocked' }));
    expect(screen.queryByRole('group', { name: 'New country' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Locked' }));
    expect(screen.queryByRole('group', { name: 'New country' })).not.toBeInTheDocument();
  });

  it('a failed rates save shows once, at the top of the country, with its own Retry', async () => {
    countriesUnreachable = true;
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
    await user.click(screen.getByRole('button', { name: 'Deactivate España' }));

    const messages = (await saved('countries.json')).map((p) => p.message);
    expect(messages.join('; ')).toMatch(/Countries: Spain renamed to España/);
    expect(screen.getByRole('button', { name: 'Reactivate España' })).toBeInTheDocument();
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
    const rate = screen.getByRole('spinbutton', { name: 'Day rate 2027, Germany' });
    await user.clear(rate);
    await user.type(rate, '740{Enter}');

    expect(screen.getByText('2027 day rate: changes the estimate of 1 initiative.')).toBeInTheDocument();
    expect(screen.getByText('Rates reviewed')).toBeInTheDocument();

    const june = screen.getByRole('spinbutton', { name: 'Working days in Jun 2027, Germany' });
    await user.clear(june);
    await user.type(june, '20{Enter}');
    expect(screen.getByText('Jun 2027 working days: changes no estimates.')).toBeInTheDocument();

    const countriesPuts = await saved('countries.json');
    expect(countriesPuts[0].message).toMatch(/^Germany: 2027 day rate set to €740/);
    expect((await saved('dataset.json'))[0].message).toBe('Rates marked as reviewed');
  });
});
