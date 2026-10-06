import type { GithubLocation } from '../brand/types';
import { decodeBase64Utf8, encodeBase64Utf8 } from './base64';
import { GithubApiError, UNREACHABLE_MESSAGE, classifyFailure } from './errors';

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
  /** The file did not exist (201): a new file, or one deleted since its sha was read, which GitHub recreates. */
  created: boolean;
}

export interface DirectoryEntry {
  name: string;
  path: string;
  /** The file's version: the same value a read of the file gives. */
  sha: string;
  type: 'file' | 'dir';
}

export interface BranchHead {
  sha: string;
  etag: string | null;
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

/** How long a request may take before it is abandoned as unreachable (§3 Sync failures), so a hung request can't
 * wedge the write queue. */
export const REQUEST_TIMEOUT_MS = 30_000;

/** GitHub's own message in a failed response's body, or '' when there is none. */
async function messageOf(response: Response): Promise<string> {
  const body: unknown = await response.json().catch(() => null);
  return body && typeof body === 'object' && 'message' in body ? String(body.message) : '';
}

/** The labelled GithubApiError for a failed response, classified from its status, headers and message. */
async function failure(response: Response, label: string, detail?: string): Promise<GithubApiError> {
  const message = detail ?? (await messageOf(response));
  const cause = classifyFailure(response.status, response.headers, message);
  if (cause === 'unreachable') return new GithubApiError(UNREACHABLE_MESSAGE, cause, response.status);
  return new GithubApiError(`${label} failed (${response.status})`, cause, response.status);
}

/** Throw a labelled GithubApiError unless the response is ok (or its status is explicitly allowed). */
async function assertOk(response: Response, label: string, extraOkStatuses: number[] = []): Promise<void> {
  if (response.ok || extraOkStatuses.includes(response.status)) return;
  throw await failure(response, label);
}

/** A write at a sha that is no longer the file's (409): a conflict, re-read and retried by the writer (§10.3). */
function assertNotStale(response: Response): void {
  if (response.status === 409) throw new GithubApiError('Stale version — the file changed since it was last read.', 'conflict', 409);
}

export class GithubClient {
  constructor(
    private readonly location: GithubLocation,
    private readonly getToken: () => string | null,
    /** Told of every response's headers, so the rate-limit budget is read without a request of its own (§5.9). */
    private readonly onResponse?: (headers: Headers) => void,
    private readonly options: { timeoutMs?: number } = {},
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

    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Raced as well as signalled, so a request ends at the timeout even where aborting doesn't settle the fetch.
    const timedOut = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new Error('timed out'));
      }, this.options.timeoutMs ?? REQUEST_TIMEOUT_MS);
    });
    try {
      // no-store: GitHub's Contents API answers with max-age=60, and a re-read after a 409 must see the other writer's commit.
      const response = await Promise.race([fetch(input, { cache: 'no-store', ...init, headers, signal: controller.signal }), timedOut]);
      this.onResponse?.(response.headers);
      return response;
    } catch {
      throw new GithubApiError(UNREACHABLE_MESSAGE, 'unreachable');
    } finally {
      clearTimeout(timer);
    }
  }

  /** GET .../contents/{path}?ref={branch} (§10.2). Returns null when the file doesn't exist yet. */
  async getFile(args: GetFileArgs): Promise<GetFileResult | null> {
    assertBranch(args.branch);
    const url = `${this.repoUrl(`contents/${encodePath(args.path)}`)}?ref=${encodeURIComponent(args.branch)}`;
    const response = await this.request(url, { method: 'GET' });

    if (response.status === 404) return null;
    await assertOk(response, `GET ${args.path}`);

    const body = (await response.json()) as { content: string; encoding: string; sha: string };
    let rawContent = body.content;
    if (body.encoding === 'none') {
      // Files over 1 MB carry no inline content from the Contents API (§3 Storage limits); read them
      // through the blob API instead, by the sha the Contents response still gives us.
      const blobResponse = await this.request(this.repoUrl(`git/blobs/${body.sha}`), { method: 'GET' });
      // The blob can itself 404 if the file was deleted between the two requests — keep getFile's
      // "null means the file doesn't exist" contract instead of throwing here.
      if (blobResponse.status === 404) return null;
      await assertOk(blobResponse, `GET blob ${args.path}`);
      rawContent = ((await blobResponse.json()) as { content: string }).content;
    }
    return { content: decodeBase64Utf8(rawContent), sha: body.sha };
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

    assertNotStale(response);
    await assertOk(response, `PUT ${args.path}`);

    const body = (await response.json()) as { content: { sha: string } };
    return { sha: body.content.sha, created: response.status === 201 };
  }

  /**
   * DELETE .../contents/{path} at `sha`, with `branch` in the request body (§10.2, §10.3). A stale sha is a
   * conflict, as for a put; `'gone'` when the file no longer exists, so a delete someone else already made counts.
   */
  async deleteFile(args: { path: string; branch: string; message: string; sha: string }): Promise<'deleted' | 'gone'> {
    assertBranch(args.branch);
    const url = this.repoUrl(`contents/${encodePath(args.path)}`);
    const response = await this.request(url, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: args.message, sha: args.sha, branch: args.branch }),
    });

    if (response.status === 404) return 'gone';
    assertNotStale(response);
    await assertOk(response, `DELETE ${args.path}`);
    return 'deleted';
  }

  /** GET .../contents/{dir}?ref={branch} as a directory listing, each entry with its version. Empty array if the directory doesn't exist yet. */
  async listDirectory(args: { path: string; branch: string }): Promise<DirectoryEntry[]> {
    assertBranch(args.branch);
    const url = `${this.repoUrl(`contents/${encodePath(args.path)}`)}?ref=${encodeURIComponent(args.branch)}`;
    const response = await this.request(url, { method: 'GET' });

    if (response.status === 404) return [];
    await assertOk(response, `GET ${args.path || 'the repository root'}`);

    const body = (await response.json()) as unknown;
    if (!Array.isArray(body)) return [];
    return body.map((entry) => {
      const { name, path, sha, type } = entry as DirectoryEntry;
      return { name, path, sha, type };
    });
  }

  /**
   * GET .../git/ref/heads/{branch}: the commit the branch is at (§10.2). Asked again with the ETag it gave,
   * an unchanged branch answers 304, which GitHub does not count against the rate limit. Null when the
   * branch does not exist yet.
   */
  async getBranchHead(args: { branch: string; etag: string | null }): Promise<BranchHead | 'not-modified' | null> {
    assertBranch(args.branch);
    const url = this.repoUrl(`git/ref/heads/${encodePath(args.branch)}`);
    const response = await this.request(url, { method: 'GET', headers: args.etag ? { 'If-None-Match': args.etag } : {} });

    if (response.status === 304) return 'not-modified';
    if (response.status === 404) return null;
    await assertOk(response, `GET the head of ${args.branch}`);

    const body = (await response.json()) as { object: { sha: string } };
    return { sha: body.object.sha, etag: response.headers.get('etag') };
  }

  /** Checked-token validation (§5.10): who this token is, and whether it can write to the configured repo. */
  async checkToken(): Promise<{ login: string; scopesClassic: boolean }> {
    const userResponse = await this.request(`${this.location.apiBaseUrl}/user`, { method: 'GET' });
    if (!userResponse.ok) {
      const cause = (await failure(userResponse, 'GET /user')).cause_;
      throw new GithubApiError(cause === 'unreachable' ? UNREACHABLE_MESSAGE : 'GitHub doesn\'t accept this token.', cause, userResponse.status);
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
      const detail = await messageOf(response);
      const cause = classifyFailure(response.status, response.headers, detail);
      throw new GithubApiError(`GET repo failed (${response.status})${detail ? `: ${detail}` : ''}`, cause, response.status);
    }
    const body = (await response.json()) as { permissions?: { push?: boolean } };
    return { visible: true, canWrite: Boolean(body.permissions?.push) };
  }

  /**
   * Replace and delete several files on an existing branch as one commit through the Git data API (§10.3): Reset and
   * Load example data. `build` is asked what to write against the head the commit will sit on, and may read the
   * branch at that commit (`at`) to decide; null stops without committing. Only the final ref update changes the
   * branch, so a failure before it leaves the branch as it was. When another commit lands first, the ref update is
   * refused as not a fast-forward (422) and the whole commit is built again on the new head, up to three times.
   */
  async commitOnHead(args: {
    branch: string;
    message: string;
    build: (at: string) => Promise<{ files: { path: string; content: string }[]; deletes: string[] } | null>;
  }): Promise<{ commitSha: string } | 'stopped'> {
    assertBranch(args.branch);
    const refUrl = this.repoUrl(`git/ref/heads/${encodePath(args.branch)}`);
    for (let attempt = 0; ; attempt += 1) {
      const refResponse = await this.request(refUrl, { method: 'GET' });
      await assertOk(refResponse, 'GET ref');
      const head = ((await refResponse.json()) as { object: { sha: string } }).object.sha;
      // The base tree only matters once there is something to write; fetch it while `build` reads.
      const baseTree = this.treeOf(head);
      baseTree.catch(() => {}); // awaited below unless `build` stops or throws first

      const changes = await args.build(head);
      if (changes === null) return 'stopped';

      const blobs = await this.createBlobs(changes.files);
      // A null sha removes the path from the base tree.
      const removed = changes.deletes.map((path) => ({ path, sha: null }));
      const commitSha = await this.createCommit({ baseTree: await baseTree, parent: head, entries: [...blobs, ...removed], message: args.message });

      const updateResponse = await this.updateRef(args.branch, commitSha);
      if (updateResponse.status === 422 && attempt < 3) continue; // the head moved: build again on the new one
      if (updateResponse.status === 422) throw new GithubApiError('The data branch kept changing — please retry.', 'conflict', 422);
      await assertOk(updateResponse, 'Ref update');
      return { commitSha };
    }
  }

  private async treeOf(commitSha: string): Promise<string> {
    const commitResponse = await this.request(this.repoUrl(`git/commits/${commitSha}`), { method: 'GET' });
    await assertOk(commitResponse, 'GET commit');
    return ((await commitResponse.json()) as { tree: { sha: string } }).tree.sha;
  }

  private createBlobs(files: { path: string; content: string }[]): Promise<{ path: string; sha: string }[]> {
    return Promise.all(
      files.map(async (file) => {
        const blobResponse = await this.request(this.repoUrl('git/blobs'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: encodeBase64Utf8(file.content), encoding: 'base64' }),
        });
        await assertOk(blobResponse, 'Blob create');
        return { path: file.path, sha: ((await blobResponse.json()) as { sha: string }).sha };
      }),
    );
  }

  /** A tree on `baseTree` with `entries` (a null sha removes the path), then a commit of it on `parent`; returns the commit's sha. */
  private async createCommit(args: {
    baseTree?: string;
    parent?: string;
    entries: { path: string; sha: string | null }[];
    message: string;
  }): Promise<string> {
    const treeResponse = await this.request(this.repoUrl('git/trees'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...(args.baseTree ? { base_tree: args.baseTree } : {}),
        tree: args.entries.map((e) => ({ path: e.path, mode: '100644', type: 'blob', sha: e.sha })),
      }),
    });
    await assertOk(treeResponse, 'Tree create');
    const tree = ((await treeResponse.json()) as { sha: string }).sha;

    const commitResponse = await this.request(this.repoUrl('git/commits'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: args.message, tree, parents: args.parent ? [args.parent] : [] }),
    });
    await assertOk(commitResponse, 'Commit create');
    return ((await commitResponse.json()) as { sha: string }).sha;
  }

  /** Updating a ref is PATCH .../git/refs/heads/{branch} (plural); only the GET is `git/ref/...` (singular) — PATCHing the singular URL is a 404. */
  private updateRef(branch: string, commitSha: string): Promise<Response> {
    return this.request(this.repoUrl(`git/refs/heads/${encodePath(branch)}`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sha: commitSha }),
    });
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
    const blobsPromise = this.createBlobs(args.files);
    // If the ref/commit lookup below throws first, this function returns without ever
    // reaching `await blobsPromise` — if a blob upload then fails on its own, nothing would
    // be listening for that rejection. This no-op catch just keeps that from ever being
    // unhandled; the real rejection is still seen wherever `blobsPromise` is awaited below.
    blobsPromise.catch(() => {});

    const refUrl = this.repoUrl(`git/ref/heads/${encodePath(args.branch)}`);
    // Once more if another commit lands on an existing branch first: the ref update is then refused as not a
    // fast-forward (422), and the commit is made again on the new head, as commitOnHead does.
    for (let attempt = 0; ; attempt += 1) {
      const refResponse = await this.request(refUrl, { method: 'GET' });
      if (refResponse.status === 404) break;
      await assertOk(refResponse, 'GET ref');
      const parent = ((await refResponse.json()) as { object: { sha: string } }).object.sha;
      const baseTree = await this.treeOf(parent);
      const commitSha = await this.createCommit({ baseTree, parent, entries: await blobsPromise, message: args.message });
      const updateResponse = await this.updateRef(args.branch, commitSha);
      if (updateResponse.status === 422 && attempt < 1) continue;
      await assertOk(updateResponse, 'Ref update');
      return { commitSha };
    }

    const commitSha = await this.createCommit({ entries: await blobsPromise, message: args.message });

    const createRefResponse = await this.request(this.repoUrl('git/refs'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ref: `refs/heads/${args.branch}`, sha: commitSha }),
    });
    // 422 "Reference already exists" — another client won the bootstrap race (§3 "System writes":
    // concurrent attempts converge, no duplicates). Our own commit never got attached to the
    // branch in that case, so `commitSha` would be a dangling sha — return the ref's actual
    // (winning) commit instead of our own, so a future caller never trusts an unreachable sha.
    if (createRefResponse.status === 422) {
      const wonRefResponse = await this.request(refUrl, { method: 'GET' });
      await assertOk(wonRefResponse, 'GET ref');
      const wonRef = (await wonRefResponse.json()) as { object: { sha: string } };
      return { commitSha: wonRef.object.sha };
    }
    await assertOk(createRefResponse, 'Ref create');
    return { commitSha };
  }
}
