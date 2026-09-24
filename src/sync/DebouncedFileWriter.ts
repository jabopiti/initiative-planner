import { parseJsonFile, type GithubClient } from '../github/client';
import { GithubApiError, toReadOnlyState, type ReadOnlyState } from '../github/errors';
import { fileCache } from '../cache/db';
import { mergeListField, type Identified } from './merge';
import type { WriteQueue } from './WriteQueue';

const COMMIT_DEBOUNCE_MS = 1000;
const MAX_RETRIES = 3;

export interface FileConflict<T> {
  path: string;
  itemId: string;
  base: unknown;
  mine: T;
  theirs: T;
  /** Resolve the conflict: keep the locally-typed value, or accept the repository's. */
  resolve: (choice: 'mine' | 'theirs') => Promise<void>;
}

export interface SyncedFile<T extends Identified> {
  content: T[];
  sha: string;
}

export type WriteStatus = 'synced' | 'syncing' | { readOnly: ReadOnlyState };

/**
 * Writes one array-shaped master data file (§10.2), applying §10.3's
 * debounce-then-commit and 409-retry-with-merge (§10.5) rules. Per-initiative
 * files use InitiativeFileWriter, which merges them field by field.
 */
interface WriteOpts<T> {
  sha?: string;
  local?: T[];
  flush?: number;
}

export class DebouncedFileWriter<T extends Identified> {
  private synced: SyncedFile<T>;
  private pending: T[] | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private retriesRemaining = MAX_RETRIES;
  /** Numbers each flush; a write that is not the newest one has later edits behind it. */
  private flushCount = 0;
  /** What changed since the last commit, keyed so a repeated edit replaces its earlier note (§10.3). */
  private notes = new Map<string, string>();

  constructor(
    private readonly path: string,
    private readonly branch: string,
    private readonly github: GithubClient,
    private readonly queue: WriteQueue,
    private readonly onStatusChange: (status: WriteStatus) => void,
    private readonly onConflict: (conflict: FileConflict<T>) => void,
    private readonly onCommitted: (content: T[]) => void,
    initial: SyncedFile<T>,
  ) {
    this.synced = initial;
  }

