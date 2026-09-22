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

    let response: Response;
    try {
      response = await fetch(input, { ...init, headers });
    } catch {
      throw new GithubApiError('Cannot reach GitHub; changes are paused.', 'unreachable');
    }
    return response;
  }

  /** GET .../contents/{path}?ref={branch} (§10.2). Returns null when the file doesn't exist yet. */
  async getFile(args: GetFileArgs): Promise<GetFileResult | null> {
    assertBranch(args.branch);
    const url = `${this.repoUrl(`contents/${encodePath(args.path)}`)}?ref=${encodeURIComponent(args.branch)}`;
    const response = await this.request(url, { method: 'GET' });

    if (response.status === 404) return null;
    if (!response.ok) {
      throw new GithubApiError(`GET ${args.path} failed (${response.status})`, classifyStatus(response.status), response.status);
    }

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
    if (!response.ok) {
      throw new GithubApiError(`PUT ${args.path} failed (${response.status})`, classifyStatus(response.status), response.status);
    }

    const body = (await response.json()) as { content: { sha: string } };
    return { sha: body.content.sha };
  }

  /** GET .../contents/{dir}?ref={branch} as a directory listing. Empty array if the directory doesn't exist yet. */
  async listDirectory(args: { path: string; branch: string }): Promise<{ name: string; path: string }[]> {
    assertBranch(args.branch);
    const url = `${this.repoUrl(`contents/${encodePath(args.path)}`)}?ref=${encodeURIComponent(args.branch)}`;
    const response = await this.request(url, { method: 'GET' });

    if (response.status === 404) return [];
    if (!response.ok) {
      throw new GithubApiError(`GET ${args.path} failed (${response.status})`, classifyStatus(response.status), response.status);
    }

    const body = (await response.json()) as unknown;
    if (!Array.isArray(body)) return [];
    return body.map((entry) => ({ name: (entry as { name: string }).name, path: (entry as { path: string }).path }));
  }

  /** Checked-token validation (§5.10): who this token is, and whether it can write to the configured repo. */
  async checkToken(): Promise<{ login: string; scopesClassic: boolean }> {
    const userResponse = await this.request('https://api.github.com/user', { method: 'GET' });
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
    const response = await this.request(this.repoUrl(''), { method: 'GET' });
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

    const refUrl = this.repoUrl(`git/ref/heads/${encodeURIComponent(args.branch)}`);
    const refResponse = await this.request(refUrl, { method: 'GET' });

    let baseTreeSha: string | undefined;
    let parentCommitSha: string | undefined;
    const branchExists = refResponse.status !== 404;

    if (branchExists) {
      if (!refResponse.ok) {
        throw new GithubApiError(`GET ref failed (${refResponse.status})`, classifyStatus(refResponse.status), refResponse.status);
      }
      const ref = (await refResponse.json()) as { object: { sha: string } };
      parentCommitSha = ref.object.sha;
      const commitResponse = await this.request(this.repoUrl(`git/commits/${parentCommitSha}`), { method: 'GET' });
      if (!commitResponse.ok) {
        throw new GithubApiError(`GET commit failed (${commitResponse.status})`, classifyStatus(commitResponse.status), commitResponse.status);
      }
      const commit = (await commitResponse.json()) as { tree: { sha: string } };
      baseTreeSha = commit.tree.sha;
    }

    const blobs = await Promise.all(
      args.files.map(async (file) => {
        const blobResponse = await this.request(this.repoUrl('git/blobs'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: encodeBase64Utf8(file.content), encoding: 'base64' }),
        });
        if (!blobResponse.ok) {
          throw new GithubApiError(`Blob create failed (${blobResponse.status})`, classifyStatus(blobResponse.status), blobResponse.status);
        }
        const blob = (await blobResponse.json()) as { sha: string };
        return { path: file.path, sha: blob.sha };
      }),
    );

    const treeResponse = await this.request(this.repoUrl('git/trees'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...(baseTreeSha ? { base_tree: baseTreeSha } : {}),
        tree: blobs.map((b) => ({ path: b.path, mode: '100644', type: 'blob', sha: b.sha })),
      }),
    });
    if (!treeResponse.ok) {
      throw new GithubApiError(`Tree create failed (${treeResponse.status})`, classifyStatus(treeResponse.status), treeResponse.status);
    }
    const tree = (await treeResponse.json()) as { sha: string };

    const commitResponse = await this.request(this.repoUrl('git/commits'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: args.message,
        tree: tree.sha,
        ...(parentCommitSha ? { parents: [parentCommitSha] } : { parents: [] }),
      }),
    });
    if (!commitResponse.ok) {
      throw new GithubApiError(`Commit create failed (${commitResponse.status})`, classifyStatus(commitResponse.status), commitResponse.status);
    }
    const newCommit = (await commitResponse.json()) as { sha: string };

    if (branchExists) {
      const updateRefResponse = await this.request(refUrl, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sha: newCommit.sha }),
      });
      if (!updateRefResponse.ok) {
        throw new GithubApiError(
          `Ref update failed (${updateRefResponse.status})`,
          classifyStatus(updateRefResponse.status),
          updateRefResponse.status,
        );
      }
    } else {
      const createRefResponse = await this.request(this.repoUrl('git/refs'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ref: `refs/heads/${args.branch}`, sha: newCommit.sha }),
      });
      if (!createRefResponse.ok && createRefResponse.status !== 422) {
        // 422 "Reference already exists" — another client won the bootstrap race (§3 "System writes":
        // concurrent attempts converge, no duplicates). Treat as success rather than surfacing an error.
        throw new GithubApiError(
          `Ref create failed (${createRefResponse.status})`,
          classifyStatus(createRefResponse.status),
          createRefResponse.status,
        );
      }
    }

    return { commitSha: newCommit.sha };
  }
}
