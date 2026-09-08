// The shell markup in index.html and the element lookups in main.js are a
// contract between two files that nothing else enforces: rename a container
// in one and the app renders nothing, silently, with no build or lint error.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (file) => readFile(`${root}${file}`, 'utf8');

test('index.html declares every element id the source looks up', async () => {
  // Scanned across all of src/ rather than one file, so moving a lookup
  // between modules cannot quietly disable this check.
  const names = (await readdir(`${root}src`)).filter((name) => name.endsWith('.js'));
  const sources = await Promise.all(names.map((name) => read(`src/${name}`)));
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
