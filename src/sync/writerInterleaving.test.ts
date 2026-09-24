import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Initiative, Person, Team } from '../data/types';
import { fakeGithub, initiative, open, person, PHASE, type Fake } from './testing/fakeGithub';

/**
 * Slice 005g: every case the one file writer must keep true, driven through the Repository against an
 * in-memory GitHub (testing/fakeGithub.ts). The tests name no writer class, so they hold across refactors.
 */

afterEach(() => {
  vi.unstubAllGlobals();
});

/** p1 renamed on both sides; resolves to a conflict in the banner without writing anything. */
async function conflictedPeople(fake: Fake, names: string[] = ['p1']) {
  const opened = await open(fake, { people: names.map((id) => person(id, 'Base')) });
  fake.seed('people.json', names.map((id) => person(id, 'Theirs')));
  for (const id of names) opened.repo.updatePerson(id, { name: 'Mine' });
  await opened.repo.flushPending();
  expect(opened.repo.getState().conflicts).toHaveLength(names.length);
  return opened;
}


describe('edits made while a save is in flight (AC 1)', () => {
  it('master file: the screen never steps back to the first save, and the queued save carries the sha the first returned', async () => {
    const fake = fakeGithub();
    const { repo, seen } = await open(fake);
    const release = fake.hold('teams.json');

    const first = repo.createTeam('Platform');
    const firstFlush = repo.flushPending();
    await vi.waitFor(() => expect(fake.arrived('teams.json')).toBe(1));

    const marker = seen.length;
    const second = repo.createTeam('Payments');
    const secondFlush = repo.flushPending();
    release();
    await Promise.all([firstFlush, secondFlush]);

    const after = seen.slice(marker);
    expect(after.every((s) => s.teams.some((t) => t.id === first.id) && s.teams.some((t) => t.id === second.id))).toBe(true);
    expect(repo.getState().teams.map((t) => t.name)).toEqual(['Platform', 'Payments']);

    const commits = fake.commits('teams.json');
    expect(commits).toHaveLength(2);
    expect(commits[1].sha).toBe(commits[0].newSha);
    expect(fake.read<Team[]>('teams.json').map((t) => t.name)).toEqual(['Platform', 'Payments']);

    // Syncing all the way to the last save, and only then synced.
    expect(after.map((s) => s.syncing).slice(0, -1).every(Boolean)).toBe(true);
    expect(repo.getState().syncing).toBe(false);
    expect(repo.getState().readOnly).toBeNull();
  });

  it('initiative file: the name on screen never returns to the first save, and the queued save carries the first save\'s sha', async () => {
    const fake = fakeGithub();
    const { repo, seen } = await open(fake, { initiatives: [initiative()] });
    const release = fake.hold('initiatives/i1.json');

    repo.renameInitiative('i1', 'Payments v2');
    const firstFlush = repo.flushPending();
    await vi.waitFor(() => expect(fake.arrived('initiatives/i1.json')).toBe(1));

    const marker = seen.length;
    repo.renameInitiative('i1', 'Payments v3');
    const secondFlush = repo.flushPending();
    release();
    await Promise.all([firstFlush, secondFlush]);

    expect(seen.slice(marker).every((s) => s.initiatives[0].name === 'Payments v3')).toBe(true);
    const commits = fake.commits('initiatives/i1.json');
    expect(commits).toHaveLength(2);
    expect(commits[1].sha).toBe(commits[0].newSha);
    expect(fake.read<Initiative>('initiatives/i1.json').name).toBe('Payments v3');
    expect(repo.getState().syncing).toBe(false);
    expect(repo.getState().readOnly).toBeNull();
  });
});

