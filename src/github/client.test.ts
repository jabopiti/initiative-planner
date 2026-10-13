import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GithubLocation } from '../brand/types';
import { FILES_PER_QUERY, gitBlobSha, GithubClient, graphqlUrl, REQUEST_TIMEOUT_MS, TRUNCATED } from './client';
import { WriteQueue } from '../sync/WriteQueue';
import { GithubApiError } from './errors';
import type { WriteBudget } from './writeBudget';
import { defaultBrandPack } from '@brand';
import { fakeGithub } from '../sync/testing/fakeGithub';

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

  it('sends nothing when the bootstrap cannot read the branch head', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      const u = String(url);
      if (u.includes('/git/ref/heads/')) return new Response(JSON.stringify({ message: 'Server Error' }), { status: 500 });
      throw new Error(`unexpected call: ${u}`);
    });

    const client = new GithubClient(location, () => 'token');
    await expect(
      client.createFilesCommit({
        branch: location.dataBranch,
        files: [{ path: 'dataset.json', content: '{}' }],
        message: 'init',
      }),
    ).rejects.toMatchObject({ cause_: 'unreachable' });
  });

  it.each(['data', 'planning/data'])(
    'commits onto an existing branch %s with one GraphQL createCommitOnBranch that names it and the head it read (slice 064)',
    async (branch) => {
      const calls: string[] = [];
      let input: { branch: { branchName: string }; expectedHeadOid: string; message: { headline: string } } | undefined;
      fetchMock.mockImplementation(async (url: string, init: RequestInit = {}) => {
        const u = String(url);
        const method = init.method ?? 'GET';
        calls.push(`${method} ${u}`);
        if (method === 'GET' && u.endsWith(`/git/ref/heads/${branch}`)) return new Response(JSON.stringify({ object: { sha: 'parent-sha' } }), { status: 200 });
        if (method === 'POST' && u === 'https://api.github.com/graphql') {
          input = (JSON.parse(init.body as string) as { variables: { input: NonNullable<typeof input> } }).variables.input;
          return new Response(JSON.stringify({ data: { createCommitOnBranch: { commit: { oid: 'new-sha' } } } }), { status: 200 });
        }
        return new Response(JSON.stringify({ message: 'Not Found' }), { status: 404 });
      });

      const result = await new GithubClient(location, () => 'token').createFilesCommit({ branch, files: [{ path: 'dataset.json', content: '{}' }], message: 'init' });

      expect(result).toEqual({ commitSha: 'new-sha', parent: 'parent-sha', written: [{ path: 'dataset.json', content: '{}', sha: '9e26dfeeb6e641a33dae4961196235bdb965b21b' }], deleted: [] });
      expect(input).toMatchObject({ branch: { branchName: branch }, expectedHeadOid: 'parent-sha', message: { headline: 'init' } });
      expect(calls.filter((c) => !c.startsWith('GET '))).toEqual(['POST https://api.github.com/graphql']);
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
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ commit: { sha: 'c2', parents: [{ sha: 'c1' }] } }), { status: 200 }));
    const client = new GithubClient(location, () => 'token');

    // The commit the delete made, and the one it sits on (slice 065).
    await expect(client.deleteFile({ path: 'initiatives/i1.json', branch: location.dataBranch, message: 'Payments API: deleted', sha: 'sha-1' })).resolves.toEqual({ sha: 'c2', parent: 'c1' });

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

describe('GithubClient — putFile on a file that is gone (slice 017)', () => {
  it('says the file was created when GitHub answers 201, as it does for a sha whose file was deleted since', async () => {
    const client = new GithubClient(location, () => 'token');
    const args = { path: 'initiatives/i1.json', branch: location.dataBranch, content: '{}', message: 'x', sha: 'sha-1' };

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ content: { sha: 'sha-2' } }), { status: 201 }));
    await expect(client.putFile(args)).resolves.toEqual({ sha: 'sha-2', created: true, commit: null });

    // With the commit it made and the one it sits on, when GitHub names them (slice 065).
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ content: { sha: 'sha-3' }, commit: { sha: 'c2', parents: [{ sha: 'c1' }] } }), { status: 200 }));
    await expect(client.putFile(args)).resolves.toEqual({ sha: 'sha-3', created: false, commit: { sha: 'c2', parent: 'c1' } });
  });
});

