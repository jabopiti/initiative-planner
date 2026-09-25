import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';
import { afterEach } from 'vitest';
import { clearAllFileCaches } from '../cache/db';

// The browser cache outlives a test's repository: every test starts as a first visit.
afterEach(async () => {
  await clearAllFileCaches();
});
