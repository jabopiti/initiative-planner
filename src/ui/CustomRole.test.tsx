import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { defaultBrandPack } from '../brand/defaultBrand';
import { buildBaselineDataset } from '../data/baseline';
import { trackedYears } from '../data/cost';
import { BrandProvider } from '../state/BrandContext';
import { RepositoryProvider } from '../state/DataContext';
import { TooltipProvider } from '@/components/ui/tooltip';
import { PeopleOverview } from './PeopleOverview';

const baseline = buildBaselineDataset(defaultBrandPack);
const standardRole = baseline.roles[0].name;
const [thisYear, nextYear] = trackedYears();
const cai = {
  id: 'p1',
  name: 'Cai Wu',
  roleId: baseline.roles[0].id,
  countryId: baseline.countries[0].id,
  capacityPct: 100,
  active: true,
};

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
const file = (content: unknown) => json({ content: btoa(JSON.stringify(content)), sha: 's' });
const puts: { url: string; body: unknown }[] = [];

beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.scrollIntoView = () => {};
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      if ((init.method ?? 'GET') === 'PUT') {
        puts.push({ url, body: JSON.parse(init.body as string) });
        return json({ content: { sha: 'next' } });
      }
      if (url.includes('/contents/dataset.json')) return file(baseline.datasetFlags);
      if (url.includes('/contents/roles.json')) return file(baseline.roles);
      if (url.includes('/contents/countries.json')) return file(baseline.countries);
      if (url.includes('/contents/teams.json')) return file([]);
      if (url.includes('/contents/people.json')) return file([cai]);
      if (url.includes('/contents/memberships.json')) return file([]);
      return new Response('{}', { status: 404 });
    }),
  );
});
afterAll(() => vi.unstubAllGlobals());
afterEach(cleanup);

async function openPanel() {
  const user = userEvent.setup();
  render(
    <BrandProvider brand={defaultBrandPack}>
      <TooltipProvider>
        <RepositoryProvider token="token">
          <PeopleOverview />
        </RepositoryProvider>
      </TooltipProvider>
    </BrandProvider>,
  );
  await user.click(await screen.findByRole('button', { name: 'Cai Wu' }));
  const panel = await screen.findByRole('dialog', { name: 'Cai Wu' });
  return { user, panel };
}

const roleCell = () => within(screen.getByRole('row', { name: /Cai Wu/, hidden: true }));

describe('custom role in the person panel (slice 005b)', () => {
  it('offers Standard and Custom role, and starts a custom role with a factor of 1 and a no-rate warning', async () => {
    const { user, panel } = await openPanel();
    expect(within(panel).getByRole('combobox', { name: 'Role' })).toHaveTextContent(standardRole);

    await user.click(within(panel).getByRole('radio', { name: 'Custom role' }));
    expect(within(panel).queryByRole('combobox', { name: 'Role' })).not.toBeInTheDocument();
    expect(within(panel).getByRole('textbox', { name: 'Custom role label' })).toHaveValue('');
    expect(within(panel).getByRole('spinbutton', { name: 'Cost factor' })).toHaveValue(1);
    expect(within(panel).getByRole('status')).toHaveTextContent('No rate yet. Costed at 0.');
    // An empty label is allowed; tables then say "Custom role".
    expect(roleCell().getByText('Custom role')).toBeInTheDocument();
  });

  it('commits a field on blur or Enter, not on each keystroke, and shows the label as the role', async () => {
    const { user, panel } = await openPanel();
    await user.click(within(panel).getByRole('radio', { name: 'Custom role' }));

    const label = within(panel).getByRole('textbox', { name: 'Custom role label' });
    await user.type(label, 'Fractional CTO');
    expect(roleCell().queryByText('Fractional CTO')).not.toBeInTheDocument();
    await user.keyboard('{Enter}');
    expect(roleCell().getByText('Fractional CTO')).toBeInTheDocument();

    const name = within(panel).getByRole('textbox', { name: 'Name' });
    await user.type(name, ' Jr');
    expect(screen.getByRole('button', { name: 'Cai Wu', hidden: true })).toBeInTheDocument();
    await user.tab();
    expect(await screen.findByRole('button', { name: 'Cai Wu Jr', hidden: true })).toBeInTheDocument();
  });

  it('says which years take another year’s rate, and clearing a rate is not zero', async () => {
    const { user, panel } = await openPanel();
    await user.click(within(panel).getByRole('radio', { name: 'Custom role' }));

    const current = within(panel).getByRole('spinbutton', { name: `Day rate ${thisYear}` });
    await user.type(current, '1200');
    await user.keyboard('{Enter}');
    expect(within(panel).queryByText('No rate yet. Costed at 0.')).not.toBeInTheDocument();
    const hints = () => within(panel).queryAllByText(`uses ${thisYear}`, { selector: 'span' });
    expect(hints()).toHaveLength(2); // the next two years both take the current year's rate
    expect(within(panel).getByRole('spinbutton', { name: `Day rate ${nextYear}` })).toHaveAttribute('placeholder', '1200');

    // An explicit zero is a rate of its own; clearing the field goes back to inheriting.
    const next = within(panel).getByRole('spinbutton', { name: `Day rate ${nextYear}` });
    await user.type(next, '0');
    await user.tab();
    expect(hints()).toHaveLength(0);
    // The year after takes the nearest earlier entered year, which is now the zero.
    expect(within(panel).getByText(`uses ${nextYear}`, { selector: 'span' })).toBeInTheDocument();
    await user.clear(next);
    await user.tab();
    expect(hints()).toHaveLength(2);
  });

  it('keeps the custom entries when switching back to the standard role', async () => {
    const { user, panel } = await openPanel();
    await user.click(within(panel).getByRole('radio', { name: 'Custom role' }));
    await user.type(within(panel).getByRole('textbox', { name: 'Custom role label' }), 'Fractional CTO');
    await user.type(within(panel).getByRole('spinbutton', { name: `Day rate ${thisYear}` }), '900');
    await user.tab();

    await user.click(within(panel).getByRole('radio', { name: 'Standard role' }));
    expect(within(panel).getByRole('combobox', { name: 'Role' })).toHaveTextContent(standardRole);
    expect(roleCell().getByText(standardRole)).toBeInTheDocument();

    await user.click(within(panel).getByRole('radio', { name: 'Custom role' }));
    expect(within(panel).getByRole('textbox', { name: 'Custom role label' })).toHaveValue('Fractional CTO');
    expect(within(panel).getByRole('spinbutton', { name: `Day rate ${thisYear}` })).toHaveValue(900);
  });

  it('rejects a negative or unreadable rate and puts the last value back', async () => {
    const { user, panel } = await openPanel();
    await user.click(within(panel).getByRole('radio', { name: 'Custom role' }));
    const current = within(panel).getByRole('spinbutton', { name: `Day rate ${thisYear}` });
    await user.type(current, '800');
    await user.tab();
    await user.clear(current);
    await user.type(current, '-5');
    await user.tab();
    expect(current).toHaveValue(800);
  });
});
