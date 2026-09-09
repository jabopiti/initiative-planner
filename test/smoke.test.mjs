// Smoke test for the shipped artifact.
//
// Everything else here tests modules in isolation. This boots the actual
// single HTML file in a real browser and walks every page, because that is
// the one failure the other tests structurally cannot see: a regex once
// rewrote `money()` into infinite recursion and lint, typecheck and all 120
// tests stayed green while the app rendered nothing at all.
//
// It is deliberately shallow — does it boot, does each page render, does
// anything throw. Real UI verification is still done by hand in a browser.
// Skips cleanly when no Chrome is installed, so a fresh clone stays green.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile, stat, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { findChrome, launch, serve } from './browser.mjs';
import { STORAGE_KEY } from '../src/store.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const artifact = `${root}initiative-planner.html`;

/** Build the artifact when it is missing or older than any source it is built from. */
async function ensureBuilt() {
  // Recursive: the render layer is split across src/pages/ and src/render/
  // rather than one file, and a directory's own mtime does not change when a
  // file inside it does — a shallow readdir would miss those edits entirely.
  const sources = [
    `${root}index.html`,
    ...(await readdir(`${root}src`, { recursive: true }))
      .filter((name) => name.endsWith('.js'))
      .map((name) => `${root}src/${name}`),
  ];
  const newest = Math.max(...(await Promise.all(sources.map((f) => stat(f).then((s) => s.mtimeMs)))));
  const built = await stat(artifact).then(
    (s) => s.mtimeMs,
    () => 0,
  );
  // Testing a stale artifact is worse than not testing one: it reports on
  // code that is no longer there.
  if (built < newest) await promisify(execFile)('npm', ['run', 'build'], { cwd: root });
}

const chromePath = await findChrome();

test(
  'the built artifact boots and every page renders',
  { skip: chromePath ? false : 'no Chrome found (set CHROME_PATH to run this)' },
  async (t) => {
    await ensureBuilt();
    const demo = await readFile(`${root}examples/exports/demo.json`, 'utf8');

    const server = await serve(artifact);
    const browser = await launch(/** @type {string} */ (chromePath));
    t.after(async () => {
      await browser.close();
      await server.close();
    });

    await browser.goto(server.url);
    assert.equal(await browser.evaluate('typeof document.querySelector("nav")'), 'object');

    // Realistic content, so pages render tables and charts instead of empty
    // states — the empty state is exactly where a broken renderer hides.
    await browser.evaluate(
      `localStorage.setItem(${JSON.stringify(STORAGE_KEY)}, ${JSON.stringify(demo)})`,
    );
    await browser.goto(server.url);

    const pages = await browser.evaluate(
      `[...document.querySelectorAll('nav [data-act="page"]')].map((b) => b.dataset.page)`,
    );
    assert.ok(pages.length >= 2, `the nav should offer pages, got ${JSON.stringify(pages)}`);

    for (const page of pages) {
      await browser.evaluate(
        `document.querySelector('nav [data-page="${page}"]').click()`,
      );
      const rendered = await browser.evaluate(
        `document.querySelector('main')?.textContent.trim().length ?? 0`,
      );
      assert.ok(rendered > 0, `the ${page} page rendered nothing`);
    }

    assert.deepEqual(browser.problems, [], 'the app logged errors while rendering');
  },
);
