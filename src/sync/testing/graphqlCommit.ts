import { decodeBase64Utf8 } from '../../github/base64';
import { gitBlobSha, type CreateCommitOnBranchInput } from '../../github/client';

/** A fake data branch, as {@link answerCreateCommit} sees it. */
export interface FakeBranch {
  name: string;
  /** The commit the branch is at; null while it does not exist. */
  head: string | null;
  has: (path: string) => boolean;
  /** Lands a commit: writes and deletes its files, moves the branch and returns the new head. */
  land: (commit: { message: string; files: { path: string; content: string; sha: string }[]; deletes: string[] }) => string;
}

/**
 * GraphQL `createCommitOnBranch` (§10.3) for the unit and e2e fakes: one commit of several files, refused unless the
 * branch is at the expected head and every file to delete exists. A refusal is a 200 with errors, as GitHub sends it
 * (spike-findings.md). Returns the response body.
 */
export async function answerCreateCommit(requestBody: string, branch: FakeBranch): Promise<unknown> {
  const { input } = (JSON.parse(requestBody) as { variables: { input: CreateCommitOnBranchInput } }).variables;
  if (input.branch.branchName !== branch.name) throw new Error(`A GraphQL commit named the wrong branch: ${input.branch.branchName}`);
  const refused = (type: string, message: string) => ({ data: { createCommitOnBranch: null }, errors: [{ type, message }] });
  if (input.expectedHeadOid !== branch.head) return refused('STALE_DATA', `Expected branch to point to "${input.expectedHeadOid}" but it did not.`);
  const deletes = input.fileChanges.deletions.map((d) => d.path);
  if (deletes.some((path) => !branch.has(path))) return refused('NOT_FOUND', 'A path was requested for deletion which does not exist');
  const files = await Promise.all(
    input.fileChanges.additions.map(async ({ path, contents }) => {
      const content = decodeBase64Utf8(contents);
      return { path, content, sha: await gitBlobSha(content) };
    }),
  );
  const message = [input.message.headline, input.message.body].filter(Boolean).join('\n\n');
  return { data: { createCommitOnBranch: { commit: { oid: branch.land({ message, files, deletes }) } } } };
}
