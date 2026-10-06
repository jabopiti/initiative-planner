import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { COMMIT_MAX_MS, COMMIT_QUIET_MS, commitWindow } from './FileWriter';
import { fakeGithub, initiative, open, type Fake } from './testing/fakeGithub';

/** Slice 064 item 1 (§10.3): a file's edits are committed 4 s after the last edit to it, and at most 20 s after its first. */

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
    await vi.advanceTimersByTimeAsync(2000);
    repo.renameInitiative('i1', 'B');
    await vi.advanceTimersByTimeAsync(2000);
    repo.renameInitiative('i1', 'C');
    await vi.advanceTimersByTimeAsync(3999);
    expect(puts(fake)).toBe(0);

    await vi.advanceTimersByTimeAsync(1);
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
        await vi.advanceTimersByTimeAsync(250);
        count();
      }
    }
    for (let ms = 0; ms < 6000; ms += 250) {
      await vi.advanceTimersByTimeAsync(250);
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
