/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; " +
  "connect-src 'self' https://api.github.com; base-uri 'self'; form-action 'self'; object-src 'none'; " +
  "frame-ancestors 'self'";

/**
 * Adds the strict production CSP (§10.1, §10.9) to the built `index.html`
 * only. The Vite dev server injects styles via runtime <style> tags for HMR,
 * which a strict `style-src 'self'` blocks outright — that's a dev-server
 * mechanism, not something the shipped app does, so the policy this app
 * ships with shouldn't gate local development.
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
  },
});
