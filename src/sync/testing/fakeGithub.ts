import { vi } from 'vitest';
import { defaultBrandPack } from '../../brand/defaultBrand';
import { buildBaselineDataset } from '../../data/baseline';
import type { Country, Initiative, Person, Role, Team } from '../../data/types';
import { decodeBase64Utf8, encodeBase64Utf8 } from '../../github/base64';
import { gitBlobSha, TRUNCATED } from '../../github/client';
import { Repository, type RepositoryState } from '../Repository';
import { answerCreateCommit } from './graphqlCommit';
import { answerFilesQuery, answerTree, isFilesQuery, queriedPaths } from './graphqlRead';

/**
 * An in-memory GitHub for tests that need the real rules: a stale sha is a 409, a missing sha on an
 * existing file is a 422, a write to a file that is gone creates it (201, as GitHub does even when it names a sha),
 * and a write can be held in flight or refused on demand.
 */

const DATA_BRANCH = defaultBrandPack.github.dataBranch;
export const PHASE = defaultBrandPack.process[0].id;

interface PutRecord {
  path: string;
  message: string;
  sha?: string;
  content: unknown;
  status: number;
  newSha?: string;
}

interface DeleteRecord {
  path: string;
  message: string;
  sha: string;
  status: number;
}

export function json(body: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(body), { status, headers });
}

/** How a refusal reads beyond its status: GitHub's message and headers (a rate limit's `retry-after`, say). */
interface Refusal {
  message?: string;
  headers?: HeadersInit;
}

/** A repository on the data branch: files with shas, held or failed writes on demand, and "the other writer". */
export type TokenBehaviour = 'invalid' | 'read-only' | 'cannot-see' | 'classic' | 'pending-approval' | 'rate-limited';

