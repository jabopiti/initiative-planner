import { afterEach, describe, expect, it, vi } from 'vitest';
import { FileCache } from '../cache/db';
import { fakeGithub, initiative, open, PHASE } from './testing/fakeGithub';

/** Slice 017: deleting an initiative no gate has passed (§9.3), against an in-memory GitHub, each race included. */

const PATH = 'initiatives/i1.json';
const passed = { [PHASE]: { outcome: 'passed' as const, passedOn: '2026-09-01', checklist: [] } };

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('deleting an initiative (slice 017)', () => {
  it('deletes the file in one commit "<name>: deleted" and forgets it here, cache included', async () => {
    const fake = fakeGithub();
    const { repo } = await open(fake, { initiatives: [initiative()] });
    const cacheDelete = vi.spyOn(FileCache.prototype, 'delete');

    await expect(repo.deleteInitiative('i1')).resolves.toBe('deleted');

    expect(fake.deletes).toEqual([expect.objectContaining({ path: PATH, message: 'Payments API: deleted', status: 200 })]);
    expect(fake.has(PATH)).toBe(false);
    expect(repo.getState().initiatives).toEqual([]);
    expect(cacheDelete).toHaveBeenCalledWith(PATH);
    expect(repo.getState().readOnly).toBeNull();
  });

  it('deletes one whose only gate record is skipped', async () => {
    const fake = fakeGithub();
    const { repo } = await open(fake, { initiatives: [initiative({ gates: { [PHASE]: { outcome: 'skipped', skipReason: 'Known work', checklist: [] } } })] });

    await expect(repo.deleteInitiative('i1')).resolves.toBe('deleted');
    expect(fake.has(PATH)).toBe(false);
  });

  it('refuses one with a passed gate without asking GitHub', async () => {
    const fake = fakeGithub();
    const { repo } = await open(fake, { initiatives: [initiative({ gates: passed })] });

    await expect(repo.deleteInitiative('i1')).resolves.toBe('refused');
    expect(fake.deletes).toEqual([]);
    expect(fake.has(PATH)).toBe(true);
  });

  it('never pushes an edit still waiting in the debounce window', async () => {
    const fake = fakeGithub();
    const { repo } = await open(fake, { initiatives: [initiative()] });
    repo.renameInitiative('i1', 'Payments API v2');

    await expect(repo.deleteInitiative('i1')).resolves.toBe('deleted');
    await new Promise((resolve) => setTimeout(resolve, 1100)); // past the debounce

    expect(fake.puts).toEqual([]);
    expect(fake.has(PATH)).toBe(false);
    expect(repo.getState().syncing).toBe(false);
  });

  it('waits for a save in flight and deletes at the version it wrote', async () => {
    const fake = fakeGithub();
    const { repo } = await open(fake, { initiatives: [initiative()] });
    const release = fake.hold(PATH);
    repo.renameInitiative('i1', 'Payments API v2');
    const saving = repo.flushPending();
    await vi.waitFor(() => expect(fake.arrived(PATH)).toBe(1));

    const deleting = repo.deleteInitiative('i1');
    release();
    await saving;

    await expect(deleting).resolves.toBe('deleted');
    expect(fake.deletes).toEqual([expect.objectContaining({ sha: fake.commits(PATH)[0].newSha, status: 200, message: 'Payments API v2: deleted' })]);
  });

  it('refuses when another user passed a gate between confirm and delete, and shows their version', async () => {
    const fake = fakeGithub();
    const { repo } = await open(fake, { initiatives: [initiative()] });
    fake.seed(PATH, initiative({ gates: passed }));

    await expect(repo.deleteInitiative('i1')).resolves.toBe('refused');

    expect(fake.deletes.map((d) => d.status)).toEqual([409]);
    expect(fake.has(PATH)).toBe(true);
    expect(repo.getState().initiatives[0].gates).toEqual(passed);
    expect(repo.getState().readOnly).toBeNull();
  });

  it('deletes at the new version when another user changed anything else meanwhile', async () => {
    const fake = fakeGithub();
    const { repo } = await open(fake, { initiatives: [initiative()] });
    fake.seed(PATH, initiative({ name: 'Payments API (renamed)' }));

    await expect(repo.deleteInitiative('i1')).resolves.toBe('deleted');

    expect(fake.deletes.map((d) => d.status)).toEqual([409, 200]);
    expect(fake.has(PATH)).toBe(false);
    expect(repo.getState().initiatives).toEqual([]);
  });

  it('counts a file someone else already deleted as deleted', async () => {
    const fake = fakeGithub();
    const { repo } = await open(fake, { initiatives: [initiative()] });
    fake.remove(PATH);

    await expect(repo.deleteInitiative('i1')).resolves.toBe('deleted');
    expect(repo.getState().initiatives).toEqual([]);
  });

  it('removes nothing while GitHub is unreachable, and shows read-only with the cause', async () => {
    const fake = fakeGithub();
    const { repo } = await open(fake, { initiatives: [initiative()] });
    vi.stubGlobal('fetch', (url: string, init?: RequestInit) =>
      init?.method === 'DELETE' ? Promise.reject(new TypeError('Failed to fetch')) : fake.fetchMock(url, init),
    );

    const result = await repo.deleteInitiative('i1');

    expect(result).toEqual({ failed: { cause: 'unreachable', message: 'Cannot reach GitHub; changes are paused.' } });
    expect(repo.getState().initiatives.map((i) => i.id)).toEqual(['i1']);
    expect(repo.getState().readOnly).toEqual({ cause: 'unreachable', message: 'Cannot reach GitHub; changes are paused.' });
    expect(fake.has(PATH)).toBe(true);

    // A pull that succeeds clears it; deleting again then works.
    vi.stubGlobal('fetch', fake.fetchMock);
    fake.seed('teams.json', []);
    await repo.pull();
    expect(repo.getState().readOnly).toBeNull();
    await expect(repo.deleteInitiative('i1')).resolves.toBe('deleted');
  });
});

