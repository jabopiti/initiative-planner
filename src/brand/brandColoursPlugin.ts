import type { Plugin } from 'vite';
import { coloursCss } from './coloursCss';
import { checkBrandColours } from './contrast';
import type { BrandColours } from './types';

const ID = 'virtual:brand-colours.css';
// The `.css` suffix keeps the resolved id on Vite's CSS pipeline, so the build emits it into the stylesheet.
const RESOLVED = `\0${ID}`;

/**
 * Generates the colour stylesheet from the brand pack, and refuses a pack whose colours fail the contrast rule (§9.5,
 * §10.7): the build stops, and the dev server shows the same error, naming every failing token.
 */
export function brandColoursPlugin(colours: BrandColours): Plugin {
  return {
    name: 'brand-colours',
    buildStart() {
      const failures = checkBrandColours(colours);
      if (failures.length) this.error(`Brand pack contrast:\n${failures.map((f) => `  ${f}`).join('\n')}`);
    },
    resolveId(id) {
      return id === ID ? RESOLVED : undefined;
    },
    load(id) {
      return id === RESOLVED ? coloursCss(colours) : undefined;
    },
  };
}
