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

/**
 * Regression coverage for slice 002's incident (spike-findings.md): a
 * Contents API call that omits `branch` silently lands on the repository's
 * default branch instead of erroring. Slice 003's own scope note requires
 * this be covered by a test, not just review.
 */
describe('GithubClient — branch is always explicit (§10.3)', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

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
});
