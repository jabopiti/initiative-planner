import { vi } from 'vitest';
import { defaultBrandPack } from '../../brand/defaultBrand';
import type { Initiative, Person, Team } from '../../data/types';
import { decodeBase64Utf8, encodeBase64Utf8 } from '../../github/base64';
import { Repository, type RepositoryState } from '../Repository';

/**
 * An in-memory GitHub for tests that need the real rules: a stale sha is a 409, a missing sha on an
 * existing file is a 422, and a write can be held in flight or refused on demand.
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

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

/** A repository on the data branch: files with shas, held or failed writes on demand, and "the other writer". */
export function fakeGithub() {
  const files = new Map<string, { content: string; sha: string }>();
  const puts: PutRecord[] = [];
  const arrivals = new Map<string, number>();
  const holds: { prefix: string; gate: Promise<void> }[] = [];
  const failures: { prefix: string; status: number }[] = [];
  const reads: string[] = [];
  const failReads: { path: string; status: number }[] = [];
  let counter = 0;
  let head = 1;

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

    record.newSha = put(path, record.content);
    return json({ content: { sha: record.newSha } });
  });

  return {
    fetchMock,
    puts,
    /** Writes the repository actually accepted to `path`, oldest first. */
    commits: (path: string) => puts.filter((p) => p.path === path && p.status === 200),
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
    /** The next write to a path starting with `prefix` is refused with `status` and changes nothing. */
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

export async function open(fake: Fake, seeded: { teams?: Team[]; people?: Person[]; initiatives?: Initiative[] } = {}) {
  fake.seed('dataset.json', { schemaVersion: 1, processIdentity: defaultBrandPack.processIdentity, ratesReviewed: false });
  fake.seed('roles.json', []);
  fake.seed('countries.json', []);
  fake.seed('teams.json', seeded.teams ?? []);
  fake.seed('people.json', seeded.people ?? []);
  fake.seed('memberships.json', []);
  for (const initiative of seeded.initiatives ?? []) fake.seed(`initiatives/${initiative.id}.json`, initiative);
  vi.stubGlobal('fetch', fake.fetchMock);
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

