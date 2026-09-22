import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GithubLocation } from '../brand/types';
import { checkToken } from './validateToken';

const location: GithubLocation = {
  apiBaseUrl: 'https://api.github.com',
  owner: 'jabopiti',
  repo: 'initiative-planner',
  appBranch: 'main',
  dataBranch: 'data',
};

function jsonResponse(body: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), { status, headers });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('checkToken — the outcomes table (§5.10)', () => {
  it('works: a fine-grained token that can write', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/user')) return jsonResponse({ login: 'bo' });
      return jsonResponse({ permissions: { push: true } });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await checkToken(location, 'token');
    expect(result).toEqual({ outcome: 'works', login: 'bo' });
  });

  it('classic-warning: a classic token that works, flagged by the X-OAuth-Scopes header', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/user')) return jsonResponse({ login: 'bo' }, 200, { 'X-OAuth-Scopes': 'repo' });
      return jsonResponse({ permissions: { push: true } });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await checkToken(location, 'token');
    expect(result).toEqual({ outcome: 'classic-warning', login: 'bo' });
  });

  it("cannot-see-repo: the token can't see the configured repository", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/user')) return jsonResponse({ login: 'bo' });
      return jsonResponse({ message: 'Not Found' }, 404);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await checkToken(location, 'token');
    expect(result).toEqual({ outcome: 'cannot-see-repo' });
  });

  it('read-only: the token can read but not write', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/user')) return jsonResponse({ login: 'bo' });
      return jsonResponse({ permissions: { push: false } });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await checkToken(location, 'token');
    expect(result).toEqual({ outcome: 'read-only' });
  });

  it('pending-approval: an org-pending fine-grained token', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/user')) return jsonResponse({ login: 'bo' });
      return jsonResponse({ message: 'Token requires organization approval, pending review.' }, 403);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await checkToken(location, 'token');
    expect(result).toEqual({ outcome: 'pending-approval' });
  });

  it('invalid: GitHub rejects the token outright', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ message: 'Bad credentials' }, 401));
    vi.stubGlobal('fetch', fetchMock);

    const result = await checkToken(location, 'token');
    expect(result).toEqual({ outcome: 'invalid' });
  });
});
