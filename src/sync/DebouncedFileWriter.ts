import type { GithubClient } from '../github/client';
import { GithubApiError, type GithubFailureCause } from '../github/errors';
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

export type WriteStatus = 'synced' | 'syncing' | { readOnly: { cause: GithubFailureCause; message: string } };

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
      await fileCache.set(this.path, { content: JSON.stringify(mine), sha: result.sha });
      this.onCommitted(mine);
      this.onStatusChange('synced');
    } catch (error) {
      await this.handleWriteFailure(error, mine);
    }
  }

  private async handleWriteFailure(error: unknown, mine: T[]): Promise<void> {
    if (!(error instanceof GithubApiError)) {
      this.onStatusChange({ readOnly: { cause: 'unknown', message: 'Something went wrong saving this change.' } });
      return;
    }

    if (error.cause_ !== 'conflict') {
      this.onStatusChange({ readOnly: { cause: error.cause_, message: error.message } });
      return;
    }

    if (this.retriesRemaining <= 0) {
      this.onStatusChange({
        readOnly: { cause: 'conflict', message: 'Could not save after several retries — please retry.' },
      });
      return;
    }
    this.retriesRemaining -= 1;

    const theirsFile = await this.github.getFile({ path: this.path, branch: this.branch });
    const theirs = theirsFile ? (JSON.parse(theirsFile.content) as T[]) : [];
    const theirsSha = theirsFile?.sha ?? '';

    const { merged, conflicts } = mergeListField(this.synced.content, mine, theirs);

    if (conflicts.length > 0) {
      for (const conflict of conflicts) {
        const itemId = (conflict.field as unknown as string[])[0];
        this.onConflict({
          path: this.path,
          itemId,
          base: conflict.base,
          mine: conflict.mine as T,
          theirs: conflict.theirs as T,
          resolve: (choice) => {
            const chosen = choice === 'mine' ? (conflict.mine as T) : (conflict.theirs as T);
            const resolved = merged.map((item) => (item.id === itemId ? chosen : item));
            this.synced = { content: theirs, sha: theirsSha };
            return this.attemptWrite(resolved, theirsSha);
          },
        });
      }
      // Keep the non-conflicting part of the merge visible locally, but don't
      // write until every conflict on this file is resolved.
      this.synced = { content: theirs, sha: theirsSha };
      this.onCommitted(merged);
      this.onStatusChange('synced');
      return;
    }

    this.synced = { content: theirs, sha: theirsSha };
    await this.attemptWrite(merged, theirsSha);
  }
}
