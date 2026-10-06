import type { GithubLocation } from '../brand/types';
import { decodeBase64Utf8, encodeBase64Utf8 } from './base64';
import { GithubApiError, UNREACHABLE_MESSAGE, classifyFailure } from './errors';
import type { WriteBudget } from './writeBudget';

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

/** How long to wait after a limit when GitHub names no time: doubled for each repeat within the hour (§10.3). */
export const RATE_LIMIT_FALLBACK_MS = 60_000;
const HOUR_MS = 3_600_000;

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

/** GitHub is limiting requests: nothing is sent before `until` (§3 Sync failures). */
function rateLimited(until: number, status?: number): GithubApiError {
  return new GithubApiError('GitHub is limiting requests', 'rate-limited', status, until);
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

export interface FileChange {
  path: string;
  content: string;
}

/** What a many-file commit writes and deletes. */
export interface FileChanges {
  files: FileChange[];
  deletes: string[];
}

/** A many-file commit that landed, with each written file's version (its git blob sha). */
export interface CommitResult {
  commitSha: string;
  written: (FileChange & { sha: string })[];
}

const CREATE_COMMIT = `mutation($input: CreateCommitOnBranchInput!) { createCommitOnBranch(input: $input) { commit { oid } } }`;

/** GitHub's GraphQL endpoint for an API base URL: derived, not appended (§2). `https://api.github.com/graphql`, or on
 * GitHub Enterprise `https://<host>/api/graphql` for `https://<host>/api/v3`. */
export function graphqlUrl(apiBaseUrl: string): string {
  const base = apiBaseUrl.replace(/\/+$/, '');
  return base.endsWith('/api/v3') ? `${base.slice(0, -'/v3'.length)}/graphql` : `${base}/graphql`;
}

/** A file's version as GitHub gives it, the git blob sha: SHA-1 of `blob <bytes>\0` and the UTF-8 content (§10.3). */
export async function gitBlobSha(content: string): Promise<string> {
  const bytes = new TextEncoder().encode(content);
  const header = new TextEncoder().encode(`blob ${bytes.length}\0`);
  const whole = new Uint8Array(header.length + bytes.length);
  whole.set(header);
  whole.set(bytes, header.length);
  const digest = await crypto.subtle.digest('SHA-1', whole);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function withVersions(files: FileChange[]): Promise<(FileChange & { sha: string })[]> {
  return Promise.all(files.map(async (file) => ({ ...file, sha: await gitBlobSha(file.content) })));
}

export class GithubClient {
  constructor(
    private readonly location: GithubLocation,
    private readonly getToken: () => string | null,
    /** Told of every response's headers, so the rate-limit budget is read without a request of its own (§5.9). */
    private readonly onResponse?: (headers: Headers) => void,
    private readonly options: {
      timeoutMs?: number;
      /** Reserves a place for each content-creating request (§10.3); none means no budget is kept. */
      budget?: WriteBudget;
      /** Told when GitHub limits requests, with the time until which nothing is sent (§3 Sync failures). */
      onPause?: (until: number) => void;
    } = {},
  ) {}

  /** GitHub's last limit: nothing is sent before `until`; `repeats` counts the limits within an hour of each other. */
  private pause: { until: number; repeats: number; at: number } | null = null;

  /** Until when no request is sent because GitHub is limiting requests, or null when it isn't (§3 Sync failures). */
  get pausedUntil(): number | null {
    return this.pause && this.pause.until > Date.now() ? this.pause.until : null;
  }

  /** The time GitHub names (`retry-after`, else the reset of an exhausted limit), else 60 s doubling per repeat (§10.3). */
  private limitHit(headers: Headers): number {
    const now = Date.now();
    const repeats = this.pause && now - this.pause.at < HOUR_MS ? this.pause.repeats + 1 : 0;
    const retryAfter = Number(headers.get('retry-after'));
    const reset = Number(headers.get('x-ratelimit-reset')) * 1000;
    let until = now + RATE_LIMIT_FALLBACK_MS * 2 ** repeats;
    if (headers.has('retry-after') && Number.isFinite(retryAfter)) until = now + retryAfter * 1000;
    else if (headers.get('x-ratelimit-remaining') === '0' && Number.isFinite(reset) && reset > now) until = reset;
    this.pause = { until, repeats, at: now };
    this.options.onPause?.(until);
    return until;
  }

  private repoUrl(path: string): string {
    return `${this.location.apiBaseUrl}/repos/${this.location.owner}/${this.location.repo}/${path}`;
  }

  /**
   * Every request goes through here. While GitHub's limit lasts, none is sent: it fails at once as rate limited. A
   * content-creating one (any but a GET, unless `contentCreating` says otherwise) first waits for a place in the
   * write budget. A response that says GitHub is limiting requests starts the wait.
   */
  private async request(input: string, init: RequestInit = {}, contentCreating = (init.method ?? 'GET') !== 'GET'): Promise<Response> {
    const pausedUntil = this.pausedUntil;
    if (pausedUntil !== null) throw rateLimited(pausedUntil);
    if (contentCreating) await this.options.budget?.reserve();
    const token = this.getToken();
    const headers = new Headers(init.headers);
    headers.set('Accept', 'application/vnd.github+json');
    headers.set('X-GitHub-Api-Version', '2022-11-28');
    if (token) headers.set('Authorization', `Bearer ${token}`);

    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let response: Response;
    // Raced as well as signalled, so a request ends at the timeout even where aborting doesn't settle the fetch.
    const timedOut = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new Error('timed out'));
      }, this.options.timeoutMs ?? REQUEST_TIMEOUT_MS);
    });
    try {
      // no-store: GitHub's Contents API answers with max-age=60, and a re-read after a 409 must see the other writer's commit.
      response = await Promise.race([fetch(input, { cache: 'no-store', ...init, headers, signal: controller.signal }), timedOut]);
      this.onResponse?.(response.headers);
    } catch {
      throw new GithubApiError(UNREACHABLE_MESSAGE, 'unreachable');
    } finally {
      clearTimeout(timer);
    }
    if (response.status === 403 || response.status === 429) {
      const message = await messageOf(response.clone());
      if (classifyFailure(response.status, response.headers, message) === 'rate-limited') {
        throw rateLimited(this.limitHit(response.headers), response.status);
      }
    }
    return response;
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
   * Replace and delete several files on an existing branch as one commit (§10.3): Reset, Load example data, the
   * bootstrap onto an existing branch, and a user action that writes several files. `build` is asked what to write
   * against the head the commit will sit on, and may read the branch at that commit (`at`) to decide; null stops
   * without committing. One GraphQL `createCommitOnBranch` makes the commit, refused unless the branch is still at that
   * head; then the whole commit is built again on the new head, up to three times. The written files come back with
   * their versions, computed here, so nobody needs to download them again.
   */
  async commitOnHead(args: {
    branch: string;
    message: string;
    build: (at: string) => Promise<FileChanges | null>;
    /** The head the caller has just read, for the first attempt. */
    head?: string;
  }): Promise<CommitResult | 'stopped'> {
    assertBranch(args.branch);
    const refUrl = this.repoUrl(`git/ref/heads/${encodePath(args.branch)}`);
    for (let attempt = 0; ; attempt += 1) {
      let head = attempt === 0 ? args.head : undefined;
      if (head === undefined) {
        const refResponse = await this.request(refUrl, { method: 'GET' });
        await assertOk(refResponse, 'GET ref');
        head = ((await refResponse.json()) as { object: { sha: string } }).object.sha;
      }
      const changes = await args.build(head);
      if (changes === null) return 'stopped';
      const outcome = await this.commitOnBranch({ branch: args.branch, expectedHeadOid: head, message: args.message, ...changes });
      if (outcome === 'moved' && attempt < 3) continue; // another commit landed first: build again on the new head
      if (outcome === 'moved') throw new GithubApiError('The data branch kept changing — please retry.', 'conflict', 422);
      return { commitSha: outcome.commitSha, written: await withVersions(changes.files) };
    }
  }

  /**
   * One GraphQL `createCommitOnBranch` on `branch`, refused unless the branch is at `expectedHeadOid` (§10.3). It is one
   * content-creating request whatever its size. 'moved' when the branch moved or a file to delete is already gone:
   * the caller reads again and decides. GitHub can answer a commit it made with a 5xx or not at all
   * (spike-findings.md): then the head is read, and a head that is our commit on our parent counts as made.
   */
  async commitOnBranch(args: { branch: string; expectedHeadOid: string; message: string } & FileChanges): Promise<{ commitSha: string } | 'moved'> {
    assertBranch(args.branch);
    const [headline, ...rest] = args.message.split('\n\n');
    const input = {
      branch: { repositoryNameWithOwner: `${this.location.owner}/${this.location.repo}`, branchName: args.branch },
      expectedHeadOid: args.expectedHeadOid,
      message: { headline, ...(rest.length > 0 ? { body: rest.join('\n\n') } : {}) },
      fileChanges: {
        additions: args.files.map((file) => ({ path: file.path, contents: encodeBase64Utf8(file.content) })),
        deletions: args.deletes.map((path) => ({ path })),
      },
    };
    let response: Response;
    try {
      response = await this.request(graphqlUrl(this.location.apiBaseUrl), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: CREATE_COMMIT, variables: { input } }),
      });
      if (response.status >= 500) throw await failure(response, 'Commit');
    } catch (error) {
      if (error instanceof GithubApiError && error.cause_ === 'unreachable') {
        const landed = await this.landedOn(args.branch, args.expectedHeadOid, headline).catch(() => null);
        if (landed) return { commitSha: landed };
      }
      throw error;
    }
    await assertOk(response, 'Commit');
    const body = (await response.json()) as { data?: { createCommitOnBranch?: { commit?: { oid: string } } | null }; errors?: { type?: string; message?: string }[] };
    // A refusal is a 200 with errors, told apart by type (spike-findings.md).
    const errors = body.errors ?? [];
    if (errors.some((e) => e.type === 'STALE_DATA' || e.type === 'NOT_FOUND')) return 'moved';
    const oid = body.data?.createCommitOnBranch?.commit?.oid;
    if (errors.length > 0 || !oid) throw new GithubApiError(`Commit failed: ${errors[0]?.message ?? 'no commit'}`, 'unknown', response.status);
    return { commitSha: oid };
  }

  /** The branch's head, when it is a commit titled `headline` on `parent`: a commit of ours whose answer was lost. */
  private async landedOn(branch: string, parent: string, headline: string): Promise<string | null> {
    const refResponse = await this.request(this.repoUrl(`git/ref/heads/${encodePath(branch)}`), { method: 'GET' });
    await assertOk(refResponse, 'GET ref');
    const head = ((await refResponse.json()) as { object: { sha: string } }).object.sha;
    if (head === parent) return null;
    const commitResponse = await this.request(this.repoUrl(`git/commits/${head}`), { method: 'GET' });
    await assertOk(commitResponse, 'GET commit');
    const commit = (await commitResponse.json()) as { message: string; parents: { sha: string }[] };
    return commit.parents[0]?.sha === parent && commit.message.split('\n')[0] === headline ? head : null;
  }

  /**
   * The fresh-install baseline (§3 "System writes") as one commit. Onto an existing branch it is {@link commitOnHead}.
   * A missing branch is created, which GraphQL can't do: a tree with the files' contents inline, a commit with no
   * parent, then the ref; three content-creating requests and no blob uploads. When another client creates the branch
   * first (422), its commit is returned instead of ours, which then belongs to no branch.
   */
  async createFilesCommit(args: { branch: string; files: FileChange[]; message: string }): Promise<CommitResult> {
    assertBranch(args.branch);
    const refUrl = this.repoUrl(`git/ref/heads/${encodePath(args.branch)}`);
    const refResponse = await this.request(refUrl, { method: 'GET' });
    if (refResponse.status !== 404) {
      await assertOk(refResponse, 'GET ref');
      const head = ((await refResponse.json()) as { object: { sha: string } }).object.sha;
      const result = await this.commitOnHead({ branch: args.branch, message: args.message, head, build: async () => ({ files: args.files, deletes: [] }) });
      return result as CommitResult;
    }

    const treeResponse = await this.request(this.repoUrl('git/trees'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tree: args.files.map((file) => ({ path: file.path, mode: '100644', type: 'blob', content: file.content })) }),
    });
    await assertOk(treeResponse, 'Tree create');
    const tree = ((await treeResponse.json()) as { sha: string }).sha;
    const commitResponse = await this.request(this.repoUrl('git/commits'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: args.message, tree, parents: [] }),
    });
    await assertOk(commitResponse, 'Commit create');
    const commitSha = ((await commitResponse.json()) as { sha: string }).sha;

    const createRefResponse = await this.request(this.repoUrl('git/refs'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ref: `refs/heads/${args.branch}`, sha: commitSha }),
    });
    // 422 "Reference already exists" — another client won the bootstrap race (§3 "System writes": concurrent attempts
    // converge, no duplicates). Return the ref's actual (winning) commit, and nothing written by us.
    if (createRefResponse.status === 422) {
      const wonRefResponse = await this.request(refUrl, { method: 'GET' });
      await assertOk(wonRefResponse, 'GET ref');
      const wonRef = (await wonRefResponse.json()) as { object: { sha: string } };
      return { commitSha: wonRef.object.sha, written: [] };
    }
    await assertOk(createRefResponse, 'Ref create');
    return { commitSha, written: await withVersions(args.files) };
  }

}
