import type { BrandColours, ColourRole, Typeface } from './types';

export const cssVar = (role: string) => `--${role.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;

/**
 * The brand pack's colour roles and team colours as CSS custom properties
 * (§2, §9.1): light on `:root`, dark under the `.dark` class the theme
 * control sets. Team colours are `--team-1` … `--team-6`. Served by
 * brandColoursPlugin as a static stylesheet — no inline styles, so the CSP
 * holds (§10.1).
 */
export function coloursCss(colours: BrandColours, teamColours: ColourRole[] = []): string {
  const block = (theme: 'light' | 'dark') =>
    [
      ...Object.entries(colours).map(([role, value]) => `  ${cssVar(role)}: ${value[theme]};`),
      ...teamColours.map((value, i) => `  --team-${i + 1}: ${value[theme]};`),
    ].join('\n');
  return `:root {\n${block('light')}\n}\n\n.dark {\n  color-scheme: dark;\n${block('dark')}\n}\n`;
}

/**
 * The brand pack's typeface (§2, §9.8): one `@font-face` per file, served from
 * the build's own origin (`url` maps a brand-folder path to its URL), and
 * `--font-brand` for the base layer to read.
 */
export function typefaceCss(typeface: Typeface, url: (path: string) => string): string {
  const faces = typeface.files.map(
    (file) =>
      `@font-face {\n  font-family: '${typeface.family}';\n  font-style: normal;\n  font-display: swap;\n  font-weight: 100 900;\n` +
      `  src: url('${url(file.path)}') format('woff2-variations');\n  unicode-range: ${file.unicodeRange};\n}\n`,
  );
  return `${faces.join('\n')}\n:root {\n  --font-brand: '${typeface.family}', ${typeface.fallback};\n}\n`;
}