export function fakeGithub() {
  const files = new Map<string, { content: string; sha: string }>();
  const puts: PutRecord[] = [];
  const deletes: DeleteRecord[] = [];
  const arrivals = new Map<string, number>();
  const holds: { prefix: string; gate: Promise<void> }[] = [];
  const failures: { prefix: string; status: number; refusal: Refusal }[] = [];
  const reads: string[] = [];
  const failReads: { path: string; status: number }[] = [];
  /** Files a GraphQL read gives cut short, as GitHub does for one over 512,000 bytes: read through REST instead. */
  const tooLarge = new Set<string>();
  const tokenBehaviours = new Map<string, TokenBehaviour>();
  let counter = 0;
  let head = 1;
  /** The bootstrap's trees and commits (§3 "System writes"), and every many-file commit that moved the branch (§10.3). */
  const trees = new Map<string, { path: string; content: string }[]>();
  const newCommits = new Map<string, { message: string; tree: string }>();
  const gitCommits: { message: string; files: string[]; deleted: string[] }[] = [];
  const graphqlCommits: { message: string; files: string[]; deleted: string[] }[] = [];
  const beforeCommits: (() => void)[] = [];
  /** What each commit the branch moved to says and sits on, for a client checking whether its commit landed. */
  const commitInfo = new Map<string, { message: string; parents: string[] }>();
  /** How the next GraphQL commits are answered instead of normally: refused with a status, or made but answered 504. */
  const graphqlFailures: ({ status: number } | 'lost')[] = [];

  const take = <T extends { prefix: string }>(queue: T[], path: string): T | undefined => {
    const index = queue.findIndex((entry) => path.startsWith(entry.prefix));
    return index < 0 ? undefined : queue.splice(index, 1)[0];
  };

  const put = (path: string, value: unknown): string => {
    const sha = `sha-${(counter += 1)}`;
    files.set(path, { content: JSON.stringify(value), sha });
    head += 1;
    return sha;
  };

  const fetchMock = vi.fn(async (url: string, init: RequestInit = {}) => {
    const pathname = new URL(url).pathname;
    const method = init.method ?? 'GET';

    if (method === 'GET' && pathname.endsWith(`/git/ref/heads/${DATA_BRANCH}`)) {
      if (files.size === 0) return json({ message: 'Not Found' }, 404);
      const etag = `"head-${head}"`;
      if (new Headers(init.headers).get('If-None-Match') === etag) return new Response(null, { status: 304 });
      return new Response(JSON.stringify({ object: { sha: `commit-${head}` } }), { status: 200, headers: { etag } });
    }

    // Every file of the branch in one listing (§10.2). The fake keeps no history: any ref lists the files as they are.
    if (method === 'GET' && /\/git\/trees\/[^/]+$/.test(pathname)) {
      if (files.size === 0) return json({ message: 'Not Found' }, 404);
      return json(answerTree(`commit-${head}`, [...files].map(([path, file]) => [path, file.sha])));
    }

    // A GraphQL read of files (§10.2): each read is a download, and a refused read refuses the whole query.
    if (method === 'POST' && pathname === '/graphql' && isFilesQuery(init.body as string)) {
      const paths = queriedPaths(init.body as string);
      const failure = failReads.findIndex((f) => paths.includes(f.path));
      if (failure >= 0) return json({ message: 'failed' }, failReads.splice(failure, 1)[0].status);
      return json(
        await answerFilesQuery(init.body as string, (path) => {
          if (!files.has(path)) return null;
          if (tooLarge.has(path)) return TRUNCATED;
          reads.push(path);
          return files.get(path)!;
        }),
      );
    }

    // GraphQL `createCommitOnBranch` (§10.3): one commit of many files, refused unless the branch is at the expected head.
    if (method === 'POST' && pathname === '/graphql') {
      const failure = graphqlFailures.shift();
      if (failure && failure !== 'lost') return json({ message: 'failed' }, failure.status);
      beforeCommits.shift()?.();
      const body = await answerCreateCommit(init.body as string, {
        name: DATA_BRANCH,
        head: files.size === 0 ? null : `commit-${head}`,
        has: (path) => files.has(path),
        land: (commit) => {
          for (const path of commit.deletes) files.delete(path);
          for (const file of commit.files) files.set(file.path, { content: file.content, sha: file.sha });
          const parent = `commit-${head}`;
          head += 1;
          commitInfo.set(`commit-${head}`, { message: commit.message, parents: [parent] });
          const record = { message: commit.message, files: commit.files.map((f) => f.path), deleted: commit.deletes };
          gitCommits.push(record);
          graphqlCommits.push(record);
          return `commit-${head}`;
        },
      });
      if (failure === 'lost') return json({ message: 'We couldn\'t respond to your request in time.' }, 504);
      return json(body);
    }

    // The bootstrap onto a missing branch: a tree with its files' contents inline, a commit with no parent, the ref.
    const git = pathname.match(/\/git\/(trees|commits|refs)(?:\/(.*))?$/);
    if (git && !(method === 'GET' && git[1] === 'refs')) {
      const [, kind, rest] = git;
      if (kind === 'commits' && method === 'GET') return json({ sha: rest, ...(commitInfo.get(rest) ?? { message: '', parents: [] }) });
      const body = JSON.parse(init.body as string) as Record<string, unknown>;
      const sha = `${kind}-${(counter += 1)}`;
      if (kind === 'trees') trees.set(sha, body.tree as { path: string; content: string }[]);
      if (kind === 'commits') newCommits.set(sha, body as { message: string; tree: string });
      if (kind === 'refs') {
        if (body.ref !== `refs/heads/${DATA_BRANCH}`) throw new Error(`A ref create named the wrong branch: ${String(body.ref)}`);
        if (files.size > 0) return json({ message: 'Reference already exists' }, 422);
        const commit = newCommits.get(body.sha as string)!;
        const entries = trees.get(commit.tree)!;
        for (const entry of entries) files.set(entry.path, { content: entry.content, sha: await gitBlobSha(entry.content) });
        head += 1;
        gitCommits.push({ message: commit.message, files: entries.map((e) => e.path), deleted: [] });
        return json({ object: { sha: `commit-${head}` } }, 201);
      }
      return json({ sha }, 201);
    }

    // The §5.10 token check: who the bearer is, and what it may do to the repository.
    const behaviour = tokenBehaviours.get((new Headers(init.headers).get('Authorization') ?? '').replace('Bearer ', ''));
    if (method === 'GET' && pathname === '/user') {
      if (behaviour === 'invalid') return json({ message: 'Bad credentials' }, 401);
      if (behaviour === 'rate-limited') return json({ message: 'API rate limit exceeded' }, 403, { 'x-ratelimit-remaining': '0' });
      // A classic token's response carries X-OAuth-Scopes; a fine-grained token's doesn't.
      return behaviour === 'classic'
        ? new Response(JSON.stringify({ login: 'jmustermann' }), { status: 200, headers: { 'X-OAuth-Scopes': 'repo' } })
        : json({ login: 'jmustermann' });
    }
    if (method === 'GET' && /^\/repos\/[^/]+\/[^/]+$/.test(pathname)) {
      if (behaviour === 'cannot-see') return json({ message: 'Not Found' }, 404);
      if (behaviour === 'pending-approval') return json({ message: 'Resource pending approval by organization owner' }, 403);
      return json({ permissions: { push: behaviour !== 'read-only' } });
    }

    const match = pathname.match(/\/contents\/(.*)$/);
    if (!match) throw new Error(`Unhandled request in test: ${url}`);
    const path = decodeURIComponent(match[1]);

    if (method === 'GET') {
      const entry = (p: string, name: string) => ({ name, path: p, sha: files.get(p)!.sha, type: 'file' });
      if (path === '') {
        const root = [...files.keys()].filter((p) => !p.includes('/')).map((p) => entry(p, p));
        const hasInitiatives = [...files.keys()].some((p) => p.startsWith('initiatives/'));
        return json(root.concat(hasInitiatives ? [{ name: 'initiatives', path: 'initiatives', sha: 'dir', type: 'dir' }] : []));
      }
      if (path === 'initiatives') {
        const entries = [...files.keys()].filter((p) => p.startsWith('initiatives/')).map((p) => entry(p, p.slice(12)));
        return entries.length ? json(entries) : json({ message: 'Not Found' }, 404);
      }
      reads.push(path);
      const failure = failReads.findIndex((f) => f.path === path);
      if (failure >= 0) return json({ message: 'failed' }, failReads.splice(failure, 1)[0].status);
      const file = files.get(path);
      return file ? json({ content: encodeBase64Utf8(file.content), sha: file.sha }) : json({ message: 'Not Found' }, 404);
    }

    const body = JSON.parse(init.body as string) as { message: string; content: string; sha?: string; branch: string };
    if (body.branch !== DATA_BRANCH) throw new Error(`A write named the wrong branch: ${body.branch}`);
    arrivals.set(path, (arrivals.get(path) ?? 0) + 1);
    const hold = take(holds, path);
    if (hold) await hold.gate;

    if (method === 'DELETE') {
      const record: DeleteRecord = { path, message: body.message, sha: body.sha!, status: 200 };
      deletes.push(record);
      const failure = take(failures, path);
      const existing = files.get(path);
      record.status = failure?.status ?? (!existing ? 404 : body.sha !== existing.sha ? 409 : 200);
      if (record.status !== 200) return json({ message: failure?.refusal.message ?? 'failed' }, record.status, failure?.refusal.headers);
      files.delete(path);
      head += 1;
      return json({ commit: { sha: `commit-${head}`, parents: [{ sha: `commit-${head - 1}` }] } });
    }

    const record: PutRecord = { path, message: body.message, sha: body.sha, content: JSON.parse(decodeBase64Utf8(body.content)), status: 200 };
    puts.push(record);

    const failure = take(failures, path);
    if (failure) {
      record.status = failure.status;
      return json({ message: failure.refusal.message ?? 'failed' }, failure.status, failure.refusal.headers);
    }
    const existing = files.get(path);
    if (existing && body.sha !== existing.sha) {
      record.status = body.sha ? 409 : 422; // a stale sha is a 409; none at all for an existing file is a 422
      return json({ message: 'sha does not match' }, record.status);
    }
    if (!existing) record.status = 201;

    record.newSha = put(path, record.content);
    return json({ content: { sha: record.newSha }, commit: { sha: `commit-${head}`, parents: [{ sha: `commit-${head - 1}` }] } }, record.status);
  });

  return {
    fetchMock,
    puts,
    /** Many-file commits that moved the data branch (§10.3), oldest first. */
    gitCommits,
    /** Those of them made through GraphQL, oldest first. */
    graphqlCommits,
    /** The next GraphQL commit is refused with `status`, or (`'lost'`) made but answered with a 504. */
    failGraphql: (failure: { status: number } | 'lost') => void graphqlFailures.push(failure),
    /** Runs `act` (another writer's commit, say) just before the next GraphQL commit is decided. */
    beforeCommit: (act: () => void) => void beforeCommits.push(act),
    /** Every delete that reached the server, refused ones included. */
    deletes,
    has: (path: string) => files.has(path),
    /** Writes the repository actually accepted to `path`, oldest first. */
    commits: (path: string) => puts.filter((p) => p.path === path && (p.status === 200 || p.status === 201)),
    /** How many writes to `path` have reached the server (held ones included). */
    arrived: (path: string) => arrivals.get(path) ?? 0,
    read: <T>(path: string): T => JSON.parse(files.get(path)!.content) as T,
    /** Files as they were before the client under test looked, or as the other writer commits them. */
    seed: (path: string, value: unknown) => void put(path, value),
    /** The other writer removes a file. */
    remove: (path: string) => {
      files.delete(path);
      head += 1;
    },
    /** Paths of every file the client has downloaded, in order (listings and head checks are not downloads). */
    reads,
    /** A GraphQL read gives `path` cut short, as GitHub does for a file over 512,000 bytes. */
    tooLarge: (path: string) => void tooLarge.add(path),
    /** The next download of `path` is refused with `status`. */
    failRead: (path: string, status: number) => void failReads.push({ path, status }),
    /** Every request the client has made, in order, as `METHOD pathname`. */
    requests: () => fetchMock.mock.calls.map(([url, init]) => `${(init as RequestInit | undefined)?.method ?? 'GET'} ${new URL(url as string).pathname}`),
    /** The next write to a path starting with `prefix` waits until the returned function is called. */
    hold: (prefix: string) => {
      let release!: () => void;
      holds.push({ prefix, gate: new Promise<void>((resolve) => (release = resolve)) });
      return release;
    },
    /** What the token check (§5.10) finds for this token: rejected, read-only, unable to see the repository, classic, awaiting approval, or rate limited. Every other token works. */
    setTokenBehaviour: (token: string, behaviour: TokenBehaviour) => void tokenBehaviours.set(token, behaviour),
    /** The next write (put or delete) to a path starting with `prefix` is refused with `status` (and `refusal`'s message and headers) and changes nothing. */
    fail: (prefix: string, status: number, refusal: Refusal = {}) => void failures.push({ prefix, status, refusal }),
  };
}

