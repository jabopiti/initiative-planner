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
 * debounce-then-commit and 409-retry-with-merge (§10.5) rules. Not used for
 * per-initiative files, which are created once and never merged in slice 003.
 */
export class DebouncedFileWriter<T extends Identified> {
  private synced: SyncedFile<T>;
  private pending: T[] | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private retriesRemaining = MAX_RETRIES;

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

  /** Apply a local edit immediately to the in-memory value, and schedule the commit. */
  schedule(next: T[]): void {
    this.pending = next;
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
    this.retriesRemaining = MAX_RETRIES;
    await this.attemptWrite(mine, this.synced.sha);
  }

  private async attemptWrite(mine: T[], sha: string): Promise<void> {
    try {
      const result = await this.queue.run(() =>
        this.github.putFile({
          path: this.path,
          branch: this.branch,
          content: JSON.stringify(mine),
          message: `${this.path}: update`,
          sha,
        }),
      );
      this.synced = { content: mine, sha: result.sha };
      this.onCommitted(mine);
      this.onStatusChange('synced');
      // The cache is a local convenience, not the source of truth — GitHub already has this
      // write. A failure here (storage full, private browsing) must not be reported as a
      // failed save, since the save already succeeded.
      try {
        await fileCache.set(this.path, { content: JSON.stringify(mine), sha: result.sha });
      } catch {
        // Losing the cache entry just means the next load re-fetches from GitHub instead of
        // the cache — survivable, unlike misreporting a write that actually succeeded.
      }
    } catch (error) {
      await this.handleWriteFailure(error, mine);
    }
  }

  private async handleWriteFailure(error: unknown, mine: T[]): Promise<void> {
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
      await this.retryAfterConflict(mine);
    } catch (retryError) {
      this.onStatusChange({ readOnly: toReadOnlyState(retryError, 'Could not save this change after a conflict.') });
    }
  }

  private async retryAfterConflict(mine: T[]): Promise<void> {
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
            const chosen = choice === 'mine' ? conflict.mine : conflict.theirs;
            const resolved = this.synced.content.map((item) => (item.id === conflict.itemId ? chosen : item));
            return this.attemptWrite(resolved, this.synced.sha);
          },
        });
      }
      // Keep the non-conflicting part of the merge visible locally, but don't
      // write until every conflict on this file is resolved.
      this.onCommitted(merged);
      this.onStatusChange('synced');
      return;
    }

    this.synced = { content: theirs, sha: theirsSha };
    await this.attemptWrite(merged, theirsSha);
  }
}
