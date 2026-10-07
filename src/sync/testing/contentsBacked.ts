import { decodeBase64Utf8 } from '../../github/base64';
import { json } from './fakeGithub';
import { answerFilesQuery, answerTree, isFilesQuery, queriedRef } from './graphqlRead';

type Fetch = (url: string, init?: RequestInit) => Response | Promise<Response>;

/**
 * A pull's one listing and GraphQL reads (§10.2, slice 065), answered from a test's own `fetch` stub that serves the
 * Contents API: the listing from its root and `initiatives` listings, each file read from its Contents read. A read it
 * refuses (other than a 404) refuses the whole query, as a refused GraphQL request would. Every other request goes
 * to the stub as it is.
 */
export function contentsBacked(contents: Fetch): (url: string, init?: RequestInit) => Promise<Response> {
  return async (url, init) => {
    const { origin, pathname } = new URL(url);
    const method = init?.method ?? 'GET';
    const tree = method === 'GET' ? pathname.match(/^(.*)\/git\/trees\/([^/]+)$/) : null;
    const query = method === 'POST' && pathname.endsWith('/graphql') && typeof init?.body === 'string' && isFilesQuery(init.body) ? init.body : null;
    if (!tree && !query) return contents(url, init);

    /** What the stub answers for a Contents read of `path` at `ref`: null for a 404; a refusal is thrown. */
    const read = async <T>(repo: string, path: string, ref: string): Promise<T | null> => {
      const target = new URL(`${origin}${repo}/contents/${path}`);
      const response = await contents(`${target.origin}${target.pathname}?ref=${ref}`, { method: 'GET' });
      if (response.status === 404) return null;
      if (!response.ok) throw response;
      return (await response.json()) as T;
    };

    try {
      if (tree) {
        const [, repo, ref] = tree;
        type Entry = { path: string; sha: string; type: string };
        const list = async (dir: string) => {
          const body = await read<unknown>(repo, dir, ref);
          return Array.isArray(body) ? (body as Entry[]) : [];
        };
        const entries = (await Promise.all([list(''), list('initiatives')])).flat();
        if (entries.length === 0) return json({ message: 'Not Found' }, 404);
        return json(answerTree(ref, entries.filter((entry) => entry.type !== 'dir').map((entry): [string, string] => [entry.path, entry.sha])));
      }
      const { variables } = JSON.parse(query!) as { variables: { owner: string; name: string } };
      const repo = `/repos/${variables.owner}/${variables.name}`;
      const ref = queriedRef(query!) ?? '';
      return json(
        await answerFilesQuery(query!, async (path) => {
          const body = await read<{ content: string; sha: string }>(repo, path, ref);
          return body && { content: decodeBase64Utf8(body.content), sha: body.sha };
        }),
      );
    } catch (refused) {
      if (refused instanceof Response) return refused;
      throw refused;
    }
  };
}