describe('a 409 in the middle of a save (AC 2)', () => {
  it('master file, other writer changed another item: the merge reaches the newer edit and nothing of theirs is reverted', async () => {
    const fake = fakeGithub();
    const { repo } = await open(fake);
    const release = fake.hold('teams.json');

    repo.createTeam('Mine 1');
    const firstFlush = repo.flushPending();
    await vi.waitFor(() => expect(fake.arrived('teams.json')).toBe(1));

    fake.seed('teams.json', [{ id: 'theirs', name: 'Theirs', active: true }]);
    repo.createTeam('Mine 2');
    const secondFlush = repo.flushPending();
    release();
    await Promise.all([firstFlush, secondFlush]);

    const inRepo = fake.read<Team[]>('teams.json').map((t) => t.name).sort();
    expect(inRepo).toEqual(['Mine 1', 'Mine 2', 'Theirs']);
    expect(repo.getState().teams.map((t) => t.name).sort()).toEqual(['Mine 1', 'Mine 2', 'Theirs']);
    expect(repo.getState().conflicts).toEqual([]);
    expect(repo.getState().readOnly).toBeNull();
    expect(repo.getState().syncing).toBe(false);
  });

  it('master file, other writer changed the same field: the conflict is shown, and their other changes still survive the newer edit', async () => {
    const fake = fakeGithub();
    const { repo } = await open(fake, { people: [person('p1', 'Base'), person('p2', 'Cai Wu', 100)] });
    const release = fake.hold('people.json');

    repo.updatePerson('p1', { name: 'Mine' });
    const firstFlush = repo.flushPending();
    await vi.waitFor(() => expect(fake.arrived('people.json')).toBe(1));

    fake.seed('people.json', [person('p1', 'Theirs'), person('p2', 'Cai Wu', 50)]); // a same-field conflict on p1, an unrelated change to p2
    repo.createPerson({ name: 'New Person', countryId: 'c1', roleId: 'r1' }); // edited meanwhile
    const secondFlush = repo.flushPending();
    release();
    await Promise.all([firstFlush, secondFlush]);

    expect(repo.getState().conflicts).toHaveLength(1);
    const inRepo = fake.read<Person[]>('people.json');
    expect(inRepo.find((p) => p.id === 'p2')?.capacityPct).toBe(50); // theirs, not reverted
    expect(inRepo.map((p) => p.name)).toContain('New Person');
    expect(repo.getState().people.find((p) => p.id === 'p2')?.capacityPct).toBe(50);
  });

  it('initiative file, other writer changed another field: the merge reaches the newer edit and nothing of theirs is reverted', async () => {
    const fake = fakeGithub();
    const { repo } = await open(fake, { initiatives: [initiative()] });
    const release = fake.hold('initiatives/i1.json');

    repo.setPhaseDate('i1', PHASE, 'startDate', '2026-03-02');
    const firstFlush = repo.flushPending();
    await vi.waitFor(() => expect(fake.arrived('initiatives/i1.json')).toBe(1));

    fake.seed('initiatives/i1.json', initiative({ description: 'Added by a colleague', phases: { [PHASE]: { allocations: [], endDate: '2026-06-30' } } }));
    repo.renameInitiative('i1', 'Payments v2'); // edited meanwhile
    const secondFlush = repo.flushPending();
    release();
    await Promise.all([firstFlush, secondFlush]);

    const inRepo = fake.read<Initiative>('initiatives/i1.json');
    expect(inRepo).toMatchObject({ name: 'Payments v2', description: 'Added by a colleague' });
    expect(inRepo.phases?.[PHASE]).toMatchObject({ startDate: '2026-03-02', endDate: '2026-06-30' });
    expect(repo.getState().initiatives[0]).toMatchObject({ name: 'Payments v2', description: 'Added by a colleague' });
    expect(repo.getState().conflicts).toEqual([]);
    expect(repo.getState().readOnly).toBeNull();
    expect(repo.getState().syncing).toBe(false);
  });

  it('initiative file, same field: one conflict is shown, and their other changes still survive the newer edit', async () => {
    const fake = fakeGithub();
    const { repo } = await open(fake, { initiatives: [initiative()] });
    const release = fake.hold('initiatives/i1.json');

    repo.renameInitiative('i1', 'Mine');
    const firstFlush = repo.flushPending();
    await vi.waitFor(() => expect(fake.arrived('initiatives/i1.json')).toBe(1));

    fake.seed('initiatives/i1.json', initiative({ name: 'Theirs', description: 'Added by a colleague' }));
    repo.setPhaseDate('i1', PHASE, 'startDate', '2026-03-02'); // edited meanwhile
    const secondFlush = repo.flushPending();
    release();
    await Promise.all([firstFlush, secondFlush]);

    expect(repo.getState().conflicts).toHaveLength(1);
    const inRepo = fake.read<Initiative>('initiatives/i1.json');
    expect(inRepo.description).toBe('Added by a colleague');
    expect(inRepo.phases?.[PHASE]?.startDate).toBe('2026-03-02');
  });
});