describe('GithubClient — failures are classified and requests end (slice 043)', () => {
  const put = (client: GithubClient) => client.putFile({ path: 'teams.json', branch: 'data', content: '[]', message: 'm', sha: 's' });
  const putArgs = { path: 'teams.json', branch: location.dataBranch, content: '[]', message: 'x', sha: 'sha-1' };
  const refused = (status: number, headers: Record<string, string> = {}, message = 'Forbidden') =>
    new Response(JSON.stringify({ message }), { status, headers });

  it('reads a secondary-limit 403 on a save as rate-limited, not access-denied', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ message: 'You have exceeded a secondary rate limit.' }), { status: 403, headers: { 'retry-after': '60' } }),
    );
    await expect(put(new GithubClient(location, () => 'token'))).rejects.toMatchObject({ cause_: 'rate-limited', status: 403 });
  });

  it('reads a plain 403 on a save as access-denied', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ message: 'Resource not accessible by personal access token' }), { status: 403 }));
    await expect(put(new GithubClient(location, () => 'token'))).rejects.toMatchObject({ cause_: 'access-denied' });
  });

  it.each([500, 502, 503])('reads a %i on a read as unreachable', async (status) => {
    fetchMock.mockResolvedValue(new Response('', { status }));
    const client = new GithubClient(location, () => 'token');
    await expect(client.getFile({ path: 'teams.json', branch: 'data' })).rejects.toMatchObject({ cause_: 'unreachable', status });
  });

  it('reads a network error as unreachable', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(put(new GithubClient(location, () => 'token'))).rejects.toMatchObject({ cause_: 'unreachable' });
  });

  describe('with a fake clock', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('aborts a request that never answers at the timeout, as unreachable, and the next queued write runs', async () => {
      const signals: AbortSignal[] = [];
      fetchMock.mockImplementationOnce((_url: string, init: RequestInit) => {
        signals.push(init.signal as AbortSignal);
        return new Promise(() => {});
      });
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ content: { sha: 'new' } }), { status: 200 }));
      const client = new GithubClient(location, () => 'token', undefined, { timeoutMs: 30_000 });
      const queue = new WriteQueue();

      const hung = queue.run(() => put(client));
      const next = queue.run(() => put(client));
      const hungSettled = expect(hung).rejects.toMatchObject({ cause_: 'unreachable' });

      await vi.advanceTimersByTimeAsync(29_999);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      await hungSettled;
      expect(signals[0].aborted).toBe(true);
      await expect(next).resolves.toEqual({ sha: 'new', created: false, commit: null });
    });

    it('times out a response whose body stalls after the headers, so its reader never hangs', async () => {
      fetchMock.mockResolvedValue(new Response(new ReadableStream({ start() {} }), { status: 200 }));
      const settled = expect(put(new GithubClient(location, () => 'token'))).rejects.toMatchObject({ cause_: 'unreachable' });
      await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);
      await settled;
    });

    it('gives a large upload longer than the timeout to send, as for a slow link', async () => {
      fetchMock.mockImplementation(() => new Promise(() => {}));
      const client = new GithubClient(location, () => 'token');
      let settled = false;
      const result = client
        .putFile({ path: 'teams.json', branch: 'data', content: 'x'.repeat(1_000_000), message: 'm', sha: 's' })
        .catch((error: unknown) => {
          settled = true;
          throw error;
        });
      const rejected = expect(result).rejects.toMatchObject({ cause_: 'unreachable' });

      await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS + 30_000);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(120_000);
      await rejected;
    });

    it('defaults the timeout to 30 s', async () => {
      fetchMock.mockImplementation(() => new Promise(() => {}));
      const settled = expect(put(new GithubClient(location, () => 'token'))).rejects.toMatchObject({ cause_: 'unreachable' });
      await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);
      expect(REQUEST_TIMEOUT_MS).toBe(30_000);
      await settled;
    });
  });

  it('bootstrapping an existing branch never commits over another client\'s commit that lands first: it returns that head', async () => {
    const fake = fakeGithub();
    vi.stubGlobal('fetch', fake.fetchMock);
    fake.seed('roles.json', []);
    fake.beforeCommit(() => fake.seed('countries.json', [])); // the other client's baseline lands first

    const client = new GithubClient(defaultBrandPack.github, () => 'token');
    const result = await client.createFilesCommit({ branch: 'data', files: [{ path: 'dataset.json', content: '{}' }], message: 'm' });

    expect(fake.graphqlCommits).toEqual([]);
    expect(fake.has('dataset.json')).toBe(false);
    expect(result).toEqual({ commitSha: 'commit-3', parent: null, written: [], deleted: [] });
    expect(fake.requests().filter((r) => r === 'POST /graphql')).toHaveLength(1);
  });

  it('bootstrapping an existing branch commits on its head when nothing else lands', async () => {
    const fake = fakeGithub();
    vi.stubGlobal('fetch', fake.fetchMock);
    fake.seed('roles.json', []);

    const client = new GithubClient(defaultBrandPack.github, () => 'token');
    await client.createFilesCommit({ branch: 'data', files: [{ path: 'dataset.json', content: '{}' }], message: 'm' });

    expect(fake.graphqlCommits).toEqual([{ message: 'm', files: ['dataset.json'], deleted: [] }]);
    expect(fake.has('roles.json')).toBe(true);
  });

  it('takes a shorter timeout when one is given', async () => {
    vi.useFakeTimers();
    try {
      fetchMock.mockImplementationOnce(
        (_url: string, init: RequestInit) =>
          new Promise((_, reject) => init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))),
      );
      const put = new GithubClient(location, () => 'token', undefined, { timeoutMs: 1000 }).putFile(putArgs);
      const outcome = expect(put).rejects.toMatchObject({ cause_: 'unreachable' });
      await vi.advanceTimersByTimeAsync(1000);
      await outcome;
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not send a write that waited for the write budget once GitHub has started limiting requests meanwhile', async () => {
    let place!: () => void;
    const budget = { reserve: () => new Promise<void>((resolve) => (place = resolve)) } as unknown as WriteBudget;
    const client = new GithubClient(location, () => 'token', undefined, { budget });
    const put = client.putFile(putArgs);
    const outcome = expect(put).rejects.toMatchObject({ cause_: 'rate-limited' });
    fetchMock.mockResolvedValueOnce(refused(403, { 'retry-after': '60' }, 'You have exceeded a secondary rate limit.'));
    await expect(client.getFile({ path: 'teams.json', branch: location.dataBranch })).rejects.toMatchObject({ cause_: 'rate-limited' });

    place();
    await outcome;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('classifies the token check’s own /user call the same way', async () => {
    fetchMock.mockResolvedValueOnce(refused(403, { 'retry-after': '60' }, 'You have exceeded a secondary rate limit.'));
    await expect(new GithubClient(location, () => 'token').checkToken()).rejects.toMatchObject({ cause_: 'rate-limited' });
  });

  it('builds the commit again on the new head when another commit moved the branch first (STALE_DATA)', async () => {
    let refGets = 0;
    const expected: string[] = [];
    fetchMock.mockImplementation(async (url: string, init: RequestInit = {}) => {
      const u = String(url);
      const method = init.method ?? 'GET';
      if (method === 'GET' && u.endsWith('/git/ref/heads/data')) {
        refGets += 1;
        return new Response(JSON.stringify({ object: { sha: `head-${refGets}` } }), { status: 200 });
      }
      if (method === 'POST' && u.endsWith('/graphql')) {
        const oid = (JSON.parse(init.body as string) as { variables: { input: { expectedHeadOid: string } } }).variables.input.expectedHeadOid;
        expected.push(oid);
        return expected.length === 1
          ? new Response(JSON.stringify({ data: { createCommitOnBranch: null }, errors: [{ type: 'STALE_DATA', message: 'Expected branch to point to' }] }), { status: 200 })
          : new Response(JSON.stringify({ data: { createCommitOnBranch: { commit: { oid: `commit-on-${oid}` } } } }), { status: 200 });
      }
      throw new Error(`unexpected call: ${method} ${u}`);
    });

    const result = await new GithubClient(location, () => 'token').commitOnHead({
      branch: location.dataBranch,
      message: 'Dataset reset',
      build: async () => ({ files: [{ path: 'teams.json', content: '[]' }], deletes: [] }),
    });

    expect(expected).toEqual(['head-1', 'head-2']);
    expect(result).toMatchObject({ commitSha: 'commit-on-head-2' });
  });
});

