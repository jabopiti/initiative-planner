import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultBrandPack } from '../brand/defaultBrand';
import { buildBaselineDataset } from '../data/baseline';
import type { Initiative, Membership, Person, Team } from '../data/types';
import { useHashRoute } from '../router/useHashRoute';
import { BrandProvider } from '../state/BrandContext';
import { RepositoryProvider, useRepositoryState } from '../state/DataContext';
import { TooltipProvider } from '@/components/ui/tooltip';
import { GlobalSearch } from './GlobalSearch';
import { PeopleOverview } from './PeopleOverview';
import { rootListing } from '../sync/testing/rootListing';

const baseline = buildBaselineDataset(defaultBrandPack);
const teams: Team[] = [
  { id: 't1', name: 'Platform', active: true },
  { id: 't2', name: 'Platform Ops', active: false },
];
const person = (id: string, name: string, active = true): Person => ({ id, name, countryId: baseline.countries[0].id, roleId: baseline.roles[0].id, capacityPct: 100, active });
const people = [person('sofia', 'Sofia Molina'), person('lucia', 'Lucía Ramos', false)];
const members: Membership[] = [{ id: 'm1', personId: 'sofia', teamId: 't1', teamFtePct: 100, active: true }];
const manyInitiatives: Initiative[] = Array.from({ length: 7 }, (_, i) => ({ id: `bulk${i}`, name: `Bulk ${i}`, teamId: 't1', status: 'Active' }));
const initiatives: Initiative[] = [
  { id: 'fraud', name: 'Fraud Detection Upgrade', teamId: 't1', status: 'Active' },
  { id: 'checkout', name: 'Checkout Redesign', description: 'Adds fraud checks to the payment step', teamId: 't1', status: 'On Hold' },
  ...manyInitiatives,
];

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
// The repository reads a file's content as UTF-8, so an accented name has to be encoded that way.
const file = (content: unknown, sha: string) => json({ content: btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(content)))), sha });

beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.scrollIntoView = () => {};
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      if ((init.method ?? 'GET') === 'PUT') return json({ content: { sha: 'next' } });
      if (new URL(url).pathname.endsWith('/contents/')) return rootListing();
      if (url.includes('/contents/dataset.json')) return file(baseline.datasetFlags, 'd');
      if (url.includes('/contents/roles.json')) return file(baseline.roles, 'r');
      if (url.includes('/contents/countries.json')) return file(baseline.countries, 'c');
      if (url.includes('/contents/teams.json')) return file(teams, 't');
      if (url.includes('/contents/people.json')) return file(people, 'p');
      if (url.includes('/contents/memberships.json')) return file(members, 'm');
      const match = /\/contents\/initiatives\/(.+)\.json$/.exec(new URL(url).pathname);
      if (match) {
        const found = initiatives.find((i) => i.id === match[1]);
        return found ? file(found, `sha-${match[1]}`) : json({ message: 'Not Found' }, 404);
      }
      if (url.includes('/contents/initiatives')) return json(initiatives.map((i) => ({ name: `${i.id}.json`, path: `initiatives/${i.id}.json`, sha: `sha-${i.id}`, type: 'file' })));
      return json({ message: 'Not Found' }, 404);
    }),
  );
});
afterAll(() => vi.unstubAllGlobals());
afterEach(cleanup);
beforeEach(() => {
  window.location.hash = '#/portfolio';
});

/** The top bar's search plus a page that shows where the route went, and the real People page for a person result. */
function Page() {
  const { status } = useRepositoryState();
  const route = useHashRoute();
  if (status === 'loading') return null;
  return (
    <>
      <GlobalSearch />
      <input aria-label="Some field" />
      <button type="button">Elsewhere</button>
      {route === '/people' ? <PeopleOverview /> : <p>Route {route}</p>}
    </>
  );
}

async function renderPage() {
  render(
    <BrandProvider brand={defaultBrandPack}>
      <TooltipProvider>
        <RepositoryProvider token="token">
          <Page />
        </RepositoryProvider>
      </TooltipProvider>
    </BrandProvider>,
  );
  await screen.findByRole('button', { name: 'Search' });
}

const dialog = () => screen.getByRole('dialog', { name: 'Search' });
const field = () => within(dialog()).getByRole('combobox', { name: 'Search initiatives, people and teams' });

/** Opens the overlay with / and types into its field, once that is focused. */
async function search(text: string) {
  const user = userEvent.setup();
  await user.keyboard('/');
  await user.type(field(), text);
  return user;
}

