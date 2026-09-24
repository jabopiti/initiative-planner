import { tokenCache } from '../cache/db';

/**
 * Where the GitHub token lives (§3). By default it stays in this tab's
 * sessionStorage and is gone when the tab closes; only when the user ticks
 * "Remember on this device" is it also kept in IndexedDB. sessionStorage is
 * per-tab, so another page on the same origin cannot read it from its own tab.
 */
const SESSION_KEY = 'github-token';

function readSession(): string | null {
  try {
    return sessionStorage.getItem(SESSION_KEY);
  } catch {
    return null; // storage blocked (private mode, policy) — fall back to IndexedDB / re-paste
  }
}

function writeSession(token: string | null): void {
  try {
    if (token) sessionStorage.setItem(SESSION_KEY, token);
    else sessionStorage.removeItem(SESSION_KEY);
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

  /** Keep the token for this tab only, or — with `remember` — on this device until it is removed. */
  async save(token: string, remember: boolean): Promise<void> {
    if (remember) {
      writeSession(null);
      await tokenCache.set(token);
    } else {
      writeSession(token);
      await tokenCache.clear();
    }
  },

  async clear(): Promise<void> {
    writeSession(null);
    await tokenCache.clear();
  },
};
