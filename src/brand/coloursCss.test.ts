import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { coloursCss } from './coloursCss';
import { defaultBrandPack } from './defaultBrand';

describe('coloursCss (§9.1, §10.1)', () => {
  it('turns every colour role into a custom property for light (:root) and dark (.dark)', () => {
    const css = coloursCss(defaultBrandPack.colours);
    const [light, dark] = css.split('.dark {');
    expect(light).toContain(':root {');
    expect(light).toContain('--text-muted: oklch(0.534 0.021 162.6);');
    expect(dark).toContain('color-scheme: dark;');
    expect(dark).toContain('--text-muted: oklch(0.635 0.024 170.1);');
    expect(dark).toContain('--text-on-accent: oklch(0.187 0.012 167.0);');
    for (const role of Object.keys(defaultBrandPack.colours)) {
      const prop = `--${role.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}:`;
      expect(light).toContain(prop);
      expect(dark).toContain(prop);
    }
  });

  it('follows a colour changed in the brand pack only', () => {
    const colours = { ...defaultBrandPack.colours, accent: { light: 'oklch(0.4 0.1 250)', dark: 'oklch(0.8 0.1 250)' } };
    const css = coloursCss(colours);
    expect(css).toContain('--accent: oklch(0.4 0.1 250);');
    expect(css).toContain('--accent: oklch(0.8 0.1 250);');
  });
});

describe('src/index.css', () => {
  it('holds no colour literals — the brand pack is the single source (§2)', () => {
    const css = readFileSync(resolve(__dirname, '../index.css'), 'utf8');
    expect(css).not.toMatch(/oklch\(|#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
  });
});
