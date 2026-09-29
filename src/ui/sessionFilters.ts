import { useSyncExternalStore } from 'react';
import { NO_FILTERS, type InitiativeFilters } from '../data/initiativeList';

/**
 * Filters kept in memory for the browser session (§9.11): still set after opening an initiative and pressing
 * Back, gone on reload, never synced. Keyed by screen so the Portfolio's filters (slice 021) can reuse it.
 */
const store = new Map<string, InitiativeFilters>();
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSessionFilters(screen: string): [InitiativeFilters, (next: InitiativeFilters) => void] {
  const filters = useSyncExternalStore(subscribe, () => store.get(screen) ?? NO_FILTERS);
  const set = (next: InitiativeFilters) => {
    store.set(screen, next);
    listeners.forEach((l) => l());
  };
  return [filters, set];
}

export function resetSessionFilters(): void {
  store.clear();
  listeners.forEach((l) => l());
}
