import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultBrandPack } from '../brand/defaultBrand';
import type { BrandPack } from '../brand/types';
import type { Country, Initiative, Membership, Person, Role, Team } from '../data/types';
import { BrandProvider } from '../state/BrandContext';
import { RepositoryProvider } from '../state/DataContext';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/sonner';
import { InitiativeDetail } from './InitiativeDetail';
import { rootListing } from '../sync/testing/rootListing';
import { subjectOf } from '../sync/testing/commitMessage';

const roles: Role[] = [{ id: 'dev', name: 'Developer', abbreviation: 'Dev', costFactor: 0.8, active: true }];
const countries: Country[] = [{ id: 'de', name: 'Germany', active: true, ratesByYear: [{ year: 2026, dayRate: 500, workingDaysByMonth: Array(12).fill(20) }] }];
const teams: Team[] = [{ id: 't1', name: 'Platform', active: true }];
const person = (id: string, name: string, extra: Partial<Person> = {}): Person => ({ id, name, countryId: 'de', roleId: 'dev', capacityPct: 100, active: true, ...extra });
// Mara and Felix are on Platform; Carla is not on any team; Sofia has since been deactivated.
const mara = person('mara', 'Mara Voss');
const felix = person('felix', 'Felix Brandt');
const carla = person('carla', 'Carla Ferrer');
const sofia = person('sofia', 'Sofia Molina', { active: false });
const membership = (personId: string, teamId: string, active = true): Membership => ({ id: `${personId}-${teamId}`, personId, teamId, teamFtePct: 60, active });

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const file = (content: unknown, sha: string) => json({ content: btoa(JSON.stringify(content)), sha });

let brand: BrandPack;
let initiative: Initiative;
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
      if (url.includes('/contents/dataset.json')) return file({ schemaVersion: 1, processIdentity: defaultBrandPack.processIdentity, ratesReviewed: true }, 'd');
      if (url.includes('/contents/roles.json')) return file(roles, 'r');
      if (url.includes('/contents/countries.json')) return file(countries, 'c');
      if (url.includes('/contents/teams.json')) return file(teams, 't');
      if (url.includes('/contents/people.json')) return file([mara, felix, carla, sofia], 'p');
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
  brand = defaultBrandPack;
  initiative = { id: 'i1', name: 'Checkout Redesign', teamId: 't1', status: 'Active' };
  members = [membership('mara', 't1'), membership('felix', 't1')];
  puts = [];
});

function renderPage() {
  return render(
    <BrandProvider brand={brand}>
      <TooltipProvider>
        <RepositoryProvider token="token">
          <InitiativeDetail id="i1" />
          <Toaster />
        </RepositoryProvider>
      </TooltipProvider>
    </BrandProvider>,
  );
}

const descriptionField = () => screen.findByRole('textbox', { name: 'Description' });
const ownerControl = () => screen.findByRole('combobox', { name: 'Owner' });
const descriptionChanges = () => puts.filter((p) => p.message.includes('description changed'));

describe('Initiative header: description (§5.4)', () => {
  it('shows the placeholder when there is no description', async () => {
    renderPage();
    expect(await descriptionField()).toHaveAttribute('placeholder', 'Add a description');
    expect(await descriptionField()).toHaveValue('');
  });

  it('saves on Enter and keeps the value shown', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await descriptionField());
    await user.type(await descriptionField(), 'New payment page with one-click checkout.{Enter}');
    await vi.waitFor(() => expect(descriptionChanges()).toHaveLength(1), { timeout: 3000 });
    expect(descriptionChanges()[0].message).toBe('Checkout Redesign: description changed');
    expect(descriptionChanges()[0].content.description).toBe('New payment page with one-click checkout.');
    expect(await descriptionField()).toHaveValue('New payment page with one-click checkout.');
  });

  it('turns a pasted line break into a space, never a newline', async () => {
    const user = userEvent.setup();
    renderPage();
    const field = await descriptionField();
    await user.click(field);
    await user.paste('Line one\nLine two');
    expect(field).toHaveValue('Line one Line two');
  });

  it('Shift+Enter does nothing: no newline, no commit', async () => {
    const user = userEvent.setup();
    renderPage();
    const field = await descriptionField();
    await user.click(field);
    await user.type(field, 'Half a thought{Shift>}{Enter}{/Shift}');
    expect(field).toHaveValue('Half a thought');
    await new Promise((resolve) => setTimeout(resolve, 1200));
    expect(descriptionChanges()).toHaveLength(0);
  });

  it('clearing and committing removes the description', async () => {
    initiative.description = 'Existing description.';
    const user = userEvent.setup();
    renderPage();
    const field = await descriptionField();
    expect(field).toHaveValue('Existing description.');
    await user.click(field);
    await user.clear(field);
    await user.keyboard('{Enter}');
    await vi.waitFor(() => expect(descriptionChanges()).toHaveLength(1), { timeout: 3000 });
    expect(descriptionChanges()[0].content.description).toBeUndefined();
    expect(await descriptionField()).toHaveAttribute('placeholder', 'Add a description');
  });
});

