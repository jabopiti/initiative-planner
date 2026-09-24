import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GithubLocation } from '../brand/types';
import { FileCache } from '../cache/db';
import { GithubClient } from '../github/client';
import { FileWriter, type FileConflict, type WriteStatus } from './FileWriter';
import { mergeDocument, pathKey } from './merge';
import { WriteQueue } from './WriteQueue';

const location: GithubLocation = {
  apiBaseUrl: 'https://api.github.com',
  owner: 'jabopiti',
  repo: 'initiative-planner',
  appBranch: 'main',
  dataBranch: 'data',
};

interface Team {
  id: string;
  name: string;
  active: boolean;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

describe('FileWriter (list file) — §10.3 debounce + §10.5 409-retry-with-merge', () => {
  const cache = new FileCache('jabopiti/initiative-planner@data');
  let fetchMock: ReturnType<typeof vi.fn>;
  let github: GithubClient;
  let statuses: WriteStatus[];
  let conflicts: FileConflict[];
  let committed: Team[][];

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    github = new GithubClient(location, () => 'token');
    statuses = [];
    conflicts = [];
    committed = [];
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function makeWriter(initial: { content: Team[]; sha: string }) {
    return new FileWriter<Team[]>({
      path: 'teams.json',
      branch: location.dataBranch,
      github,
      queue: new WriteQueue(),
      cache,
      merge: mergeDocument,
      whenMissing: [],
      initial,
      onStatus: (s) => statuses.push(s),
      onConflict: (c) => conflicts.push(c),
      onDocument: (content) => committed.push(content),
    });
  }

  it('groups an edit into one commit after 1s, against the last-seen sha, on the data branch', async () => {
    const writer = makeWriter({ content: [], sha: 's0' });
    const team1: Team = { id: 't1', name: 'Platform', active: true };

    writer.schedule([team1]);
    expect(statuses).toEqual(['syncing']);
    expect(fetchMock).not.toHaveBeenCalled();

    fetchMock.mockResolvedValueOnce(jsonResponse({ content: { sha: 's1' } }));

    await writer.flush();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as { branch: string; sha: string };
    expect(body.branch).toBe('data');
    expect(body.sha).toBe('s0');

    expect(committed).toEqual([[team1]]);
    expect(statuses.at(-1)).toBe('synced');
  });

  it('retries after a 409 by re-fetching and merging pure additions from both sides', async () => {
    const writer = makeWriter({ content: [], sha: 's0' });
    const mine: Team = { id: 't1', name: 'Platform', active: true };
    const theirs: Team = { id: 't2', name: 'Growth', active: true };

    writer.schedule([mine]);

    fetchMock
      .mockResolvedValueOnce(jsonResponse({ message: 'Conflict' }, 409))
      .mockResolvedValueOnce(jsonResponse({ content: btoa(JSON.stringify([theirs])), sha: 's1' }))
      .mockResolvedValueOnce(jsonResponse({ content: { sha: 's2' } }));

    await writer.flush();

    expect(statuses.at(-1)).toBe('synced');
    expect(conflicts).toHaveLength(0);
    const finalCommit = committed.at(-1)!;
    expect(finalCommit.map((t) => t.id).sort()).toEqual(['t1', 't2']);

    const putCalls = fetchMock.mock.calls.filter(([, init]) => (init as RequestInit)?.method === 'PUT');
    expect(putCalls).toHaveLength(2);
    const retryBody = JSON.parse((putCalls[1][1] as RequestInit).body as string) as { sha: string };
    expect(retryBody.sha).toBe('s1');
  });

  it('surfaces a same-field conflict instead of auto-resolving, and lets "Use mine" win on retry', async () => {
    const base: Team = { id: 't1', name: 'Original', active: true };
    const writer = makeWriter({ content: [base], sha: 's0' });

    const mine: Team = { id: 't1', name: 'My Rename', active: true };
    const theirs: Team = { id: 't1', name: 'Their Rename', active: true };

    writer.schedule([mine]);

    fetchMock
      .mockResolvedValueOnce(jsonResponse({ message: 'Conflict' }, 409))
      .mockResolvedValueOnce(jsonResponse({ content: btoa(JSON.stringify([theirs])), sha: 's1' }));

    await writer.flush();

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({ file: 'teams.json', path: [{ id: 't1' }, 'name'], mine: 'My Rename', theirs: 'Their Rename' });
    // Never auto-resolved: no third PUT fired yet.
    const putCallsBeforeResolve = fetchMock.mock.calls.filter(([, init]) => (init as RequestInit)?.method === 'PUT');
    expect(putCallsBeforeResolve).toHaveLength(1);

    fetchMock.mockResolvedValueOnce(jsonResponse({ content: { sha: 's2' } }));
    await conflicts[0].resolve('mine');
    expect(statuses.at(-1)).toBe('synced');

    const putCalls = fetchMock.mock.calls.filter(([, init]) => (init as RequestInit)?.method === 'PUT');
    expect(putCalls).toHaveLength(2);
    const resolvedBody = JSON.parse((putCalls[1][1] as RequestInit).body as string) as { content: string; sha: string };
    const resolvedTeams = JSON.parse(atob(resolvedBody.content)) as Team[];
    expect(resolvedTeams.find((t) => t.id === 't1')?.name).toBe('My Rename');
    expect(resolvedBody.sha).toBe('s1');
  });

  it('keeps an edit made while a write is in flight: the finished write does not rewind state, and the queued write carries the new sha', async () => {
    const writer = makeWriter({ content: [], sha: 's0' });
    const team1: Team = { id: 't1', name: 'Platform', active: true };
    const team2: Team = { id: 't2', name: 'Payments', active: true };

    let releaseFirst!: (response: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => (releaseFirst = resolve)));
    writer.schedule([team1]);
    const first = writer.flush();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    writer.schedule([team1, team2]); // edited while the first write is still in flight
    fetchMock.mockResolvedValueOnce(jsonResponse({ content: { sha: 's2' } }));
    const second = writer.flush();

    releaseFirst(jsonResponse({ content: { sha: 's1' } }));
    await Promise.all([first, second]);

    expect(committed).toEqual([[team1, team2]]); // never [team1] alone
    expect(statuses.filter((s) => s === 'synced')).toHaveLength(1); // synced once, when the last write landed
    const puts = fetchMock.mock.calls.filter(([, init]) => (init as RequestInit)?.method === 'PUT');
    expect((JSON.parse((puts[1][1] as RequestInit).body as string) as { sha: string }).sha).toBe('s1');
  });

  it('resolving a conflict changes only the conflicting fields; the rest of the item keeps its clean merge', async () => {
    const base = { id: 'p1', name: 'A', active: true };
    const writer = makeWriter({ content: [base], sha: 's0' });
    const theirs = [{ id: 'p1', name: 'C', active: false }]; // they renamed it and deactivated it
    writer.schedule([{ id: 'p1', name: 'B', active: true }]); // we renamed it

    fetchMock
      .mockResolvedValueOnce(jsonResponse({ message: 'Conflict' }, 409))
      .mockResolvedValueOnce(jsonResponse({ content: btoa(JSON.stringify(theirs)), sha: 's1' }));
    await writer.flush();
    expect(conflicts).toHaveLength(1);

    fetchMock.mockResolvedValueOnce(jsonResponse({ content: { sha: 's2' } }));
    await conflicts[0].resolve('mine');
    const put = fetchMock.mock.calls.filter(([, init]) => (init as RequestInit)?.method === 'PUT').at(-1)!;
    const written = JSON.parse(atob((JSON.parse((put[1] as RequestInit).body as string) as { content: string }).content)) as Team[];
    expect(written).toEqual([{ id: 'p1', name: 'B', active: false }]); // our name, their deactivation
  });

  it('resolving one of several conflicts does not revert an already-resolved sibling', async () => {
    const baseA: Team = { id: 'tA', name: 'Original A', active: true };
    const baseB: Team = { id: 'tB', name: 'Original B', active: true };
    const writer = makeWriter({ content: [baseA, baseB], sha: 's0' });

    const mine: Team[] = [
      { id: 'tA', name: 'My A', active: true },
      { id: 'tB', name: 'My B', active: true },
    ];
    const theirs: Team[] = [
      { id: 'tA', name: 'Their A', active: true },
      { id: 'tB', name: 'Their B', active: true },
    ];

    writer.schedule(mine);
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ message: 'Conflict' }, 409))
      .mockResolvedValueOnce(jsonResponse({ content: btoa(JSON.stringify(theirs)), sha: 's1' }));
    await writer.flush();

