const INCLUDE_NAMES_KEY = 'initiative-planner/prompt-include-names';

/** Include names (§9.12, §10.4): this browser's choice for every prompt, never synced; off when storage can't be read. */
export function readIncludeNames(): boolean {
  try {
    return localStorage.getItem(INCLUDE_NAMES_KEY) === 'true';
  } catch {
    return false;
  }
}

export function writeIncludeNames(include: boolean): void {
  try {
    localStorage.setItem(INCLUDE_NAMES_KEY, String(include));
  } catch {
    // Non-essential: the choice lasts until the page is left.
  }
}
