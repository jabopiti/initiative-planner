/** What a fake has at a path for a GraphQL read: the file, null when there is none, or `'truncated'` when too large. */
export type FakeBlob = { content: string; sha: string } | null | 'truncated';

/** Whether a GraphQL request body is a read (a query), not a commit (a mutation). */
export function isFilesQuery(requestBody: string): boolean {
  return /^\s*query\b/.test((JSON.parse(requestBody) as { query: string }).query);
}

/** The paths a GraphQL read asks for, in the order of its fields (`f0`, `f1`, …), from its `"<ref>:<path>"` variables. */
export function queriedPaths(requestBody: string): string[] {
  const { variables } = JSON.parse(requestBody) as { variables: Record<string, string> };
  return Object.keys(variables)
    .filter((name) => /^e\d+$/.test(name))
    .sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)))
    .map((name) => variables[name].slice(variables[name].indexOf(':') + 1));
}

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
      blob === null ? null : blob === 'truncated' ? { oid: 'truncated', text: '{"cut', isTruncated: true } : { oid: blob.sha, text: blob.content, isTruncated: false };
  }
  return { data: { repository } };
}
