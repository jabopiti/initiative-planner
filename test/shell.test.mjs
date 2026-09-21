// The shell markup in index.html and the element lookups in main.js are a
// contract between two files that nothing else enforces: rename a container
// in one and the app renders nothing, silently, with no build or lint error.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (file) => readFile(`${root}${file}`, 'utf8');

/**
 * Every `.js` file under `src/`, at any depth. The render layer is split
 * across `src/pages/` and `src/render/` rather than living in one file, so a
 * check that only looked at the top level would silently stop covering
 * whatever moved into a subdirectory.
 */
async function srcFiles() {
  const names = await readdir(`${root}src`, { recursive: true });
  return names.filter((name) => name.endsWith('.js')).map((name) => `src/${name}`);
}

test('index.html declares every element id the source looks up', async () => {
  // Scanned across all of src/ rather than one file, so moving a lookup
  // between modules cannot quietly disable this check.
  const names = await srcFiles();
  const sources = await Promise.all(names.map((name) => read(name)));
  const html = await read('index.html');

  const wanted = sources.flatMap((js) =>
    [...js.matchAll(/getElementById\(['"]([^'"]+)['"]\)/g)].map((m) => m[1]),
  );
  assert.ok(wanted.length > 0, 'expected the source to look up at least one element');

  for (const id of new Set(wanted)) {
    assert.match(html, new RegExp(`id="${id}"`), `index.html is missing id="${id}"`);
  }
});

test('index.html carries no inline brand content', async () => {
  const html = await read('index.html');
  const body = html.slice(html.indexOf('<body>'));
  const text = body
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, '')
    .trim();

  assert.equal(text, '', `shell markup should be empty of copy, found: ${text}`);
});

test('every action rendered has something that handles it, and vice versa', async () => {
  // A stray edit to the handler chain can orphan an action: the control still
  // renders and silently does nothing, past lint, types and every unit test.
  // That has happened once already, to four handlers at a stroke.
  //
  // The render tree and the wiring that consumes it live in different files
  // (pages/*.js render the markup, app.js owns the switch that handles it),
  // so this reads every source file rather than just app.js.
  const sources = await Promise.all((await srcFiles()).map(read));
  const source = sources.join('\n');

  // Actions reach the markup two ways: as a literal attribute, and as an
  // object property on a field helper.
  const rendered = new Set([
    ...[...source.matchAll(/data-act="([a-z-]+)"/g)].map((m) => m[1]),
    ...[...source.matchAll(/'data-act': '([a-z-]+)'/g)].map((m) => m[1]),
  ]);

  // And they are consumed four ways: a registry-map entry (every page module
  // registers its own `{act: handler}` map into app.js's shared dispatch —
  // AGENTS.md's registry pattern), a switch case (the style the registry
  // replaced, kept here in case a stray one ever comes back), a comparison
  // (either direction), or a lookup by selector for a control read rather
  // than dispatched on.
  const consumed = new Set([
    ...[...source.matchAll(/'([a-z-]+)':\s*\(/g)].map((m) => m[1]),
    ...[...source.matchAll(/case '([a-z-]+)':/g)].map((m) => m[1]),
    ...[...source.matchAll(/act [=!]==? '([a-z-]+)'/g)].map((m) => m[1]),
    ...[...source.matchAll(/querySelector\(`?\[data-act="([a-z-]+)"/g)].map((m) => m[1]),
  ]);

  assert.ok(rendered.size > 10, 'expected the page to render plenty of actions');

  const orphaned = [...rendered].filter((act) => !consumed.has(act));
  assert.deepEqual(orphaned, [], `rendered but never handled: ${orphaned}`);

  // The same defect from the other side: a branch that survives a refactor
  // which removed its control, misleading the next reader.
  const dead = [...consumed].filter((act) => !rendered.has(act));
  assert.deepEqual(dead, [], `handled but never rendered: ${dead}`);
});
