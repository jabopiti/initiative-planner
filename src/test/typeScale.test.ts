import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = resolve(__dirname, '..');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name);
    if (e.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [path] : [];
  });
}

// Tailwind's own size and weight classes, which index.css resets so they generate nothing (§9.8).
const STRAY = /(?<![\w-])(?:[a-z0-9-]+:)*(?:text-(?:xs|sm|base|lg|[2-9]?xl|\[\d[^\]]*\])|font-(?:thin|extralight|light|semibold|bold|extrabold|black))(?![\w-])/g;

// Every text-* class: a size, a colour, an alignment or a wrap mode. A name none of those covers generates no CSS.
const TEXT_CLASS = /(?<![\w-])(?:[^\s"'`:]+:)*!?text-([a-z][\w-]*?)(?:\/\d+)?!?(?![\w-])/g;
const TYPE_TOKENS = ['label', 'caption', 'body', 'heading', 'title', 'display'];
const NON_SIZE = ['left', 'right', 'center', 'start', 'end', 'justify', 'wrap', 'nowrap', 'balance', 'pretty', 'ellipsis', 'clip'];
const BUILT_IN_COLOURS = ['white', 'black', 'inherit', 'current', 'transparent'];

describe('the type scale (§9.8)', () => {
  const files = sourceFiles(SRC).map((file) => ({ name: relative(SRC, file), text: readFileSync(file, 'utf8') }));

  it('uses only the six type tokens and the two weights in src/', () => {
    const strays = files.flatMap(({ name, text }) => [...text.matchAll(STRAY)].map((m) => `${name}: ${m[0]}`));
    expect(strays).toEqual([]);
  });

  it('names no text-* class that index.css does not define, such as a misspelt or retired size', () => {
    const colours = [...readFileSync(join(SRC, 'index.css'), 'utf8').matchAll(/--color-([\w-]+?):/g)].map((m) => m[1]);
    const known = new Set([...TYPE_TOKENS, ...NON_SIZE, ...BUILT_IN_COLOURS, ...colours]);
    const unknown = files.flatMap(({ name, text }) =>
      [...text.matchAll(TEXT_CLASS)].filter((m) => !known.has(m[1])).map((m) => `${name}: ${m[0]}`),
    );
    expect(unknown).toEqual([]);
  });
});
