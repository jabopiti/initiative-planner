import { describe, expect, it } from 'vitest';
import { tokenCreationUrl } from './tokenCreationUrl';

const location = {
  apiBaseUrl: 'https://api.github.com',
  owner: 'jabopiti',
  repo: 'initiative-planner',
  appBranch: 'main',
  dataBranch: 'data',
};

function nameOf(url: string): string {
  return new URL(url).searchParams.get('name') ?? '';
}

describe('tokenCreationUrl', () => {
  it('keeps the prefilled token name under GitHub\'s 40-character limit', () => {
    const name = nameOf(tokenCreationUrl(location, 'Initiative Planner'));
    expect(name.length).toBeLessThan(40);
    expect(name).toContain('Initiative Planner');
  });

  it('falls back to the product name, truncated, when it is long', () => {
    const name = nameOf(tokenCreationUrl(location, 'A Very Long Product Name For A Deployment Fork'));
    expect(name.length).toBeLessThan(40);
  });
});
