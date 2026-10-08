import type { GithubClient } from '../github/client';
import { GithubApiError, toReadOnlyState } from '../github/errors';
import { distinctEntities, renderMessage, type FileWriter, type JointPart } from './FileWriter';
import type { WriteQueue } from './WriteQueue';

/** What a commit of several files needs of the repository it is made in. */
export interface JointCommitDeps {
  github: GithubClient;
  queue: WriteQueue;
  branch: string;
  /** Settles when the first pull of the dataset has (§3): nothing is committed before it. */
  ready: Promise<unknown>;
  /** The writer of the file at `path`. */
  writerOf: (path: string) => FileWriter<unknown> | undefined;
  /** Tells the pull a commit of this client's own wrote `paths`, leading on from `parent`. */
  recordSave: (paths: string[], commit: { sha: string; parent: string }) => void;
}

/**
 * One commit of the files' pending edits (§10.3). It goes ahead only while every file is still at the version its
 * edit was made on, read at the head the commit is pinned to, and is made again on a new head when another commit
 * lands first; otherwise each file saves on its own and merges with the newer version as any save does (§10.5).
 */
export function commitJointly(deps: JointCommitDeps, paths: string[]): void {
  void deps.ready.then(() =>
    deps.queue.run(async () => {
      const writers = paths.map((path) => deps.writerOf(path));
      const parts: [FileWriter<unknown>, JointPart<unknown>][] = [];
      for (const writer of writers) {
        const part = writer?.takeJoint();
        if (writer && part) parts.push([writer, part]);
      }
      // Each file given back saves on its own.
      const giveBack = () => {
        for (const [writer, part] of parts) writer.jointReturned(part);
      };
      if (parts.length < paths.length) {
        giveBack();
        for (const writer of writers) if (writer && !parts.some(([taken]) => taken === writer)) void writer.flush();
        return;
      }
      const message = renderMessage({
        subject: [...new Set(parts.map(([, part]) => part.message.subject))].join('; '),
        entities: distinctEntities(parts.flatMap(([, part]) => part.message.entities)),
      });
      const files = parts.map(([, part]) => ({ path: part.path, content: part.content }));
      try {
        const result = await deps.github.commitOnHead({
          branch: deps.branch,
          message,
          build: async (at) => {
            const root = await deps.github.listDirectory({ path: '', branch: at });
            const unchanged = parts.every(([, part]) => root.find((entry) => entry.path === part.path)?.sha === part.sha);
            return unchanged ? { files, deletes: [] } : null;
          },
        });
        if (result === 'stopped') return giveBack();
        parts.forEach(([writer, part], i) => writer.jointLanded(part, result.written[i].sha));
        if (result.parent) deps.recordSave(paths, { sha: result.commitSha, parent: result.parent });
      } catch (error) {
        // The branch kept moving, or its head can't be read: each file saves on its own, as it would without this commit.
        if (error instanceof GithubApiError && (error.cause_ === 'conflict' || error.cause_ === 'not-found')) return giveBack();
        const cause = toReadOnlyState(error, 'Something went wrong saving this change.');
        for (const [writer, part] of parts) writer.jointFailed(part, cause);
      }
    }),
  );
}
