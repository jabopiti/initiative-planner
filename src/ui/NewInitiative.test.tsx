import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultBrandPack } from '../brand/defaultBrand';
import { buildBaselineDataset } from '../data/baseline';
import { BrandProvider } from '../state/BrandContext';
import { RepositoryProvider } from '../state/DataContext';
import { TooltipProvider } from '@/components/ui/tooltip';
import { NewInitiativeControl } from './NewInitiativeControl';
import { NewInitiativeDraft } from './NewInitiativeDraft';
import { PortfolioBoard } from './PortfolioBoard';

const baseline = buildBaselineDataset(defaultBrandPack);
const ONE_TEAM = [{ id: 't1', name: 'Payments', active: true }];
const TWO_TEAMS = [
  { id: 't1', name: 'Payments', active: true },
  { id: 't2', name: 'Platform', active: true },
];

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const file = (content: unknown, sha: string) => json({ content: btoa(JSON.stringify(content)), sha });

let teams = ONE_TEAM;
let puts: { url: string; body: { message: string; content: string } }[] = [];

beforeAll(() => {
  // Radix Select needs these pointer/scroll APIs, which jsdom lacks.
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.scrollIntoView = () => {};
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      if ((init.method ?? 'GET') === 'PUT') {
        puts.push({ url, body: JSON.parse(String(init.body)) });
        return json({ content: { sha: 'next' } });
      }
      if (url.includes('/contents/dataset.json')) return file(baseline.datasetFlags, 'd');
      if (url.includes('/contents/roles.json')) return file(baseline.roles, 'r');
      if (url.includes('/contents/countries.json')) return file(baseline.countries, 'c');
      if (url.includes('/contents/teams.json')) return file(teams, 't');
      if (url.includes('/contents/people.json')) return file([], 'p');
      if (url.includes('/contents/memberships.json')) return file([], 'm');
      return json({ message: 'Not Found' }, 404);
    }),
  );
});
afterAll(() => vi.unstubAllGlobals());
afterEach(cleanup);
beforeEach(() => {
  teams = ONE_TEAM;
  puts = [];
  localStorage.clear();
  window.location.hash = '';
});

function renderWith(ui: React.ReactNode) {
  return render(
    <BrandProvider brand={defaultBrandPack}>
      <TooltipProvider>
        <RepositoryProvider token="token">{ui}</RepositoryProvider>
      </TooltipProvider>
    </BrandProvider>,
  );
}

const initiativePuts = () => puts.filter((p) => p.url.includes('/initiatives/'));
const nameField = () => screen.findByPlaceholderText('Name this initiative');

describe('New initiative: name it on the page (§5.1, §5.4)', () => {
  it('the top-bar button and the Portfolio empty state both open the draft page', async () => {
    const user = userEvent.setup();
    const bar = renderWith(<NewInitiativeControl />);
    const button = await screen.findByRole('button', { name: 'New initiative' });
    await vi.waitFor(() => expect(button).toBeEnabled()); // teams have loaded
    await user.click(button);
    expect(window.location.hash).toBe('#/initiatives/new');
    bar.unmount();

    window.location.hash = '';
    renderWith(<PortfolioBoard />);
    await user.click(await screen.findByRole('button', { name: 'Create your first initiative' }));
    expect(window.location.hash).toBe('#/initiatives/new');
  });

  it('opens with the name field focused, a Draft chip, and the only active team chosen', async () => {
    renderWith(<NewInitiativeDraft />);
    expect(await nameField()).toHaveFocus();
    expect(screen.getByText('Draft')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Team' })).toHaveTextContent('Payments');
  });

  it('Enter saves the initiative as its own file and opens its page in place of the draft', async () => {
    const user = userEvent.setup();
    renderWith(<NewInitiativeDraft />);
    await user.type(await nameField(), 'Payments API v2{Enter}');

    await vi.waitFor(() => expect(initiativePuts()).toHaveLength(1));
    const saved = JSON.parse(atob(initiativePuts()[0].body.content));
    expect(saved).toMatchObject({ name: 'Payments API v2', teamId: 't1', status: 'Active' });
    expect(window.location.hash).toBe(`#/initiatives/${saved.id}`);
  });

  it('leaving the name field with a name typed saves too', async () => {
    const user = userEvent.setup();
    renderWith(<NewInitiativeDraft />);
    await user.type(await nameField(), 'Loyalty pilot');
    await user.tab();
    await user.click(document.body);
    await vi.waitFor(() => expect(initiativePuts()).toHaveLength(1));
  });

  it('saves nothing while the name is empty', async () => {
    const user = userEvent.setup();
    renderWith(<NewInitiativeDraft />);
    await user.type(await nameField(), '   {Enter}');
    await user.click(document.body);
    expect(initiativePuts()).toHaveLength(0);
    expect(window.location.hash).not.toMatch(/^#\/initiatives\/(?!new)/);
  });

  it('Esc discards the draft and returns to the Portfolio', async () => {
    const user = userEvent.setup();
    renderWith(<NewInitiativeDraft />);
    await user.type(await nameField(), 'Never mind{Escape}');
    expect(window.location.hash).toBe('#/portfolio');
    expect(initiativePuts()).toHaveLength(0);
  });

  it('with several teams and none used before, asks for a team and saves once one is chosen', async () => {
    const user = userEvent.setup();
    teams = TWO_TEAMS;
    renderWith(<NewInitiativeDraft />);
    const field = await nameField();
    expect(screen.getByRole('combobox', { name: 'Team' })).toHaveTextContent('Choose team');

    await user.type(field, 'Data lake{Enter}');
    expect(initiativePuts()).toHaveLength(0);

    await user.click(screen.getByRole('combobox', { name: 'Team' }));
    await user.click(await screen.findByRole('option', { name: 'Platform' }));
    await vi.waitFor(() => expect(initiativePuts()).toHaveLength(1));
    expect(JSON.parse(atob(initiativePuts()[0].body.content))).toMatchObject({ name: 'Data lake', teamId: 't2' });
  });

  it('defaults to the team used last, and changing the team before saving is respected', async () => {
    const user = userEvent.setup();
    teams = TWO_TEAMS;
    localStorage.setItem('initiative-planner/last-used-team', 't2');
    renderWith(<NewInitiativeDraft />);
    const field = await nameField();
    expect(screen.getByRole('combobox', { name: 'Team' })).toHaveTextContent('Platform');

    await user.type(field, 'Checkout redo');
    await user.click(screen.getByRole('combobox', { name: 'Team' }));
    await user.click(await screen.findByRole('option', { name: 'Payments' }));
    await vi.waitFor(() => expect(initiativePuts()).toHaveLength(1));
    expect(JSON.parse(atob(initiativePuts()[0].body.content))).toMatchObject({ teamId: 't1' });
    expect(localStorage.getItem('initiative-planner/last-used-team')).toBe('t1');
  });
});
