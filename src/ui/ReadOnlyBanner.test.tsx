import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultBrandPack } from '../brand/defaultBrand';
import { BrandProvider } from '../state/BrandContext';
import { RepositoryContext } from '../state/DataContext';
import type { Repository } from '../sync/Repository';
import { fakeGithub, open } from '../sync/testing/fakeGithub';
import { ReadOnlyBanner } from './ReadOnlyBanner';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderBanner(repo: Repository) {
  render(
    <BrandProvider brand={defaultBrandPack}>
      <RepositoryContext.Provider value={repo}>
        <ReadOnlyBanner />
      </RepositoryContext.Provider>
    </BrandProvider>,
  );
}

describe('Read-only banner (§3, §9.9)', () => {
  it('shows nothing while sync is fine', async () => {
    const fake = fakeGithub();
    const { repo } = await open(fake);
    renderBanner(repo);

    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('names the cause and offers Retry once a write fails', async () => {
    const fake = fakeGithub();
    const { repo } = await open(fake);
    fake.fail('teams.json', 403);
    repo.createTeam('Platform');
    await repo.flushPending();
    renderBanner(repo);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('The token is missing, expired, revoked or lacks write permission');
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('Retry resends the pull and every failed file, and the banner clears once it lands', async () => {
    const user = userEvent.setup();
    const fake = fakeGithub();
    const { repo } = await open(fake);
    fake.fail('teams.json', 500);
    repo.createTeam('Platform');
    await repo.flushPending();
    renderBanner(repo);
    await screen.findByRole('alert');

    await user.click(screen.getByRole('button', { name: 'Retry' }));

    await vi.waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(fake.commits('teams.json')).toHaveLength(1);
  });
});
