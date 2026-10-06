import { describe, expect, it } from 'vitest';
import { isSharedOrigin } from './sharedOrigin';

describe('isSharedOrigin (§3, §10.7)', () => {
  it('a github.io address is shared with the account’s other Pages sites', () => {
    expect(isSharedOrigin('jabopiti.github.io')).toBe(true);
    expect(isSharedOrigin('Some-Org.GitHub.io')).toBe(true);
    expect(isSharedOrigin('jabopiti.github.io.')).toBe(true);
  });

  it('a custom domain or the dev server is the app’s own', () => {
    expect(isSharedOrigin('planner.example.com')).toBe(false);
    expect(isSharedOrigin('localhost')).toBe(false);
    expect(isSharedOrigin('github.io.example.com')).toBe(false);
  });
});