describe('GithubClient — GraphQL commits (slice 064)', () => {
  it('derives the GraphQL endpoint from the API base URL, not appending to it', () => {
    expect(graphqlUrl('https://api.github.com')).toBe('https://api.github.com/graphql');
    expect(graphqlUrl('https://github.example.com/api/v3')).toBe('https://github.example.com/api/graphql');
    expect(graphqlUrl('https://github.example.com/api/v3/')).toBe('https://github.example.com/api/graphql');
  });

  it('computes a file’s version as GitHub does, the git blob sha', async () => {
    expect(await gitBlobSha('{}')).toBe('9e26dfeeb6e641a33dae4961196235bdb965b21b');
    expect(await gitBlobSha('Zürich – € ✓')).toBe('17730bcd731d177bd88c85eed4cea412ecf12f2e'); // git hash-object, UTF-8 bytes counted
  });

  it('a commit answered with a 504 that landed anyway is not sent again', async () => {
    const posts: string[] = [];
    fetchMock.mockImplementation(async (url: string, init: RequestInit = {}) => {
      const u = String(url);
      const method = init.method ?? 'GET';
      if (method === 'POST') {
        posts.push(u);
        return new Response(JSON.stringify({ message: 'timeout' }), { status: 504 });
      }
      if (u.endsWith('/git/ref/heads/data')) return new Response(JSON.stringify({ object: { sha: posts.length ? 'ours' : 'parent' } }), { status: 200 });
      if (u.endsWith('/git/commits/ours')) return new Response(JSON.stringify({ message: 'Dataset reset', parents: [{ sha: 'parent' }] }), { status: 200 });
      throw new Error(`unexpected call: ${method} ${u}`);
    });

    const result = await new GithubClient(location, () => 'token').commitOnHead({
      branch: location.dataBranch,
      message: 'Dataset reset',
      build: async () => ({ files: [{ path: 'teams.json', content: '[]' }], deletes: [] }),
    });

    expect(result).toMatchObject({ commitSha: 'ours' });
    expect(posts).toHaveLength(1);
  });
});

