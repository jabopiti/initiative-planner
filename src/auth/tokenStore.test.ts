import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { classicWarningCache, loginCache, tokenCache } from '../cache/db';
import { tokenStore } from './tokenStore';

const origin = vi.hoisted(() => ({ shared: false }));
vi.mock('./sharedOrigin', () => ({ isSharedOrigin: () => origin.shared }));

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

describe('tokenStore on a shared origin (§3, Authentication)', () => {
  beforeEach(async () => {
    sessionStorage.clear();
    await tokenStore.clear();
    origin.shared = true;
  });
  afterEach(async () => {
    origin.shared = false;
    await tokenStore.clear();
  });

  it('offers no Remember me and keeps a token asked to be remembered in this tab only', async () => {
    expect(tokenStore.canRemember()).toBe(false);

    await tokenStore.save('t4', true);
    await tokenStore.saveLogin('bo');

    expect(await tokenCache.get()).toBeNull();
    expect(await loginCache.get()).toBeNull();
    expect(sessionStorage.getItem('github-token')).toBe('t4');
    expect(await tokenStore.remembered()).toBe(false);
  });

  it('moves a token remembered there earlier, with its login and classic warning, into this tab', async () => {
    await Promise.all([tokenCache.set('old-remembered'), loginCache.set('bo'), classicWarningCache.set()]);

    // As App loads them: all three at once.
    const [token, login, classic] = await Promise.all([
      tokenStore.load(),
      tokenStore.loadLogin(),
      tokenStore.loadClassicWarning(),
    ]);

    expect([token, login, classic]).toEqual(['old-remembered', 'bo', true]);
    expect(await tokenCache.get()).toBeNull();
    expect(await loginCache.get()).toBeNull();
    expect(await classicWarningCache.get()).toBeNull();
    expect(sessionStorage.getItem('github-token')).toBe('old-remembered');
  });

  it('a token already in this tab wins over one remembered earlier, which is still deleted', async () => {
    await tokenStore.save('tab-token', false);
    await tokenCache.set('old-remembered');

    expect(await tokenStore.load()).toBe('tab-token');
    expect(await tokenCache.get()).toBeNull();
  });

  it('keeps the remembered token when this tab’s session storage refuses it', async () => {
    await tokenCache.set('old-remembered');
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    try {
      expect(await tokenStore.load()).toBe('old-remembered');
      expect(await tokenCache.get()).toBe('old-remembered');
    } finally {
      setItem.mockRestore();
    }
  });

  it('clears a login left in IndexedDB without its token, and never reports a token as remembered', async () => {
    await loginCache.set('stale');
    expect(await tokenStore.loadLogin()).toBeNull();
    expect(await loginCache.get()).toBeNull();

    await tokenCache.set('survivor');
    expect(await tokenStore.remembered()).toBe(false);
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
