import { cleanup, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { defaultBrandPack } from '../brand/defaultBrand';
import { BrandProvider } from '../state/BrandContext';
import { RepositoryProvider } from '../state/DataContext';
import { TooltipProvider } from '@/components/ui/tooltip';
import { rootListing } from '../sync/testing/rootListing';
import { SettingsPage } from './SettingsPage';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const file = (content: unknown, sha: string) => json({ content: btoa(JSON.stringify(content)), sha });

beforeAll(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      if ((init.method ?? 'GET') === 'PUT') return json({ content: { sha: 'next' } });
      if (new URL(url).pathname.endsWith('/contents/')) return rootListing();
      if (url.includes('/contents/dataset.json')) return file({ schemaVersion: 1, processIdentity: defaultBrandPack.processIdentity, ratesReviewed: true }, 'd');
      if (url.includes('/contents/roles.json')) return file([], 'r');
      if (url.includes('/contents/countries.json')) return file([], 'c');
      if (url.includes('/contents/teams.json')) return file([], 't');
      if (url.includes('/contents/people.json')) return file([], 'p');
      if (url.includes('/contents/memberships.json')) return file([], 'm');
      if (url.includes('/contents/initiatives')) return json({ message: 'Not Found' }, 404);
      return json({ message: 'Not Found' }, 404);
    }),
  );
});
afterAll(() => vi.unstubAllGlobals());
afterEach(cleanup);

function renderSettings(section: string) {
  return render(
    <BrandProvider brand={defaultBrandPack}>
      <TooltipProvider>
        <RepositoryProvider token="token">
          <SettingsPage section={section} />
        </RepositoryProvider>
      </TooltipProvider>
    </BrandProvider>,
  );
}

describe('SettingsPage section list (§5.9)', () => {
  it('lists only the built sections, Roles, and marks it current', async () => {
    renderSettings('roles');
    expect(await screen.findByRole('heading', { name: 'Roles', level: 2 })).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'Roles' });
    expect(link).toHaveAttribute('aria-current', 'page');
    expect(screen.getAllByRole('link')).toHaveLength(1);
  });

  it('an unknown section in the URL shows Roles', async () => {
    renderSettings('countries');
    expect(await screen.findByRole('heading', { name: 'Roles', level: 2 })).toBeInTheDocument();
  });
});
