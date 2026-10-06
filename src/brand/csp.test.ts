import { describe, expect, it } from 'vitest';
import { buildCsp } from './csp';

describe('buildCsp (§10.9)', () => {
  it('allows the configured API host for connections and no other origin', () => {
    const csp = buildCsp('https://api.github.com');
    expect(csp).toContain("connect-src 'self' https://api.github.com;");
    expect(csp.match(/https?:\/\/[^\s;]+/g)).toEqual(['https://api.github.com']);
  });

  it('follows a GitHub Enterprise host, path and all, and drops api.github.com', () => {
    const csp = buildCsp('https://github.example.com/api/v3');
    expect(csp).toContain("connect-src 'self' https://github.example.com;");
    expect(csp).not.toContain('api.github.com');
  });

  it('keeps scripts to the app’s own files, with no inline code or eval', () => {
    const csp = buildCsp('https://api.github.com');
    expect(csp).toContain("script-src 'self';");
    expect(csp).not.toMatch(/script-src[^;]*('unsafe-inline'|'unsafe-eval')/);
  });

  it('leaves out frame-ancestors, which browsers ignore in a <meta> policy (§10.1)', () => {
    expect(buildCsp('https://api.github.com')).not.toContain('frame-ancestors');
  });
});
