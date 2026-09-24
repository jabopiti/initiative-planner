import { fileCache } from '../cache/db';
import type { GithubClient } from '../github/client';
import { GithubApiError, toReadOnlyState, type ReadOnlyState } from '../github/errors';
import type { DocumentConflict, DocumentMerge } from './documentMerge';
import type { WriteQueue } from './WriteQueue';

const COMMIT_DEBOUNCE_MS = 1000;
const MAX_RETRIES = 3;

export type WriteStatus = 'synced' | 'syncing' | { readOnly: ReadOnlyState };

/** How one save ended: written, held back for the user to resolve a conflict, or refused (the status says why). */
export type SaveResult = 'saved' | 'conflicts' | 'failed';

/** A same-field conflict a save found (§3, §10.5), for the banner. Resolving it is a new edit like any other. */
export interface FileConflict {
  path: string;
  itemId: string;
  base: unknown;
  mine: unknown;
  theirs: unknown;
  /** Resolves true once the choice is saved (or needed no write) or replaced by a newer conflict; false when the write failed. */
  resolve: (choice: 'mine' | 'theirs') => Promise<boolean>;
}

export interface SyncedFile<D> {
  content: D;
  sha: string;
}

export interface FileWriterOptions<D> {
  path: string;
  branch: string;
  github: GithubClient;
  queue: WriteQueue;
  merge: DocumentMerge<D>;
  /** What the file holds when a re-read after a 409 finds it gone; null when its absence is an error. */
  whenMissing: D | null;
  /** The file as last read, or null while it does not exist yet: the first save then creates it. */
  initial: SyncedFile<D> | null;
  /** What to tell the user when that first save fails. */
  creationFailure?: string;
  onStatus: (status: WriteStatus) => void;
  onConflict: (conflict: FileConflict) => void;
  /** The document on screen should now be this one: a save landed, or a merge brought in the other writer's changes. */
  onDocument: (doc: D) => void;
}