describe('two files saving (AC 3)', () => {
  const twoUnsaved = async (fake: Fake) => {
    const opened = await open(fake);
    fake.fail('teams.json', 403);
    opened.repo.createTeam('Platform');
    await opened.repo.flushPending();
    return opened;
  };

  it('a file that saved does not clear another file\'s failure; the status stays read-only until the failed file is saved', async () => {
    const fake = fakeGithub();
    const { repo } = await twoUnsaved(fake);
    expect(repo.getState().readOnly).not.toBeNull();
    expect(repo.getState().syncing).toBe(false);

    repo.createPerson({ name: 'Cai Wu', countryId: 'c1', roleId: 'r1' });
    await repo.flushPending();
    expect(fake.commits('people.json')).toHaveLength(1);
    expect(repo.getState().readOnly).not.toBeNull(); // people saved; teams did not

    repo.createTeam('Payments');
    await repo.flushPending();
    expect(fake.commits('teams.json')).toHaveLength(1);
    expect(repo.getState().readOnly).toBeNull();
    expect(repo.getState().syncing).toBe(false);
  });

  it('while any file has unsaved changes the state says syncing, even beside another file\'s failure', async () => {
    const fake = fakeGithub();
    const { repo } = await twoUnsaved(fake);
    const release = fake.hold('people.json');

    repo.createPerson({ name: 'Cai Wu', countryId: 'c1', roleId: 'r1' });
    const flushing = repo.flushPending();
    await vi.waitFor(() => expect(fake.arrived('people.json')).toBe(1));
    expect(repo.getState().syncing).toBe(true);
    expect(repo.getState().readOnly).not.toBeNull(); // the indicator shows read-only first (§3)

    release();
    await flushing;
    expect(repo.getState().syncing).toBe(false);
    expect(repo.getState().readOnly).not.toBeNull();
  });

  it('a failed master file and an initiative file that saved: the initiative\'s success does not clear the failure', async () => {
    const fake = fakeGithub();
    const { repo } = await open(fake, { initiatives: [initiative()] });
    fake.fail('teams.json', 403);
    repo.createTeam('Platform');
    await repo.flushPending();

    repo.renameInitiative('i1', 'Payments v2');
    await repo.flushPending();

    expect(fake.commits('initiatives/i1.json')).toHaveLength(1);
    expect(repo.getState().readOnly).not.toBeNull();
  });
});

describe('creating an initiative (AC 4)', () => {
  it('writes one commit "<name>: created" to the initiative\'s own file, and an edit straight afterwards is saved against its sha', async () => {
    const fake = fakeGithub();
    const { repo } = await open(fake);

    const created = await repo.createInitiative('Checkout Redesign', 'team-1', '2026-01-05');
    const path = `initiatives/${created.id}.json`;
    expect(fake.commits(path)).toHaveLength(1);
    expect(fake.commits(path)[0]).toMatchObject({ message: 'Checkout Redesign: created', sha: undefined });

    repo.renameInitiative(created.id, 'Checkout v2');
    await repo.flushPending();

    const commits = fake.commits(path);
    expect(commits).toHaveLength(2);
    expect(commits[1].sha).toBe(commits[0].newSha);
    expect(commits[1].message).toBe('Checkout Redesign: renamed to Checkout v2');
    expect(fake.puts.filter((p) => p.path === path && p.status !== 200)).toEqual([]);
    expect(repo.getState().syncing).toBe(false);
    expect(repo.getState().readOnly).toBeNull();
  });

  it('a failed creation leaves no initiative in the list, rejects, and never writes to that file afterwards', async () => {
    const fake = fakeGithub();
    const { repo } = await open(fake);
    fake.fail('initiatives/', 500);

    await expect(repo.createInitiative('Checkout Redesign', 'team-1', '2026-01-05')).rejects.toThrow();
    expect(repo.getState().initiatives).toEqual([]);
    expect(repo.getState().readOnly).not.toBeNull();
    expect(repo.getState().syncing).toBe(false);

    await repo.flushPending();
    expect(fake.puts.filter((p) => p.path.startsWith('initiatives/'))).toHaveLength(1);
  });

  it('a creation that saved does not clear another file\'s failure', async () => {
    const fake = fakeGithub();
    const { repo } = await open(fake);
    fake.fail('teams.json', 403);
    repo.createTeam('Platform');
    await repo.flushPending();

    await repo.createInitiative('Checkout Redesign', 'team-1', '2026-01-05');

    expect(repo.getState().readOnly).not.toBeNull(); // teams.json is still unsaved
  });
});

