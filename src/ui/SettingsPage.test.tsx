import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { defaultBrandPack } from '@brand';
import { BrandProvider } from '../state/BrandContext';
import { RepositoryProvider } from '../state/DataContext';
import { TooltipProvider } from '@/components/ui/tooltip';
import { SettingsPage } from './SettingsPage';
import { fakeOnDemand, seedFiles } from '../sync/testing/fakeGithub';

fakeOnDemand((fake) => seedFiles(fake, { ratesReviewed: true, roles: [], countries: [] }));

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
