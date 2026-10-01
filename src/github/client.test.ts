import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GithubLocation } from '../brand/types';
import { GithubClient } from './client';
import { GithubApiError } from './errors';

const location: GithubLocation = {
  apiBaseUrl: 'https://api.github.com',
  owner: 'jabopiti',
  repo: 'initiative-planner',
  appBranch: 'main',
  dataBranch: 'data',
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/**
 * Regression coverage for slice 002's incident (spike-findings.md): a
 * Contents API call that omits `branch` silently lands on the repository's
 * default branch instead of erroring. Slice 003's own scope note requires
 * this be covered by a test, not just review.
 */
describe('GithubClient — branch is always explicit (§10.3)', () => {
  it('refuses getFile when branch is omitted, without ever calling fetch', async () => {
    const client = new GithubClient(location, () => 'token');
    // `as any` bypasses the compile-time requirement to simulate a bug that
    // slips past TypeScript (e.g. a value computed as '' or undefined at runtime).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(client.getFile({ path: 'teams.json', branch: '' } as any)).rejects.toThrow(GithubApiError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses putFile when branch is omitted, without ever calling fetch', async () => {
    const client = new GithubClient(location, () => 'token');
    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client.putFile({ path: 'teams.json', branch: undefined as any, content: '[]', message: 'x' }),
    ).rejects.toThrow(GithubApiError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses createFilesCommit when branch is omitted, without ever calling fetch', async () => {
    const client = new GithubClient(location, () => 'token');
    await expect(
      client.createFilesCommit({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        branch: null as any,
        files: [{ path: 'dataset.json', content: '{}' }],
        message: 'init',
      }),
    ).rejects.toThrow(GithubApiError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends the data branch, never the app branch, on every real Contents API call', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ content: btoa('[]'), sha: 'sha-1' }), { status: 200 }),
    );

    const client = new GithubClient(location, () => 'token');
    await client.getFile({ path: 'teams.json', branch: location.dataBranch });

    const [calledUrl] = fetchMock.mock.calls[0] as [string];
    expect(calledUrl).toContain(`ref=${location.dataBranch}`);
    expect(calledUrl).not.toContain(`ref=${location.appBranch}`);
  });

  it('sends `branch` in the PUT body on every write — this is the exact incident from spike-findings.md', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ content: { sha: 'sha-2' } }), { status: 200 }),
    );

    const client = new GithubClient(location, () => 'token');
    await client.putFile({ path: 'teams.json', branch: location.dataBranch, content: '[]', message: 'update' });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as { branch: string };
    expect(body.branch).toBe('data');
    expect(body.branch).not.toBe('main');
  });

  it('checks repo access at /repos/{owner}/{repo} without a trailing slash, which GitHub answers with a 404', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ permissions: { push: true } }), { status: 200 }));

    const client = new GithubClient(location, () => 'token');
    const access = await client.checkRepoAccess();

    const [calledUrl] = fetchMock.mock.calls[0] as [string];
    expect(calledUrl).toBe('https://api.github.com/repos/jabopiti/initiative-planner');
    expect(access).toEqual({ visible: true, canWrite: true });
  });

  it('calls the configured API host for checkToken, not a hardcoded github.com', async () => {
    const enterpriseLocation: GithubLocation = { ...location, apiBaseUrl: 'https://github.example.com/api/v3' };
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ login: 'bo' }), { status: 200 }));

    const client = new GithubClient(enterpriseLocation, () => 'token');
    await client.checkToken();

    const [calledUrl] = fetchMock.mock.calls[0] as [string];
    expect(calledUrl).toBe('https://github.example.com/api/v3/user');
  });

  it("does not produce an unhandled rejection when the ref GET fails while a blob upload is also failing", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      const u = String(url);
      if (u.includes('/git/ref/heads/')) return new Response(JSON.stringify({ message: 'Server Error' }), { status: 500 });
      if (u.endsWith('/git/blobs')) return new Response(JSON.stringify({ message: 'Forbidden' }), { status: 403 });
      throw new Error(`unexpected call: ${u}`);
    });

    const client = new GithubClient(location, () => 'token');
    await expect(
      client.createFilesCommit({
        branch: location.dataBranch,
        files: [{ path: 'dataset.json', content: '{}' }],
        message: 'init',
      }),
    ).rejects.toThrow(GithubApiError);
    // If the blob-upload promise's rejection were left unobserved, it would surface as an
    // unhandled rejection — vitest reports that as a failure of this test.
  });

  it.each(['data', 'planning/data'])(
    'updates an existing branch %s through PATCH git/refs/heads/{branch} (plural), not the singular read URL, which 404s, with `/` kept unencoded',
    async (branch) => {
      const calls: string[] = [];
      fetchMock.mockImplementation(async (url: string, init: RequestInit = {}) => {
        const u = String(url);
        const method = init.method ?? 'GET';
        calls.push(`${method} ${u}`);
        if (method === 'GET' && u.endsWith(`/git/ref/heads/${branch}`)) return new Response(JSON.stringify({ object: { sha: 'parent-sha' } }), { status: 200 });
        if (method === 'GET' && u.endsWith('/git/commits/parent-sha')) return new Response(JSON.stringify({ tree: { sha: 'base-tree' } }), { status: 200 });
        if (method === 'POST' && u.endsWith('/git/blobs')) return new Response(JSON.stringify({ sha: 'blob-1' }), { status: 200 });
        if (method === 'POST' && u.endsWith('/git/trees')) return new Response(JSON.stringify({ sha: 'tree-1' }), { status: 200 });
        if (method === 'POST' && u.endsWith('/git/commits')) return new Response(JSON.stringify({ sha: 'new-sha' }), { status: 200 });
        // GitHub answers a PATCH to the singular `git/ref/...` URL with a 404.
        if (method === 'PATCH' && u.endsWith(`/git/refs/heads/${branch}`)) return new Response(JSON.stringify({ object: { sha: 'new-sha' } }), { status: 200 });
        return new Response(JSON.stringify({ message: 'Not Found' }), { status: 404 });
      });

      const client = new GithubClient(location, () => 'token');
      const result = await client.createFilesCommit({
        branch,
        files: [{ path: 'dataset.json', content: '{}' }],
        message: 'init',
      });

      expect(result.commitSha).toBe('new-sha');
      expect(calls).toContain(`GET https://api.github.com/repos/jabopiti/initiative-planner/git/ref/heads/${branch}`);
      expect(calls).toContain(`PATCH https://api.github.com/repos/jabopiti/initiative-planner/git/refs/heads/${branch}`);
    },
  );

  it('returns the winning commit sha, not its own dangling one, when it loses the bootstrap race', async () => {
    // GET .../git/ref/heads/data is called twice: once (404, branch doesn't exist yet) before
    // the ref-create race, and once more (200, the actual winner) after losing that race — a
    // call counter distinguishes the two responses.
    let refCallCount = 0;
    fetchMock.mockImplementation(async (url: string, init: RequestInit = {}) => {
      const u = String(url);
      const method = init.method ?? 'GET';
      if (method === 'GET' && u.includes('/git/ref/heads/data')) {
        refCallCount += 1;
        if (refCallCount === 1) return new Response(JSON.stringify({ message: 'Not Found' }), { status: 404 });
        return new Response(JSON.stringify({ object: { sha: 'the-actual-winning-sha' } }), { status: 200 });
      }
      if (method === 'POST' && u.endsWith('/git/blobs')) return new Response(JSON.stringify({ sha: 'blob-1' }), { status: 200 });
      if (method === 'POST' && u.endsWith('/git/trees')) return new Response(JSON.stringify({ sha: 'tree-1' }), { status: 200 });
      if (method === 'POST' && u.endsWith('/git/commits')) return new Response(JSON.stringify({ sha: 'my-dangling-sha' }), { status: 200 });
      if (method === 'POST' && u.endsWith('/git/refs')) {
        return new Response(JSON.stringify({ message: 'Reference already exists' }), { status: 422 });
      }
      throw new Error(`unexpected call: ${method} ${u}`);
    });

    const client = new GithubClient(location, () => 'token');
    const result = await client.createFilesCommit({
      branch: location.dataBranch,
      files: [{ path: 'dataset.json', content: '{}' }],
      message: 'init',
    });

    expect(result.commitSha).toBe('the-actual-winning-sha');
    expect(result.commitSha).not.toBe('my-dangling-sha');
  });
});