export type Fake = ReturnType<typeof fakeGithub>;

/** Every request waits for the returned `release()` (or only those `only` picks), so what shows before the network answers can be told from what shows after. */
export function holdNetwork(fake: Fake, only: (url: string, init?: RequestInit) => boolean = () => true) {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  vi.stubGlobal('fetch', (url: string, init?: RequestInit) => (only(url, init) ? gate.then(() => fake.fetchMock(url, init)) : fake.fetchMock(url, init)));
  return release;
}

/**
 * A fake made and seeded by `seed` at the first request after each `reset()`, for test files whose tests change their
 * dataset before rendering. Stub `fetch` once with `fetch`; `fake()` is the current one.
 */
export function fakeOnDemand(seed: (fake: Fake) => void) {
  let current: Fake | undefined;
  const fake = (): Fake => {
    if (!current) {
      current = fakeGithub();
      seed(current);
    }
    return current;
  };
  return {
    fake,
    fetch: (url: string, init?: RequestInit) => fake().fetchMock(url, init),
    /** The next request starts from a new fake. */
    reset: () => void (current = undefined),
    /** Writes the repository accepted, oldest first, across every file. */
    accepted: () => fake().puts.filter((p) => p.status === 200 || p.status === 201),
  };
}

/** The six master files, each the brand pack's baseline unless `files` names it, and each initiative in its file. */
export function seedFiles(
  fake: Fake,
  files: { dataset?: unknown; roles?: unknown; countries?: unknown; teams?: unknown; people?: unknown; memberships?: unknown; initiatives?: Initiative[] } = {},
) {
  const baseline = buildBaselineDataset(defaultBrandPack);
  fake.seed('dataset.json', files.dataset ?? baseline.datasetFlags);
  fake.seed('roles.json', files.roles ?? baseline.roles);
  fake.seed('countries.json', files.countries ?? baseline.countries);
  fake.seed('teams.json', files.teams ?? []);
  fake.seed('people.json', files.people ?? []);
  fake.seed('memberships.json', files.memberships ?? []);
  for (const initiative of files.initiatives ?? []) fake.seed(`initiatives/${initiative.id}.json`, initiative);
}

