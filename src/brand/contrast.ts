import type { BrandColours } from './types';

/**
 * The brand-pack contrast rule (§9.5): every text and UI colour role, in both
 * themes, against each surface the core puts it on. Run by the build
 * (brandColoursPlugin) and by Vitest; a failure names the token.
 */

type Role = keyof BrandColours;
type Oklch = [l: number, c: number, h: number];
type Pair = [fg: Role, bgs: Role[], min: number];

const TEXT = 4.5;
const UI = 3;

const PAGE_CARD: Role[] = ['surfacePage', 'surfaceCard'];
const SURFACES: Role[] = [...PAGE_CARD, 'surfaceSubtle'];

/** Which roles sit on which: the core's usage, so a fork's pack is held to how the screens actually draw it. */
const PAIRS: Pair[] = [
  ...(['textPrimary', 'textSecondary', 'textMuted'] as const).map((fg): Pair => [fg, [...SURFACES, 'accentTint', 'metTint'], TEXT]),
  // Status text sits on the plain surfaces and on its own tint.
  ...(['accent', 'warning', 'alarm', 'met'] as const).map((s): Pair => [`${s}Text`, [...SURFACES, `${s}Tint`], TEXT]),
  // Search-match highlights: primary and secondary text on the warning tint.
  ...(['textPrimary', 'textSecondary'] as const).map((fg): Pair => [fg, ['warningTint'], TEXT]),
  ['textOnAccent', ['accent', 'alarm'], TEXT],
  // Tooltips: page-coloured text on a primary-text fill.
  ['surfacePage', ['textPrimary'], TEXT],
  // Non-text contrast (WCAG 1.4.11): focus indicator, status fills and form-control outlines.
  ...(['focusRing', 'accent', 'met', 'warning', 'alarm', 'borderInput'] as const).map((fg): Pair => [fg, PAGE_CARD, UI]),
];

const NUM = String.raw`(\d+(?:\.\d+)?|\.\d+)`;
const OKLCH = new RegExp(String.raw`^oklch\(\s*${NUM}\s+${NUM}\s+${NUM}\s*\)$`);

export function parseOklch(value: string): Oklch | null {
  const m = OKLCH.exec(value.trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** OKLCH → linear sRGB (Björn Ottosson's OKLab matrices), clipped to the sRGB gamut, → WCAG 2 relative luminance. */
function luminance([l, c, h]: Oklch): number {
  const rad = (h * Math.PI) / 180;
  const a = c * Math.cos(rad);
  const b = c * Math.sin(rad);
  const l3 = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m3 = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s3 = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const clip = (x: number) => Math.min(1, Math.max(0, x));
  const r = clip(4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3);
  const g = clip(-1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3);
  const bl = clip(-0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3);
  return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
}

export function contrastRatio(a: Oklch, b: Oklch): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Every problem with the pack's colours, one line each; empty when it passes. */
export function checkBrandColours(colours: BrandColours): string[] {
  const failures: string[] = [];
  for (const theme of ['light', 'dark'] as const) {
    const parsed = new Map<Role, Oklch>();
    for (const role of Object.keys(colours) as Role[]) {
      const value = colours[role][theme];
      const p = parseOklch(value);
      if (p) parsed.set(role, p);
      else failures.push(`${role} (${theme}) is not an oklch(L C H) colour: "${value}"`);
    }
    for (const [fg, bgs, min] of PAIRS) {
      const f = parsed.get(fg);
      if (!f) continue;
      for (const bg of bgs) {
        const b = parsed.get(bg);
        if (!b) continue;
        const ratio = contrastRatio(f, b);
        if (ratio < min) failures.push(`${fg} (${theme}) on ${bg} is ${ratio.toFixed(2)}:1, needs ${min}:1`);
      }
    }
  }
  return failures;
}
