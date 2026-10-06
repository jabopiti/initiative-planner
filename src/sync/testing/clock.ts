import { afterEach, beforeEach, vi } from 'vitest';
import { COMMIT_MAX_MS, COMMIT_QUIET_MS, commitWindow } from '../FileWriter';

/** Lets IndexedDB (the write budget's reservation, on real ticks) finish; the fake clock does not move meanwhile. */
export async function settle(): Promise<void> {
  for (let i = 0; i < 20; i += 1) await new Promise((resolve) => setImmediate(resolve));
}

/** Moves the fake clock on by `ms`, `step` at a time, letting what became due reach the fake GitHub after each step. */
export async function advance(ms: number, step = ms): Promise<void> {
  let waited = 0;
  do {
    const by = Math.min(step, ms - waited);
    await vi.advanceTimersByTimeAsync(by);
    await settle();
    waited += by;
  } while (waited < ms);
}

/** This file's tests use the real 4 s / 20 s commit window, not the shorter one src/test/setup.ts sets. */
export function withRealCommitWindow(): void {
  const shortened = { ...commitWindow };
  beforeEach(() => void Object.assign(commitWindow, { quietMs: COMMIT_QUIET_MS, maxMs: COMMIT_MAX_MS }));
  afterEach(() => void Object.assign(commitWindow, shortened));
}