describe('GithubClient — cheaper pulls (slice 065)', () => {
  it('lists every file of a commit in one recursive tree request, and an absent branch or empty repository as none', async () => {
    const client = new GithubClient(location, () => 'token');
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ tree: [{ path: 'teams.json', sha: 's1', type: 'blob', mode: '100644' }, { path: 'initiatives', sha: 'd', type: 'tree' }], truncated: false }), { status: 200 }),
    );
    await expect(client.listTree({ ref: 'c1' })).resolves.toEqual({
      entries: [{ path: 'teams.json', sha: 's1', type: 'blob' }, { path: 'initiatives', sha: 'd', type: 'tree' }],
      truncated: false,
    });
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.github.com/repos/jabopiti/initiative-planner/git/trees/c1?recursive=1');

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ message: 'Not Found' }), { status: 404 }));
    await expect(client.listTree({ ref: 'data' })).resolves.toEqual({ entries: [], truncated: false });
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ message: 'Git Repository is empty.' }), { status: 409 }));
    await expect(client.listTree({ ref: 'data' })).resolves.toEqual({ entries: [], truncated: false });
  });

  it('reads files in one GraphQL query by commit and path, passed as variables; a cut file is marked, a missing one left out', async () => {
    const budget = { reserve: vi.fn(async () => {}) } as unknown as WriteBudget;
    const client = new GithubClient(location, () => 'token', undefined, { budget });
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: {
            repository: {
              f0: { oid: 's1', text: '[]', isTruncated: false },
              f1: { oid: 's2', text: '{"cut', isTruncated: true },
              f2: null,
            },
          },
        }),
        { status: 200 },
      ),
    );

    const read = await client.readFiles({ ref: 'c1', paths: ['teams.json', 'initiatives/big.json', 'initiatives/gone.json'] });

    expect([...read]).toEqual([
      ['teams.json', { content: '[]', sha: 's1' }],
      ['initiatives/big.json', TRUNCATED],
    ]);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.github.com/graphql');
    const body = JSON.parse(init.body as string) as { query: string; variables: Record<string, string> };
    expect(body.variables).toMatchObject({ owner: 'jabopiti', name: 'initiative-planner', e0: 'c1:teams.json', e2: 'c1:initiatives/gone.json' });
    expect(body.query).not.toContain('teams.json');
    // A read takes no place in the write budget (§10.3).
    expect(budget.reserve).not.toHaveBeenCalled();
    await expect(client.readFiles({ ref: 'c1', paths: Array.from({ length: FILES_PER_QUERY + 1 }, (_, i) => `f${i}`) })).rejects.toThrow();
  });

  it('a GraphQL read GitHub limits pauses requests as a REST limit does; another GraphQL error fails the read', async () => {
    const client = new GithubClient(location, () => 'token');
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ errors: [{ type: 'RATE_LIMITED', message: 'API rate limit exceeded' }] }), { status: 200, headers: { 'retry-after': '30' } }),
    );
    await expect(client.readFiles({ ref: 'c1', paths: ['teams.json'] })).rejects.toMatchObject({ cause_: 'rate-limited' });
    expect(client.pausedUntil).not.toBeNull();

    const other = new GithubClient(location, () => 'token');
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ errors: [{ type: 'FORBIDDEN', message: 'no' }] }), { status: 200 }));
    await expect(other.readFiles({ ref: 'c1', paths: ['teams.json'] })).rejects.toMatchObject({ cause_: 'unknown' });
  });
});