describe('resolving a conflict (AC 5)', () => {
  it('Use mine writes the choice once and the conflict leaves the banner after the write', async () => {
    const fake = fakeGithub();
    const { repo } = await conflictedPeople(fake);
    const before = fake.commits('people.json').length;

    await repo.resolveConflict(repo.getState().conflicts[0], 'mine');

    expect(fake.commits('people.json')).toHaveLength(before + 1);
    expect(fake.read<Person[]>('people.json')[0].name).toBe('Mine');
    expect(repo.getState().conflicts).toEqual([]);
    expect(repo.getState().readOnly).toBeNull();
    expect(repo.getState().syncing).toBe(false);
  });

  it('a failed write leaves the conflict in the banner, and choosing again is the retry', async () => {
    const fake = fakeGithub();
    const { repo } = await conflictedPeople(fake);
    const conflict = repo.getState().conflicts[0];
    fake.fail('people.json', 500);

    await repo.resolveConflict(conflict, 'mine').catch(() => undefined);
    expect(repo.getState().conflicts).toEqual([conflict]);
    expect(repo.getState().readOnly).not.toBeNull();
    expect(fake.read<Person[]>('people.json')[0].name).toBe('Theirs');

    await repo.resolveConflict(conflict, 'mine');
    expect(repo.getState().conflicts).toEqual([]);
    expect(repo.getState().readOnly).toBeNull();
    expect(fake.read<Person[]>('people.json')[0].name).toBe('Mine');
  });

  it('two conflicts in one file are written once each, and the second choice builds on the first', async () => {
    const fake = fakeGithub();
    const { repo } = await conflictedPeople(fake, ['p1', 'p2']);
    const before = fake.commits('people.json').length;

    await repo.resolveConflict(repo.getState().conflicts[0], 'mine');
    expect(fake.commits('people.json')).toHaveLength(before + 1);
    expect(repo.getState().conflicts).toHaveLength(1);

    await repo.resolveConflict(repo.getState().conflicts[0], 'mine');
    expect(fake.commits('people.json')).toHaveLength(before + 2);
    expect(fake.read<Person[]>('people.json').map((p) => p.name)).toEqual(['Mine', 'Mine']);
    expect(repo.getState().conflicts).toEqual([]);
  });

  it('an initiative conflict: Use mine writes once and leaves the banner only after the write; a failed write leaves it', async () => {
    const fake = fakeGithub();
    const { repo } = await open(fake, { initiatives: [initiative()] });
    fake.seed('initiatives/i1.json', initiative({ name: 'Theirs' }));
    repo.renameInitiative('i1', 'Mine');
    await repo.flushPending();
    const conflict = repo.getState().conflicts[0];
    expect(repo.getState().conflicts).toHaveLength(1);
    const before = fake.commits('initiatives/i1.json').length;

    fake.fail('initiatives/', 500);
    await repo.resolveConflict(conflict, 'mine').catch(() => undefined);
    expect(repo.getState().conflicts).toEqual([conflict]);
    expect(repo.getState().readOnly).not.toBeNull();

    await repo.resolveConflict(conflict, 'mine');
    expect(fake.commits('initiatives/i1.json')).toHaveLength(before + 1);
    expect(fake.read<Initiative>('initiatives/i1.json').name).toBe('Mine');
    expect(repo.getState().conflicts).toEqual([]);
    expect(repo.getState().readOnly).toBeNull();
  });
});

