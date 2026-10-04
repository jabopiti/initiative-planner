import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App, screenFor } from './App';
import { tokenStore } from './auth/tokenStore';
import { defaultBrandPack } from './brand/defaultBrand';
import { buildBaselineDataset } from './data/baseline';
import { fakeGithub, seedDataset, type Fake, type TokenBehaviour } from './sync/testing/fakeGithub';

/** Slice 049: the §5.10 outcomes through the real app, not a stubbed Connect screen. */

const repo = `${defaultBrandPack.github.owner}/${defaultBrandPack.github.repo}`;
const baseline = buildBaselineDataset(defaultBrandPack);
let fake: Fake;

beforeEach(async () => {
  fake = fakeGithub();
  seedDataset(fake);
  fake.seed('roles.json', baseline.roles);
  fake.seed('countries.json', baseline.countries);
  await tokenStore.clear();
});
afterEach(async () => {
  cleanup();
  vi.unstubAllGlobals();
  await tokenStore.clear();
});

async function connectWith(behaviour: TokenBehaviour | null, how: 'paste' | 'submit' = 'submit') {
  if (behaviour) fake.setTokenBehaviour('t-token', behaviour);
  const user = userEvent.setup();
  render(<App />);
  const field = await screen.findByLabelText('GitHub token');
  if (how === 'paste') {
    await user.click(field);
    await user.paste('t-token');
  } else {
    await user.type(field, 't-token');
    await user.click(screen.getByRole('button', { name: 'Connect' }));
  }
}

describe('App — Connect outcomes (§5.10)', () => {
  it.each<[TokenBehaviour, string]>([
    ['cannot-see', `This token can't see ${repo}. Create it with access to that repository.`],
    ['read-only', 'This token can read but not write. Set Contents to Read and write.'],
    ['pending-approval', 'Your GitHub organisation needs to approve this token first. Ask your GitHub owner.'],
  ])('%s: shows its message and the app stays closed', async (behaviour, message) => {
    await connectWith(behaviour);

    expect((await screen.findByRole('alert')).textContent).toBe(message);
    expect(screen.queryByRole('navigation', { name: 'Primary' })).toBeNull();
  });

  it('a rejected token (401) names the likely cause, offers Create a new token, and the app stays closed', async () => {
    await connectWith('invalid');

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain(
      "GitHub doesn't accept this token. It has probably expired or been revoked, or part of it is missing from the paste.",
    );
    expect(screen.getByRole('link', { name: /Create a new token/ })).toHaveAttribute('href', expect.stringContaining('github.com'));
    expect(screen.queryByRole('navigation', { name: 'Primary' })).toBeNull();
  });

  it('a network failure says so and the app stays closed', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new Error('down');
    });
    const user = userEvent.setup();
    render(<App />);
    await user.type(await screen.findByLabelText('GitHub token'), 't-token');
    await user.click(screen.getByRole('button', { name: 'Connect' }));

    expect((await screen.findByRole('alert')).textContent).toBe("Couldn't reach GitHub to check the token. Check your connection and try again.");
  });

  it('a fine-grained token that works opens the app with no warning', async () => {
    await connectWith(null);

    expect(await screen.findByRole('navigation', { name: 'Primary' })).toBeInTheDocument();
    expect(screen.queryByText(/classic token/)).toBeNull();
  });

  it('a pasted token is checked at once, without pressing Connect', async () => {
    await connectWith('cannot-see', 'paste');

    expect((await screen.findByRole('alert')).textContent).toContain(`This token can't see ${repo}.`);
  });

  it('a classic token opens the app with the warning until dismissed, and the warning survives a reload', async () => {
    const user = userEvent.setup();
    await connectWith('classic', 'paste');

    const banner = await screen.findByText(/a classic token reaches all your repositories/);
    expect(banner.textContent).toContain('Connected as jmustermann');
    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Create a fine-grained one/ })).toBeInTheDocument();

    // The flag is written to storage in the background: wait for it before "reloading".
    await waitFor(async () => expect(await tokenStore.loadClassicWarning()).toBe(true));
    cleanup();
    render(<App />);
    expect(await screen.findByText(/a classic token reaches all your repositories/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText(/a classic token reaches all your repositories/)).toBeNull();
    await waitFor(async () => expect(await tokenStore.loadClassicWarning()).toBe(false));

    cleanup();
    render(<App />);
    await screen.findByRole('navigation', { name: 'Primary' });
    await waitFor(() => expect(screen.queryByText(/a classic token reaches/)).toBeNull());
  });
});

describe('the route fade (slice 059)', () => {
  it('fades a new screen in, but not a jump within the page or a Settings section switch', () => {
    const key = (route: string) => screenFor(route).key;
    expect(key('/initiatives/i1?focus=cost-summary-section')).toBe(key('/initiatives/i1'));
    expect(key('/initiatives/i1')).not.toBe(key('/initiatives/i2'));
    expect(key('/settings/roles')).toBe(key('/settings'));
    expect(key('/portfolio')).not.toBe(key('/teams'));
  });
});
