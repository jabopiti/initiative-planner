/// <reference types="vitest/config" />
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { brandColoursPlugin } from './src/brand/brandColoursPlugin';
import { buildCsp } from './src/brand/csp';
// The config loads before the `@brand` alias exists, so it reaches the pack by path.
import { defaultBrandPack } from './brand/brand';

/**
 * Adds the strict production CSP (§10.1, §10.9) to the built `index.html`
 * only. The Vite dev server injects styles via runtime <style> tags for HMR,
 * which a strict `style-src 'self'` blocks outright — that's a dev-server
 * mechanism, not something the shipped app does, so the policy this app
 * ships with shouldn't gate local development.
 *
 * `style-src` also allows `'unsafe-inline'` (slice 003b): Radix UI's
 * floating-position logic (used by shadcn's Select, Popover, Menu, Dialog
 * and Tooltip) sets an inline `style` with a computed `transform` on each
 * position update, which a bare `style-src 'self'` blocks outright — hashes
 * don't work since the value is different every time, and there's no
 * server to mint a per-load nonce on a static, header-less GitHub Pages
 * deploy. `script-src` stays `'self'` with no `unsafe-inline`/`eval`, which
 * is what actually protects the token (§3) from injection.
 */
function cspMetaTag(): Plugin {
  return {
    name: 'csp-meta-tag',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace('<title>', `<meta http-equiv="Content-Security-Policy" content="${buildCsp(defaultBrandPack.github.apiBaseUrl)}" />\n    <title>`);
    },
  };
}

/** The build's identity for Settings → About (§5.9): the package version and, where git is available, the short commit. */
function buildVersion(): string {
  const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };
  try {
    const commit = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    return commit ? `${version} (${commit})` : version;
  } catch {
    return version;
  }
}

export default defineConfig({
  define: { __BUILD_VERSION__: JSON.stringify(buildVersion()) },
  plugins: [react(), tailwindcss(), brandColoursPlugin(defaultBrandPack, fileURLToPath(new URL('./brand', import.meta.url))), cspMetaTag()],
  base: './',
  // Parallel sessions each run their own dev server: the preview launcher hands out a free port via PORT.
  server: { port: Number(process.env.PORT) || 5173 },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // The brand pack: the one folder a fork edits (§2, §10.7).
      '@brand': fileURLToPath(new URL('./brand/brand.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    // Tests must never pick up a developer's real token from .env.local.
    env: { VITE_DEV_TOKEN: '' },
    exclude: ['**/node_modules/**', 'e2e/**', '.claude/worktrees/**'],
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      reporter: ['text-summary', 'json-summary'],
      // A ratchet just under the measured 93.4 / 87.5 / 92.9 / 95.4 (statements / branches / functions / lines):
      // `npm run test:coverage` fails if a change lowers coverage. Raise these as coverage grows, never lower them.
      thresholds: { statements: 92, branches: 86, functions: 91, lines: 94 },
    },
  },
});