describe('another user deleted the initiative (slice 017)', () => {
  it('drops an edit whose save finds the file gone, deletes the copy GitHub recreated, and names the lost change', async () => {
    const fake = fakeGithub();
    const { repo } = await open(fake, { initiatives: [initiative()] });
    fake.remove(PATH);

    repo.renameInitiative('i1', 'Payments API v2');
    await repo.flushPending();

    expect(fake.puts.map((p) => p.status)).toEqual([201]);
    expect(fake.deletes).toEqual([expect.objectContaining({ sha: fake.puts[0].newSha, message: 'Payments API v2: deleted', status: 200 })]);
    expect(fake.has(PATH)).toBe(false);
    expect(repo.getState().initiatives).toEqual([]);
    expect(repo.getState().deletedWithLostEdit.get('i1')).toBe('Payments API v2');
    expect(repo.getState().readOnly).toBeNull();
    expect(repo.getState().syncing).toBe(false);
  });

  it('drops the edit also when a conflict\'s re-read finds the file gone, without writing again', async () => {
    const fake = fakeGithub();
    const { repo } = await open(fake, { initiatives: [initiative()] });
    fake.fail(PATH, 409); // deleted between the stale write and its re-read
    fake.remove(PATH);

    repo.renameInitiative('i1', 'Payments API v2');
    await repo.flushPending();

    expect(fake.puts.map((p) => p.status)).toEqual([409]);
    expect(fake.has(PATH)).toBe(false);
    expect(repo.getState().deletedWithLostEdit.get('i1')).toBe('Payments API v2');
  });

  it('a pull removes it from an idle client, with no lost change to name', async () => {
    const fake = fakeGithub();
    const { repo } = await open(fake, { initiatives: [initiative()] });
    fake.remove(PATH);

    await repo.pull();

    expect(repo.getState().initiatives).toEqual([]);
    expect(repo.getState().deletedWithLostEdit.size).toBe(0);
  });
});
