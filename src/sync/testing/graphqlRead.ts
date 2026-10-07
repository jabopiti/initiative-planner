import { TRUNCATED } from '../../github/client';

/** What a fake has at a path for a GraphQL read: the file, null when there is none, or {@link TRUNCATED} when too large. */
export type FakeBlob = { content: string; sha: string } | null | typeof TRUNCATED;

/**
 * A recursive tree listing (§10.2) for the fakes, answered as GitHub does: each file a blob with its version, each
 * folder above one a tree entry.
 */
export function answerTree(commit: string, files: Iterable<[string, string]>): unknown {
  const tree: { path: string; mode: string; type: string; sha: string }[] = [];
  const folders = new Set<string>();
  for (const [path, sha] of files) {
    tree.push({ path, mode: '100644', type: 'blob', sha });
    for (let end = path.indexOf('/'); end > 0; end = path.indexOf('/', end + 1)) folders.add(path.slice(0, end));
  }
  for (const path of folders) tree.push({ path, mode: '040000', type: 'tree', sha: `tree-${path}` });
  return { sha: commit, tree, truncated: false };
}

/** Whether a GraphQL request body is a read (a query), not a commit (a mutation). */
export function isFilesQuery(requestBody: string): boolean {
  return /^\s*query\b/.test((JSON.parse(requestBody) as { query: string }).query);
}

/** The expressions a GraphQL read asks for, in the order of its fields (`f0`, `f1`, …), from its `"<ref>:<path>"` variables. */
function queried(requestBody: string): { ref: string; path: string }[] {
  const { variables } = JSON.parse(requestBody) as { variables: Record<string, string> };
  return Object.keys(variables)
    .filter((name) => /^e\d+$/.test(name))
    .sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)))
    .map((name) => {
      const colon = variables[name].indexOf(':');
      return { ref: variables[name].slice(0, colon), path: variables[name].slice(colon + 1) };
    });
}

/** The paths a GraphQL read asks for, in the order of its fields. */
export const queriedPaths = (requestBody: string): string[] => queried(requestBody).map(({ path }) => path);

/** The commit or branch a GraphQL read reads at. */
export const queriedRef = (requestBody: string): string | undefined => queried(requestBody)[0]?.ref;

/**
 * A GraphQL read of files (§10.2) for the unit and e2e fakes, answered as GitHub does: each field a blob with its oid
 * and text, `isTruncated` with a cut text for a file too large, or null for a path that does not exist.
 */
export async function answerFilesQuery(requestBody: string, read: (path: string) => FakeBlob | Promise<FakeBlob>): Promise<unknown> {
  const repository: Record<string, unknown> = {};
  const paths = queriedPaths(requestBody);
  for (const [i, path] of paths.entries()) {
    const blob = await read(path);
    repository[`f${i}`] =
      blob === null ? null : blob === TRUNCATED ? { oid: TRUNCATED, text: '{"cut', isTruncated: true } : { oid: blob.sha, text: blob.content, isTruncated: false };
  }
  return { data: { repository } };
}
