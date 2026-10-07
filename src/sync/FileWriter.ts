import { isQuotaError, type FileCache } from '../cache/db';
import type { CommitLink, GithubClient } from '../github/client';
import { GithubApiError, toReadOnlyState, type ReadOnlyState } from '../github/errors';
import { changedPaths, getAtPath, pathKey, sameValue, setAtPath, type DocumentMerge, type MergeConflict, type Path } from './merge';
import { parseDataFile } from './validateDataset';
import type { WriteQueue } from './WriteQueue';

/** A file's edits are committed this long after the last edit to it (§10.3)… */
export const COMMIT_QUIET_MS = 4000;
/** …and at most this long after its first uncommitted edit, so steady editing still saves (§10.3). */
export const COMMIT_MAX_MS = 20_000;

/** The window every writer uses; tests that wait for a save in real time shorten it (src/test/setup.ts). */
export const commitWindow = { quietMs: COMMIT_QUIET_MS, maxMs: COMMIT_MAX_MS };
const MAX_RETRIES = 3;
/** The wait before retry 1, 2 and 3 after a rejected write (§10.3), before jitter. */
const RETRY_BACKOFF_MS = [500, 1000, 2000];
const JITTER = 0.2;

/** The clock a writer waits on when it is not given one; tests replace `delay` to run without real time. */
export const defaultTiming = {
  delay: (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms)),
  random: (): number => Math.random(),
};

export type WriteStatus = 'synced' | 'syncing' | { readOnly: ReadOnlyState };

/** How one save ended: written, held back for the user to resolve a conflict, refused (the status says why), or
 * dropped because someone else deleted the file (§3). */
export type SaveResult = 'saved' | 'conflicts' | 'failed' | 'gone';

/** How deleting the file ended (§9.3): deleted (or already gone), refused by the caller's rule on the newer
 * version a conflict brought in, or failed with the cause. */
export type DeleteResult = 'deleted' | 'refused' | { failed: ReadOnlyState };

/** A same-field conflict a save found (§3, §10.5), for the banner. Resolving it is a new edit like any other. */
export interface FileConflict extends MergeConflict {
  /** The data-branch file it is in (§10.2). */
  file: string;
  /** Resolves true once the choice is saved (or needed no write) or replaced by a newer conflict; false when the write failed. */
  resolve: (choice: 'mine' | 'theirs') => Promise<boolean>;
}

/** The kinds of entity a commit can touch (§10.3). Each but `dataset` is rendered as an `Entity:` trailer. */
export type EntityKind = 'initiative' | 'person' | 'team' | 'membership' | 'role' | 'country' | 'dataset';

export type EntityRef = { kind: EntityKind; id: string };

/** A commit message: the plain-words subject, and the entities it touched, which end it as trailer lines (§10.3). */
export interface CommitMessage {
  subject: string;
  entities: EntityRef[];
}

/** The subject, then a blank line and one `Entity: <kind>/<id>` trailer per entity (dataset-level notes have none). */
export function renderMessage({ subject, entities }: CommitMessage): string {
  const trailers = entities.filter((e) => e.kind !== 'dataset').map((e) => `Entity: ${e.kind}/${e.id}`);
  return trailers.length === 0 ? subject : `${subject}\n\n${trailers.join('\n')}`;
}

/** Entities in first-seen order, each once. */
export function distinctEntities(entities: EntityRef[]): EntityRef[] {
  const seen = new Set<string>();
  return entities.filter((e) => {
    const key = `${e.kind}/${e.id}`;
    return !seen.has(key) && seen.add(key);
  });
}

/**
 * One edit, as the commit message describes it (§10.3). Edits to the same `field` of the same entity within one
 * commit combine into one note, from the first `from` to the last `to`: `undefined` means it did not exist, and a
 * change back to where it started leaves no note. `words` phrases the net change in plain words naming the entity.
 */
export interface CommitNote {
  entity: EntityRef;
  /**
   * Who the note is about, when `words` leaves them out: notes with the same subject share it, "Lucía Ramos: Team FTE %
   * on Platform set to 70%, Team FTE % on Growth set to 30%" (a split bar move, §5.6).
   */
  subject?: string;
  field: string;
  from: unknown;
  to: unknown;
  words: (from: unknown, to: unknown) => string;
}

export interface SyncedFile<D> {
  content: D;
  sha: string;
}

/** What became of a pulled file: applied, with the paths that changed on screen, or left alone (see `receive`). */
export type Received = { changed: Path[] } | { left: 'retry' | 'writer' };

