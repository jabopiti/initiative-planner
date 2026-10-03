import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';
import { afterEach } from 'vitest';
import { clearAllFileCaches } from '../cache/db';
import { defaultTiming } from '../sync/FileWriter';

// A retry's backoff (§10.3) never waits on real time in a test; the backoff tests inject their own clock.
defaultTiming.delay = () => Promise.resolve();

// The browser cache outlives a test's repository: every test starts as a first visit.
afterEach(async () => {
  await clearAllFileCaches();
});

// jsdom has no ResizeObserver, which Radix's popper-positioned content (dropdown menu) measures with.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// jsdom has no matchMedia, which the theme control (§9.1) asks whether the OS prefers dark; a test starts light.
window.matchMedia ??= ((query: string) => ({
  matches: false,
  media: query,
  addEventListener() {},
  removeEventListener() {},
})) as unknown as typeof window.matchMedia;
