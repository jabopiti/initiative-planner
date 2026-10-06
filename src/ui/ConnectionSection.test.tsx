import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultBrandPack } from '../brand/defaultBrand';
import { BrandProvider } from '../state/BrandContext';
import { RepositoryContext } from '../state/DataContext';
import { SessionContext, type Session } from '../state/SessionContext';
import type { Repository } from '../sync/Repository';
import { fakeGithub, open, type Fake } from '../sync/testing/fakeGithub';
import { ConnectionSection } from './ConnectionSection';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderConnection(repo: Repository, session: Partial<Session> = {}) {
  const value: Session = { login: 'jmustermann', rememberLogin: vi.fn(), classicWarning: false, setClassicWarning: vi.fn(), disconnect: vi.fn(), ...session };
  render(
    <BrandProvider brand={defaultBrandPack}>
      <SessionContext.Provider value={value}>
        <RepositoryContext.Provider value={repo}>
          <ConnectionSection />
        </RepositoryContext.Provider>
      </SessionContext.Provider>
    </BrandProvider>,
  );
  return value;
}

/** Every response now carries GitHub's rate-limit headers. */
function withRateLimit(fake: Fake, remaining: number, limit: number, reset: number) {
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    const response = await fake.fetchMock(url, init);
    const headers = new Headers(response.headers);
    headers.set('x-ratelimit-remaining', String(remaining));
    headers.set('x-ratelimit-limit', String(limit));
    headers.set('x-ratelimit-reset', String(reset));
    return new Response(response.status === 304 ? null : await response.text(), { status: response.status, headers });
  });
}

describe('Settings → Connection (§5.9)', () => {
  it('shows the user, the repository and its data branch', async () => {
    const { repo } = await open(fakeGithub());
    renderConnection(repo);
    expect(screen.getByText('jmustermann')).toBeInTheDocument();
    expect(screen.getByText('jabopiti/initiative-planner (data)')).toBeInTheDocument();
  });

  it('reads the remaining requests off the latest response, without a request of its own', async () => {
    const fake = fakeGithub();
    const { repo } = await open(fake);
    renderConnection(repo);
    expect(screen.getByText('Not known yet')).toBeInTheDocument();

    withRateLimit(fake, 4812, 5000, 1_700_000_000);
    repo.retryAll();

    expect(await screen.findByText(/^4,812 of 5,000 API requests left this hour, resets at \d\d:\d\d$/)).toBeInTheDocument();
    expect(fake.requests().filter((r) => r === 'GET /user')).toHaveLength(0);
  });

  it('shows the saves this browser made this hour against the line where saving slows (slice 064)', async () => {
    const fake = fakeGithub();
    const { repo } = await open(fake);
    renderConnection(repo);
    expect(screen.getByText('0 of 400 from this browser; saving slows down above that')).toBeInTheDocument();

    repo.createTeam('Platform');
    await repo.flushPending();

    expect(await screen.findByText('1 of 400 from this browser; saving slows down above that')).toBeInTheDocument();
    expect(screen.getByText('Saves this hour')).toBeInTheDocument();
  });

  it('fetches the user once when the session never recorded it', async () => {
    const fake = fakeGithub();
    const { repo } = await open(fake);
    const session = renderConnection(repo, { login: null });
    await vi.waitFor(() => expect(session.rememberLogin).toHaveBeenCalledWith('jmustermann'));
    expect(fake.requests().filter((r) => r === 'GET /user')).toHaveLength(1);
  });

  it('disconnects in one click with nothing unsaved', async () => {
    const user = userEvent.setup();
    const { repo } = await open(fakeGithub());
    const session = renderConnection(repo);
    await user.click(screen.getByRole('button', { name: 'Disconnect' }));
    expect(session.disconnect).toHaveBeenCalledOnce();
  });

  it('sends a pending edit first and then disconnects in one click, with nothing to discard (slice 064)', async () => {
    const user = userEvent.setup();
    const fake = fakeGithub();
    const { repo } = await open(fake);
    repo.createTeam('Platform'); // waiting in its commit window
    const session = renderConnection(repo);

    await user.click(screen.getByRole('button', { name: 'Disconnect' }));

    await vi.waitFor(() => expect(session.disconnect).toHaveBeenCalledOnce());
    expect(fake.commits('teams.json')).toHaveLength(1);
  });

  it('asks first, naming the count, when edits are unsaved, and Cancel keeps everything', async () => {
    const user = userEvent.setup();
    const fake = fakeGithub();
    const { repo } = await open(fake);
    fake.fail('teams.json', 500);
    repo.createTeam('Platform');
    await repo.flushPending();
    const session = renderConnection(repo);

    await user.click(screen.getByRole('button', { name: 'Disconnect' }));
    expect(session.disconnect).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /^Disconnect and discard \d+ unsaved changes?$/ })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: 'Disconnect' })).toBeInTheDocument();
    expect(session.disconnect).not.toHaveBeenCalled();
  });

  it('disconnects once the discard is confirmed', async () => {
    const user = userEvent.setup();
    const fake = fakeGithub();
    const { repo } = await open(fake);
    fake.fail('teams.json', 500);
    repo.createTeam('Platform');
    await repo.flushPending();
    const session = renderConnection(repo);

    await user.click(screen.getByRole('button', { name: 'Disconnect' }));
    await user.click(screen.getByRole('button', { name: /^Disconnect and discard/ }));
    expect(session.disconnect).toHaveBeenCalledOnce();
  });

  it('offers the token field to replace the token in place', async () => {
    const { repo } = await open(fakeGithub());
    renderConnection(repo);
    expect(screen.getByLabelText('New GitHub token')).toBeInTheDocument();
  });
});