export interface FileWriterOptions<D> {
  path: string;
  branch: string;
  github: GithubClient;
  queue: WriteQueue;
  merge: DocumentMerge<D>;
  /** What the file holds when a re-read after a 409 finds it gone; null when its absence is an error. */
  whenMissing: D | null;
  /** Someone else deleted the file while an edit waited to be saved (§3): the edit is dropped, not resaved,
   * and `tell` is told. GitHub recreates a file a write names a sha for, so a save that recreated it deletes it
   * again in a commit `message` names. Without it, a file gone on re-read is an error. */
  whenGone?: { message: (doc: D) => CommitMessage; tell: () => void };
  /** The file as last read, or null while it does not exist yet: the first save then creates it. */
  initial: SyncedFile<D> | null;
  /** What to tell the user when that first save fails. */
  creationFailure?: string;
  /** Where a save that landed is kept, for the next open (§10.4). */
  cache: FileCache;
  /** Settles when the first pull of the dataset has (§3): a save waits for it, so it is built on what the pull brought in. */
  gate?: () => Promise<unknown>;
  /** Why `content` may not be written just now, or null: the dataset is refused (§3 Data integrity, Damaged data), or
   * the content refers to a record another file has not saved yet. Asked of this client's edit before every attempt,
   * a retry's too; the save is then refused before anything is sent, failing like a push would, with the typed value kept. */
  refused?: (content: D) => ReadOnlyState | null;
  /** Waits before a retry (§10.3); real timers by default. */
  delay?: (ms: number) => Promise<void>;
  /** Uniform in [0, 1), for the retry jitter; `Math.random` by default. */
  random?: () => number;
  onStatus: (status: WriteStatus) => void;
  /** An edit was made (see {@link FileWriter.schedule}). */
  onSchedule?: () => void;
  /** A save or delete of this file made `commit` (§10.2), told once the cache has been asked to keep what it wrote. */
  onCommitted?: (commit: CommitLink) => void;
  /** The local cache refused a write because storage is full (§3 Storage limits); the save itself had succeeded. */
  onCacheFull?: () => void;
  onConflict: (conflict: FileConflict) => void;
  /** A conflict closed without a choice (§3): a pull settled it or replaced its "theirs", or a new edit replaced it. */
  onConflictClosed?: (conflict: FileConflict) => void;
  /** The document on screen should now be this one: a save landed, or a merge brought in the other writer's changes. */
  onDocument: (doc: D) => void;
}

/** One file's share of a commit of several files (§10.3), taken by {@link FileWriter.takeJoint}. */
export interface JointPart<D> {
  path: string;
  /** What is committed: the file's text. */
  content: string;
  /** The version the edit was made on: the commit goes ahead only while the file is still at it. */
  sha: string;
  message: CommitMessage;
  mine: D;
  batch: EditBatch<D>;
}

/** An edit taken out of a writer to be saved apart from those made after it (see {@link FileWriter.flushApart}). */
interface EditBatch<D> {
  pending: D | null;
  notes: CommitNote[];
  extras: [string, string][];
  extraEntities: EntityRef[];
  replaced: boolean;
  noted: boolean;
}

/**
 * The one writer behind every file in the data branch (§10.2): debounce, save, merge on conflict,
 * report status. A file is a document `D`, merged by path (§10.5), with any rule of its own the
 * `merge` it is given adds. Creating the file is its first save.
 *
 * One save runs at a time per file, in order. A save takes the latest edit when it reaches the front,
 * so it is built on whatever the save before it merged in, and it reads its sha when it reaches the
 * front of the global write queue (§10.3). Edits made while a save is in flight stay in `pending`,
 * are reported synced only when their own save lands, and are rebased onto a merge with the
 * repository's version so the other writer's changes are not lost.
 */
export class FileWriter<D> {
  private synced: SyncedFile<D> | null;
  /** The document as the user sees it: the last edit, plus anything a merge brought in. */
  private screen: D | null;
  /** The newest edit that no save has taken yet. */
  private pending: D | null = null;
  /** What changed since the last save: one note per entity field, in first-edit order (§10.3). */
  private readonly notes = new Map<string, CommitNote>();
  /** Words added verbatim to the message, such as a conflict's outcome. */
  private readonly extras = new Map<string, string>();
  /** The entities of the commits those extras stand for. */
  private extraEntities: EntityRef[] = [];
  /** The commit each open conflict was raised under: its entities end the message that settles it. */
  private readonly conflictCommits = new WeakMap<FileConflict, CommitMessage>();
  /** An edit since the last save answered an open conflict: the message ends "(conflict: replaced)". */
  private replaced = false;
  /** An edit with a note was made since the last save, even if its note has cancelled out. */
  private noted = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** Edits set aside by {@link flushApart}, oldest first: each save takes the oldest before what is pending, so
   * documents are sent in the order they were made. */
  private readonly apart: EditBatch<D>[] = [];
  /** When the oldest edit no save has taken yet was made: the commit window closes {@link COMMIT_MAX_MS} after it. */
  private windowOpenedAt: number | null = null;
  /** Saves are chained so each starts after the one before it has finished. */
  private tail: Promise<unknown> = Promise.resolve();
  /** Saves requested and not yet started. */
  private waiting = 0;
  /** Saves requested and not yet finished, those waiting at their gate included. */
  private unfinished = 0;
  /** What last failed to save, and why — set and cleared together by {@link fail}/{@link clearFailure} — kept
   * until a fresh edit or a landed save clears it (§3, §9.9); non-null is "the last save failed and nothing
   * has been saved since", so an idle writer must not say synced. */
  private failedContent: D | null = null;
  private failedCause: ReadOnlyState | null = null;
  private openConflicts: FileConflict[] = [];
  /** A save is running: the pull leaves the file alone, since the save's own re-read brings in anything newer. */
  private saving = false;
  /** The file is deleted: nothing is saved any more. */
  private disposed = false;

