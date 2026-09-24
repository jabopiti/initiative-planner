import type { GithubLocation } from '../brand/types';
import { decodeBase64Utf8, encodeBase64Utf8 } from './base64';
import { GithubApiError, classifyStatus } from './errors';

/**
 * Thin wrapper over the GitHub Contents API. `branch` is a required,
 * explicitly-named argument on every call — never a default parameter and
 * never optional — because GitHub silently defaults an omitted `branch` to
 * the repository's default branch (the app branch) instead of erroring
 * (§10.3; spike-findings.md's incident). The runtime guard below is
 * defence in depth beneath TypeScript's own "missing required property"
 * check; github/client.test.ts exercises both.
 */

export interface GetFileResult {
  content: string;
  sha: string;
}

export interface GetFileArgs {
  path: string;
  branch: string;
}

export interface PutFileArgs {
  path: string;
  branch: string;
  content: string;
  message: string;
  /** Omit only when creating a brand-new file; required to update an existing one. */
  sha?: string;
}

export interface PutFileResult {
  sha: string;
}

/** Parse a fetched file's JSON content, or `fallback` when the file doesn't exist (§10.2: a missing master file means "empty"). */
export function parseJsonFile<T>(file: GetFileResult | null, fallback: T): T {
  return file ? (JSON.parse(file.content) as T) : fallback;
}

/** Encode each path segment, but keep `/` separators — encodeURIComponent alone would mangle e.g. `initiatives/<id>.json`. */
function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

function assertBranch(branch: string): void {
  if (!branch || typeof branch !== 'string') {
    throw new GithubApiError(
      'Refusing to call the GitHub Contents API without an explicit data-branch name — an omitted `branch` silently defaults to the repository\'s default branch (§10.3).',
      'unknown',
    );
  }
}

/** Throw a labelled GithubApiError unless the response is ok (or its status is explicitly allowed). */
function assertOk(response: Response, label: string, extraOkStatuses: number[] = []): void {
  if (response.ok || extraOkStatuses.includes(response.status)) return;
  throw new GithubApiError(`${label} failed (${response.status})`, classifyStatus(response.status), response.status);
}

export class GithubClient {
  constructor(
    private readonly location: GithubLocation,
    private readonly getToken: () => string | null,
  ) {}

  private repoUrl(path: string): string {
    return `${this.location.apiBaseUrl}/repos/${this.location.owner}/${this.location.repo}/${path}`;
  }

  private async request(input: string, init: RequestInit = {}): Promise<Response> {
    const token = this.getToken();
    const headers = new Headers(init.headers);
    headers.set('Accept', 'application/vnd.github+json');
    headers.set('X-GitHub-Api-Version', '2022-11-28');
    if (token) headers.set('Authorization', `Bearer ${token}`);

    try {
      // no-store: GitHub's Contents API answers with max-age=60, and a re-read after a 409 must see the other writer's commit.
      return await fetch(input, { cache: 'no-store', ...init, headers });
    } catch {
      throw new GithubApiError('Cannot reach GitHub; changes are paused.', 'unreachable');
    }
  }

  /** GET .../contents/{path}?ref={branch} (§10.2). Returns null when the file doesn't exist yet. */
  async getFile(args: GetFileArgs): Promise<GetFileResult | null> {
    assertBranch(args.branch);
    const url = `${this.repoUrl(`contents/${encodePath(args.path)}`)}?ref=${encodeURIComponent(args.branch)}`;
    const response = await this.request(url, { method: 'GET' });

    if (response.status === 404) return null;
    assertOk(response, `GET ${args.path}`);

    const body = (await response.json()) as { content: string; sha: string };
    return { content: decodeBase64Utf8(body.content), sha: body.sha };
  }

