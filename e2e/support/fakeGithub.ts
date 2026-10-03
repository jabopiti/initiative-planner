import type { Page, Route } from '@playwright/test';
import { decodeBase64Utf8 as unb64, encodeBase64Utf8 as b64 } from '../../src/github/base64';

/**
 * An in-memory GitHub for browser tests: just enough of the REST API the app uses (the token check, the
 * Contents API, and the Git Data API a fresh install bootstraps with) behind `page.route`, so a flow runs
 * against the production build with no network and no real repository. Like the real thing, a stale `sha`
 * on a write is a 409 and an existing file written without one is a 422.
 */

const API = 'https://api.github.com';
const BRANCH = 'data';

interface StoredFile {
  content: string;
  sha: string;
}

export function fakeGithub(page: Page, options: { login?: string; rejectedTokens?: string[] } = {}) {
  const rejectedTokens = [...(options.rejectedTokens ?? [])];
  const files = new Map<string, StoredFile>();
  const blobs = new Map<string, string>();
  const trees = new Map<string, Map<string, string>>();
  const commits = new Map<string, string>();
  const writes: { path: string; message: string }[] = [];
  let headCommit: string | null = null;
  let counter = 0;
  const next = (kind: string) => `${kind}-${(counter += 1)}`;

  const json = (route: Route, body: unknown, status = 200, headers: Record<string, string> = {}) =>
    route.fulfill({
      status,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'etag, x-oauth-scopes', ...headers },
      body: JSON.stringify(body),
    });

  function listing(dir: string) {
    const prefix = dir ? `${dir}/` : '';
    const entries = new Map<string, unknown>();
    for (const [path, file] of files) {
      if (!path.startsWith(prefix)) continue;
      const rest = path.slice(prefix.length);
      const [name, ...deeper] = rest.split('/');
      entries.set(name, deeper.length ? { name, path: prefix + name, sha: 'dir', type: 'dir' } : { name, path, sha: file.sha, type: 'file' });
    }
    return [...entries.values()];
  }

  async function handle(route: Route) {
    const request = route.request();
    const { pathname } = new URL(request.url());
    const method = request.method();

    const token = (request.headers().authorization ?? '').replace('Bearer ', '');
    if (rejectedTokens.includes(token)) return json(route, { message: 'Bad credentials' }, 401);
    if (method === 'GET' && pathname === '/user') return json(route, { login: options.login ?? 'e2e-user' });
    if (method === 'GET' && /^\/repos\/[^/]+\/[^/]+$/.test(pathname)) return json(route, { permissions: { push: true } });

    if (method === 'GET' && pathname.endsWith(`/git/ref/heads/${BRANCH}`)) {
      if (!headCommit) return json(route, { message: 'Not Found' }, 404);
      const etag = `"${headCommit}"`;
      if (request.headers()['if-none-match'] === etag) return route.fulfill({ status: 304, headers: { 'access-control-allow-origin': '*' } });
      return json(route, { object: { sha: headCommit } }, 200, { etag });
    }

    if (method === 'POST' && pathname.endsWith('/git/blobs')) {
      const sha = next('blob');
      blobs.set(sha, request.postDataJSON().content);
      return json(route, { sha }, 201);
    }
    if (method === 'POST' && pathname.endsWith('/git/trees')) {
      const body = request.postDataJSON() as { base_tree?: string; tree: { path: string; sha: string }[] };
      const tree = new Map(body.base_tree ? trees.get(body.base_tree) : []);
      for (const entry of body.tree) tree.set(entry.path, entry.sha);
      const sha = next('tree');
      trees.set(sha, tree);
      return json(route, { sha }, 201);
    }
    if (method === 'POST' && pathname.endsWith('/git/commits')) {
      const sha = next('commit');
      commits.set(sha, request.postDataJSON().tree);
      return json(route, { sha }, 201);
    }
    const commitMatch = pathname.match(/\/git\/commits\/(.+)$/);
    if (method === 'GET' && commitMatch) return json(route, { tree: { sha: commits.get(commitMatch[1]) } });

    if ((method === 'POST' && pathname.endsWith('/git/refs')) || (method === 'PATCH' && pathname.endsWith(`/git/refs/heads/${BRANCH}`))) {
      const sha = request.postDataJSON().sha as string;
      headCommit = sha;
      files.clear();
      for (const [path, blob] of trees.get(commits.get(sha)!)!) files.set(path, { content: unb64(blobs.get(blob)!), sha: blob });
      return json(route, { ref: `refs/heads/${BRANCH}`, object: { sha } }, method === 'POST' ? 201 : 200);
    }

    const contents = pathname.match(/\/contents\/(.*)$/);
    if (contents) {
      const path = decodeURIComponent(contents[1]);
      if (method === 'GET') {
        const file = files.get(path);
        if (file) return json(route, { content: b64(file.content), encoding: 'base64', sha: file.sha });
        const entries = listing(path);
        return entries.length ? json(route, entries) : json(route, { message: 'Not Found' }, 404);
      }
      if (method === 'PUT') {
        const body = request.postDataJSON() as { message: string; content: string; sha?: string; branch: string };
        if (body.branch !== BRANCH) throw new Error(`A write named the wrong branch: ${body.branch}`);
        const existing = files.get(path);
        if (existing && body.sha !== existing.sha) return json(route, { message: 'sha does not match' }, body.sha ? 409 : 422);
        const sha = next('sha');
        files.set(path, { content: unb64(body.content), sha });
        writes.push({ path, message: body.message });
        headCommit = next('commit');
        return json(route, { content: { sha } });
      }
    }

    throw new Error(`Unhandled GitHub request: ${method} ${pathname}`);
  }

  return {
    /** Starts answering for api.github.com; call before the page loads. */
    async install() {
      await page.route(`${API}/**`, async (route) => {
        // A cross-origin request with an Authorization header is preflighted; answer it so the real one is sent.
        if (route.request().method() === 'OPTIONS') {
          return route.fulfill({
            status: 204,
            headers: {
              'access-control-allow-origin': '*',
              'access-control-allow-methods': 'GET, PUT, POST, PATCH, OPTIONS',
              'access-control-allow-headers': '*',
            },
          });
        }
        return handle(route);
      });
    },
    /** Parsed contents of a file on the data branch, or undefined if it isn't there. */
    read: <T>(path: string): T | undefined => {
      const file = files.get(path);
      return file ? (JSON.parse(file.content) as T) : undefined;
    },
    /** Paths of the files under `dir` on the data branch. */
    paths: (dir = '') => [...files.keys()].filter((path) => path.startsWith(dir)),
    /** Every write made through the Contents API, oldest first. */
    writes,
    /** From now on GitHub answers 401 to this token, as it does once a token is revoked or expires. */
    rejectToken: (token: string) => void rejectedTokens.push(token),
    /**
     * Another user's save: replaces a file's content behind the app's back, so its next write carries a stale
     * `sha` (a 409) and its next pull sees a new branch head.
     */
    edit: <T>(path: string, change: (current: T) => T) => {
      const file = files.get(path);
      if (!file) throw new Error(`No file to edit: ${path}`);
      files.set(path, { content: JSON.stringify(change(JSON.parse(file.content) as T)), sha: next('sha') });
      headCommit = next('commit');
    },
  };
}