/** The role and country every `person()` refers to. */
export const FIXTURE_ROLE: Role = { id: 'r1', name: 'Developer', abbreviation: 'Dev', costFactor: 1, active: true };
export const FIXTURE_COUNTRY: Country = { id: 'c1', name: 'Germany', code: 'DE', active: true, ratesByYear: [] };

/** A dataset with these teams, people and initiatives, served to `fetch`. */
export function seedDataset(fake: Fake, seeded: { teams?: Team[]; people?: Person[]; initiatives?: Initiative[]; ratesReviewed?: boolean } = {}) {
  fake.seed('dataset.json', { schemaVersion: 1, processIdentity: defaultBrandPack.processIdentity, ratesReviewed: seeded.ratesReviewed ?? false });
  // Every reference resolves (§3 Damaged data): the role and country `person()` uses, and each initiative's team.
  fake.seed('roles.json', [FIXTURE_ROLE]);
  fake.seed('countries.json', [FIXTURE_COUNTRY]);
  const teams = [...(seeded.teams ?? [])];
  for (const { teamId } of seeded.initiatives ?? []) if (!teams.some((t) => t.id === teamId)) teams.push({ id: teamId, name: teamId, active: true });
  fake.seed('teams.json', teams);
  fake.seed('people.json', seeded.people ?? []);
  fake.seed('memberships.json', []);
  for (const initiative of seeded.initiatives ?? []) fake.seed(`initiatives/${initiative.id}.json`, initiative);
  vi.stubGlobal('fetch', fake.fetchMock);
}

export async function open(fake: Fake, seeded: { teams?: Team[]; people?: Person[]; initiatives?: Initiative[] } = {}) {
  seedDataset(fake, seeded);
  const repo = new Repository(defaultBrandPack, 'token');
  await repo.initialize();
  const seen: RepositoryState[] = [];
  repo.subscribe(() => seen.push(repo.getState()));
  return { repo, seen };
}

export const person = (id: string, name: string, capacityPct = 100): Person => ({
  id,
  name,
  countryId: 'c1',
  roleId: 'r1',
  capacityPct,
  active: true,
});

export const initiative = (overrides: Partial<Initiative> = {}): Initiative => ({
  id: 'i1',
  name: 'Payments API',
  teamId: 'team-1',
  status: 'Active',
  ...overrides,
});

