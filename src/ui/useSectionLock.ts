import { useState } from 'react';

export interface SectionLock {
  locked: boolean;
  toggle: () => void;
}

/**
 * One lockable Settings section's lock state (§2): starts locked, browser-local and held only in memory —
 * plain component state, never written to the dataset. Call this in `SettingsPage` itself, once per
 * lockable section, unconditionally — never inside the section component it guards. `SettingsPage` only
 * mounts the currently-shown section, so a lock living there would remount (and so re-lock) every time its
 * section is navigated away from and back to; held in `SettingsPage`, it only resets when Settings itself
 * is left, which is what §2 requires.
 */
export function useSectionLock(): SectionLock {
  const [locked, setLocked] = useState(true);
  return { locked, toggle: () => setLocked((current) => !current) };
}
