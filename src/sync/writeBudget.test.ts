import { afterEach, describe, expect, it, vi } from 'vitest';
import { BUDGET_LINES, WriteBudget } from '../github/writeBudget';
import { fakeGithub, initiative, open } from './testing/fakeGithub';

/** Slice 064 items 2 and 3 (§10.3, §3 Sync failures): the write budget, and waiting out a limit GitHub sets. */

/** Lets IndexedDB (on real ticks) finish; the fake clock does not move meanwhile. */
async function settle() {
  for (let i = 0; i < 20; i += 1) await new Promise((resolve) => setImmediate(resolve));
}

async function advance(ms: number, step = 250) {
  for (let waited = 0; waited < ms; waited += step) {
    await vi.advanceTimersByTimeAsync(Math.min(step, ms - waited));
    await settle();
  }
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('write budget (slice 064 item 2, §10.3)', () => {
  it('holds 60 a minute and 400 an hour', () => {
    expect(BUDGET_LINES).toEqual({ perMinute: 60, perHour: 400 });
  });

  it('61 requests due within one minute from two tabs: at most 60 in any rolling minute, the rest later, none lost', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    const tabs = [new WriteBudget('two-tabs'), new WriteBudget('two-tabs')];
    const start = Date.now();
    const sentAt: number[] = [];
    const all = Array.from({ length: 61 }, (_, i) => tabs[i % 2].reserve().then(() => sentAt.push(Date.now() - start)));

    const settledUntil = async (count: number) => {
      for (let i = 0; i < 100 && sentAt.length < count; i += 1) await settle();
    };
    await settledUntil(60);
    expect(sentAt).toHaveLength(60); // the 61st waits for a place
    await vi.advanceTimersByTimeAsync(60_000);
    await settledUntil(61);
    await Promise.all(all);

    expect(sentAt).toHaveLength(61);
    sentAt.sort((a, b) => a - b);
    for (const from of sentAt) expect(sentAt.filter((at) => at >= from && at < from + 60_000).length).toBeLessThanOrEqual(60);
    expect(sentAt.filter((at) => at < 60_000)).toHaveLength(60);
    expect(sentAt[60]).toBe(60_000);
  });

  it('counts what this browser sent in the last hour, for Settings (§5.9)', async () => {
    const budget = new WriteBudget('count');
    await budget.reserve();
    await budget.reserve();
    expect(budget.sentThisHour()).toBe(2);
    expect(budget.hourLine).toBe(400);
  });

  it('edits keep combining while a commit waits for the budget, and none is refused or dropped', async () => {
    const fake = fakeGithub();
    const { repo } = await open(fake, { initiatives: [initiative()] });
    const full = new WriteBudget('https://api.github.com');
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    // Another tab used up the minute.
    for (let i = 0; i < 60; i += 1) void full.reserve();
    await settle();

    repo.renameInitiative('i1', 'First');
    await advance(5000);
    repo.renameInitiative('i1', 'Second');
    await advance(10_000);

    expect(repo.getState().syncing).toBe(true);
    expect(repo.getState().readOnly).toBeNull();

    await advance(60_000, 1000);
    await repo.flushPending();
    expect(fake.commits('initiatives/i1.json').at(-1)!.content).toMatchObject({ name: 'Second' });
    expect(repo.getState().readOnly).toBeNull();
  });
});

describe('waiting out a limit (slice 064 item 3, §3 Sync failures)', () => {
  it('after a 403 with retry-after: 60, nothing reaches GitHub for 60 s, then the pull and the failed edit resume by themselves', async () => {
    const fake = fakeGithub();
    const { repo } = await open(fake, { initiatives: [initiative()] });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    fake.fail('initiatives/i1.json', 403, { headers: { 'retry-after': '60' }, message: 'You have exceeded a secondary rate limit.' });

    repo.renameInitiative('i1', 'Limited');
    await repo.flushPending();
    await settle();
    expect(repo.getState().readOnly).toMatchObject({ cause: 'rate-limited' });
    const sentBefore = fake.requests().length;

    // An edit made during the wait fails at once, without a request.
    repo.createTeam('Platform');
    await repo.flushPending();
    await repo.pull();
    expect(repo.getState().fileFailures.get('teams.json')?.message).toMatch(/^GitHub is limiting requests\. Saving resumes by itself at \d\d:\d\d\.$/);

    await advance(59_000, 1000);
    expect(fake.requests().length).toBe(sentBefore);

    await advance(2000);
    await repo.flushPending();
    await repo.whenPulled();
    expect(fake.commits('initiatives/i1.json').at(-1)!.content).toMatchObject({ name: 'Limited' });
    expect(fake.commits('teams.json')).toHaveLength(1);
    expect(repo.getState().readOnly).toBeNull();
  });

  it('after a 429 with no requests left, waits until x-ratelimit-reset', async () => {
    const fake = fakeGithub();
    const { repo } = await open(fake, { initiatives: [initiative()] });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    const reset = Math.ceil(Date.now() / 1000) + 300;
    fake.fail('initiatives/i1.json', 429, { headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(reset) } });

    repo.renameInitiative('i1', 'Limited');
    await repo.flushPending();
    await settle();
    const sentBefore = fake.requests().length;

    await advance(reset * 1000 - Date.now() - 1000, 5000);
    expect(fake.requests().length).toBe(sentBefore);

    await advance(2000);
    await repo.flushPending();
    expect(fake.commits('initiatives/i1.json')).toHaveLength(1);
  });

  it('when GitHub names no time, waits 60 s, doubling for a repeat within the hour', async () => {
    const fake = fakeGithub();
    const { repo } = await open(fake, { initiatives: [initiative()] });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    fake.fail('initiatives/i1.json', 429);
    fake.fail('initiatives/i1.json', 429);

    repo.renameInitiative('i1', 'Limited');
    await repo.flushPending();
    await settle();
    const first = repo.getState().readOnly?.retryAt;

    await advance(61_000, 1000); // the retry is refused again
    const second = repo.getState().readOnly?.retryAt;
    expect(second! - first!).toBeGreaterThanOrEqual(120_000);

    await advance(121_000, 1000);
    await repo.flushPending();
    expect(fake.commits('initiatives/i1.json')).toHaveLength(1);
  });
});
