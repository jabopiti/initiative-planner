import { describe, expect, it } from 'vitest';
import { checkBrandColours, contrastRatio, parseOklch } from './contrast';
import { defaultBrandPack } from './defaultBrand';
import type { BrandColours } from './types';

const teams = defaultBrandPack.teamColours;

const withRole = (role: keyof BrandColours, theme: 'light' | 'dark', value: string): BrandColours => ({
  ...defaultBrandPack.colours,
  [role]: { ...defaultBrandPack.colours[role], [theme]: value },
});

describe('contrastRatio (§9.5)', () => {
  it('is 21:1 for white on black and 1:1 for a colour on itself', () => {
    expect(contrastRatio(parseOklch('oklch(1 0 0)')!, parseOklch('oklch(0 0 0)')!)).toBeCloseTo(21, 1);
    expect(contrastRatio(parseOklch('oklch(0.5 0.1 120)')!, parseOklch('oklch(0.5 0.1 120)')!)).toBeCloseTo(1, 5);
  });

  it('rejects anything that is not an oklch(L C H) triplet', () => {
    expect(parseOklch('#ffffff')).toBeNull();
    expect(parseOklch('oklch(1 0)')).toBeNull();
    expect(parseOklch('oklch(0.5.1 0.1 120)')).toBeNull();
    expect(parseOklch('oklch(. 0.1 120)')).toBeNull();
    expect(parseOklch('oklch(.5 0 120)')).toEqual([0.5, 0, 120]);
  });
});

describe('checkBrandColours (§9.5, §10.7)', () => {
  it('passes the default brand pack in both themes', () => {
    expect(checkBrandColours(defaultBrandPack.colours, teams)).toEqual([]);
  });

  it('names the token, theme and surface of a text pair below 4.5:1', () => {
    const failures = checkBrandColours(withRole('textMuted', 'light', 'oklch(0.622 0.021 162.6)'), teams);
    expect(failures).toContain('textMuted (light) on surfaceSubtle is 3.13:1, needs 4.5:1');
    expect(failures.every((f) => f.startsWith('textMuted (light)'))).toBe(true);
  });

  it('checks text on the warning tint behind search highlights', () => {
    expect(checkBrandColours(withRole('textSecondary', 'light', 'oklch(0.622 0.022 167.2)'), teams).some((f) => f.startsWith('textSecondary (light) on warningTint'))).toBe(true);
  });

  it('checks text on the capacity heatmap washes, mixed from the accent and Warning over the card (§5.8)', () => {
    // Secondary text light enough for every plain surface, but not for the accent wash under a cell's Provisional figure.
    expect(checkBrandColours(withRole('textSecondary', 'light', 'oklch(0.49 0.017 286)'), teams)).toEqual([
      'textSecondary (light) on the heat wash is 4.38:1, needs 4.5:1',
    ]);
  });

  it('holds the input border to 3:1, not 4.5:1', () => {
    expect(checkBrandColours(withRole('borderInput', 'dark', 'oklch(0.395 0.027 159.1)'), teams)).toContain(
      'borderInput (dark) on surfaceCard is 1.90:1, needs 3:1',
    );
  });

  it('fails a malformed colour, naming the role', () => {
    expect(checkBrandColours(withRole('accent', 'dark', 'teal'), teams)).toContain('accent (dark) is not an oklch(L C H) colour: "teal"');
  });

  it('holds every team colour to 3:1 on page and card, in both themes (§9.5)', () => {
    const tooLight = teams.map((c, i) => (i === 2 ? { ...c, light: 'oklch(0.8 0.08 205)' } : c));
    expect(checkBrandColours(defaultBrandPack.colours, tooLight)).toEqual([
      'teamColours[2] (light) on surfacePage is 1.69:1, needs 3:1',
      'teamColours[2] (light) on surfaceCard is 1.81:1, needs 3:1',
    ]);
  });

  it('needs six team colours (§2)', () => {
    expect(checkBrandColours(defaultBrandPack.colours, teams.slice(0, 5))).toContain('teamColours has 5 colours, needs 6');
  });
});
