import { useState } from 'react';

export interface SectionLock {
  locked: boolean;
  toggle: () => void;
}

/**
 * One lockable Settings section's lock state (§2): starts locked, browser-local and held only in memory —
 * plain component state, never written to the dataset. Re-locking on leaving Settings entirely needs no
 * special handling: the state lives in the section it guards, which unmounts (and so forgets it) the moment
 * Settings is left; moving between sections within Settings keeps each section's own state as it is.
 */
export function useSectionLock(): SectionLock {
  const [locked, setLocked] = useState(true);
  return { locked, toggle: () => setLocked((current) => !current) };
}