describe('GithubClient — edge cases (slice 040)', () => {
  it('keeps `/` unencoded in the branch head ref URL, for a data branch like planning/data', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ object: { sha: 'head-sha' } }), { status: 200 }));

    const client = new GithubClient(location, () => 'token');
    await client.getBranchHead({ branch: 'planning/data', etag: null });

    const [calledUrl] = fetchMock.mock.calls[0] as [string];
    expect(calledUrl).toBe('https://api.github.com/repos/jabopiti/initiative-planner/git/ref/heads/planning/data');
  });

  it('reads a file over 1 MB through the blob API when the Contents response carries no inline content', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      const u = String(url);
      if (u.includes('/contents/')) {
        return new Response(JSON.stringify({ content: '', encoding: 'none', sha: 'big-file-sha' }), { status: 200 });
      }
      if (u.endsWith('/git/blobs/big-file-sha')) {
        return new Response(JSON.stringify({ sha: 'big-file-sha', encoding: 'base64', content: btoa('[]') }), { status: 200 });
      }
      throw new Error(`unexpected call: ${u}`);
    });

    const client = new GithubClient(location, () => 'token');
    const result = await client.getFile({ path: 'people.json', branch: location.dataBranch });

    expect(result).toEqual({ content: '[]', sha: 'big-file-sha' });
  });

  it("returns null, not a thrown error, when a large file's blob has gone by the time the fallback fetches it", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      const u = String(url);
      if (u.includes('/contents/')) {
        return new Response(JSON.stringify({ content: '', encoding: 'none', sha: 'vanished-sha' }), { status: 200 });
      }
      if (u.endsWith('/git/blobs/vanished-sha')) {
        return new Response(JSON.stringify({ message: 'Not Found' }), { status: 404 });
      }
      throw new Error(`unexpected call: ${u}`);
    });

    const client = new GithubClient(location, () => 'token');
    const result = await client.getFile({ path: 'people.json', branch: location.dataBranch });

    expect(result).toBeNull();
  });
});

