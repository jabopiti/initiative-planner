import type { GithubLocation } from '../brand/types';
import { HOUR_MS, MINUTE_MS } from '../data/dates';
import { decodeBase64Utf8, encodeBase64Utf8 } from './base64';
import { CAUSE_MESSAGES, GithubApiError, classifyFailure, githubMessage } from './errors';
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

/** A commit this client made, and the commit it sits on (§10.2): a pull can tell from these alone that the head moved
 * only through its own saves. */
export interface CommitLink {
  sha: string;
  parent: string;
}

export interface PutFileResult {
  sha: string;
  /** The file did not exist (201): a new file, or one deleted since its sha was read, which GitHub recreates. */
  created: boolean;
  /** The commit the write made, or null when GitHub's answer does not name it. */
  commit: CommitLink | null;
}

export interface DirectoryEntry {
  name: string;
  path: string;
  /** The file's version: the same value a read of the file gives. */
  sha: string;
  type: 'file' | 'dir';
}

/** One file of a commit's tree, recursively listed (§10.2). */
export interface TreeEntry {
  path: string;
  /** The file's version: the same value a read of the file gives. */
  sha: string;
  type: 'blob' | 'tree' | 'commit';
}

/** A file a GraphQL read could not give whole: too large for the query (over 512,000 bytes), read on its own instead. */
export const TRUNCATED = 'truncated';

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

/** How long a request may take to answer before it counts as GitHub unreachable (§3 Sync failures). */
export const REQUEST_TIMEOUT_MS = 30_000;

/** The time limit covers this many bytes sent or received; beyond it, a request gets as long more as the slowest
 * transfer still allowed for (16 kB/s) needs, so a large file on a slow link is not cut off and resent for ever. */
const BYTES_WITHIN_TIMEOUT = 64 * 1024;
const MIN_BYTES_PER_MS = 16;

function transferAllowanceMs(bytes: number): number {
  return Number.isFinite(bytes) && bytes > BYTES_WITHIN_TIMEOUT ? (bytes - BYTES_WITHIN_TIMEOUT) / MIN_BYTES_PER_MS : 0;
}

/** How long to wait after a limit when GitHub names no time: doubled for each repeat within the hour (§10.3). */
export const RATE_LIMIT_FALLBACK_MS = MINUTE_MS;

/**
 * A failed response as a GithubApiError, its cause read from the status, headers and body (§3 Sync failures). GitHub's
 * own message is kept, so a caller can tell causes apart (a fine-grained token pending organisation approval names
 * that state in its 403 body).
 */
async function failure(response: Response, label: string): Promise<GithubApiError> {
  const body = await response.text().catch(() => '');
  const cause = classifyFailure(response.status, response.headers, body);
  const detail = githubMessage(body);
  return new GithubApiError(`${label} failed (${response.status})${detail ? `: ${detail}` : ''}`, cause, response.status);
}

/** GitHub is limiting requests: nothing is sent before `until` (§3 Sync failures). GitHub's own message, when it gave
 * one, is kept: a 403 can name another cause as well (a token pending approval, §5.10). */
function rateLimited(until: number, status?: number, detail = ''): GithubApiError {
  return new GithubApiError(`GitHub is limiting requests${detail ? `: ${detail}` : ''}`, 'rate-limited', status, until);
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
  /** The commit it sits on; null for the first commit of a new branch, or when another client's commit won. */
  parent: string | null;
  written: (FileChange & { sha: string })[];
}

/** What {@link GithubClient.commitOnHead} is asked to do. */
export interface CommitOnHeadArgs {
  branch: string;
  message: string;
  /** What to write against the head `at`; null stops without committing. */
  build: (at: string) => Promise<FileChanges | null>;
}

/** The input of GraphQL `createCommitOnBranch`, as {@link GithubClient.commitOnBranch} sends it. */
export interface CreateCommitOnBranchInput {
  branch: { repositoryNameWithOwner: string; branchName: string };
  expectedHeadOid: string;
  message: { headline: string; body?: string };
  fileChanges: { additions: { path: string; contents: string }[]; deletions: { path: string }[] };
}

const CREATE_COMMIT = `mutation($input: CreateCommitOnBranchInput!) { createCommitOnBranch(input: $input) { commit { oid } } }`;

/** How many files one GraphQL read asks for (§10.2). */
export const FILES_PER_QUERY = 100;

