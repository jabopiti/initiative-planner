import { existsSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import type { Plugin } from 'vite';
import { coloursCss, typefaceCss } from './coloursCss';
import { checkBrandColours } from './contrast';
import { checkBrandPack } from './packChecks';
import type { BrandPack } from './types';

const ID = 'virtual:brand-colours.css';
const ASSETS_ID = 'virtual:brand-assets';
const ASSETS_RESOLVED = `\0${ASSETS_ID}`;
// The `.css` suffix keeps the resolved id on Vite's CSS pipeline, so the build emits it into the stylesheet.
const RESOLVED = `\0${ID}`;

/**
 * Generates the brand stylesheet from the brand pack (colour roles, team colours and the typeface's @font-face rules),
 * and refuses a pack whose colours fail the contrast rule, whose font files are missing, or whose bands, process
 * definition or example dataset break the structural rules (§9.5, §10.7, packChecks.ts): the build stops, and the dev
 * server shows the same error, naming every problem. `brandDir` is the brand folder the typeface's
 * file paths are relative to; the font files are bundled from there, so no font is fetched from a third party (§10.9).
 */
export function brandColoursPlugin(brand: BrandPack, brandDir: string): Plugin {
  let root = process.cwd();
  // Root-relative URLs, which Vite resolves against the project root and emits as hashed assets.
  const url = (path: string) => `/${relative(root, resolve(brandDir, path)).split('\\').join('/')}`;
  return {
    name: 'brand-colours',
    configResolved(config) {
      root = config.root;
    },
    buildStart() {
      const failures = [...checkBrandColours(brand.colours, brand.teamColours), ...checkBrandPack(brand)];
      const missing = [
        ...brand.typeface.files.map((f) => ['typeface file', f.path]),
        ['logo', brand.logo.path],
        ['favicon', brand.favicon.path],
      ]
        .filter(([, path]) => !existsSync(resolve(brandDir, path)))
        .map(([what, path]) => `${what} ${path} not found in ${brandDir}`);
      if (failures.length || missing.length) this.error(`Brand pack:\n${[...failures, ...missing].map((f) => `  ${f}`).join('\n')}`);
    },
    resolveId(id) {
      return id === ID ? RESOLVED : id === ASSETS_ID ? ASSETS_RESOLVED : undefined;
    },
    // The tab's title and favicon come from the pack; `pre` so Vite then hashes the favicon like any asset in the page.
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        const title = brand.pageTitle.replace(/&/g, '&amp;').replace(/</g, '&lt;');
        return html.replace(/<title>[^<]*<\/title>/, `<link rel="icon" href="${url(brand.favicon.path)}" />\n    <title>${title}</title>`);
      },
    },
    load(id) {
      if (id === ASSETS_RESOLVED) return `import logo from '${url(brand.logo.path)}';\nexport const logoUrl = logo;`;
      if (id !== RESOLVED) return undefined;
      return `${typefaceCss(brand.typeface, url)}\n${coloursCss(brand.colours, brand.teamColours)}`;
    },
  };
}
