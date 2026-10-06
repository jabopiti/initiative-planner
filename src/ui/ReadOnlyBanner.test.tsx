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
    fake.fail('teams.json', 503);
    repo.createTeam('Platform');
    await repo.flushPending();
    renderBanner(repo);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Cannot reach GitHub; changes are paused.');
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('while GitHub limits requests, says when saving resumes and offers no Retry until then (slice 064)', async () => {
    const fake = fakeGithub();
    const { repo } = await open(fake);
    fake.fail('teams.json', 403, { headers: { 'retry-after': '60' }, message: 'You have exceeded a secondary rate limit.' });
    repo.createTeam('Platform');
    await repo.flushPending();
    renderBanner(repo);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/^GitHub is limiting requests\. Saving resumes by itself at \d\d:\d\d\.$/);
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
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

  describe('access denied (§3 Sync failures)', () => {
    async function denied(behaviour?: 'invalid' | 'read-only' | 'cannot-see') {
      const fake = fakeGithub();
      const { repo } = await open(fake);
      if (behaviour) fake.setTokenBehaviour('token', behaviour);
      fake.fail('teams.json', 401);
      repo.createTeam('Platform');
      await repo.flushPending();
      renderBanner(repo);
      return { fake, repo };
    }

    it('says the token expired or was revoked, with the field, Create a new token and no Retry', async () => {
      await denied('invalid');

      expect(await screen.findByText(/GitHub doesn't accept this token\. It has probably expired or been revoked, or part of it is missing from the paste\./)).toBeInTheDocument();
      expect(screen.getByLabelText('New GitHub token')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Replace' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /Create a new token/ })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
    });

    it('says a read-only token cannot write, and keeps Retry and a link to edit it', async () => {
      await denied('read-only');

      expect(await screen.findByText('This token can read but not write. Set Contents to Read and write.')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /Edit this token in GitHub/ })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    });

    it('says a token cannot see the repository', async () => {
      await denied('cannot-see');

      expect(await screen.findByText(/This token can't see/)).toBeInTheDocument();
    });

    it('falls back to GitHub\'s message with Retry when the check finds nothing wrong but the save is refused again', async () => {
      const { fake } = await denied();
      fake.fail('teams.json', 401); // the resend the check triggers is refused as well

      expect(await screen.findByText('GitHub refused access with this token')).toBeInTheDocument();
      expect(screen.queryByText('Checking your token…')).toBeNull();
      expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    });

    it('resends rather than blaming the token when the check itself is rate limited (slice 043)', async () => {
      const fake = fakeGithub();
      const { repo } = await open(fake);
      fake.fail('teams.json', 403);
      repo.createTeam('Platform');
      await repo.flushPending();
      vi.stubGlobal('fetch', (url: string, init?: RequestInit) =>
        new URL(url).pathname === '/user'
          ? Promise.resolve(new Response(JSON.stringify({ message: 'You have exceeded a secondary rate limit.' }), { status: 403 }))
          : fake.fetchMock(url, init),
      );
      renderBanner(repo);

      await vi.waitFor(() => expect(fake.commits('teams.json')).toHaveLength(1));
      await vi.waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
      expect(screen.queryByText(/limiting requests/)).toBeNull();
    });

    it('shows the four steps behind Show steps', async () => {
      await denied('invalid');
      await screen.findByText(/expired or been revoked/);

      expect(screen.getByText('Show steps')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Copy jabopiti/initiative-planner' })).toBeInTheDocument();
    });

    it('checks a pasted token at once, swaps it in, keeps the edit and clears the banner', async () => {
      const user = userEvent.setup();
      const { fake, repo } = await denied('invalid');
      await screen.findByText(/expired or been revoked/);

      await user.click(screen.getByLabelText('New GitHub token'));
      await user.paste('github_pat_new');

      await vi.waitFor(() => expect(screen.queryByLabelText('New GitHub token')).toBeNull());
      expect(fake.commits('teams.json')).toHaveLength(1);
      expect(fake.commits('teams.json')[0].content).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'Platform' })]));
      expect(repo.getState().readOnly).toBeNull();
    });

    it('shows §5.10\'s message under the field for a pasted token that fails, and stays read-only', async () => {
      const user = userEvent.setup();
      const { fake, repo } = await denied('invalid');
      fake.setTokenBehaviour('github_pat_ro', 'read-only');
      await screen.findByText(/expired or been revoked/);

      await user.click(screen.getByLabelText('New GitHub token'));
      await user.paste('github_pat_ro');

      expect(await screen.findByText('This token can read but not write. Set Contents to Read and write.')).toBeInTheDocument();
      expect(repo.getState().readOnly?.cause).toBe('access-denied');
    });

    it('checks a typed token on Replace, not before', async () => {
      const user = userEvent.setup();
      const { fake } = await denied('invalid');
      await screen.findByText(/expired or been revoked/);
      const before = fake.requests().filter((r) => r === 'GET /user').length;

      await user.type(screen.getByLabelText('New GitHub token'), 'github_pat_typed');
      expect(fake.requests().filter((r) => r === 'GET /user')).toHaveLength(before);

      await user.click(screen.getByRole('button', { name: 'Replace' }));
      // The token's own check, and the banner's fresh diagnosis of the new token if the save is refused again.
      await vi.waitFor(() => expect(fake.requests().filter((r) => r === 'GET /user').length).toBeGreaterThan(before));
    });
  });

  it('names the damaged file and links the data branch\'s commit history (§3 Damaged data)', async () => {
    const fake = fakeGithub();
    const { repo } = await open(fake);
    fake.seed('people.json', {});
    await repo.pull();
    renderBanner(repo);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Dataset damaged: people.json: should be a list. Ask the repository owner to restore an earlier version from the commit history. Open commit history',
    );
    expect(screen.getByRole('link', { name: /^Open commit history/ })).toHaveAttribute(
      'href',
      `https://github.com/${defaultBrandPack.github.owner}/${defaultBrandPack.github.repo}/commits/${defaultBrandPack.github.dataBranch}`,
    );
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('shows no history link for other causes', async () => {
    const fake = fakeGithub();
    const { repo } = await open(fake);
    fake.fail('teams.json', 429);
    repo.createTeam('Platform');
    await repo.flushPending();
    renderBanner(repo);

    await screen.findByRole('alert');
    expect(screen.queryByRole('link', { name: /Open commit history/ })).toBeNull();
  });
});
