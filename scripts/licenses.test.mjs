import { describe, expect, it } from 'vitest';
import { disallowedLicenses, licenseAllowed } from './licenses.mjs';

describe('licenseAllowed (§10.8 Dependencies)', () => {
  it('allows listed licences and SPDX expressions that offer one', () => {
    expect(licenseAllowed('MIT')).toBe(true);
    expect(licenseAllowed('(MIT OR GPL-3.0-only)')).toBe(true);
    expect(licenseAllowed('MIT AND ISC')).toBe(true);
  });

  it('refuses unlisted licences, and an AND with one unlisted side', () => {
    expect(licenseAllowed('GPL-3.0-only')).toBe(false);
    expect(licenseAllowed('MIT AND GPL-3.0-only')).toBe(false);
    expect(licenseAllowed('UNLICENSED')).toBe(false);
  });
});

describe('disallowedLicenses', () => {
  const lockfile = {
    packages: {
      '': { name: 'app', license: 'UNLICENSED' },
      'node_modules/react': { license: 'MIT' },
      'node_modules/copyleft': { license: 'GPL-3.0-only' },
      'node_modules/react/node_modules/nested': { license: 'AGPL-3.0' },
      'node_modules/unknown': {},
      'node_modules/vitest': { license: 'GPL-3.0-only', dev: true },
    },
  };

  it('reports shipped packages with an unlisted or missing licence, not the root or dev-only ones', () => {
    expect(disallowedLicenses(lockfile)).toEqual(['copyleft: GPL-3.0-only', 'nested: AGPL-3.0', 'unknown: no licence recorded']);
  });
});
