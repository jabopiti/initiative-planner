import { vi } from 'vitest';
import { defaultBrandPack } from '../../brand/defaultBrand';
import type { Country, Initiative, Person, Role, Team } from '../../data/types';
import { decodeBase64Utf8, encodeBase64Utf8 } from '../../github/base64';
import { Repository, type RepositoryState } from '../Repository';

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

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

/** A repository on the data branch: files with shas, held or failed writes on demand, and "the other writer". */
export type TokenBehaviour = 'invalid' | 'read-only' | 'cannot-see' | 'classic' | 'pending-approval';

export function fakeGithub() {
  const files = new Map<string, { content: string; sha: string }>();
  const puts: PutRecord[] = [];
  const deletes: DeleteRecord[] = [];
  const arrivals = new Map<string, number>();
  const holds: { prefix: string; gate: Promise<void> }[] = [];
  const failures: { prefix: string; status: number }[] = [];
  const reads: string[] = [];
  const failReads: { path: string; status: number }[] = [];
  const tokenBehaviours = new Map<string, TokenBehaviour>();
  let counter = 0;
  let head = 1;
  /** The Git data API (§10.3's many-file commits): blobs, trees and commits made, and commits that moved the branch. */
  const blobs = new Map<string, string>();
  const trees = new Map<string, { path: string; sha: string | null }[]>();
  const newCommits = new Map<string, { message: string; tree: string; parents: string[] }>();
  const gitCommits: { message: string; files: string[]; deleted: string[] }[] = [];
  const gitFailures: { prefix: string; status: number }[] = [];
  const beforeRefUpdates: (() => void)[] = [];

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

    const git = pathname.match(/\/git\/(blobs|trees|commits|refs)(?:\/(.*))?$/);
    if (git && !(method === 'GET' && git[1] === 'refs')) {
      const [, kind, rest] = git;
      const failure = take(gitFailures, kind);
      if (failure) return json({ message: 'failed' }, failure.status);
      const body = init.body ? (JSON.parse(init.body as string) as Record<string, unknown>) : {};
      if (kind === 'commits' && method === 'GET') return json({ sha: rest, tree: { sha: `tree-of-${rest}` } });
      const sha = `${kind}-${(counter += 1)}`;
      if (kind === 'blobs') blobs.set(sha, decodeBase64Utf8(body.content as string));
      if (kind === 'trees') trees.set(sha, body.tree as { path: string; sha: string | null }[]);
      if (kind === 'commits') newCommits.set(sha, body as { message: string; tree: string; parents: string[] });
      if (kind === 'refs') {
        if (rest !== `heads/${DATA_BRANCH}`) throw new Error(`A ref update named the wrong branch: ${rest}`);
        beforeRefUpdates.shift()?.();
        const commit = newCommits.get(body.sha as string)!;
        if (commit.parents[0] !== `commit-${head}`) return json({ message: 'Update is not a fast forward' }, 422);
        const entries = trees.get(commit.tree)!;
        for (const entry of entries) {
          if (entry.sha === null) files.delete(entry.path);
          else files.set(entry.path, { content: blobs.get(entry.sha)!, sha: entry.sha });
        }
        head += 1;
        gitCommits.push({
          message: commit.message,
          files: entries.filter((e) => e.sha !== null).map((e) => e.path),
          deleted: entries.filter((e) => e.sha === null).map((e) => e.path),
        });
        return json({ object: { sha: `commit-${head}` } });
      }
      return json({ sha }, 201);
    }

    // The §5.10 token check: who the bearer is, and what it may do to the repository.
    const behaviour = tokenBehaviours.get((new Headers(init.headers).get('Authorization') ?? '').replace('Bearer ', ''));
    if (method === 'GET' && pathname === '/user') {
      if (behaviour === 'invalid') return json({ message: 'Bad credentials' }, 401);
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
      if (record.status !== 200) return json({ message: 'failed' }, record.status);
      files.delete(path);
      head += 1;
      return json({ commit: { sha: `commit-${head}` } });
    }

    const record: PutRecord = { path, message: body.message, sha: body.sha, content: JSON.parse(decodeBase64Utf8(body.content)), status: 200 };
    puts.push(record);

    const failure = take(failures, path);
    if (failure) {
      record.status = failure.status;
      return json({ message: 'failed' }, failure.status);
    }
    const existing = files.get(path);
    if (existing && body.sha !== existing.sha) {
      record.status = body.sha ? 409 : 422; // a stale sha is a 409; none at all for an existing file is a 422
      return json({ message: 'sha does not match' }, record.status);
    }
    if (!existing) record.status = 201;

    record.newSha = put(path, record.content);
    return json({ content: { sha: record.newSha } }, record.status);
  });

  return {
    fetchMock,
    puts,
    /** Many-file commits that moved the data branch (§10.3), oldest first. */
    gitCommits,
    /** The next Git data request of this kind (`blobs`, `trees`, `commits`, `refs`) is refused with `status`. */
    failGit: (kind: 'blobs' | 'trees' | 'commits' | 'refs', status: number) => void gitFailures.push({ prefix: kind, status }),
    /** Runs `act` (another writer's commit, say) just before the next ref update is decided. */
    beforeRefUpdate: (act: () => void) => void beforeRefUpdates.push(act),
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
    /** What the token check (§5.10) finds for this token: rejected, read-only, unable to see the repository, classic, or awaiting approval. Every other token works. */
    setTokenBehaviour: (token: string, behaviour: TokenBehaviour) => void tokenBehaviours.set(token, behaviour),
    /** The next write (put or delete) to a path starting with `prefix` is refused with `status` and changes nothing. */
    fail: (prefix: string, status: number) => void failures.push({ prefix, status }),
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

