import type { BrandColours, ColourRole } from './types';

/**
 * The brand-pack contrast rule (§9.5): every text and UI colour role, in both
 * themes, against each surface the core puts it on. Run by the build
 * (brandColoursPlugin) and by Vitest; a failure names the token.
 */

type Role = keyof BrandColours;
type Oklch = [l: number, c: number, h: number];
/** A foreground (a role, or a team colour as `teamColours[i]`), the roles it sits on, and the ratio it needs. */
type Pair = [fg: string, bgs: Role[], min: number];

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

type Rgb = [r: number, g: number, b: number];

/** OKLCH → linear sRGB (Björn Ottosson's OKLab matrices), clipped to the sRGB gamut. */
function linearRgb([l, c, h]: Oklch): Rgb {
  const rad = (h * Math.PI) / 180;
  const a = c * Math.cos(rad);
  const b = c * Math.sin(rad);
  const l3 = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m3 = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s3 = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const clip = (x: number) => Math.min(1, Math.max(0, x));
  return [
    clip(4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3),
    clip(-1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3),
    clip(-0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3),
  ];
}

const encode = (x: number) => (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055);
const decode = (x: number) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);

/** WCAG 2 relative luminance of a linear sRGB colour. */
const luminanceOf = ([r, g, b]: Rgb) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/** `color-mix(in srgb, fg share, bg)`: mixed in gamma-encoded sRGB, as the browser does; linear sRGB back. */
function mixSrgb(fg: Oklch, share: number, bg: Oklch): Rgb {
  const [f, b] = [linearRgb(fg), linearRgb(bg)];
  return f.map((x, i) => decode(encode(x) * share + encode(b[i]) * (1 - share))) as Rgb;
}

const wcagRatio = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

export function contrastRatio(a: Oklch, b: Oklch): number {
  return wcagRatio(luminanceOf(linearRgb(a)), luminanceOf(linearRgb(b)));
}

/**
 * The capacity heatmap's washes (§5.8): index.css's --color-heat and --color-heat-over, a share of a fill over the
 * card. The cell's number, its Provisional figure and its icons sit on them.
 */
export const HEAT_WASHES: { name: string; fill: Role; share: number; on: [fg: Role, min: number][] }[] = [
  { name: 'heat', fill: 'accent', share: 0.22, on: [['textPrimary', TEXT], ['textSecondary', TEXT]] },
  { name: 'heat-over', fill: 'warning', share: 0.22, on: [['textPrimary', TEXT], ['textSecondary', TEXT], ['warningText', UI]] },
];

/** The number of team colours the pack defines (§2); index.css's --color-team-1..6 and src/ui/teamColors.ts match it. */
const TEAM_COLOUR_COUNT = 6;

/**
 * Every problem with the pack's colours, one line each; empty when it passes. Team colours are swatches, so like the
 * other fills they need 3:1 on page and card (§9.5).
 */
export function checkBrandColours(colours: BrandColours, teamColours: ColourRole[]): string[] {
  const failures: string[] = [];
  if (teamColours.length !== TEAM_COLOUR_COUNT) failures.push(`teamColours has ${teamColours.length} colours, needs ${TEAM_COLOUR_COUNT}`);
  const teamNames = teamColours.map((_, i) => `teamColours[${i}]`);
  const pairs: Pair[] = [...PAIRS, ...teamNames.map((name): Pair => [name, PAGE_CARD, UI])];
  for (const theme of ['light', 'dark'] as const) {
    const values = [
      ...(Object.keys(colours) as Role[]).map((role): [string, string] => [role, colours[role][theme]]),
      ...teamColours.map((colour, i): [string, string] => [teamNames[i], colour[theme]]),
    ];
    const parsed = new Map<string, Oklch>();
    for (const [name, value] of values) {
      const p = parseOklch(value);
      if (p) parsed.set(name, p);
      else failures.push(`${name} (${theme}) is not an oklch(L C H) colour: "${value}"`);
    }
    for (const [fg, bgs, min] of pairs) {
      const f = parsed.get(fg);
      if (!f) continue;
      for (const bg of bgs) {
        const b = parsed.get(bg);
        if (!b) continue;
        const ratio = contrastRatio(f, b);
        if (ratio < min) failures.push(`${fg} (${theme}) on ${bg} is ${ratio.toFixed(2)}:1, needs ${min}:1`);
      }
    }
    const card = parsed.get('surfaceCard');
    for (const wash of HEAT_WASHES) {
      const fill = parsed.get(wash.fill);
      if (!fill || !card) continue;
      const bg = luminanceOf(mixSrgb(fill, wash.share, card));
      for (const [fg, min] of wash.on) {
        const f = parsed.get(fg);
        if (!f) continue;
        const r = wcagRatio(luminanceOf(linearRgb(f)), bg);
        if (r < min) failures.push(`${fg} (${theme}) on the ${wash.name} wash is ${r.toFixed(2)}:1, needs ${min}:1`);
      }
    }
  }
  return failures;
}
