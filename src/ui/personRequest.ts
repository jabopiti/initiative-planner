import { useEffect } from 'react';

/** People have no direct links (§5.1), so the search overlay asks the People page to open a person's panel in-app. */
let pending: string | null = null;
const listeners = new Set<() => void>();

export function requestPerson(personId: string): void {
  pending = personId;
  listeners.forEach((listener) => listener());
}

/** Calls `open` for a request made before this page mounted and for each one made while it is mounted. */
export function usePersonRequests(open: (personId: string) => void): void {
  useEffect(() => {
    const take = () => {
      if (pending === null) return;
      const personId = pending;
      pending = null;
      open(personId);
    };
    take();
    listeners.add(take);
    return () => {
      listeners.delete(take);
    };
  }, [open]);
}
