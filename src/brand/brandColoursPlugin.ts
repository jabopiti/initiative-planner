import { existsSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import type { Plugin } from 'vite';
import { coloursCss, typefaceCss } from './coloursCss';
import { checkBrandColours } from './contrast';
import type { BrandPack } from './types';

const ID = 'virtual:brand-colours.css';
// The `.css` suffix keeps the resolved id on Vite's CSS pipeline, so the build emits it into the stylesheet.
const RESOLVED = `\0${ID}`;

export type BrandStyles = Pick<BrandPack, 'colours' | 'teamColours' | 'typeface'>;

/**
 * Generates the brand stylesheet from the brand pack (colour roles, team colours and the typeface's @font-face rules),
 * and refuses a pack whose colours fail the contrast rule or whose font files are missing (§9.5, §10.7): the build
 * stops, and the dev server shows the same error, naming every problem. `brandDir` is the brand folder the typeface's
 * file paths are relative to; the font files are bundled from there, so no font is fetched from a third party (§10.9).
 */
export function brandColoursPlugin(brand: BrandStyles, brandDir: string): Plugin {
  let root = process.cwd();
  return {
    name: 'brand-colours',
    configResolved(config) {
      root = config.root;
    },
    buildStart() {
      const failures = checkBrandColours(brand.colours, brand.teamColours);
      const missing = brand.typeface.files.filter((f) => !existsSync(resolve(brandDir, f.path))).map((f) => `typeface file ${f.path} not found in ${brandDir}`);
      if (failures.length || missing.length) this.error(`Brand pack:\n${[...failures, ...missing].map((f) => `  ${f}`).join('\n')}`);
    },
    resolveId(id) {
      return id === ID ? RESOLVED : undefined;
    },
    load(id) {
      if (id !== RESOLVED) return undefined;
      // Root-relative URLs, which Vite resolves against the project root and emits as hashed assets.
      const url = (path: string) => `/${relative(root, resolve(brandDir, path)).split('\\').join('/')}`;
      return `${typefaceCss(brand.typeface, url)}\n${coloursCss(brand.colours, brand.teamColours)}`;
    },
  };
}
