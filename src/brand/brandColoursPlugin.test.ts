import { describe, expect, it } from 'vitest';
import { brandColoursPlugin } from './brandColoursPlugin';
import { defaultBrandPack } from './defaultBrand';

const ctx = {
  error: (msg: string): never => {
    throw new Error(msg);
  },
};
const call = (hook: unknown, ...args: unknown[]) => (hook as (...a: unknown[]) => unknown).call(ctx, ...args);

describe('brandColoursPlugin (§9.5, §10.7)', () => {
  it('serves the generated stylesheet as virtual:brand-colours.css', () => {
    const plugin = brandColoursPlugin(defaultBrandPack.colours);
    const id = call(plugin.resolveId, 'virtual:brand-colours.css') as string;
    expect(call(plugin.resolveId, './other.css')).toBeUndefined();
    expect(call(plugin.load, id)).toContain('--surface-page: oklch(0.983 0.003 174.5);');
    expect(call(plugin.load, '/src/index.css')).toBeUndefined();
  });

  it('lets the default pack build', () => {
    expect(() => call(brandColoursPlugin(defaultBrandPack.colours).buildStart)).not.toThrow();
  });

  it('stops the build on a failing pair, naming the token', () => {
    const colours = { ...defaultBrandPack.colours, metText: { ...defaultBrandPack.colours.metText, light: 'oklch(0.627 0.17 149.2)' } };
    expect(() => call(brandColoursPlugin(colours).buildStart)).toThrow(/Brand pack contrast:\n {2}metText \(light\) on surfacePage is 3\.14:1, needs 4\.5:1/);
  });
});
