import { classicWarningCache, loginCache, tokenCache } from '../cache/db';
import { isSharedOrigin } from './sharedOrigin';

/**
 * Where the GitHub token lives (§3). By default it stays in this tab's
 * sessionStorage and is gone when the tab closes; only when the user ticks
 * "Remember on this device" is it also kept in IndexedDB. sessionStorage is
 * per-tab, so another page on the same origin cannot read it from its own tab.
 * On a shared origin ({@link isSharedOrigin}) nothing is kept in IndexedDB at all.
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

function clearRemembered(): Promise<unknown> {
  return Promise.all([tokenCache.clear(), loginCache.clear(), classicWarningCache.clear()]);
}

/**
 * On a shared origin, moves a token remembered there before Remember me was turned off — with its login and
 * classic-token flag — into this tab's session storage and deletes it from IndexedDB (§3, Authentication).
 * Each value reaches session storage before anything is deleted.
 */
async function moveRememberedIntoTab(): Promise<void> {
  if (!isSharedOrigin()) return;
  const [token, login, classic] = await Promise.all([
    tokenCache.get().catch(() => null),
    loginCache.get().catch(() => null),
    classicWarningCache.get().catch(() => null),
  ]);
  if (token == null) {
    // A login or classic flag left without its token is cleared too, so loadLogin can't surface it.
    if (login != null || classic != null) await clearRemembered();
    return;
  }
  if (readSession() == null) {
    writeSession(token);
    if (login) writeSession(login, LOGIN_SESSION_KEY);
    if (classic) writeSession('1', CLASSIC_SESSION_KEY);
  }
  // Session storage blocked or full: writeSession swallowed it, so keep the remembered copy rather than lose it.
  if (readSession() == null) return;
  await clearRemembered();
}

/** App loads the token, login and classic flag together: they share one move instead of each running their own. */
let moving: Promise<void> | undefined;
function moveOnce(): Promise<void> {
  moving ??= moveRememberedIntoTab()
    .catch(() => undefined)
    .finally(() => (moving = undefined));
  return moving;
}

export const tokenStore = {
  /** Whether Remember me is offered: not on a shared origin, where other sites could read what is kept (§5.10). */
  canRemember(): boolean {
    return !isSharedOrigin();
  },

  async load(): Promise<string | null> {
    const dev = devToken();
    if (dev) return dev;
    await moveOnce();
    return readSession() ?? (await tokenCache.get());
  },

  /** The GitHub login the stored token belongs to, or null when it was never recorded (a dev token, an older session). */
  async loadLogin(): Promise<string | null> {
    await moveOnce();
    return readSession(LOGIN_SESSION_KEY) ?? (await loginCache.get().catch(() => null)) ?? null;
  },

  /** Keep the token for this tab only, or — with `remember`, where {@link canRemember} — on this device until it is
   * removed. The login of the token it replaces goes with it; {@link saveLogin} records the new one. */
  async save(token: string, remember: boolean): Promise<void> {
    remember &&= tokenStore.canRemember();
    writeSession(null, LOGIN_SESSION_KEY);
    writeSession(null, CLASSIC_SESSION_KEY);
    if (remember) {
      writeSession(null);
      await Promise.all([tokenCache.set(token), loginCache.clear(), classicWarningCache.clear()]);
    } else {
      writeSession(token);
      await clearRemembered();
    }
  },

  /** Records the login of the token already stored, in the same place as the token. */
  async saveLogin(login: string): Promise<void> {
    if (await tokenStore.remembered()) await loginCache.set(login);
    else writeSession(login, LOGIN_SESSION_KEY);
  },

  /** Whether the stored token is a classic one whose warning is still to be shown (§5.10). */
  async loadClassicWarning(): Promise<boolean> {
    await moveOnce();
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
    // Never on a shared origin, even if a copy survived the move, so nothing more is written to IndexedDB there.
    if (!tokenStore.canRemember()) return false;
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
    await clearRemembered();
  },
};
