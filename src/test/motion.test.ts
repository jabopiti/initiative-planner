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

// Every animate-* class, with its variants; the ones index.css defines are slice 059's motions.
const ANIMATE = /(?<![\w-])((?:[a-z0-9-]+:)*)animate-([a-z][\w-]*)/g;
// A hover lift: the card's translate on hover, which must stay put under reduced motion.
const LIFT = /hover:-translate-y-px/;

describe('motion under prefers-reduced-motion (§9.5, slice 059)', () => {
  const files = sourceFiles(SRC).map((file) => ({ name: relative(SRC, file), text: readFileSync(file, 'utf8') }));

  const defined = new Set([...readFileSync(join(SRC, 'index.css'), 'utf8').matchAll(/--animate-([\w-]+):/g)].map((m) => m[1]));

  it('runs every animation index.css defines only with motion-safe:, so reduced motion shows the end state at once', () => {
    const uses = files.flatMap(({ name, text }) => [...text.matchAll(ANIMATE)].filter((m) => defined.has(m[2])).map((m) => ({ name, m })));
    expect(uses.length).toBeGreaterThan(0);
    expect(uses.filter(({ m }) => !m[1].includes('motion-safe:')).map(({ name, m }) => `${name}: ${m[0]}`)).toEqual([]);
  });

  it('keeps a hovered card in place under reduced motion', () => {
    const lifts = files.filter(({ text }) => LIFT.test(text));
    expect(lifts.length).toBeGreaterThan(0);
    for (const { name, text } of lifts) expect(text, name).toMatch(/motion-reduce:hover:translate-y-0/);
  });
});
