import { defineConfig } from '@playwright/test';

// Runs against the production build (`vite preview`), where the strict CSP
// from vite.config.ts's csp-meta-tag plugin is in effect (§10.1, §10.9).
export default defineConfig({
  testDir: './e2e',
  webServer: {
    // CI serves the build the `build` job already made and uploaded as `dist`.
    command: `${process.env.CI ? '' : 'npm run build:quiet && '}npm run preview -- --port 4173 --strictPort`,
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  use: { baseURL: 'http://localhost:4173' },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
