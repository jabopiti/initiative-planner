import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Everything is inlined into one HTML file: no separate JS or CSS assets,
// no runtime dependencies, no network calls (AGENTS.md).
//
// The build writes to a temporary directory rather than over the source
// `index.html`; `scripts/bundle.mjs` then moves the single produced file to
// the shipped filename and removes the directory (DESIGN.md §1).
export default defineConfig({
  plugins: [viteSingleFile()],
  build: {
    outDir: '.build-tmp',
    emptyOutDir: true,
    assetsInlineLimit: Infinity,
    cssCodeSplit: false,
  },
});
