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
export class InitiativeFileWriter {
  private pending: Initiative | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private retriesRemaining = MAX_RETRIES;
  private notes = new Map<string, string>();
  private message: string;

  constructor(
    private readonly path: string,
    private readonly branch: string,
    private readonly github: GithubClient,
    private readonly queue: WriteQueue,
    private readonly onStatusChange: (status: WriteStatus) => void,
    private readonly onConflict: (conflict: FileConflict<unknown>) => void,
    private readonly onMerged: (content: Initiative) => void,
    private synced: { content: Initiative; sha: string },
  ) {
    this.message = `${path}: update`;
  }

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
    this.message = this.notes.size > 0 ? [...this.notes.values()].join('; ') : `${this.path}: update`;
    this.notes.clear();
    this.retriesRemaining = MAX_RETRIES;
    await this.attemptWrite(mine, this.synced.sha);
  }

  private async attemptWrite(mine: Initiative, sha: string): Promise<void> {
    try {
      const result = await this.queue.run(() =>
        this.github.putFile({ path: this.path, branch: this.branch, content: JSON.stringify(mine), message: this.message, sha }),
      );
      // The in-memory value already holds this edit (schedule applied it), and edits made while this
      // write was in flight are newer, so success reports nothing back into state.
      this.synced = { content: mine, sha: result.sha };
      this.onStatusChange('synced');
    } catch (error) {
      await this.handleWriteFailure(error, mine);
    }
  }

  private async handleWriteFailure(error: unknown, mine: Initiative): Promise<void> {
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
      await this.retryAfterConflict(mine);
    } catch (retryError) {
      this.onStatusChange({ readOnly: toReadOnlyState(retryError, 'Could not save this change after a conflict.') });
    }
  }

  private async retryAfterConflict(mine: Initiative): Promise<void> {
    const theirsFile = await this.github.getFile({ path: this.path, branch: this.branch });
    if (!theirsFile) throw new Error('The initiative file is gone from the repository.');
    const theirs = parseJsonFile(theirsFile, mine);
    const { merged, conflicts } = mergeInitiative(this.synced.content, mine, theirs);

    if (conflicts.length === 0) {
      this.synced = { content: theirs, sha: theirsFile.sha };
      this.onMerged(merged); // carries what the other writer changed into what the user sees
      await this.attemptWrite(merged, theirsFile.sha);
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
          return this.attemptWrite(resolved, this.synced.sha);
        },
      });
    }
    this.onMerged(merged);
    this.onStatusChange('synced');
  }
}
