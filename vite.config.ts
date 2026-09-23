/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; " +
  "connect-src 'self' https://api.github.com; base-uri 'self'; form-action 'self'; object-src 'none'; " +
  "frame-ancestors 'self'";

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
      return html.replace('<title>', `<meta http-equiv="Content-Security-Policy" content="${CSP}" />\n    <title>`);
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), cspMetaTag()],
  base: './',
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    exclude: ['**/node_modules/**', 'e2e/**'],
    coverage: { provider: 'v8', include: ['src/**'], reporter: ['text-summary', 'json-summary'] },
  },
});
