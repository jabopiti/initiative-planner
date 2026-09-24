import { parseJsonFile, type GithubClient } from '../github/client';
import { GithubApiError, toReadOnlyState } from '../github/errors';
import type { Initiative } from '../data/types';
import type { FileConflict, WriteStatus } from './DebouncedFileWriter';
import { mergeInitiative } from './mergeInitiative';
import type { WriteQueue } from './WriteQueue';

const COMMIT_DEBOUNCE_MS = 1000;
const MAX_RETRIES = 3;

/**
 * Writes one initiative's file (§10.2): a single record, not a list, so it can't share the array
 * writer behind the master files. The same rules apply: debounce, then commit with a plain-words
 * message (§10.3), and on a 409 re-read, three-way merge and retry (§10.5).
 */
interface WriteOpts {
  sha?: string;
  local?: Initiative;
  flush?: number;
}

export class InitiativeFileWriter {
  private pending: Initiative | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private retriesRemaining = MAX_RETRIES;
  /** Numbers each flush; a write that is not the newest one has later edits behind it. */
  private flushCount = 0;
  private notes = new Map<string, string>();

  constructor(
    private readonly path: string,
    private readonly branch: string,
    private readonly github: GithubClient,
    private readonly queue: WriteQueue,
    private readonly onStatusChange: (status: WriteStatus) => void,
    private readonly onConflict: (conflict: FileConflict<unknown>) => void,
    private readonly onMerged: (content: Initiative) => void,
    private synced: { content: Initiative; sha: string },
  ) {}

  /** Apply an edit to the in-memory value now and commit it once edits settle; a repeated `key` replaces its note. */
  schedule(next: Initiative, note?: { key: string; text: string }): void {
    this.pending = next;
    if (note) this.notes.set(note.key, note.text);
    this.onStatusChange('syncing');
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, COMMIT_DEBOUNCE_MS);
  }

  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
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
  private async attemptWrite(sent: Initiative, message: string, opts: WriteOpts = {}): Promise<void> {
    const { sha, local = sent, flush = this.flushCount } = opts;
    try {
      const result = await this.queue.run(() =>
        this.github.putFile({ path: this.path, branch: this.branch, content: JSON.stringify(sent), message, sha: sha ?? this.synced.sha }),
      );
      // The in-memory value already holds this edit (schedule applied it), and edits made while this
      // write was in flight are newer, so success reports nothing back into state, and reports
      // synced only when no newer edit is waiting for its own write.
      this.synced = { content: sent, sha: result.sha };
      if (this.pending === null && flush === this.flushCount) this.onStatusChange('synced');
      else if (this.pending !== null && sent !== local) {
        // The write was a merge with the repository's version: carry it into the newer edits.
        this.pending = mergeInitiative(local, this.pending, sent).merged;
        this.onMerged(this.pending);
      }
    } catch (error) {
      await this.handleWriteFailure(error, sent, message, flush);
    }
  }

  private async handleWriteFailure(error: unknown, mine: Initiative, message: string, flush: number): Promise<void> {
    if (!(error instanceof GithubApiError) || error.cause_ !== 'conflict') {
      this.onStatusChange({ readOnly: toReadOnlyState(error, 'Something went wrong saving this change.') });
      return;
    }
    if (this.retriesRemaining <= 0) {
      this.onStatusChange({ readOnly: { cause: 'conflict', message: 'Could not save after several retries — please retry.' } });
      return;
    }
    this.retriesRemaining -= 1;
    try {
      await this.retryAfterConflict(mine, message, flush);
    } catch (retryError) {
      this.onStatusChange({ readOnly: toReadOnlyState(retryError, 'Could not save this change after a conflict.') });
    }
  }

  private async retryAfterConflict(mine: Initiative, message: string, flush: number): Promise<void> {
    const theirsFile = await this.github.getFile({ path: this.path, branch: this.branch });
    if (!theirsFile) throw new Error('The initiative file is gone from the repository.');
    const theirs = parseJsonFile(theirsFile, mine);
    const { merged, conflicts } = mergeInitiative(this.synced.content, mine, theirs);

    if (conflicts.length === 0) {
      this.synced = { content: theirs, sha: theirsFile.sha };
      // Carries what the other writer changed into what the user sees, unless newer edits are waiting:
      // attemptWrite then rebases those onto the merge once it has landed.
      if (this.pending === null) this.onMerged(merged);
      await this.attemptWrite(merged, message, { sha: theirsFile.sha, local: mine, flush });
      return;
    }

    // Same rule as the master files: nothing is written until every conflict is resolved, and each
    // resolution builds on the latest synced document, since resolving one advances it.
    this.synced = { content: merged, sha: theirsFile.sha };
    for (const conflict of conflicts) {
      this.onConflict({
        path: this.path,
        itemId: conflict.itemId,
        base: conflict.base,
        mine: conflict.mine,
        theirs: conflict.theirs,
        resolve: (choice) => {
          const resolved = conflict.apply(this.synced.content, choice === 'mine' ? conflict.mine : conflict.theirs);
          this.onMerged(resolved);
          return this.attemptWrite(resolved, message);
        },
      });
    }
    if (this.pending === null) this.onMerged(merged);
    else {
      this.pending = mergeInitiative(mine, this.pending, merged).merged;
      this.onMerged(this.pending);
    }
    if (this.pending === null) this.onStatusChange('synced');
  }
}
