// The brand pack is TypeScript, which these plain-node scripts cannot import: read a quoted string value from it.
import { readFileSync } from 'node:fs';

const brand = readFileSync(new URL('../src/brand/defaultBrand.ts', import.meta.url), 'utf8');

export const brandValue = (key) => brand.match(new RegExp(`${key}:\\s*'([^']+)'`))?.[1];
