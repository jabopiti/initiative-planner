import { useSyncExternalStore } from 'react';

/**
 * "Dismiss for now" on the Getting started strip (§5.2, §10.4): kept in session storage, so it lasts for the
 * browser session and is never synced. When storage can't be used the in-memory flag still hides the strip for
 * the page's lifetime.
 */
const KEY = 'getting-started-dismissed';
let dismissedInMemory = false;
const listeners = new Set<() => void>();

function stored(): boolean {
  try {
    return sessionStorage.getItem(KEY) === '1';
  } catch {
    return false; // storage blocked (private mode, policy): the in-memory flag carries it
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function dismissGettingStarted(): void {
  dismissedInMemory = true;
  try {
    sessionStorage.setItem(KEY, '1');
  } catch {
    // Ignored: dismissedInMemory covers this page load.
  }
  listeners.forEach((l) => l());
}

export function useGettingStartedDismissed(): boolean {
  return useSyncExternalStore(subscribe, () => dismissedInMemory || stored());
}

/** For tests: forgets the in-memory flag. */
export function resetGettingStartedDismissal(): void {
  dismissedInMemory = false;
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // Nothing stored to remove.
  }
  listeners.forEach((l) => l());
}