/** A GraphQL read of `count` files of one repository, each by a `"<commit>:<path>"` expression passed as a variable. */
function filesQuery(count: number): string {
  const indices = Array.from({ length: count }, (_, i) => i);
  const variables = indices.map((i) => `$e${i}: String!`).join(', ');
  const fields = indices.map((i) => `f${i}: object(expression: $e${i}) { ... on Blob { oid text isTruncated } }`).join(' ');
  return `query($owner: String!, $name: String!, ${variables}) { repository(owner: $owner, name: $name) { ${fields} } }`;
}

/** The commit a Contents write made, from its answer (`commit.sha`, `commit.parents[0].sha`). */
function commitOf(body: unknown): CommitLink | null {
  const commit = (body as { commit?: { sha?: unknown; parents?: { sha?: unknown }[] } } | null)?.commit;
  const sha = commit?.sha;
  const parent = commit?.parents?.[0]?.sha;
  return typeof sha === 'string' && typeof parent === 'string' ? { sha, parent } : null;
}

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

  private throwIfPaused(): void {
    const pausedUntil = this.pausedUntil;
    if (pausedUntil !== null) throw rateLimited(pausedUntil);
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
    this.throwIfPaused();
    if (contentCreating) {
      await this.options.budget?.reserve();
      // GitHub may have started limiting requests while this one waited for its place.
      this.throwIfPaused();
    }
    const token = this.getToken();
    const headers = new Headers(init.headers);
    headers.set('Accept', 'application/vnd.github+json');
    headers.set('X-GitHub-Api-Version', '2022-11-28');
    if (token) headers.set('Authorization', `Bearer ${token}`);

    const timeoutMs = this.options.timeoutMs ?? REQUEST_TIMEOUT_MS;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let timeOut: (error: Error) => void = () => {};
    // Raced as well as aborted, so a fetch that ignores its signal still ends.
    const timedOut = new Promise<never>((_, reject) => {
      timeOut = reject;
    });
    const allow = (ms: number) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        controller.abort();
        timeOut(new Error('timed out'));
      }, ms);
    };
    // The upload counts against the time, so a large body gets longer to send.
    allow(timeoutMs + transferAllowanceMs(typeof init.body === 'string' ? init.body.length : 0));
    let response: Response;
    try {
      response = await Promise.race([
        (async () => {
          // no-store: GitHub's Contents API answers with max-age=60, and a re-read after a 409 must see the other writer's commit.
          const answered = await fetch(input, { cache: 'no-store', ...init, headers, signal: controller.signal });
          // The body is read within the time too, given longer for a large one: a connection that stalls after the
          // headers would otherwise hang its reader, and the write queue behind it, for ever.
          allow(timeoutMs + transferAllowanceMs(Number(answered.headers.get('content-length'))));
          const body = answered.status === 204 || answered.status === 304 ? null : await answered.arrayBuffer();
          return new Response(body, { status: answered.status, statusText: answered.statusText, headers: answered.headers });
        })(),
        timedOut,
      ]);
      this.onResponse?.(response.headers);
    } catch {
      throw new GithubApiError(CAUSE_MESSAGES.unreachable!, 'unreachable');
    } finally {
      clearTimeout(timer);
    }
    if (response.status === 403 || response.status === 429) {
      const body = await response.clone().text();
      if (classifyFailure(response.status, response.headers, body) === 'rate-limited') {
        throw rateLimited(this.limitHit(response.headers), response.status, githubMessage(body));
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
    return { sha: body.content.sha, created: response.status === 201, commit: commitOf(body) };
  }

  /**
   * DELETE .../contents/{path} at `sha`, with `branch` in the request body (§10.2, §10.3). A stale sha is a
   * conflict, as for a put; `'gone'` when the file no longer exists, so a delete someone else already made counts.
   * Deleted, it gives the commit the delete made, or null when GitHub's answer does not name it.
   */
  async deleteFile(args: { path: string; branch: string; message: string; sha: string }): Promise<CommitLink | null | 'gone'> {
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
    return commitOf(await response.json().catch(() => null));
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
   * GET .../git/trees/{ref}?recursive=1: every file at `ref` (a commit or the branch) with its version, in one request
   * (§10.2). `truncated` when GitHub could not list them all (over 100,000 entries); the caller then lists another way.
   * Empty when the branch does not exist (404) or the repository is empty (409).
   */
  async listTree(args: { ref: string }): Promise<{ entries: TreeEntry[]; truncated: boolean }> {
    assertBranch(args.ref);
    const response = await this.request(`${this.repoUrl(`git/trees/${encodePath(args.ref)}`)}?recursive=1`, { method: 'GET' });
    if (response.status === 404 || response.status === 409) return { entries: [], truncated: false };
    await assertOk(response, `GET the files of ${args.ref}`);
    const body = (await response.json()) as { tree?: TreeEntry[]; truncated?: boolean };
    const entries = (body.tree ?? []).map(({ path, sha, type }) => ({ path, sha, type }));
    return { entries, truncated: Boolean(body.truncated) };
  }

  /**
   * Up to {@link FILES_PER_QUERY} files at `ref` (a commit or the branch) in one GraphQL query (§10.2). It only reads,
   * so it takes no place in the write budget. A file over GraphQL's limit is {@link TRUNCATED}, for the caller to read
   * on its own; one that does not exist at `ref` is left out. A limit GitHub names in the answer pauses requests as a
   * REST limit does.
   */
  async readFiles(args: { ref: string; paths: string[] }): Promise<Map<string, GetFileResult | typeof TRUNCATED>> {
    assertBranch(args.ref);
    if (args.paths.length > FILES_PER_QUERY) throw new Error(`At most ${FILES_PER_QUERY} files are read in one query.`);
    const read = new Map<string, GetFileResult | typeof TRUNCATED>();
    if (args.paths.length === 0) return read;
    const variables: Record<string, string> = { owner: this.location.owner, name: this.location.repo };
    args.paths.forEach((path, i) => (variables[`e${i}`] = `${args.ref}:${path}`));
    const response = await this.request(
      graphqlUrl(this.location.apiBaseUrl),
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: filesQuery(args.paths.length), variables }) },
      false,
    );
    type Blob = { oid: string; text: string | null; isTruncated: boolean } | null;
    const { data, errors } = await this.graphqlAnswer<{ repository?: Record<string, Blob> | null }>(response, 'GET files');
    const repository = data?.repository;
    if (errors.length > 0 || !repository) throw new GithubApiError(`GET files failed: ${errors[0]?.message ?? 'no repository'}`, 'unknown', response.status);
    args.paths.forEach((path, i) => {
      const blob = repository[`f${i}`];
      if (!blob) return;
      read.set(path, blob.isTruncated || blob.text === null ? TRUNCATED : { content: blob.text, sha: blob.oid });
    });
    return read;
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

  /** The commit the branch is at now; null when the branch does not exist. */
  private async headOf(branch: string): Promise<string | null> {
    const head = await this.getBranchHead({ branch, etag: null });
    return head && head !== 'not-modified' ? head.sha : null;
  }

  /** The commit the branch is at now, which must exist. */
  private async existingHeadOf(branch: string): Promise<string> {
    const head = await this.headOf(branch);
    if (head === null) throw new GithubApiError(`GET the head of ${branch} failed (404)`, 'not-found', 404);
    return head;
  }

  /** Checked-token validation (§5.10): who this token is, and whether it can write to the configured repo. */
  async checkToken(): Promise<{ login: string; scopesClassic: boolean }> {
    const userResponse = await this.request(`${this.location.apiBaseUrl}/user`, { method: 'GET' });
    await assertOk(userResponse, 'GET user');
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
    await assertOk(response, 'GET repo');
    const body = (await response.json()) as { permissions?: { push?: boolean } };
    return { visible: true, canWrite: Boolean(body.permissions?.push) };
  }

  /**
   * Replace and delete several files on an existing branch as one commit (§10.3): Reset, Load example data, and a
   * user action that writes several files. `build` is asked what to write
   * against the head the commit will sit on, and may read the branch at that commit (`at`) to decide; null stops
   * without committing. One GraphQL `createCommitOnBranch` makes the commit, refused unless the branch is still at that
   * head; then the whole commit is built again on the new head, up to three times. The written files come back with
   * their versions, computed here, so nobody needs to download them again.
   */
  async commitOnHead(args: CommitOnHeadArgs): Promise<CommitResult | 'stopped'> {
    assertBranch(args.branch);
    for (let attempt = 0; ; attempt += 1) {
      const head = await this.existingHeadOf(args.branch);
      const changes = await args.build(head);
      if (changes === null) return 'stopped';
      const outcome = await this.commitOnBranch({ branch: args.branch, expectedHeadOid: head, message: args.message, ...changes });
      if (outcome === 'moved' && attempt < 3) continue; // another commit landed first: build again on the new head
      if (outcome === 'moved') throw new GithubApiError('The data branch kept changing — please retry.', 'conflict', 422);
      return { commitSha: outcome.commitSha, parent: head, written: await withVersions(changes.files) };
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
    const input: CreateCommitOnBranchInput = {
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
    const { data, errors } = await this.graphqlAnswer<{ createCommitOnBranch?: { commit?: { oid: string } } | null }>(response, 'Commit');
    // A refusal is a 200 with errors, told apart by type (spike-findings.md).
    if (errors.some((e) => e.type === 'STALE_DATA' || e.type === 'NOT_FOUND')) return 'moved';
    const oid = data?.createCommitOnBranch?.commit?.oid;
    if (errors.length > 0 || !oid) throw new GithubApiError(`Commit failed: ${errors[0]?.message ?? 'no commit'}`, 'unknown', response.status);
    return { commitSha: oid };
  }

  /** A GraphQL answer's data and errors; a limit GitHub names in them pauses requests as a REST limit does (§10.2). */
  private async graphqlAnswer<D>(response: Response, what: string): Promise<{ data: D | null; errors: { type?: string; message?: string }[] }> {
    await assertOk(response, what);
    const body = (await response.json()) as { data?: D | null; errors?: { type?: string; message?: string }[] };
    const errors = body.errors ?? [];
    if (errors.some((e) => e.type === 'RATE_LIMITED')) throw rateLimited(this.limitHit(response.headers), response.status, errors[0]?.message ?? '');
    return { data: body.data ?? null, errors };
  }

  /** The branch's head, when it is a commit titled `headline` on `parent`: a commit of ours whose answer was lost. */
  private async landedOn(branch: string, parent: string, headline: string): Promise<string | null> {
    const head = await this.existingHeadOf(branch);
    if (head === parent) return null;
    const commitResponse = await this.request(this.repoUrl(`git/commits/${head}`), { method: 'GET' });
    await assertOk(commitResponse, 'GET commit');
    const commit = (await commitResponse.json()) as { message: string; parents: { sha: string }[] };
    return commit.parents[0]?.sha === parent && commit.message.split('\n')[0] === headline ? head : null;
  }

  /**
   * The fresh-install baseline (§3 "System writes") as one commit. Onto an existing branch it is one GraphQL commit on
   * the head just read. A missing branch is created, which GraphQL can't do: a tree with the files' contents inline, a
   * commit with no parent, then the ref; three content-creating requests and no blob uploads.
   *
   * When another commit reaches the branch first, ours is never put on top of it: the commit is refused as stale, or
   * the ref create as "Reference already exists" (422), and the branch's actual head is returned instead, with nothing
   * written by us. The concurrent attempts converge on the winner's baseline, with no duplicate (§3 "System writes"); a
   * second baseline over it would replace its roles' and countries' ids under data already pointing at them.
   */
  async createFilesCommit(args: { branch: string; files: FileChange[]; message: string }): Promise<CommitResult> {
    assertBranch(args.branch);
    const head = await this.headOf(args.branch);
    if (head !== null) {
      const outcome = await this.commitOnBranch({ branch: args.branch, expectedHeadOid: head, message: args.message, files: args.files, deletes: [] });
      if (outcome === 'moved') return this.lostTo(args.branch);
      return { commitSha: outcome.commitSha, parent: head, written: await withVersions(args.files) };
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
    if (createRefResponse.status === 422) return this.lostTo(args.branch);
    await assertOk(createRefResponse, 'Ref create');
    return { commitSha, parent: null, written: await withVersions(args.files) };
  }

  /** Another client's bootstrap won: its commit, rather than a dangling sha of ours, and nothing written by us. */
  private async lostTo(branch: string): Promise<CommitResult> {
    const winner = await this.headOf(branch);
    if (winner === null) throw new GithubApiError('The data branch changed during setup — please retry.', 'conflict', 422);
    return { commitSha: winner, parent: null, written: [] };
  }
}
