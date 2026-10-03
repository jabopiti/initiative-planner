import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { coloursCss, cssVar, typefaceCss } from './coloursCss';
import { defaultBrandPack } from './defaultBrand';

describe('coloursCss (§9.1, §10.1)', () => {
  it('turns every colour role into a custom property for light (:root) and dark (.dark)', () => {
    const css = coloursCss(defaultBrandPack.colours, defaultBrandPack.teamColours);
    const [light, dark] = css.split('.dark {');
    expect(light).toContain(':root {');
    expect(light).toContain('--text-muted: oklch(0.535 0.016 286);');
    expect(dark).toContain('color-scheme: dark;');
    expect(dark).toContain('--text-muted: oklch(0.68 0.012 286);');
    expect(dark).toContain('--text-on-accent: oklch(0.17 0.004 286);');
    for (const role of Object.keys(defaultBrandPack.colours)) {
      const prop = `${cssVar(role)}:`;
      expect(light).toContain(prop);
      expect(dark).toContain(prop);
    }
  });

  it('gives each team colour a --team-N property in both themes (§9.8)', () => {
    const [light, dark] = coloursCss(defaultBrandPack.colours, defaultBrandPack.teamColours).split('.dark {');
    expect(light).toContain('--team-1: oklch(0.52 0.13 293);');
    expect(dark).toContain('--team-6: oklch(0.72 0.03 265);');
  });

  it('follows a colour changed in the brand pack only', () => {
    const colours = { ...defaultBrandPack.colours, accent: { light: 'oklch(0.4 0.1 250)', dark: 'oklch(0.8 0.1 250)' } };
    const css = coloursCss(colours);
    expect(css).toContain('--accent: oklch(0.4 0.1 250);');
    expect(css).toContain('--accent: oklch(0.8 0.1 250);');
  });
});

describe('typefaceCss (§2, §9.8)', () => {
  it('declares one @font-face per brand-folder file, served from the given URL, and the family with its fallback', () => {
    const css = typefaceCss(defaultBrandPack.typeface, (path) => `/src/brand/${path}`);
    expect(css.match(/@font-face/g)).toHaveLength(2);
    expect(css).toContain("src: url('/src/brand/fonts/geist-latin-wght-normal.woff2') format('woff2');");
    expect(css).toContain('font-weight: 100 900;');
    expect(css).toContain("--font-brand: 'Geist', system-ui,");
  });

  it("takes a static or italic file's own weight and style, so a fork can bring a non-variable typeface", () => {
    const css = typefaceCss(
      { family: 'Brand', fallback: 'sans-serif', files: [{ path: 'fonts/brand-500-italic.woff2', unicodeRange: 'U+0000-00FF', weight: '500', style: 'italic' }] },
      (path) => `/${path}`,
    );
    expect(css).toContain('font-weight: 500;');
    expect(css).toContain('font-style: italic;');
  });
});

describe('src/index.css', () => {
  it('holds no colour literals — the brand pack is the single source (§2)', () => {
    const css = readFileSync(resolve(__dirname, '../index.css'), 'utf8');
    expect(css).not.toMatch(/oklch\(|#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
  });
});