  constructor(private readonly options: FileWriterOptions<D>) {
    this.synced = options.initial;
    this.screen = options.initial?.content ?? null;
  }

  /**
   * Apply an edit to the on-screen document now and save it once edits settle. `note` describes the change
   * in plain words naming the entity (§10.3), one note per entity it changes; edits within one window are combined
   * into their net effect.
   */
  schedule(next: D, note?: CommitNote | CommitNote[]): void {
    this.replaceConflicts(next);
    this.screen = next;
    this.pending = next;
    this.clearFailure();
    for (const n of note === undefined ? [] : [note].flat()) this.note(n);
    this.options.onStatus('syncing');
    this.options.onSchedule?.();
    if (this.timer) clearTimeout(this.timer);
    const now = Date.now();
    this.windowOpenedAt ??= now;
    const wait = Math.min(commitWindow.quietMs, this.windowOpenedAt + commitWindow.maxMs - now);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, Math.max(0, wait));
  }

  /** Save what is pending now, without waiting for the commit window to close (§10.3's flush points), after any save in flight. */
  flush(): Promise<SaveResult> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.windowOpenedAt = null;
    return this.enqueue(() => this.saveNext());
  }

  /**
   * Sends what is pending now as a save of its own, after any save in flight, and starts it at once (§10.3: an action
   * that reads or replaces the saved file). An edit made after this call, such as that action's own, goes in the next
   * save, not this one, even though this one starts later.
   */
  flushApart(): Promise<SaveResult> {
    if (this.pending === null) return this.flush();
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.windowOpenedAt = null;
    this.apart.push(this.takeEdits());
    return this.enqueue(() => this.saveNext());
  }

  /**
   * Takes the pending edit for a commit of several files (§10.3), at once and without its window: null when nothing is
   * pending, the file does not exist yet, a save of it is queued or running, a choice is open or the edit is refused,
   * and the caller then lets each file save on its own. Until {@link jointLanded}, {@link jointFailed} or
   * {@link jointReturned}, the file counts as saving.
   */
  takeJoint(): JointPart<D> | null {
    const mine = this.pending;
    if (mine === null || this.synced === null || this.unfinished > 0 || this.disposed) return null;
    if (this.openConflicts.length > 0 || this.options.refused?.(mine)) return null;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.windowOpenedAt = null;
    const message = this.commitMessage();
    const batch = this.takeEdits();
    this.saving = true;
    // A save of an edit made meanwhile waits for the commit, so it neither races it nor is overwritten by an edit given back.
    const done = new Promise<void>((resolve) => (this.jointDone = resolve));
    void this.enqueue(() => done);
    return { path: this.options.path, content: JSON.stringify(mine), sha: this.synced.sha, message, mine, batch };
  }

  /** Ends the hold {@link takeJoint} put on this writer's saves. */
  private jointDone: (() => void) | null = null;

  private endJoint(): void {
    this.saving = false;
    this.jointDone?.();
    this.jointDone = null;
  }

  /** The commit holding this file's share landed: `sha` is the file's new version. */
  jointLanded(part: JointPart<D>, sha: string): void {
    this.endJoint();
    this.synced = { content: part.mine, sha };
    this.clearFailure();
    this.landed(part.mine, part.mine, false, part.message);
    void this.cache(part.mine, sha);
  }

  /** The commit failed: the edit is this file's failure, resent by Retry or the automatic retry as its own save. */
  jointFailed(part: JointPart<D>, cause: ReadOnlyState): void {
    this.endJoint();
    // Its notes stay for the resend; an edit made since stays pending, on top of it.
    this.giveBack({ ...part, batch: { ...part.batch, pending: null } });
    this.failWith(cause, part.mine);
  }

  /** No commit was made (the file changed meanwhile): the edit goes back and is saved on its own, now. */
  jointReturned(part: JointPart<D>): void {
    this.endJoint();
    this.giveBack(part);
    void this.flush();
  }

  /** The share's edit and notes back in, before anything edited since. */
  private giveBack(part: JointPart<D>): void {
    this.addEdits(this.swapEdits(part.batch));
  }

  /** Settles once the edits made so far are saved or have failed: one waiting for its commit window is saved now. */
  settled(): Promise<unknown> {
    return this.timer ? this.flush() : this.tail;
  }

  /** Runs `step` once every save before it has finished. */
  private enqueue<T>(step: () => Promise<T>): Promise<T> {
    this.waiting += 1;
    this.unfinished += 1;
    const result = this.tail.then(() => {
      this.waiting -= 1;
      return step();
    });
    this.tail = result.catch(() => undefined).finally(() => (this.unfinished -= 1));
    return result;
  }

  /** The version of the file this writer last read or wrote; null while the file does not exist yet. */
  get sha(): string | null {
    return this.synced?.sha ?? null;
  }

  /** The file as this writer last read or wrote it; null while it does not exist yet. */
  get syncedContent(): D | null {
    return this.synced?.content ?? null;
  }

  /** Nothing is waiting to be saved, no save is running and no choice is open: a pull may replace what is on screen. */
  get idle(): boolean {
    return !this.busy && this.openConflicts.length === 0 && this.failedCause === null;
  }

  /** An edit is waiting to be saved or a save is running. */
  get busy(): boolean {
    return this.pending !== null || this.apart.length > 0 || this.timer !== null || this.waiting > 0 || this.saving;
  }

  /** Why this file's last save failed, for as long as nothing has saved since (§3, §9.9); null otherwise. */
  get failure(): ReadOnlyState | null {
    return this.failedCause;
  }

  /** An edit is waiting to be saved: typed or made, and no save has taken it yet. */
  get hasPending(): boolean {
    return this.pending !== null || this.apart.length > 0;
  }

  /** The paths that changed in the edit that failed to save, against what is actually on GitHub (§9.9): only
   * these are shown as "Not saved" on screen, so a field the failed edit never touched is not implicated. */
  get failedPaths(): Path[] {
    if (this.failedContent === null) return [];
    return changedPaths(this.synced?.content ?? null, this.failedContent);
  }

  /** Resends the edit that last failed to save (§3, §9.9's Retry): a no-op once nothing is failed, since a
   * fresh edit already cleared it via {@link schedule}. */
  retry(): Promise<SaveResult> {
    if (this.failedContent === null) return Promise.resolve('saved');
    // A second Retry while the first is still on its way would send the same edit again, as a second commit.
    if (this.retrying) return this.retrying;
    this.pending = this.failedContent;
    this.options.onStatus('syncing');
    const retrying = this.enqueue(() => this.saveNext()).finally(() => {
      if (this.retrying === retrying) this.retrying = null;
    });
    this.retrying = retrying;
    return retrying;
  }

  /** The resend {@link retry} started and that has not finished yet. */
  private retrying: Promise<SaveResult> | null = null;

  /**
   * The repository's newer version of the file, from a pull (§3). It replaces what is on screen; an edit not yet
   * saved is merged with it like a save that found the file changed (§10.5), and a clash is a conflict for the
   * user to choose. The file is left alone, and says why, when a save is running or it is not the version the pull
   * compared (a save landed since): `retry`, the next pull will find it changed. Or a choice is open or the last
   * save failed: `writer`, the writer's next save re-reads the file and merges it, so a pull has nothing to retry.
   */
  receive(file: SyncedFile<D>, replaces: string | null): Received {
    const stale = (this.synced?.sha ?? null) !== replaces;
    if (this.openConflicts.length > 0 && this.failedCause === null && !this.busy) {
      return stale ? { left: 'retry' } : this.receiveWithConflicts(file);
    }
    if (this.openConflicts.length > 0 || this.failedCause !== null) return { left: 'writer' };
    if (this.saving || stale) return { left: 'retry' };
    return this.show(file);
  }

  /** Shows the repository's version, an edit not saved yet merged into it (§10.5). */
  private show(file: SyncedFile<D>): Received {
    const before = this.screen;
    let next = file.content;
    if (this.pending !== null || this.timer !== null) {
      const mine = this.pending ?? (this.screen as D);
      const message = this.commitMessage();
      const outcome = this.options.merge(this.synced?.content ?? file.content, mine, file.content);
      this.raise(outcome.conflicts, message);
      next = outcome.merged;
      this.pending = next;
    }
    this.synced = file;
    this.screen = next;
    this.options.onDocument(next);
    return { changed: changedPaths(before, next) };
  }

  /**
   * A pull while a choice is open (§3): merged against the screen with each open conflict's own sides, so a
   * conflict the repository now settles (it holds mine, or theirs went back to the base) closes, one whose
   * "theirs" moved on is raised again with the newer value, and the rest of the pull shows. Once none is open,
   * anything of the user's that the repository does not hold yet is saved.
   */
  private receiveWithConflicts(file: SyncedFile<D>): Received {
    const before = this.screen as D;
    const open = this.openConflicts;
    let base = this.synced?.content ?? file.content;
    let mine = before;
    for (const c of open) {
      base = setAtPath(base, c.path, c.base);
      mine = setAtPath(mine, c.path, c.mine);
    }
    const message = this.commitMessage();
    const outcome = this.options.merge(base, mine, file.content);
    const still = (c: FileConflict) =>
      outcome.conflicts.some((n) => pathKey(n.path) === pathKey(c.path) && sameValue(n.mine, c.mine) && sameValue(n.theirs, c.theirs));
    const closing = open.filter((c) => !still(c));
    this.openConflicts = open.filter(still);
    for (const c of closing) this.options.onConflictClosed?.(c);
    this.raise(outcome.conflicts, message);
    this.synced = file;
    this.screen = outcome.merged;
    this.options.onDocument(outcome.merged);
    if (this.openConflicts.length === 0 && !sameValue(outcome.merged, file.content)) {
      this.pending = outcome.merged;
      for (const c of closing) {
        this.extras.set(`conflict:${pathKey(c.path)}`, message.subject);
        this.extraEntities.push(...(this.conflictCommits.get(c)?.entities ?? []));
      }
      this.options.onStatus('syncing');
      void this.flush();
    }
    return { changed: changedPaths(before, outcome.merged) };
  }

  /** A new edit that changes a field with an open conflict is the user's answer to it (§3): the conflict closes. */
  private replaceConflicts(next: D): void {
    if (this.screen === null) return;
    const screen = this.screen;
    const replaced = this.openConflicts.filter((c) => !sameValue(getAtPath(next, c.path), getAtPath(screen, c.path)));
    if (replaced.length === 0) return;
    this.openConflicts = this.openConflicts.filter((c) => !replaced.includes(c));
    this.replaced = true;
    for (const c of replaced) this.options.onConflictClosed?.(c);
  }

  private note(note: CommitNote): void {
    const key = `${note.entity.kind}/${note.entity.id}/${note.field}`;
    const from = this.notes.has(key) ? (this.notes.get(key) as CommitNote).from : note.from;
    this.noted = true;
    if (sameValue(from, note.to)) this.notes.delete(key);
    else this.notes.set(key, { ...note, from });
  }

  /** The net effect of the edits since the last save, in plain words; null when none remains. */
  private describe(): string | null {
    const groups: { subject?: string; words: string[] }[] = [];
    for (const n of this.notes.values()) {
      const words = n.words(n.from, n.to);
      const same = n.subject !== undefined && groups.find((g) => g.subject === n.subject);
      if (same) same.words.push(words);
      else groups.push({ subject: n.subject, words: [words] });
    }
    const parts = [...groups.map((g) => (g.subject === undefined ? g.words[0] : `${g.subject}: ${g.words.join(', ')}`)), ...this.extras.values()];
    if (parts.length === 0) return null;
    return this.replaced ? `${parts.join('; ')} (conflict: replaced)` : parts.join('; ');
  }

  private commitMessage(): CommitMessage {
    return { subject: this.describe() ?? `${this.options.path}: update`, entities: this.touched() };
  }

  /** The entities with a note left, or an extra standing for one, in first-edit order. */
  private touched(): EntityRef[] {
    return distinctEntities([...[...this.notes.values()].map((n) => n.entity), ...this.extraEntities]);
  }

  /** The pending edit and its notes, taken out of the writer, which is left with none. */
  private takeEdits(): EditBatch<D> {
    const batch: EditBatch<D> = {
      pending: this.pending,
      notes: [...this.notes.values()],
      extras: [...this.extras],
      extraEntities: this.extraEntities,
      replaced: this.replaced,
      noted: this.noted,
    };
    this.pending = null;
    this.clearEdits();
    return batch;
  }

  /** Puts `batch` in the writer's place, and returns what the writer held. */
  private swapEdits(batch: EditBatch<D>): EditBatch<D> {
    const held = this.takeEdits();
    this.addEdits(batch);
    return held;
  }

  /** Adds a batch's edit after what the writer holds: its document is the newer one, its notes merge by field. */
  private addEdits(batch: EditBatch<D>): void {
    if (batch.pending !== null) this.pending = batch.pending;
    const noted = this.noted || batch.noted;
    for (const n of batch.notes) this.note(n);
    this.noted = noted;
    for (const [key, words] of batch.extras) this.extras.set(key, words);
    this.extraEntities = [...this.extraEntities, ...batch.extraEntities];
    this.replaced ||= batch.replaced;
  }

  /** The edits so far are written into a commit: they start afresh. */
  private clearEdits(): void {
    this.notes.clear();
    this.extras.clear();
    this.extraEntities = [];
    this.replaced = false;
    this.noted = false;
  }

  private async saveNext(): Promise<SaveResult> {
    await this.options.gate?.();
    const batch = this.apart.shift();
    if (batch) {
      const later = this.swapEdits(batch);
      try {
        return await this.saveTaken();
      } finally {
        // Whatever is left (a refused save keeps its notes, an edit made during the save) joins what came later.
        this.addEdits(this.swapEdits(later));
      }
    }
    return this.saveTaken();
  }

  /** Saves what is pending now. */
  private async saveTaken(): Promise<SaveResult> {
    if (this.disposed) return 'gone';
    if (this.pending === null) {
      this.reportIdle();
      return 'saved';
    }
    const mine = this.pending;
    this.pending = null;
    const refusal = this.options.refused?.(mine);
    // Refused before anything is sent: the edit fails with the typed value kept, and its notes stay for the save
    // that follows once the dataset can be written again.
    if (refusal) return this.failWith(refusal, mine);
    const message = this.commitMessage();
    const cancelled = this.noted && this.describe() === null && this.synced !== null && sameValue(mine, this.synced.content);
    this.clearEdits();
    if (cancelled) {
      // The edits undid each other, nothing changed, so nothing to commit (§10.3).
      this.reportIdle();
      return 'saved';
    }
    this.saving = true;
    try {
      return await this.save(mine, message);
    } finally {
      this.saving = false;
    }
  }

  private async save(mine: D, message: CommitMessage): Promise<SaveResult> {
    let sent = mine;
    let merged = false;
    for (let retries = MAX_RETRIES; ; retries -= 1) {
      if (retries < MAX_RETRIES) {
        await this.backoff(MAX_RETRIES - retries - 1);
        // An edit made during the wait joins this write rather than starting one of its own, unless edits set apart
        // are waiting: they are older, and go first.
        if (this.pending !== null && this.apart.length === 0) {
          const newer = this.pending;
          this.pending = null;
          sent = this.rebase(mine, newer, sent, message);
          mine = newer;
          message = {
            subject: [message.subject, this.describe()].filter(Boolean).join('; '),
            entities: distinctEntities([...message.entities, ...this.touched()]),
          };
          this.clearEdits();
        }
        // The dataset may have been refused since the save started. Asked of this client's own edit, not the merge:
        // what the merge brought in is already on GitHub, records it refers to included.
        const refusal = this.options.refused?.(mine);
        if (refusal) return this.failWith(refusal, sent);
      }
      try {
        const { sha, created, commit } = await this.options.queue.run(() =>
          this.options.github.putFile({
            path: this.options.path,
            branch: this.options.branch,
            content: JSON.stringify(sent),
            message: renderMessage(message),
            sha: this.synced?.sha,
          }),
        );
        if (created && this.synced !== null && this.options.whenGone) return this.recreated(sent, sha, this.options.whenGone);
        this.synced = { content: sent, sha };
        this.clearFailure();
        this.landed(mine, sent, merged, message);
        void this.cache(sent, sha); // Not waited for: the save is done, and the cache only helps the next open.
        if (commit) this.options.onCommitted?.(commit);
        return 'saved';
      } catch (error) {
        const stale = error instanceof GithubApiError && error.cause_ === 'conflict';
        const exists = this.synced === null && error instanceof GithubApiError && error.status === 422;
        if (!stale && !exists) return this.fail(error, this.synced ? 'Something went wrong saving this change.' : this.creationFailure(), sent);
        if (retries <= 0) {
          return this.fail(
            new GithubApiError('Could not save after several retries — please retry.', 'conflict'),
            'Could not save after several retries — please retry.',
            sent,
          );
        }
        // A wrapped re-read: a failure anywhere in the retry must still resolve to a reported status,
        // since every caller of flush() and schedule() discards the promise without a catch of its own.
        try {
          if (this.synced === null && !exists) continue; // Creating: nothing to merge with, put it again.
          const outcome = await this.reread(mine);
          if (outcome === null) continue;
          if (outcome === 'gone') return this.gone();
          if (outcome.conflicts.length > 0) return this.surface(outcome.merged, outcome.conflicts, mine, message);
          sent = outcome.merged;
          merged = true;
        } catch (retryError) {
          return this.fail(retryError, 'Could not save this change after a conflict.', sent);
        }
      }
    }
  }

  /** Waits out the delay before retry `n` (0-based): 0.5 s, 1 s, 2 s, each within ±20%. */
  private backoff(n: number): Promise<void> {
    const random = this.options.random ?? defaultTiming.random;
    const delay = this.options.delay ?? defaultTiming.delay;
    return delay(RETRY_BACKOFF_MS[n] * (1 + (random() * 2 - 1) * JITTER));
  }

  /**
   * Re-read the file and merge the user's version with it against the last-synced one (§10.5). The
   * repository's version becomes the last-synced one, so the next put carries its sha. Null when a
   * file that already existed while creating turned out to be gone again.
   */
  private async reread(mine: D) {
    const file = await this.options.github.getFile({ path: this.options.path, branch: this.options.branch });
    if (file === null && this.options.whenMissing === null && this.synced !== null) {
      if (this.options.whenGone) return 'gone' as const;
      throw new Error('The file is gone from the repository.');
    }
    if (file === null && this.synced === null) return null;
    const theirs = file ? (parseDataFile(this.options.path, file.content) as D) : (this.options.whenMissing as D);
    // A file created by an earlier attempt of this same save: it is now the base.
    const base = this.synced?.content ?? theirs;
    const outcome = this.options.merge(base, mine, theirs);
    this.synced = { content: theirs, sha: file?.sha ?? '' };
    return outcome;
  }

  /** Someone else deleted the file (§3): the edit that found it gone is dropped, and so is anything after it. */
  private gone(): SaveResult {
    this.dispose();
    this.options.whenGone?.tell();
    return 'gone';
  }

  /**
   * The save recreated a file someone else deleted (GitHub does, though the write named a sha): it is deleted
   * again, and the edit dropped as if the save had found it gone. Should that delete fail, the file stays with the
   * edit in it, and the next pull brings it back here: nothing is lost, only the other user's delete undone.
   */
  private async recreated(sent: D, sha: string, whenGone: { message: (doc: D) => CommitMessage }): Promise<SaveResult> {
    try {
      await this.options.queue.run(() =>
        this.options.github.deleteFile({ path: this.options.path, branch: this.options.branch, message: renderMessage(whenGone.message(sent)), sha }),
      );
    } catch {
      // Left recreated: see above.
    }
    return this.gone();
  }

  /**
   * Delete the file (§9.3, §10.3) after any save in flight, at the version that save left. An edit not saved yet
   * waits: it is dropped once the delete lands, and saved as usual if it does not. A conflict re-reads the file
   * and shows the newer version; `refuses` decides from it whether to stop, otherwise the delete is sent again
   * at its sha, since what was confirmed is deleting the file, not one version of it.
   */
  deleteFile(message: CommitMessage, refuses: (doc: D) => boolean): Promise<DeleteResult> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    return this.enqueue(async () => {
      this.saving = true;
      let result: DeleteResult;
      try {
        result = await this.deleteNow(message, refuses);
      } finally {
        this.saving = false;
      }
      if (result === 'deleted') this.dispose();
      else if (this.pending !== null) void this.flush();
      return result;
    });
  }

  private async deleteNow(message: CommitMessage, refuses: (doc: D) => boolean): Promise<DeleteResult> {
    // The version to delete: the synced one, then whatever each conflict's re-read finds. Kept apart from
    // `synced`, which only moves when the re-read can be shown (no choice open, no failed save waiting).
    let sha = this.synced?.sha;
    if (sha === undefined) return 'deleted'; // never created: nothing to delete
    for (let retries = MAX_RETRIES; ; retries -= 1) {
      if (retries < MAX_RETRIES) await this.backoff(MAX_RETRIES - retries - 1);
      const at = sha;
      try {
        const deleted = await this.options.queue.run(() =>
          this.options.github.deleteFile({ path: this.options.path, branch: this.options.branch, message: renderMessage(message), sha: at }),
        );
        // Out of the cache before the commit is told, so a pull that ends at it never leaves the file cached.
        void this.options.cache.delete(this.options.path).catch(() => {});
        if (deleted !== 'gone' && deleted) this.options.onCommitted?.(deleted);
        return 'deleted';
      } catch (error) {
        const stale = error instanceof GithubApiError && error.cause_ === 'conflict';
        if (!stale) return { failed: toReadOnlyState(error, 'Something went wrong deleting this.') };
        if (retries <= 0) return { failed: { cause: 'conflict', message: 'Could not delete after several retries — please retry.' } };
        try {
          const file = await this.options.github.getFile({ path: this.options.path, branch: this.options.branch });
          if (file === null) return 'deleted';
          const theirs = parseDataFile(this.options.path, file.content) as D;
          // Shown unless a choice is open or a failed save waits: the writer's next save merges it then.
          if (this.openConflicts.length === 0 && this.failedCause === null) this.show({ content: theirs, sha: file.sha });
          if (refuses(theirs)) return 'refused';
          sha = file.sha;
        } catch (retryError) {
          return { failed: toReadOnlyState(retryError, 'Something went wrong deleting this.') };
        }
      }
    }
  }

  /**
   * Drop every edit not saved yet, with its failure and open choices, once any save in flight has finished, and show
   * the file as last saved (Reset, §5.9): the writer stays, and the next pull brings in what replaced the file.
   */
  async drop(): Promise<void> {
    this.discardLocal();
    await this.enqueue(async () => {});
    this.discardLocal(); // a save in flight may have left a failure or an open choice
    this.replaced = false;
    this.noted = false;
    if (this.synced) {
      this.screen = this.synced.content;
      this.options.onDocument(this.synced.content);
    }
    this.reportIdle();
  }

  /** The app let go of the repository (Disconnect, §3): edits not saved yet are dropped, never sent later. */
  discardUnsaved(): void {
    this.discardLocal();
  }

  /** Nothing of this file is saved any more: its edits, open choices and failure go with it. */
  private dispose(): void {
    this.discardLocal();
    this.disposed = true;
  }

  /** Every edit not saved yet, with its notes, failure and open choices, gone. */
  private discardLocal(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.windowOpenedAt = null;
    this.pending = null;
    this.apart.length = 0;
    this.notes.clear();
    this.extras.clear();
    this.extraEntities = [];
    this.clearFailure();
    const open = this.openConflicts;
    this.openConflicts = [];
    for (const c of open) this.options.onConflictClosed?.(c);
  }

  /** A save landed. Newer edits are rebased onto what it wrote when that was a merge; otherwise the screen shows it. */
  private landed(mine: D, sent: D, merged: boolean, message: CommitMessage): void {
    if (this.pending === null) {
      this.screen = sent;
      this.options.onDocument(sent);
      this.reportIdle();
    } else if (merged) {
      this.pending = this.rebase(mine, this.pending, sent, message);
      this.screen = this.pending;
      this.options.onDocument(this.pending);
    }
  }

  /** The other writer's changes into an edit made while a save was in flight; a clash between the two is a conflict. */
  private rebase(mine: D, newer: D, sent: D, message: CommitMessage): D {
    const { merged, conflicts } = this.options.merge(mine, newer, sent);
    this.raise(conflicts, message);
    return merged;
  }

  /** Conflicts found: nothing is written until the user chooses, and the screen shows the merge meanwhile. */
  private surface(merged: D, conflicts: MergeConflict[], mine: D, message: CommitMessage): SaveResult {
    const screen = this.pending === null ? merged : this.rebase(mine, this.pending, merged, message);
    if (this.pending !== null) this.pending = screen;
    this.screen = screen;
    this.options.onDocument(screen);
    this.raise(conflicts, message);
    this.clearFailure();
    this.reportIdle();
    return 'conflicts';
  }

  private raise(conflicts: MergeConflict[], message: CommitMessage): void {
    for (const c of conflicts) {
      if (this.openConflicts.some((open) => pathKey(open.path) === pathKey(c.path))) continue;
      const conflict: FileConflict = {
        ...c,
        file: this.options.path,
        resolve: (choice) => this.resolve(conflict, choice, message),
      };
      this.openConflicts.push(conflict);
      this.conflictCommits.set(conflict, message);
      this.options.onConflict(conflict);
    }
  }

  /** The chosen side's value goes in at the conflict's path, and only there: the rest of the merge stays as it was. */
  private async resolve(conflict: FileConflict, choice: 'mine' | 'theirs', message: CommitMessage): Promise<boolean> {
    // Free for a newer conflict on the same field, should the save find one.
    this.openConflicts = this.openConflicts.filter((open) => open !== conflict);
    this.options.onStatus('syncing');
    const result = await this.enqueue(async () => {
      const idle = this.pending === null;
      const doc = setAtPath(this.screen as D, conflict.path, choice === 'mine' ? conflict.mine : conflict.theirs);
      this.screen = doc;
      this.options.onDocument(doc);
      if (idle && this.synced && sameValue(doc, this.synced.content)) {
        // Keep theirs, with nothing else to write: the repository already holds it.
        this.clearFailure();
        this.reportIdle();
        return 'saved';
      }
      this.pending = doc;
      this.extras.set(`conflict:${pathKey(conflict.path)}`, `${message.subject} (conflict: ${choice === 'mine' ? 'used mine' : 'kept theirs'})`);
      this.extraEntities.push(...message.entities);
      return this.saveNext();
    });
    if (result === 'failed') this.openConflicts.push(conflict);
    return result !== 'failed';
  }

  private creationFailure(): string {
    return this.options.creationFailure ?? 'Something went wrong saving this change.';
  }

  private fail(error: unknown, fallback: string, content: D): SaveResult {
    return this.failWith(toReadOnlyState(error, fallback), content);
  }

  private failWith(cause: ReadOnlyState, content: D): SaveResult {
    this.failedContent = content;
    this.failedCause = cause;
    this.options.onStatus({ readOnly: this.failedCause });
    return 'failed';
  }

  /** The two failure fields are always set (by {@link fail}) and cleared together (§3, §9.9); every clearing
   * site calls this one method so they can never drift apart the way separately-written clears would. */
  private clearFailure(): void {
    this.failedContent = null;
    this.failedCause = null;
  }

  /** Synced only when nothing newer is waiting for its own save. */
  private reportIdle(): void {
    if (this.pending === null && this.waiting === 0 && this.timer === null && this.failedCause === null) this.options.onStatus('synced');
  }

  /**
   * The cache is a local convenience, not the source of truth: GitHub already has this write. A failure
   * here (storage full, private browsing) must not be reported as a failed save, and losing the entry
   * only means the next load re-fetches from GitHub.
   */
  private async cache(sent: D, sha: string): Promise<void> {
    try {
      await this.options.cache.set(this.options.path, { content: JSON.stringify(sent), sha });
    } catch (error) {
      // Survivable, unlike misreporting a write that succeeded; a full store is told (§3 Storage limits).
      if (isQuotaError(error)) this.options.onCacheFull?.();
    }
  }
}