describe('decided in chat for slice 005g', () => {
  it('a retry from the same draft is the same file: the failure clears when that save lands', async () => {
    const fake = fakeGithub();
    const { repo } = await open(fake);
    fake.fail('initiatives/', 500);

    await expect(repo.createInitiative('Checkout Redesign', 'team-1', '2026-01-05', 'draft-1')).rejects.toThrow();
    expect(repo.getState().readOnly).not.toBeNull();

    await repo.createInitiative('Checkout Redesign', 'team-1', '2026-01-05', 'draft-1');
    expect(fake.commits('initiatives/draft-1.json')).toHaveLength(1);
    expect(repo.getState().readOnly).toBeNull();
    expect(repo.getState().syncing).toBe(false);
  });

  it('a creation that had already landed before the retry is adopted, not refused', async () => {
    const fake = fakeGithub();
    const { repo } = await open(fake);
    fake.seed('initiatives/draft-1.json', initiative({ id: 'draft-1', name: 'Checkout Redesign' }));

    const created = await repo.createInitiative('Checkout Redesign v2', 'team-1', '2026-01-05', 'draft-1');

    expect(repo.getState().initiatives.map((i) => i.id)).toEqual([created.id]);
    expect(fake.read<Initiative>('initiatives/draft-1.json').name).toBe('Checkout Redesign v2');
    expect(repo.getState().readOnly).toBeNull();
  });

  it('discarding the draft after a failed creation clears the read-only status; a saved creation is left alone', async () => {
    const fake = fakeGithub();
    const { repo } = await open(fake);
    fake.fail('initiatives/', 500);
    await expect(repo.createInitiative('Checkout Redesign', 'team-1', '2026-01-05', 'draft-1')).rejects.toThrow();

    repo.discardFailedCreation('draft-1');
    expect(repo.getState().readOnly).toBeNull();

    fake.fail('teams.json', 403);
    repo.createTeam('Platform');
    await repo.flushPending();
    const saved = await repo.createInitiative('Saved One', 'team-1', '2026-01-05', 'draft-2');
    repo.discardFailedCreation(saved.id);
    expect(repo.getState().initiatives).toHaveLength(1);
    expect(repo.getState().readOnly).not.toBeNull(); // still teams.json's
  });

  it('Keep theirs with nothing else to write makes no commit and clears the banner', async () => {
    const fake = fakeGithub();
    const { repo } = await conflictedPeople(fake);
    const before = fake.commits('people.json').length;

    await repo.resolveConflict(repo.getState().conflicts[0], 'theirs');

    expect(fake.commits('people.json')).toHaveLength(before);
    expect(repo.getState().conflicts).toEqual([]);
    expect(repo.getState().readOnly).toBeNull();
    expect(repo.getState().syncing).toBe(false);
    expect(repo.getState().people[0].name).toBe('Theirs');
  });

  it("Keep theirs still writes the clean part of the user's edit", async () => {
    const fake = fakeGithub();
    const { repo } = await open(fake, { people: [person('p1', 'Base')] });
    fake.seed('people.json', [person('p1', 'Theirs')]);
    repo.updatePerson('p1', { name: 'Mine' });
    repo.updatePerson('p1', { capacityPct: 80 }); // no clash on this one
    await repo.flushPending();
    const before = fake.commits('people.json').length;

    await repo.resolveConflict(repo.getState().conflicts[0], 'theirs');

    expect(fake.commits('people.json')).toHaveLength(before + 1);
    expect(fake.read<Person[]>('people.json')[0]).toMatchObject({ name: 'Theirs', capacityPct: 80 });
  });

  it('a resolution commit says the outcome after the original message', async () => {
    const fake = fakeGithub();
    const { repo } = await conflictedPeople(fake, ['p1', 'p2']);

    await repo.resolveConflict(repo.getState().conflicts[0], 'mine');
    await repo.resolveConflict(repo.getState().conflicts[0], 'mine');

    const [first, second] = fake.commits('people.json').slice(-2);
    expect(first.message).toMatch(/ \(conflict: used mine\)$/);
    expect(second.message).toMatch(/ \(conflict: used mine\)$/);
    expect(first.message).toContain('renamed from Base');
  });

  it('a resolution that hits a 409 gets its own retry budget', async () => {
    const fake = fakeGithub();
    const { repo } = await conflictedPeople(fake);
    for (let i = 0; i < 3; i += 1) fake.fail('people.json', 409); // the save that found the conflict already used one retry

    await repo.resolveConflict(repo.getState().conflicts[0], 'mine');

    expect(repo.getState().conflicts).toEqual([]);
    expect(repo.getState().readOnly).toBeNull();
    expect(fake.read<Person[]>('people.json')[0].name).toBe('Mine');
  });
});