    expect(conflicts).toHaveLength(2);
    const conflictA = conflicts.find((c) => pathKey(c.path) === '[tA].name')!;
    const conflictB = conflicts.find((c) => pathKey(c.path) === '[tB].name')!;

    // Resolve A ("use mine"), then B ("use mine" too: "keep theirs" with nothing else to write makes no commit) — each against whatever is current when it runs.
    fetchMock.mockResolvedValueOnce(jsonResponse({ content: { sha: 's2' } }));
    await conflictA.resolve('mine');

    fetchMock.mockResolvedValueOnce(jsonResponse({ content: { sha: 's3' } }));
    await conflictB.resolve('mine');

    const putCalls = fetchMock.mock.calls.filter(([, init]) => (init as RequestInit)?.method === 'PUT');
    expect(putCalls).toHaveLength(3); // initial (409'd) + A's resolve + B's resolve

    // B's resolve must have written against the sha A's resolve produced, not the stale pre-conflict sha.
    const bResolveBody = JSON.parse((putCalls[2][1] as RequestInit).body as string) as { sha: string; content: string };
    expect(bResolveBody.sha).toBe('s2');

    const finalTeams = JSON.parse(atob(bResolveBody.content)) as Team[];
    expect(finalTeams.find((t) => t.id === 'tA')?.name).toBe('My A'); // A's resolution preserved
    expect(finalTeams.find((t) => t.id === 'tB')?.name).toBe('My B'); // B's own resolution applied
  });

  it('reports a synced status even when the local IndexedDB cache write fails, since the GitHub write already succeeded', async () => {
    const writer = makeWriter({ content: [], sha: 's0' });
    const team1: Team = { id: 't1', name: 'Platform', active: true };

    vi.spyOn(cache, 'set').mockRejectedValueOnce(new Error('IndexedDB quota exceeded'));
    fetchMock.mockResolvedValueOnce(jsonResponse({ content: { sha: 's1' } }));

    writer.schedule([team1]);
    await writer.flush();

    expect(statuses.at(-1)).toBe('synced');
    expect(committed).toEqual([[team1]]);
  });

  it('reports a readOnly status instead of throwing when the conflict retry itself fails', async () => {
    const writer = makeWriter({ content: [], sha: 's0' });
    const team1: Team = { id: 't1', name: 'Platform', active: true };

    writer.schedule([team1]);
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ message: 'Conflict' }, 409))
      .mockRejectedValueOnce(new Error('network dropped mid-retry'));

    await expect(writer.flush()).resolves.toBe('failed'); // never throws/rejects out to the caller

    const last = statuses.at(-1);
    expect(typeof last === 'object' && last !== null && 'readOnly' in last).toBe(true);
  });
});