  /** PUT .../contents/{path}, with `branch` always in the request body (§10.2, §10.3). */
  async putFile(args: PutFileArgs): Promise<PutFileResult> {
    assertBranch(args.branch);
    const url = this.repoUrl(`contents/${encodePath(args.path)}`);
    const response = await this.request(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: args.message,
        content: encodeBase64Utf8(args.content),
        branch: args.branch,
        ...(args.sha ? { sha: args.sha } : {}),
      }),
    });

    if (response.status === 409) {
      throw new GithubApiError('Stale version — the file changed since it was last read.', 'conflict', 409);
    }
    assertOk(response, `PUT ${args.path}`);

    const body = (await response.json()) as { content: { sha: string } };
    return { sha: body.content.sha };
  }

  /** GET .../contents/{dir}?ref={branch} as a directory listing. Empty array if the directory doesn't exist yet. */
  async listDirectory(args: { path: string; branch: string }): Promise<{ name: string; path: string }[]> {
    assertBranch(args.branch);
    const url = `${this.repoUrl(`contents/${encodePath(args.path)}`)}?ref=${encodeURIComponent(args.branch)}`;
    const response = await this.request(url, { method: 'GET' });

    if (response.status === 404) return [];
    assertOk(response, `GET ${args.path}`);

    const body = (await response.json()) as unknown;
    if (!Array.isArray(body)) return [];
    return body.map((entry) => ({ name: (entry as { name: string }).name, path: (entry as { path: string }).path }));
  }

  /** Checked-token validation (§5.10): who this token is, and whether it can write to the configured repo. */
  async checkToken(): Promise<{ login: string; scopesClassic: boolean }> {
    const userResponse = await this.request(`${this.location.apiBaseUrl}/user`, { method: 'GET' });
    if (!userResponse.ok) {
      throw new GithubApiError('GitHub doesn\'t accept this token.', classifyStatus(userResponse.status), userResponse.status);
    }
    const user = (await userResponse.json()) as { login: string };

    // A classic PAT's response carries an `X-OAuth-Scopes` header; a fine-grained token doesn't.
    const scopesClassic = userResponse.headers.has('x-oauth-scopes');

    return { login: user.login, scopesClassic };
  }

  /** GET .../repos/{owner}/{repo} — used to distinguish "can't see the repo" from "read-only" (§5.10). */
  async checkRepoAccess(): Promise<{ visible: boolean; canWrite: boolean }> {
    // No trailing slash: GitHub answers `/repos/{owner}/{repo}/` with a 404 even for a visible repo.
    const response = await this.request(this.repoUrl('').replace(/\/$/, ''), { method: 'GET' });
    if (response.status === 404) return { visible: false, canWrite: false };
    if (!response.ok) {
      // Surface GitHub's own message (e.g. a fine-grained token pending organisation
      // approval names that state in its 403 body) so callers can distinguish causes.
      const body = await response.json().catch(() => null);
      const detail = body && typeof body === 'object' && 'message' in body ? String((body as { message: unknown }).message) : '';
      throw new GithubApiError(`GET repo failed (${response.status})${detail ? `: ${detail}` : ''}`, classifyStatus(response.status), response.status);
    }
    const body = (await response.json()) as { permissions?: { push?: boolean } };
    return { visible: true, canWrite: Boolean(body.permissions?.push) };
  }

  /**
   * Create or update several files as one commit through the Git Data API
   * (§10.3: "Operations that change many files ... are a single commit
   * through the Git data API"). Used for the fresh-install baseline bootstrap
   * (§3 "System writes"). If the branch doesn't exist yet, it's created as
   * an orphan (no parent commit, no base tree) — confirmed viable against
   * the real API in slice 002's spike.
   */
  async createFilesCommit(args: {
    branch: string;
    files: { path: string; content: string }[];
    message: string;
  }): Promise<{ commitSha: string }> {
    assertBranch(args.branch);

    // Blob content doesn't depend on the branch/ref lookup below, so start both concurrently.
    const blobsPromise = Promise.all(
      args.files.map(async (file) => {
        const blobResponse = await this.request(this.repoUrl('git/blobs'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: encodeBase64Utf8(file.content), encoding: 'base64' }),
        });
        assertOk(blobResponse, 'Blob create');
        const blob = (await blobResponse.json()) as { sha: string };
        return { path: file.path, sha: blob.sha };
      }),
    );
    // If the ref/commit lookup below throws first, this function returns without ever
    // reaching `await blobsPromise` — if a blob upload then fails on its own, nothing would
    // be listening for that rejection. This no-op catch just keeps that from ever being
    // unhandled; the real rejection is still seen wherever `blobsPromise` is awaited below.
    blobsPromise.catch(() => {});

    const refUrl = this.repoUrl(`git/ref/heads/${encodeURIComponent(args.branch)}`);
    const refResponse = await this.request(refUrl, { method: 'GET' });

    let baseTreeSha: string | undefined;
    let parentCommitSha: string | undefined;
    const branchExists = refResponse.status !== 404;

    if (branchExists) {
      assertOk(refResponse, 'GET ref');
      const ref = (await refResponse.json()) as { object: { sha: string } };
      parentCommitSha = ref.object.sha;
      const commitResponse = await this.request(this.repoUrl(`git/commits/${parentCommitSha}`), { method: 'GET' });
      assertOk(commitResponse, 'GET commit');
      const commit = (await commitResponse.json()) as { tree: { sha: string } };
      baseTreeSha = commit.tree.sha;
    }

    const blobs = await blobsPromise;

    const treeResponse = await this.request(this.repoUrl('git/trees'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...(baseTreeSha ? { base_tree: baseTreeSha } : {}),
        tree: blobs.map((b) => ({ path: b.path, mode: '100644', type: 'blob', sha: b.sha })),
      }),
    });
    assertOk(treeResponse, 'Tree create');
    const tree = (await treeResponse.json()) as { sha: string };

    const commitResponse = await this.request(this.repoUrl('git/commits'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: args.message,
        tree: tree.sha,
        parents: parentCommitSha ? [parentCommitSha] : [],
      }),
    });
    assertOk(commitResponse, 'Commit create');
    const newCommit = (await commitResponse.json()) as { sha: string };

    if (branchExists) {
      // Updating a ref is PATCH .../git/refs/heads/{branch} (plural); only the GET is `git/ref/...` (singular) — PATCHing the singular URL is a 404.
      const updateRefResponse = await this.request(this.repoUrl(`git/refs/heads/${encodeURIComponent(args.branch)}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sha: newCommit.sha }),
      });
      assertOk(updateRefResponse, 'Ref update');
      return { commitSha: newCommit.sha };
    }

    const createRefResponse = await this.request(this.repoUrl('git/refs'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ref: `refs/heads/${args.branch}`, sha: newCommit.sha }),
    });
    // 422 "Reference already exists" — another client won the bootstrap race (§3 "System writes":
    // concurrent attempts converge, no duplicates). Our own commit never got attached to the
    // branch in that case, so `newCommit.sha` would be a dangling sha — return the ref's actual
    // (winning) commit instead of our own, so a future caller never trusts an unreachable sha.
    if (createRefResponse.status === 422) {
      const wonRefResponse = await this.request(refUrl, { method: 'GET' });
      assertOk(wonRefResponse, 'GET ref');
      const wonRef = (await wonRefResponse.json()) as { object: { sha: string } };
      return { commitSha: wonRef.object.sha };
    }
    assertOk(createRefResponse, 'Ref create');
    return { commitSha: newCommit.sha };
  }
}