const sameDocument = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * The one writer behind every file in the data branch (§10.2): debounce, save, merge on conflict,
 * report status. A file is a document `D`, merged as `merge` says (lists by id for the master files,
 * field by field for an initiative). Creating the file is its first save.
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
  /** What changed since the last save, keyed so a repeated edit replaces its earlier note (§10.3). */
  private readonly notes = new Map<string, string>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** Saves are chained so each starts after the one before it has finished. */
  private tail: Promise<unknown> = Promise.resolve();
  /** Saves requested and not yet started. */
  private waiting = 0;
  /** The last save failed and nothing has been saved since, so an idle writer must not say synced. */
  private failed = false;
  private openConflicts: FileConflict[] = [];

  constructor(private readonly options: FileWriterOptions<D>) {
    this.synced = options.initial;
    this.screen = options.initial?.content ?? null;
  }

  /**
   * Apply an edit to the on-screen document now and save it once edits settle. `note` describes the change
   * in plain words naming the entity (§10.3); edits within one window are joined, and a later note with
   * the same `key` replaces an earlier one.
   */
  schedule(next: D, note?: { key: string; text: string }): void {
    this.screen = next;
    this.pending = next;
    this.failed = false;
    if (note) this.notes.set(note.key, note.text);
    this.options.onStatus('syncing');
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, COMMIT_DEBOUNCE_MS);
  }

  /** Save what is pending now, without waiting out the debounce (creation, page unload), after any save in flight. */
  flush(): Promise<SaveResult> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    return this.enqueue(() => this.saveNext());
  }

  /** Runs `step` once every save before it has finished. */
  private enqueue<T>(step: () => Promise<T>): Promise<T> {
    this.waiting += 1;
    const result = this.tail.then(() => {
      this.waiting -= 1;
      return step();
    });
    this.tail = result.catch(() => undefined);
    return result;
  }

  private async saveNext(): Promise<SaveResult> {
    if (this.pending === null) {
      this.reportIdle();
      return 'saved';
    }
    const mine = this.pending;
    this.pending = null;
    const message = this.notes.size > 0 ? [...this.notes.values()].join('; ') : `${this.options.path}: update`;
    this.notes.clear();
    return this.save(mine, message);
  }

  private async save(mine: D, message: string): Promise<SaveResult> {
    let sent = mine;
    let merged = false;
    for (let retries = MAX_RETRIES; ; retries -= 1) {
      try {
        const { sha } = await this.options.queue.run(() =>
          this.options.github.putFile({
            path: this.options.path,
            branch: this.options.branch,
            content: JSON.stringify(sent),
            message,
            sha: this.synced?.sha,
          }),
        );
        this.synced = { content: sent, sha };
        this.failed = false;
        this.landed(mine, sent, merged, message);
        await this.cache(sent, sha);
        return 'saved';
      } catch (error) {
        const stale = error instanceof GithubApiError && error.cause_ === 'conflict';
        const exists = this.synced === null && error instanceof GithubApiError && error.status === 422;
        if (!stale && !exists) return this.fail(error, this.synced ? 'Something went wrong saving this change.' : this.creationFailure());
        if (retries <= 0) {
          return this.fail(
            new GithubApiError('Could not save after several retries — please retry.', 'conflict'),
            'Could not save after several retries — please retry.',
          );
        }
        // A wrapped re-read: a failure anywhere in the retry must still resolve to a reported status,
        // since every caller of flush() and schedule() discards the promise without a catch of its own.
        try {
          if (this.synced === null && !exists) continue; // Creating: nothing to merge with, put it again.
          const outcome = await this.reread(mine);
          if (outcome === null) continue;
          if (outcome.conflicts.length > 0) return this.surface(outcome.merged, outcome.conflicts, mine, message);
          sent = outcome.merged;
          merged = true;
        } catch (retryError) {
          return this.fail(retryError, 'Could not save this change after a conflict.');
        }
      }
    }
  }

  /**
   * Re-read the file and merge the user's version with it against the last-synced one (§10.5). The
   * repository's version becomes the last-synced one, so the next put carries its sha. Null when a
   * file that already existed while creating turned out to be gone again.
   */
  private async reread(mine: D) {
    const file = await this.options.github.getFile({ path: this.options.path, branch: this.options.branch });
    if (file === null && this.options.whenMissing === null && this.synced !== null) {
      throw new Error('The file is gone from the repository.');
    }
    if (file === null && this.synced === null) return null;
    const theirs = file ? (JSON.parse(file.content) as D) : (this.options.whenMissing as D);
    // A file created by an earlier attempt of this same save: it is now the base.
    const base = this.synced?.content ?? theirs;
    const outcome = this.options.merge(base, mine, theirs);
    this.synced = { content: theirs, sha: file?.sha ?? '' };
    return outcome;
  }

  /** A save landed. Newer edits are rebased onto what it wrote when that was a merge; otherwise the screen shows it. */
  private landed(mine: D, sent: D, merged: boolean, message: string): void {
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
  private rebase(mine: D, newer: D, sent: D, message: string): D {
    const { merged, conflicts } = this.options.merge(mine, newer, sent);
    this.raise(conflicts, message);
    return merged;
  }

  /** Conflicts found: nothing is written until the user chooses, and the screen shows the merge meanwhile. */
  private surface(merged: D, conflicts: DocumentConflict<D>[], mine: D, message: string): SaveResult {
    const screen = this.pending === null ? merged : this.rebase(mine, this.pending, merged, message);
    if (this.pending !== null) this.pending = screen;
    this.screen = screen;
    this.options.onDocument(screen);
    this.raise(conflicts, message);
    this.failed = false;
    this.reportIdle();
    return 'conflicts';
  }

  private raise(conflicts: DocumentConflict<D>[], message: string): void {
    for (const c of conflicts) {
      if (this.openConflicts.some((open) => open.itemId === c.itemId)) continue;
      const conflict: FileConflict = {
        path: this.options.path,
        itemId: c.itemId,
        base: c.base,
        mine: c.mine,
        theirs: c.theirs,
        resolve: (choice) => this.resolve(conflict, c, choice, message),
      };
      this.openConflicts.push(conflict);
      this.options.onConflict(conflict);
    }
  }

  private async resolve(conflict: FileConflict, c: DocumentConflict<D>, choice: 'mine' | 'theirs', message: string): Promise<boolean> {
    // Free for a newer conflict on the same field, should the save find one.
    this.openConflicts = this.openConflicts.filter((open) => open !== conflict);
    this.options.onStatus('syncing');
    const result = await this.enqueue(async () => {
      const idle = this.pending === null;
      const doc = c.apply(this.screen as D, choice === 'mine' ? c.mine : c.theirs);
      this.screen = doc;
      this.options.onDocument(doc);
      if (idle && this.synced && sameDocument(doc, this.synced.content)) {
        this.failed = false; // Keep theirs, with nothing else to write: the repository already holds it.
        this.reportIdle();
        return 'saved';
      }
      this.pending = doc;
      this.notes.set(`conflict:${c.itemId}`, `${message} (conflict: ${choice === 'mine' ? 'used mine' : 'kept theirs'})`);
      return this.saveNext();
    });
    if (result === 'failed') this.openConflicts.push(conflict);
    return result !== 'failed';
  }

  private creationFailure(): string {
    return this.options.creationFailure ?? 'Something went wrong saving this change.';
  }

  private fail(error: unknown, fallback: string): SaveResult {
    this.failed = true;
    this.options.onStatus({ readOnly: toReadOnlyState(error, fallback) });
    return 'failed';
  }

  /** Synced only when nothing newer is waiting for its own save. */
  private reportIdle(): void {
    if (this.pending === null && this.waiting === 0 && this.timer === null && !this.failed) this.options.onStatus('synced');
  }

  /**
   * The cache is a local convenience, not the source of truth: GitHub already has this write. A failure
   * here (storage full, private browsing) must not be reported as a failed save, and losing the entry
   * only means the next load re-fetches from GitHub.
   */
  private async cache(sent: D, sha: string): Promise<void> {
    try {
      await fileCache.set(this.options.path, { content: JSON.stringify(sent), sha });
    } catch {
      // Survivable, unlike misreporting a write that succeeded.
    }
  }
}