describe('Initiative header: owner (§5.4, §9.3)', () => {
  it('lists No owner, the team’s active members, then everyone else, each by name; inactive people are excluded', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await ownerControl());
    const options = (await screen.findAllByRole('option')).map((o) => o.textContent);
    expect(options).toEqual(['No owner', 'Felix Brandt', 'Mara Voss', 'Carla Ferrer']);
    // The group labels ("Platform", "Everyone else") aren't selectable options, but still say why the order is what it is.
    const listbox = screen.getByRole('listbox');
    expect(listbox.textContent!.indexOf('Platform')).toBeLessThan(listbox.textContent!.indexOf('Felix Brandt'));
    expect(listbox.textContent!.indexOf('Everyone else')).toBeGreaterThan(listbox.textContent!.indexOf('Mara Voss'));
    expect(listbox.textContent!.indexOf('Everyone else')).toBeLessThan(listbox.textContent!.indexOf('Carla Ferrer'));
  });

  it('choosing an owner commits and updates the trigger', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await ownerControl());
    await user.click(await screen.findByRole('option', { name: 'Mara Voss' }));
    expect(await ownerControl()).toHaveTextContent('Mara Voss');
    await vi.waitFor(() => expect(puts.some((p) => p.message.includes('owner set to'))).toBe(true), { timeout: 3000 });
    const change = puts.find((p) => p.message.includes('owner set to'))!;
    expect(change.message).toBe('Checkout Redesign: owner set to Mara Voss');
    expect(change.content.ownerId).toBe('mara');
  });

  it('choosing No owner clears the owner', async () => {
    initiative.ownerId = 'mara';
    const user = userEvent.setup();
    renderPage();
    expect(await ownerControl()).toHaveTextContent('Mara Voss');
    await user.click(await ownerControl());
    await user.click(await screen.findByRole('option', { name: 'No owner' }));
    expect(await ownerControl()).toHaveTextContent('No owner');
    await vi.waitFor(() => expect(puts.some((p) => p.message.includes('owner cleared'))).toBe(true), { timeout: 3000 });
    expect(puts.find((p) => p.message.includes('owner cleared'))!.content.ownerId).toBeUndefined();
  });

  it('shows a deactivated owner as "(inactive)" and keeps them until someone changes it, without offering them again', async () => {
    initiative.ownerId = 'sofia';
    const user = userEvent.setup();
    renderPage();
    expect(await ownerControl()).toHaveTextContent('Sofia Molina (inactive)');
    await user.click(await ownerControl());
    expect(screen.queryByRole('option', { name: /Sofia/ })).not.toBeInTheDocument();
  });
});

describe('Initiative header: approval track badge (§5.4, §7.4)', () => {
  it('reads the live track’s name, with its requirement text as the tooltip', async () => {
    initiative.phases = {
      validation: {
        startDate: '2026-09-01',
        endDate: '2026-09-30',
        allocations: [],
        costItems: [{ id: 'c1', label: 'License', amount: 120_000, timing: 'month', month: '2026-09' }],
      },
    };
    const user = userEvent.setup();
    renderPage();
    // The full track badge, letter and name (§9.10).
    const badge = await screen.findByText((_, el) => el?.textContent === 'S Standard');
    await user.hover(badge);
    expect(await screen.findByText('Requires department head approval')).toBeInTheDocument();
  });

  it('reads "No approval track", with no tooltip, when no band covers the total', async () => {
    brand = {
      ...defaultBrandPack,
      approvalTracks: [
        { id: 'light', name: 'Light', abbreviation: 'L', lowerBound: 0, upperBound: 10_000, severity: 1, requirementText: 'No additional approval required' },
        { id: 'elevated', name: 'Elevated', abbreviation: 'E', lowerBound: 20_000, severity: 2, requirementText: 'Requires steering committee approval' },
      ],
    };
    initiative.phases = {
      validation: {
        startDate: '2026-09-01',
        endDate: '2026-09-30',
        allocations: [],
        costItems: [{ id: 'c1', label: 'License', amount: 15_000, timing: 'month', month: '2026-09' }],
      },
    };
    renderPage();
    expect(await screen.findByText('No approval track')).toBeInTheDocument();
    expect(screen.queryByText('No additional approval required')).not.toBeInTheDocument();
  });
});
