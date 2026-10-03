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

describe('the type scale (§9.8)', () => {
  it('uses only the six type tokens and the two weights in src/', () => {
    const strays = sourceFiles(SRC).flatMap((file) =>
      [...readFileSync(file, 'utf8').matchAll(STRAY)].map((m) => `${relative(SRC, file)}: ${m[0]}`),
    );
    expect(strays).toEqual([]);
  });
});
