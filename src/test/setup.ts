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
