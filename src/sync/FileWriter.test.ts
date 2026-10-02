import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GithubLocation } from '../brand/types';
import { cacheScope, FileCache } from '../cache/db';
import { GithubClient } from '../github/client';
import { FileWriter, type CommitNote, type FileConflict, type WriteStatus } from './FileWriter';
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
  const cache = new FileCache(cacheScope(location));
  let fetchMock: ReturnType<typeof vi.fn>;
  let github: GithubClient;
  let statuses: WriteStatus[];
  let conflicts: FileConflict[];
  let closed: FileConflict[];
  let committed: Team[][];

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    github = new GithubClient(location, () => 'token');
    statuses = [];
    conflicts = [];
    closed = [];
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
      onConflictClosed: (c) => closed.push(c),
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

  describe('slice 037: a retry after a 409 waits a short, growing, jittered delay (§10.3)', () => {
    function timedWriter(random: () => number, waits: number[], during?: () => void) {
      return new FileWriter<Team[]>({
        path: 'teams.json',
        branch: location.dataBranch,
        github,
        queue: new WriteQueue(),
        cache,
        merge: mergeDocument,
        whenMissing: [],
        initial: { content: [], sha: 's0' },
        delay: (ms) => {
          waits.push(ms);
          during?.();
          return Promise.resolve();
        },
        random,
        onStatus: (s) => statuses.push(s),
        onConflict: (c) => conflicts.push(c),
        onDocument: (content) => committed.push(content),
      });
    }
    const added = (team: Team): CommitNote => ({ entity: { kind: 'team', id: team.id }, field: 'record', from: undefined, to: team, words: () => `${team.name}: added` });
    const conflict409 = () => jsonResponse({ message: 'Conflict' }, 409);
    const theirsFile = (sha: string) => jsonResponse({ content: btoa(JSON.stringify([])), sha });
    const puts = () => fetchMock.mock.calls.filter(([, init]) => (init as RequestInit)?.method === 'PUT');

    it('waits 0.5 s, 1 s and 2 s (±20%) before the three retries, then the fourth 409 is the failure', async () => {
      const lows: number[] = [];
      const highs: number[] = [];
      for (const [random, into] of [
        [() => 0, lows],
        [() => 0.999999, highs],
      ] as const) {
        fetchMock.mockReset();
        fetchMock
          .mockResolvedValueOnce(conflict409())
          .mockResolvedValueOnce(theirsFile('s1'))
          .mockResolvedValueOnce(conflict409())
          .mockResolvedValueOnce(theirsFile('s2'))
          .mockResolvedValueOnce(conflict409())
          .mockResolvedValueOnce(theirsFile('s3'))
          .mockResolvedValueOnce(conflict409());
        const writer = timedWriter(random, into);
        writer.schedule([{ id: 't1', name: 'Platform', active: true }]);
        await expect(writer.flush()).resolves.toBe('failed');
      }
      expect(lows.map(Math.round)).toEqual([400, 800, 1600]);
      expect(highs.map(Math.round)).toEqual([600, 1200, 2400]);
    });

    it('with jitter fixed at +10% the delays are exactly 0.55, 1.1 and 2.2 s', async () => {
      const waits: number[] = [];
      fetchMock
        .mockResolvedValueOnce(conflict409())
        .mockResolvedValueOnce(theirsFile('s1'))
        .mockResolvedValueOnce(conflict409())
        .mockResolvedValueOnce(theirsFile('s2'))
        .mockResolvedValueOnce(conflict409())
        .mockResolvedValueOnce(theirsFile('s3'))
        .mockResolvedValueOnce(jsonResponse({ content: { sha: 's4' } }));
      const writer = timedWriter(() => 0.75, waits);
      writer.schedule([{ id: 't1', name: 'Platform', active: true }]);
      await expect(writer.flush()).resolves.toBe('saved');
      expect(waits.map((w) => Math.round(w * 1000) / 1000)).toEqual([550, 1100, 2200]);
    });

    it('an edit made during a backoff goes out in the retried write, as the only write in flight', async () => {
      const t1: Team = { id: 't1', name: 'Platform', active: true };
      const t2: Team = { id: 't2', name: 'Growth', active: true };
      const writer: FileWriter<Team[]> = timedWriter(
        () => 0.5,
        [],
        () => writer.schedule([t1, t2], added(t2)),
      );
      fetchMock
        .mockResolvedValueOnce(conflict409())
        .mockResolvedValueOnce(theirsFile('s1'))
        .mockResolvedValueOnce(jsonResponse({ content: { sha: 's2' } }));
      writer.schedule([t1], added(t1));
      await expect(writer.flush()).resolves.toBe('saved');
      expect(puts()).toHaveLength(2);
      const retried = JSON.parse((puts()[1][1] as RequestInit).body as string) as { content: string; message: string };
      expect((JSON.parse(atob(retried.content)) as Team[]).map((t) => t.id)).toEqual(['t1', 't2']);
      expect(retried.message).toBe('Platform: added; Growth: added\n\nEntity: team/t1\nEntity: team/t2');
      await writer.flush();
      expect(puts()).toHaveLength(2); // the folded edit is not written a second time
    });

    it('a pull that arrives during a backoff leaves the file alone', async () => {
      let received: unknown;
      const writer: FileWriter<Team[]> = timedWriter(
        () => 0.5,
        [],
        () => {
          received = writer.receive({ content: [], sha: 's9' }, 's0');
        },
      );
      fetchMock
        .mockResolvedValueOnce(conflict409())
        .mockResolvedValueOnce(theirsFile('s1'))
        .mockResolvedValueOnce(jsonResponse({ content: { sha: 's2' } }));
      writer.schedule([{ id: 't1', name: 'Platform', active: true }]);
      await writer.flush();
      expect(received).toEqual({ left: 'retry' });
    });
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

  describe('slice 005j: a failed edit stays in edit, and Retry resends it', () => {
    it('keeps the failed edit and its cause; retry() resends the same content and clears the failure', async () => {
      const writer = makeWriter({ content: [{ id: 't1', name: 'Original', active: true }], sha: 's0' });
      writer.schedule([{ id: 't1', name: 'Renamed', active: true }]);

      fetchMock.mockResolvedValueOnce(jsonResponse({ message: 'server error' }, 500));
      await writer.flush();

      expect(writer.failure).not.toBeNull();
      expect(writer.failedPaths).toEqual([[{ id: 't1' }, 'name']]);
      expect(statuses.at(-1)).toEqual({ readOnly: writer.failure });

      fetchMock.mockResolvedValueOnce(jsonResponse({ content: { sha: 's1' } }));
      await writer.retry();

      expect(writer.failure).toBeNull();
      expect(writer.failedPaths).toEqual([]);
      expect(statuses.at(-1)).toBe('synced');
      expect(committed.at(-1)).toEqual([{ id: 't1', name: 'Renamed', active: true }]);
      const puts = fetchMock.mock.calls.filter(([, init]) => (init as RequestInit)?.method === 'PUT');
      expect(puts).toHaveLength(2);
    });

    it('only lists the fields the failed edit actually changed, not the rest of the document', async () => {
      const writer = makeWriter({
        content: [
          { id: 't1', name: 'A', active: true },
          { id: 't2', name: 'B', active: true },
        ],
        sha: 's0',
      });
      writer.schedule([
        { id: 't1', name: 'A renamed', active: true },
        { id: 't2', name: 'B', active: true },
      ]);

      fetchMock.mockResolvedValueOnce(jsonResponse({ message: 'server error' }, 500));
      await writer.flush();

      expect(writer.failedPaths).toEqual([[{ id: 't1' }, 'name']]);
    });

    it('a fresh edit clears the failed state at once, before anything has saved', async () => {
      const writer = makeWriter({ content: [], sha: 's0' });
      writer.schedule([{ id: 't1', name: 'Platform', active: true }]);
      fetchMock.mockResolvedValueOnce(jsonResponse({ message: 'server error' }, 500));
      await writer.flush();
      expect(writer.failure).not.toBeNull();

      writer.schedule([{ id: 't1', name: 'Payments', active: true }]);
      expect(writer.failure).toBeNull();
      expect(writer.failedPaths).toEqual([]);

      fetchMock.mockResolvedValueOnce(jsonResponse({ content: { sha: 's1' } }));
      await writer.flush();
      expect(statuses.at(-1)).toBe('synced');
    });

    it('retry() is a no-op once nothing is failed', async () => {
      const writer = makeWriter({ content: [{ id: 't1', name: 'Platform', active: true }], sha: 's0' });

      await expect(writer.retry()).resolves.toBe('saved');
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('commit message: the net effect of grouped edits (§10.3)', () => {
    const team = (name: string): Team => ({ id: 't1', name, active: true });
    /** A note for the team's whole record, worded from the saved to the final name. */
    const note = (from: Team | undefined, to: Team | undefined, other = 't1'): CommitNote => ({
      entity: { kind: 'team', id: other },
      field: 'record',
      from,
      to,
      words: (f, t) => (!f ? `${(t as Team).name} added` : !t ? `${(f as Team).name} removed` : `${(f as Team).name} renamed to ${(t as Team).name}`),
    });
    const sentMessages = () => fetchMock.mock.calls.map(([, init]) => (JSON.parse((init as RequestInit).body as string) as { message: string }).message);

    it('ends the message with one Entity trailer per touched entity, each once, in first-edit order (§10.3)', async () => {
      const writer = makeWriter({ content: [], sha: 's0' });
      fetchMock.mockResolvedValueOnce(jsonResponse({ content: { sha: 's1' } }));
      writer.schedule([team('Platform')], note(undefined, team('Platform'), 't1'));
      writer.schedule([team('Platform'), team('Growth')], note(undefined, team('Growth'), 't2'));
      writer.schedule([team('Platform 2'), team('Growth')], note(team('Platform'), team('Platform 2'), 't1'));
      await writer.flush();
      expect(sentMessages()).toEqual(['Platform 2 added; Growth added\n\nEntity: team/t1\nEntity: team/t2']);
    });

    it('lists no trailer for an entity whose notes cancelled out, nor for a dataset-level note', async () => {
      const writer = makeWriter({ content: [team('Platform')], sha: 's0' });
      fetchMock.mockResolvedValueOnce(jsonResponse({ content: { sha: 's1' } }));
      writer.schedule([team('Platform'), team('Growth')], note(undefined, team('Growth'), 't2'));
      writer.schedule([team('Platform')], note(team('Growth'), undefined, 't2'));
      writer.schedule([team('Platform 2')], note(team('Platform'), team('Platform 2'), 't1'));
      writer.schedule([team('Platform 2')], { entity: { kind: 'dataset', id: 'rates' }, field: 'x', from: 1, to: 2, words: () => 'Rates copied' });
      await writer.flush();
      expect(sentMessages()).toEqual(['Platform renamed to Platform 2; Rates copied\n\nEntity: team/t1']);
    });

    it('reads add then change as one added note with the final values', async () => {
      const writer = makeWriter({ content: [], sha: 's0' });
      fetchMock.mockResolvedValueOnce(jsonResponse({ content: { sha: 's1' } }));
      writer.schedule([team('Platform')], note(undefined, team('Platform')));
      writer.schedule([team('Platform 2')], note(team('Platform'), team('Platform 2')));
      await writer.flush();
      expect(sentMessages()).toEqual(['Platform 2 added\n\nEntity: team/t1']);
    });

    it('makes no commit for add then remove, or for a change back to the saved value', async () => {
      const writer = makeWriter({ content: [team('Platform')], sha: 's0' });
      writer.schedule([team('Platform'), { id: 't2', name: 'Growth', active: true }], note(undefined, team('Growth'), 't2'));
      writer.schedule([team('Platform')], note(team('Growth'), undefined, 't2'));
      await writer.flush();
      writer.schedule([team('Platform 2')], note(team('Platform'), team('Platform 2')));
      writer.schedule([team('Platform')], note(team('Platform 2'), team('Platform')));
      await writer.flush();
      expect(fetchMock).not.toHaveBeenCalled();
      expect(statuses.at(-1)).toBe('synced');
    });

    it('reads a double rename from the saved name to the last', async () => {
      const writer = makeWriter({ content: [team('A')], sha: 's0' });
      fetchMock.mockResolvedValueOnce(jsonResponse({ content: { sha: 's1' } }));
      writer.schedule([team('B')], note(team('A'), team('B')));
      writer.schedule([team('C')], note(team('B'), team('C')));
      await writer.flush();
      expect(sentMessages()).toEqual(['A renamed to C\n\nEntity: team/t1']);
    });

    it('joins the notes of two entities in first-edit order', async () => {
      const writer = makeWriter({ content: [team('A')], sha: 's0' });
      fetchMock.mockResolvedValueOnce(jsonResponse({ content: { sha: 's1' } }));
      writer.schedule([team('B')], note(team('A'), team('B')));
      writer.schedule([team('B'), { id: 't2', name: 'Growth', active: true }], note(undefined, team('Growth'), 't2'));
      writer.schedule([team('C'), { id: 't2', name: 'Growth', active: true }], note(team('B'), team('C')));
      await writer.flush();
      expect(sentMessages()).toEqual(['A renamed to C; Growth added\n\nEntity: team/t1\nEntity: team/t2']);
    });
  });

  describe('slice 035: an open conflict settled by a pull or replaced by a new edit (§3)', () => {
    const team = (name: string, active = true): Team => ({ id: 't1', name, active });
    const puts = () => fetchMock.mock.calls.filter(([, init]) => (init as RequestInit)?.method === 'PUT');
    const sent = (n: number) => JSON.parse((puts()[n][1] as RequestInit).body as string) as { content: string; sha: string; message: string };

    /** Base "Original", mine "My Rename", theirs "Their Rename" at sha s1: one open conflict on the name. */
    async function withConflict() {
      const writer = makeWriter({ content: [team('Original')], sha: 's0' });
      writer.schedule([team('My Rename')], {
        entity: { kind: 'team', id: 't1' },
        field: 'name',
        from: 'Original',
        to: 'My Rename',
        words: (f, t) => `${String(f)} renamed to ${String(t)}`,
      });
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ message: 'Conflict' }, 409))
        .mockResolvedValueOnce(jsonResponse({ content: btoa(JSON.stringify([team('Their Rename')])), sha: 's1' }));
      await writer.flush();
      expect(conflicts).toHaveLength(1);
      return writer;
    }

    it('closes the conflict when a pull brings in the user\'s own value, with nothing to write', async () => {
      const writer = await withConflict();
      writer.receive({ content: [team('My Rename')], sha: 's2' }, 's1');
      await writer.flush();
      expect(closed).toEqual([conflicts[0]]);
      expect(puts()).toHaveLength(1);
      expect(committed.at(-1)).toEqual([team('My Rename')]);
    });

    it('shows a newer "theirs" when a pull brings in yet another value', async () => {
      const writer = await withConflict();
      writer.receive({ content: [team('Third')], sha: 's2' }, 's1');
      expect(closed).toEqual([conflicts[0]]);
      expect(conflicts).toHaveLength(2);
      expect(conflicts[1]).toMatchObject({ path: [{ id: 't1' }, 'name'], mine: 'My Rename', theirs: 'Third' });
      // Resolving the newer one writes against the pulled version.
      fetchMock.mockResolvedValueOnce(jsonResponse({ content: { sha: 's3' } }));
      await conflicts[1].resolve('mine');
      expect(sent(1).sha).toBe('s2');
    });

    it('saves mine once a pull puts the other user\'s value back to the base', async () => {
      const writer = await withConflict();
      fetchMock.mockResolvedValueOnce(jsonResponse({ content: { sha: 's3' } }));
      writer.receive({ content: [team('Original')], sha: 's2' }, 's1');
      await writer.flush();
      expect(closed).toEqual([conflicts[0]]);
      expect(puts()).toHaveLength(2);
      expect(sent(1).sha).toBe('s2');
      expect((JSON.parse(atob(sent(1).content)) as Team[])[0].name).toBe('My Rename');
    });

    it('keeps the conflict open while a pull changes only another field, and shows that change', async () => {
      const writer = await withConflict();
      writer.receive({ content: [team('Their Rename', false)], sha: 's2' }, 's1');
      expect(closed).toEqual([]);
      expect(conflicts).toHaveLength(1);
      expect(committed.at(-1)).toEqual([team('Their Rename', false)]);
    });

    it('settles the conflict with a newly typed value, the message ending "(conflict: replaced)"', async () => {
      const writer = await withConflict();
      fetchMock.mockResolvedValueOnce(jsonResponse({ content: { sha: 's2' } }));
      writer.schedule([team('Typed Anew')], {
        entity: { kind: 'team', id: 't1' },
        field: 'name',
        from: 'Their Rename',
        to: 'Typed Anew',
        words: (f, t) => `${String(f)} renamed to ${String(t)}`,
      });
      expect(closed).toEqual([conflicts[0]]);
      await writer.flush();
      expect(sent(1).sha).toBe('s1');
      expect(sent(1).message).toBe('Their Rename renamed to Typed Anew (conflict: replaced)\n\nEntity: team/t1');
    });

    it('leaves an open conflict alone when an edit changes another field of the file', async () => {
      const writer = await withConflict();
      fetchMock.mockResolvedValueOnce(jsonResponse({ content: { sha: 's2' } }));
      writer.schedule([team('Their Rename', false)]);
      expect(closed).toEqual([]);
      await writer.flush();
      expect(sent(1).message).not.toContain('conflict');
    });
  });
});
