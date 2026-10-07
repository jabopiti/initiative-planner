import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { defaultBrandPack } from '../brand/defaultBrand';
import { BrandProvider } from '../state/BrandContext';
import { RepositoryProvider } from '../state/DataContext';
import { TooltipProvider } from '@/components/ui/tooltip';
import { rootListing } from '../sync/testing/rootListing';
import { SettingsPage } from './SettingsPage';
import { contentsBacked } from '../sync/testing/contentsBacked';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const file = (content: unknown, sha: string) => json({ content: btoa(JSON.stringify(content)), sha });

beforeAll(() => {
  vi.stubGlobal(
    'fetch',
    contentsBacked(vi.fn(async (url: string, init: RequestInit = {}) => {
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
    })),
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
  it('lists the built sections in order and marks the current one', async () => {
    renderSettings('roles');
    expect(await screen.findByRole('heading', { name: 'Roles', level: 2 })).toBeInTheDocument();
    expect(screen.getAllByRole('link').map((l) => l.textContent)).toEqual(['Roles', 'Countries & rates', 'Process', 'Connection', 'About', 'Danger zone']);
    expect(screen.getByRole('link', { name: 'Roles' })).toHaveAttribute('aria-current', 'page');
  });

  it('shows Process and About without a lock toggle', async () => {
    renderSettings('process');
    expect(await screen.findByRole('heading', { name: 'Process', level: 2 })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /unlock/i })).toBeNull();
    cleanup();
    renderSettings('about');
    expect(await screen.findByRole('heading', { name: 'About', level: 2 })).toBeInTheDocument();
  });

  it('an unknown section in the URL shows Roles', async () => {
    renderSettings('no-such-section');
    expect(await screen.findByRole('heading', { name: 'Roles', level: 2 })).toBeInTheDocument();
  });
});

describe('Leaving Settings re-locks a section (§2)', () => {
  it('unlocking, then unmounting and remounting Settings, starts locked again', async () => {
    const user = userEvent.setup();
    const { unmount } = renderSettings('roles');
    await screen.findByRole('heading', { name: 'Roles', level: 2 });

    await user.click(screen.getByRole('button', { name: 'Unlock to edit' }));
    expect(screen.getByRole('button', { name: 'Lock' })).toBeInTheDocument();

    unmount(); // leaving Settings entirely
    renderSettings('roles'); // coming back
    expect(await screen.findByRole('button', { name: 'Unlock to edit' })).toBeInTheDocument();
  });
});
