import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tokenCache } from '../cache/db';
import { tokenStore } from './tokenStore';

describe('tokenStore (§3)', () => {
  beforeEach(async () => {
    sessionStorage.clear();
    await tokenCache.clear();
  });

  it('keeps the token in this tab only by default, never in IndexedDB', async () => {
    await tokenStore.save('t1', false);

    expect(sessionStorage.getItem('github-token')).toBe('t1');
    expect(await tokenCache.get()).toBeNull();
    expect(await tokenStore.load()).toBe('t1');
  });

  it('persists to IndexedDB only when the user chooses to remember it', async () => {
    await tokenStore.save('t2', true);

    expect(await tokenCache.get()).toBe('t2');
    expect(sessionStorage.getItem('github-token')).toBeNull();

    sessionStorage.clear(); // a new tab / new session
    expect(await tokenStore.load()).toBe('t2');
  });

  it('a later save replaces the other location, leaving no stale copy', async () => {
    await tokenStore.save('old', true);
    await tokenStore.save('new', false);

    expect(await tokenCache.get()).toBeNull();
    expect(await tokenStore.load()).toBe('new');
  });

  it('clear removes the token from both places', async () => {
    await tokenStore.save('t3', true);
    await tokenStore.clear();

    expect(await tokenStore.load()).toBeNull();
  });
});

describe('tokenStore dev token', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('uses VITE_DEV_TOKEN in development', async () => {
    vi.stubEnv('DEV', true);
    vi.stubEnv('VITE_DEV_TOKEN', 'dev-token-value');
    expect(await tokenStore.load()).toBe('dev-token-value');
  });

  it('ignores VITE_DEV_TOKEN outside development', async () => {
    vi.stubEnv('DEV', false);
    vi.stubEnv('VITE_DEV_TOKEN', 'dev-token-value');
    expect(await tokenStore.load()).toBeNull();
  });
});
