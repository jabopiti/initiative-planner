import type { BrandColours } from './types';

const cssVar = (role: string) => `--${role.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;

/**
 * The brand pack's colour roles as CSS custom properties (§2, §9.1): light on
 * `:root`, dark under the `.dark` class the theme control sets. Served by
 * brandColoursPlugin as a static stylesheet — no inline styles, so the CSP
 * holds (§10.1).
 */
export function coloursCss(colours: BrandColours): string {
  const block = (theme: 'light' | 'dark') =>
    Object.entries(colours)
      .map(([role, value]) => `  ${cssVar(role)}: ${value[theme]};`)
      .join('\n');
  return `:root {\n${block('light')}\n}\n\n.dark {\n  color-scheme: dark;\n${block('dark')}\n}\n`;
}