describe('opening and closing', () => {
  it('opens from the icon with the field focused, and shows the hint', async () => {
    await renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(field()).toHaveFocus();
    expect(within(dialog()).getByText('Search initiatives, people and teams', { selector: 'p' })).toBeInTheDocument();
  });

  it('opens with Ctrl+K and ⌘+K, even from a text field', async () => {
    await renderPage();
    const user = userEvent.setup();
    await user.click(screen.getByRole('textbox', { name: 'Some field' }));
    await user.keyboard('{Control>}k{/Control}');
    expect(field()).toHaveFocus();
    await user.keyboard('{Escape}');
    await user.keyboard('{Meta>}k{/Meta}');
    expect(field()).toHaveFocus();
  });

  it('opens with / outside a text field, and types a slash inside one', async () => {
    await renderPage();
    const user = userEvent.setup();
    await user.click(screen.getByRole('textbox', { name: 'Some field' }));
    await user.keyboard('/');
    expect(screen.getByRole('textbox', { name: 'Some field' })).toHaveValue('/');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Elsewhere' }));
    await user.keyboard('/');
    expect(field()).toHaveFocus();
    expect(field()).toHaveValue('');
  });

  it('closes with Esc and returns focus to the element focused before', async () => {
    await renderPage();
    const user = userEvent.setup();
    const elsewhere = screen.getByRole('button', { name: 'Elsewhere' });
    elsewhere.focus();
    await user.keyboard('{Control>}k{/Control}');
    await user.keyboard('fraud{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(elsewhere).toHaveFocus();
  });

  it('keeps the original focus target when Ctrl+K is pressed inside the open overlay', async () => {
    await renderPage();
    const user = userEvent.setup();
    const elsewhere = screen.getByRole('button', { name: 'Elsewhere' });
    elsewhere.focus();
    await user.keyboard('{Control>}k{/Control}');
    await user.keyboard('{Control>}k{/Control}');
    await user.keyboard('{Escape}');
    expect(elsewhere).toHaveFocus();
  });

  it('names its shortcut in the icon tooltip', async () => {
    await renderPage();
    await userEvent.hover(screen.getByRole('button', { name: 'Search' }));
    expect((await screen.findAllByText('Search (Ctrl+K)')).length).toBeGreaterThan(0);
  });
});

describe('results', () => {
  it('groups initiatives with phase, status chip and a description excerpt, name matches first', async () => {
    await renderPage();
    await search('fra');
    const group = within(dialog()).getByRole('group', { name: /Initiatives/ });
    const rows = within(group).getAllByRole('option');
    expect(rows[0]).toHaveTextContent('Fraud Detection Upgrade');
    expect(rows[0]).toHaveTextContent(defaultBrandPack.process[0].label);
    expect(rows[1]).toHaveTextContent('Checkout Redesign');
    expect(rows[1]).toHaveTextContent('On Hold');
    expect(rows[1]).toHaveTextContent('Adds fraud checks to the payment step');
  });

  it('finds people without accents, and marks inactive ones', async () => {
    await renderPage();
    await search('lucia');
    expect(within(within(dialog()).getByRole('group', { name: /People/ })).getByRole('option')).toHaveTextContent('Lucía Ramos (inactive)');
  });

  it('finds teams and marks inactive ones', async () => {
    await renderPage();
    await search('plat');
    const options = within(within(dialog()).getByRole('group', { name: /Teams/ })).getAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual(['Platform', 'Platform Ops (inactive)']);
  });

  it('shows 5 of a longer group and says how many match', async () => {
    await renderPage();
    await search('bulk');
    const group = within(dialog()).getByRole('group', { name: /Initiatives/ });
    expect(within(group).getAllByRole('option')).toHaveLength(5);
    expect(within(dialog()).getByText('5 of 7')).toBeInTheDocument();
  });

  it('says so when nothing matches', async () => {
    await renderPage();
    await search('xyz');
    expect(within(dialog()).getByRole('status')).toHaveTextContent('No matches for ‘xyz’');
  });
});

describe('opening a result', () => {
  it('opens an initiative with Enter, and closes the overlay', async () => {
    await renderPage();
    const user = await search('fraud');
    await user.keyboard('{Enter}');
    expect(window.location.hash).toBe('#/initiatives/fraud');
    expect(screen.queryByRole('dialog', { name: 'Search' })).not.toBeInTheDocument();
  });

  it('opens a team with a click', async () => {
    await renderPage();
    const user = await search('plat');
    await user.click(within(dialog()).getByRole('option', { name: 'Platform' }));
    expect(window.location.hash).toBe('#/teams/t1');
  });

  it('opens a person on the People page with their side panel', async () => {
    await renderPage();
    const user = await search('sofia');
    await user.keyboard('{Enter}');
    expect(window.location.hash).toBe('#/people');
    expect(await screen.findByRole('dialog', { name: /Sofia Molina/ })).toBeInTheDocument();
  });

  it('moves between results with the arrow keys', async () => {
    await renderPage();
    const user = await search('fra');
    await user.keyboard('{ArrowDown}{Enter}');
    expect(window.location.hash).toBe('#/initiatives/checkout');
  });
});
