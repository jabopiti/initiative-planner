import { useSyncExternalStore } from 'react';

/**
 * Filters kept in memory for the browser session (§9.11): still set after opening an initiative and pressing
 * Back, gone on reload, never synced. Keyed by screen, so each list keeps its own (§5.2, §5.3).
 */
const store = new Map<string, unknown>();
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** A screen's filters, starting from `defaults` — which must be a stable (module-level) value. */
export function useSessionFilters<T>(screen: string, defaults: T): [T, (next: T) => void] {
  const filters = useSyncExternalStore(subscribe, () => (store.get(screen) as T | undefined) ?? defaults);
  const set = (next: T) => {
    store.set(screen, next);
    listeners.forEach((l) => l());
  };
  return [filters, set];
}

export function resetSessionFilters(): void {
  store.clear();
  listeners.forEach((l) => l());
}