  /**
   * Apply a local edit immediately to the in-memory value, and schedule the commit.
   * `note` describes the change in plain words naming the entity (§10.3); edits within one
   * debounce window are joined, and a later note with the same `key` replaces an earlier one.
   */
  schedule(next: T[], note?: { key: string; text: string }): void {
    this.pending = next;
    if (note) this.notes.set(note.key, note.text);
    this.onStatusChange('syncing');
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, COMMIT_DEBOUNCE_MS);
  }

  /** Write immediately, skipping the debounce window (tests, and page-unload). */
  async flush(): Promise<void> {
    if (this.pending === null) return;
    const mine = this.pending;
    this.pending = null;
    const message = this.notes.size > 0 ? [...this.notes.values()].join('; ') : `${this.path}: update`;
    this.notes.clear();
    this.retriesRemaining = MAX_RETRIES;
    await this.attemptWrite(mine, message, { flush: (this.flushCount += 1) });
  }

  /**
   * Puts `sent` to the file. `sha` is read when the write reaches the front of the queue (a write
   * queued behind an earlier one would otherwise carry a stale sha and always conflict), unless the
   * caller has just fetched one. `local` is the value the user's edits were built on, when `sent`
   * is a merge of it with the repository's version. `flush` numbers the write (absent for a resolution).
   */
  private async attemptWrite(sent: T[], message: string, opts: WriteOpts<T> = {}): Promise<void> {
    const { sha, local = sent, flush = this.flushCount } = opts;
    try {
      const result = await this.queue.run(() =>
        this.github.putFile({
          path: this.path,
          branch: this.branch,
          content: JSON.stringify(sent),
          message,
          sha: sha ?? this.synced.sha,
        }),
      );
      this.synced = { content: sent, sha: result.sha };
      this.settle(sent, local, flush);
      // The cache is a local convenience, not the source of truth — GitHub already has this
      // write. A failure here (storage full, private browsing) must not be reported as a
      // failed save, since the save already succeeded.
      try {
        await fileCache.set(this.path, { content: JSON.stringify(sent), sha: result.sha });
      } catch {
        // Losing the cache entry just means the next load re-fetches from GitHub instead of
        // the cache — survivable, unlike misreporting a write that actually succeeded.
      }
    } catch (error) {
      await this.handleWriteFailure(error, sent, message, flush);
    }
  }

  /**
   * A write landed. Edits made while it was in flight are newer than what it wrote, so they stay in
   * state and are reported synced only when their own write lands; when the write was a merge with the
   * repository's version, those edits are rebased onto it so the other writer's changes are not lost.
   */
  private settle(sent: T[], local: T[], flush: number): void {
    if (this.pending === null && flush === this.flushCount) {
      this.onCommitted(sent);
      this.onStatusChange('synced');
    } else if (this.pending !== null && sent !== local) {
      this.pending = mergeListField(local, this.pending, sent).merged;
      this.onCommitted(this.pending);
    }
  }

  private async handleWriteFailure(error: unknown, mine: T[], message: string, flush: number): Promise<void> {
    if (!(error instanceof GithubApiError) || error.cause_ !== 'conflict') {
      this.onStatusChange({ readOnly: toReadOnlyState(error, 'Something went wrong saving this change.') });
      return;
    }

    if (this.retriesRemaining <= 0) {
      this.onStatusChange({
        readOnly: { cause: 'conflict', message: 'Could not save after several retries — please retry.' },
      });
      return;
    }
    this.retriesRemaining -= 1;

    // Wrapped: a failure anywhere in the retry itself (the re-fetch, or a recursive write)
    // must still resolve to a reported readOnly state rather than an unhandled rejection —
    // every caller of flush()/schedule() discards this promise without a catch of its own.
    try {
      await this.retryAfterConflict(mine, message, flush);
    } catch (retryError) {
      this.onStatusChange({ readOnly: toReadOnlyState(retryError, 'Could not save this change after a conflict.') });
    }
  }

  private async retryAfterConflict(mine: T[], message: string, flush: number): Promise<void> {
    const theirsFile = await this.github.getFile({ path: this.path, branch: this.branch });
    const theirs = parseJsonFile(theirsFile, [] as T[]);
    const theirsSha = theirsFile?.sha ?? '';

    const { merged, conflicts } = mergeListField(this.synced.content, mine, theirs);

    if (conflicts.length > 0) {
      // this.synced.content becomes `merged`, not raw `theirs`: it must carry every
      // conflict's default (theirs-side) value and any mine-only addition, because each
      // conflict's resolve() below reads this.synced fresh at call time — resolving one
      // conflict writes and advances this.synced, so a second resolve() started afterwards
      // must build on that write's result, not on a stale snapshot from before either ran.
      this.synced = { content: merged, sha: theirsSha };

      for (const conflict of conflicts) {
        this.onConflict({
          path: this.path,
          itemId: conflict.itemId,
          base: conflict.base,
          mine: conflict.mine,
          theirs: conflict.theirs,
          resolve: (choice) => {
            // Only the conflicting fields take the chosen side; the rest of the item keeps its clean merge.
            const chosen = (item: T): T =>
              choice === 'mine'
                ? { ...item, ...Object.fromEntries(conflict.fields.map((f) => [f, (conflict.mine as Record<string, unknown>)[f]])) }
                : item;
            const resolved = this.synced.content.map((item) => (item.id === conflict.itemId ? chosen(item) : item));
            return this.attemptWrite(resolved, message);
          },
        });
      }
      // Keep the clean part of the merge visible locally. Each resolution is written as it is chosen.
      this.onCommitted(merged);
      this.onStatusChange('synced');
      return;
    }

    this.synced = { content: theirs, sha: theirsSha };
    await this.attemptWrite(merged, message, { sha: theirsSha, local: mine, flush });
  }
}
