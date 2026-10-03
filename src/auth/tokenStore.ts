import { classicWarningCache, loginCache, tokenCache } from '../cache/db';

/**
 * Where the GitHub token lives (§3). By default it stays in this tab's
 * sessionStorage and is gone when the tab closes; only when the user ticks
 * "Remember on this device" is it also kept in IndexedDB. sessionStorage is
 * per-tab, so another page on the same origin cannot read it from its own tab.
 */
const SESSION_KEY = 'github-token';
const LOGIN_SESSION_KEY = 'github-login';
const CLASSIC_SESSION_KEY = 'github-classic-warning';

function readSession(key = SESSION_KEY): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null; // storage blocked (private mode, policy) — fall back to IndexedDB / re-paste
  }
}

function writeSession(token: string | null, key = SESSION_KEY): void {
  try {
    if (token) sessionStorage.setItem(key, token);
    else sessionStorage.removeItem(key);
  } catch {
    // Ignored: the token stays in memory for this page load regardless.
  }
}

/**
 * Local development only: a token from the gitignored `.env.local`
 * (`VITE_DEV_TOKEN`) skips the Connect screen. `import.meta.env.DEV` is
 * replaced with `false` in a production build, so this whole branch, and the
 * token with it, is removed from the shipped bundle.
 */
function devToken(): string | null {
  if (!import.meta.env.DEV) return null;
  return import.meta.env.VITE_DEV_TOKEN || null;
}

export const tokenStore = {
  async load(): Promise<string | null> {
    return devToken() ?? readSession() ?? (await tokenCache.get());
  },

  /** The GitHub login the stored token belongs to, or null when it was never recorded (a dev token, an older session). */
  async loadLogin(): Promise<string | null> {
    return readSession(LOGIN_SESSION_KEY) ?? (await loginCache.get().catch(() => null)) ?? null;
  },

  /** Keep the token for this tab only, or — with `remember` — on this device until it is removed. The login of the
   * token it replaces goes with it; {@link saveLogin} records the new one. */
  async save(token: string, remember: boolean): Promise<void> {
    writeSession(null, LOGIN_SESSION_KEY);
    writeSession(null, CLASSIC_SESSION_KEY);
    if (remember) {
      writeSession(null);
      await Promise.all([tokenCache.set(token), loginCache.clear(), classicWarningCache.clear()]);
    } else {
      writeSession(token);
      await Promise.all([tokenCache.clear(), loginCache.clear(), classicWarningCache.clear()]);
    }
  },

  /** Records the login of the token already stored, in the same place as the token. */
  async saveLogin(login: string): Promise<void> {
    if (await tokenStore.remembered()) await loginCache.set(login);
    else writeSession(login, LOGIN_SESSION_KEY);
  },

  /** Whether the stored token is a classic one whose warning is still to be shown (§5.10). */
  async loadClassicWarning(): Promise<boolean> {
    return readSession(CLASSIC_SESSION_KEY) === '1' || ((await classicWarningCache.get().catch(() => null)) ?? false);
  },

  /** Shows (or, with `false`, dismisses) the classic-token warning, in the same place as the token. */
  async saveClassicWarning(on: boolean): Promise<void> {
    writeSession(null, CLASSIC_SESSION_KEY);
    await classicWarningCache.clear();
    if (!on) return;
    if (await tokenStore.remembered()) await classicWarningCache.set();
    else writeSession('1', CLASSIC_SESSION_KEY);
  },

  /** Whether the token is kept on this device (Remember me), so a replacement keeps the same choice. */
  async remembered(): Promise<boolean> {
    try {
      return (await tokenCache.get()) != null;
    } catch {
      return false;
    }
  },

  async clear(): Promise<void> {
    writeSession(null);
    writeSession(null, LOGIN_SESSION_KEY);
    writeSession(null, CLASSIC_SESSION_KEY);
    await Promise.all([tokenCache.clear(), loginCache.clear(), classicWarningCache.clear()]);
  },
};
