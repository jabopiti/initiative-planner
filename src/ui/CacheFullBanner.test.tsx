import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FileCache } from '../cache/db';
import { RepositoryContext } from '../state/DataContext';
import type { Repository } from '../sync/Repository';
import { fakeGithub, open } from '../sync/testing/fakeGithub';
import { CacheFullBanner } from './CacheFullBanner';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const quotaError = () => new DOMException('The quota has been exceeded.', 'QuotaExceededError');

function renderBanner(repo: Repository) {
  render(
    <RepositoryContext.Provider value={repo}>
      <CacheFullBanner />
    </RepositoryContext.Provider>,
  );
}

describe('Full-storage banner (§3 Storage limits)', () => {
  it('shows nothing while the cache keeps writing', async () => {
    const { repo } = await open(fakeGithub());
    renderBanner(repo);

    expect(screen.queryByRole('status')).toBeNull();
  });

  it('says so, keeps the edit saved and sync normal, when the cache write hits the quota after a push', async () => {
    const { repo } = await open(fakeGithub());
    vi.spyOn(FileCache.prototype, 'set').mockRejectedValue(quotaError());
    repo.createTeam('Platform');
    await repo.flushPending();
    renderBanner(repo);

    expect((await screen.findByRole('status')).textContent).toContain(
      "Browser storage is full. Your changes are saved in GitHub, but this browser can't keep a local copy, so the next open loads everything again.",
    );
    expect(repo.getState().readOnly).toBeNull();
    expect(repo.unsavedChangeCount()).toBe(0);
  });

  it('shows nothing for a cache failure that is not a full store', async () => {
    const { repo } = await open(fakeGithub());
    vi.spyOn(FileCache.prototype, 'set').mockRejectedValue(new Error('IndexedDB unavailable'));
    repo.createTeam('Platform');
    await repo.flushPending();
    renderBanner(repo);

    expect(screen.queryByRole('status')).toBeNull();
  });

  it('is dismissed with Dismiss and does not come back this session', async () => {
    const user = userEvent.setup();
    const { repo } = await open(fakeGithub());
    vi.spyOn(FileCache.prototype, 'set').mockRejectedValue(quotaError());
    repo.createTeam('Platform');
    await repo.flushPending();
    renderBanner(repo);

    await user.click(await screen.findByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('status')).toBeNull();

    repo.createTeam('Design');
    await repo.flushPending();
    expect(screen.queryByRole('status')).toBeNull();
  });
});

describe('Closing the tab with unsaved work (§10.3)', () => {
  it('has unsaved work while an edit waits for its save, and none once it is saved', async () => {
    const { repo } = await open(fakeGithub());
    expect(repo.hasUnsavedWork()).toBe(false);

    repo.createTeam('Platform');
    expect(repo.hasUnsavedWork()).toBe(true);

    await repo.flushPending();
    expect(repo.hasUnsavedWork()).toBe(false);
  });
});