describe('GithubClient — deleteFile (slice 017)', () => {
  it('refuses deleteFile when branch is omitted, without ever calling fetch', async () => {
    const client = new GithubClient(location, () => 'token');
    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client.deleteFile({ path: 'initiatives/i1.json', branch: '' as any, message: 'x', sha: 'sha-1' }),
    ).rejects.toThrow(GithubApiError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends DELETE with the sha, message and data branch in the body', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ commit: {} }), { status: 200 }));
    const client = new GithubClient(location, () => 'token');

    await expect(client.deleteFile({ path: 'initiatives/i1.json', branch: location.dataBranch, message: 'Payments API: deleted', sha: 'sha-1' })).resolves.toBe('deleted');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.github.com/repos/jabopiti/initiative-planner/contents/initiatives/i1.json');
    expect(init.method).toBe('DELETE');
    expect(JSON.parse(init.body as string)).toEqual({ message: 'Payments API: deleted', sha: 'sha-1', branch: 'data' });
  });

  it('reports a file that is already gone, and a stale sha as a conflict', async () => {
    const client = new GithubClient(location, () => 'token');
    const args = { path: 'initiatives/i1.json', branch: location.dataBranch, message: 'x', sha: 'sha-1' };

    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 404 }));
    await expect(client.deleteFile(args)).resolves.toBe('gone');

    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 409 }));
    await expect(client.deleteFile(args)).rejects.toMatchObject({ cause_: 'conflict', status: 409 });
  });
});
