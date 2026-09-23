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

export const tokenStore = {
  async load(): Promise<string | null> {
    return readSession() ?? (await tokenCache.get());
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
