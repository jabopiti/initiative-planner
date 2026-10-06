import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { COMMIT_MAX_MS, COMMIT_QUIET_MS, commitWindow } from './FileWriter';
import { fakeGithub, initiative, open, type Fake } from './testing/fakeGithub';

/** Slice 064 item 1 (§10.3): a file's edits are committed 4 s after the last edit to it, and at most 20 s after its first. */

/** Lets IndexedDB (the write budget's reservation, on real ticks) finish; the fake clock does not move meanwhile. */
async function settle() {
  for (let i = 0; i < 20; i += 1) await new Promise((resolve) => setImmediate(resolve));
}

/** Moves the fake clock on, then lets what became due reach the fake GitHub. */
async function advance(ms: number) {
  await vi.advanceTimersByTimeAsync(ms);
  await settle();
}

const PUT_I1 = 'PUT /repos/jabopiti/initiative-planner/contents/initiatives/i1.json';
const puts = (fake: Fake) => fake.requests().filter((r) => r === PUT_I1).length;

let fake: Fake;

const testWindow = { ...commitWindow };

beforeEach(() => {
  fake = fakeGithub();
  Object.assign(commitWindow, { quietMs: COMMIT_QUIET_MS, maxMs: COMMIT_MAX_MS });
});

afterEach(() => {
  Object.assign(commitWindow, testWindow);
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('commit window (slice 064, §10.3)', () => {
  it('is 4 s quiet and 20 s at most', () => {
    expect(COMMIT_QUIET_MS).toBe(4000);
    expect(COMMIT_MAX_MS).toBe(20_000);
  });

  it('three edits 2 s apart are one PUT, sent 4 s after the last', async () => {
    const { repo } = await open(fake, { initiatives: [initiative()] });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });

    repo.renameInitiative('i1', 'A');
    await advance(2000);
    repo.renameInitiative('i1', 'B');
    await advance(2000);
    repo.renameInitiative('i1', 'C');
    await advance(3999);
    expect(puts(fake)).toBe(0);

    await advance(1);
    expect(puts(fake)).toBe(1);
    expect(fake.commits('initiatives/i1.json')[0].content).toMatchObject({ name: 'C' });
  });

  it('an edit every 2 s for 30 s is committed at 20 s, then 4 s after the last edit', async () => {
    const { repo } = await open(fake, { initiatives: [initiative()] });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    const sentAt: number[] = [];
    const start = Date.now();
    const count = () => {
      while (sentAt.length < puts(fake)) sentAt.push(Date.now() - start);
    };

    for (let t = 0; t <= 30_000; t += 2000) {
      repo.renameInitiative('i1', `Name ${t}`);
      for (let ms = 0; ms < 2000; ms += 250) {
        await advance(250);
        count();
      }
    }
    for (let ms = 0; ms < 6000; ms += 250) {
      await advance(250);
      count();
    }

    // The first window opened at 0 and closed at 20 s, taking the edit made then; the second opened with the edit at
    // 22 s, and the last edit was at 30 s, so it closed at 34 s.
    expect(sentAt).toEqual([20_000, 34_000]);
    expect(fake.commits('initiatives/i1.json').at(-1)!.content).toMatchObject({ name: 'Name 30000' });
  });

  it('shows Saving at once, as before', async () => {
    const { repo } = await open(fake, { initiatives: [initiative()] });
    repo.renameInitiative('i1', 'A');
    expect(repo.getState().syncing).toBe(true);
    await repo.flushPending();
  });
});

describe('actions that read or replace the saved file send pending edits first (slice 064, §10.3)', () => {
  const contents = (fake: Fake) => fake.commits('initiatives/i1.json').map((c) => c.content as { name: string; status: string });

  it('passing a gate: the pending edits as their own commit, then the gate, both at once', async () => {
    const { repo } = await open(fake, { initiatives: [initiative()] });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    repo.renameInitiative('i1', 'Payments API v2');
    repo.setChecklistItem('i1', 'discovery', 'g1-problem-statement', 'complete', '');
    repo.setChecklistItem('i1', 'discovery', 'g1-stakeholders-aligned', 'complete', '');

    expect(repo.passGate('i1', '2026-10-06')).toEqual({ ok: true });
    await advance(0);
    await repo.flushPending();

    const [edits, gate] = fake.commits('initiatives/i1.json');
    expect(fake.commits('initiatives/i1.json')).toHaveLength(2);
    expect(edits.message).not.toMatch(/G1 passed/);
    expect(edits.content).toMatchObject({ name: 'Payments API v2' });
    expect(gate.message).toMatch(/G1 passed/);
  });

  it('a status change: pending edit first, then the status, without waiting out the window', async () => {
    const { repo } = await open(fake, { initiatives: [initiative()] });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    repo.renameInitiative('i1', 'Renamed');
    repo.putOnHold('i1');
    await advance(0);
    await advance(0);

    expect(contents(fake)).toEqual([expect.objectContaining({ name: 'Renamed', status: 'Active' }), expect.objectContaining({ status: 'On Hold' })]);
  });

  it('changing team: pending edit first, then the team change, without waiting out the window', async () => {
    const teams = [
      { id: 'team-1', name: 'Payments', active: true },
      { id: 'team-2', name: 'Growth', active: true },
    ];
    const { repo } = await open(fake, { teams, initiatives: [initiative()] });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    repo.renameInitiative('i1', 'Renamed');
    repo.changeTeam('i1', 'team-2');
    await advance(0);
    await advance(0);

    expect(fake.commits('initiatives/i1.json').map((c) => (c.content as { teamId: string; name: string }).teamId)).toEqual(['team-1', 'team-2']);
  });

  it('flushInitiative (leaving its page) sends that file now', async () => {
    const { repo } = await open(fake, { initiatives: [initiative()] });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    repo.renameInitiative('i1', 'Left');
    repo.flushInitiative('i1');
    await advance(0);

    expect(puts(fake)).toBe(1);
  });
});
