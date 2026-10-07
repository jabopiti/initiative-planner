import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { defaultBrandPack } from '../brand/defaultBrand';
import { buildBaselineDataset } from '../data/baseline';
import { BrandProvider } from '../state/BrandContext';
import { RepositoryProvider } from '../state/DataContext';
import { TooltipProvider } from '@/components/ui/tooltip';
import { PeopleOverview } from './PeopleOverview';
import { TeamDetail } from './TeamDetail';
import { rootListing } from '../sync/testing/rootListing';
import { contentsBacked } from '../sync/testing/contentsBacked';

const baseline = buildBaselineDataset(defaultBrandPack);
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const file = (content: unknown, sha: string) => json({ content: btoa(JSON.stringify(content)), sha });
const puts: string[] = [];

beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.scrollIntoView = () => {};
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal(
    'fetch',
    contentsBacked(vi.fn(async (url: string, init: RequestInit = {}) => {
      if ((init.method ?? 'GET') === 'PUT') {
        puts.push(url);
        return json({ content: { sha: 'next' } });
      }
      if (new URL(url).pathname.endsWith('/contents/')) return rootListing();
      if (url.includes('/contents/dataset.json')) return file(baseline.datasetFlags, 'd');
      if (url.includes('/contents/roles.json')) return file([], 'r');
      if (url.includes('/contents/countries.json')) return file([], 'c');
      if (url.includes('/contents/teams.json')) return file([{ id: 't1', name: 'Payments', active: true }], 't');
      if (url.includes('/contents/people.json')) return file([], 'p');
      if (url.includes('/contents/memberships.json')) return file([], 'm');
      return json({ message: 'Not Found' }, 404);
    })),
  );
});
afterAll(() => vi.unstubAllGlobals());
afterEach(cleanup);

const wrap = (view: React.ReactNode) => (
  <BrandProvider brand={defaultBrandPack}>
    <TooltipProvider>
      <RepositoryProvider token="token">{view}</RepositoryProvider>
    </TooltipProvider>
  </BrandProvider>
);

describe('adding a person with no active country or role (slice 054, §9.4)', () => {
  it('disables Add person and links to Settings on the People overview', async () => {
    const user = userEvent.setup();
    render(wrap(<PeopleOverview />));
    await user.type(await screen.findByRole('textbox', { name: 'Name' }), 'Mira Kovac');
    expect(screen.getByRole('button', { name: 'Add person' })).toBeDisabled();
    expect(screen.getByText(/before adding people\./)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '#/settings');
  });

  it('offers no Create option on the team page, and says why', async () => {
    const user = userEvent.setup();
    render(wrap(<TeamDetail id="t1" />));
    await user.type(await screen.findByRole('combobox', { name: 'Add member' }), 'Mira Kovac');
    expect(screen.queryByRole('option', { name: /Create/ })).not.toBeInTheDocument();
    expect(screen.getByText(/before creating people\./)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '#/settings');
  });
});
