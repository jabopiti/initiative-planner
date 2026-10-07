import { decodeBase64Utf8 } from '../../github/base64';
import { answerFilesQuery, isFilesQuery, type FakeBlob } from './graphqlRead';

type Fetch = (url: string, init?: RequestInit) => Response | Promise<Response>;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

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

    const tree = pathname.match(/^(.*)\/git\/trees\/([^/]+)$/);
    if (method === 'GET' && tree) {
      const [, repo, ref] = tree;
      const list = async (dir: string) => {
        const response = await contents(`${origin}${repo}/contents/${dir}?ref=${ref}`, { method: 'GET' });
        if (response.status === 404) return [];
        if (!response.ok) throw response;
        const body = (await response.json()) as unknown;
        return Array.isArray(body) ? (body as { path: string; sha: string; type: string }[]) : [];
      };
      try {
        const [root, initiatives] = await Promise.all([list(''), list('initiatives')]);
        if (root.length === 0 && initiatives.length === 0) return json({ message: 'Not Found' }, 404);
        const entries = [...root, ...initiatives].map(({ path, sha, type }) => ({ path, sha, type: type === 'dir' ? 'tree' : 'blob' }));
        return json({ sha: ref, tree: entries, truncated: false });
      } catch (refused) {
        if (refused instanceof Response) return refused;
        throw refused;
      }
    }

    if (method === 'POST' && pathname.endsWith('/graphql') && typeof init?.body === 'string' && isFilesQuery(init.body)) {
      const { variables } = JSON.parse(init.body) as { variables: Record<string, string> };
      const repo = `${origin}/repos/${variables.owner}/${variables.name}`;
      const ref = variables.e0.slice(0, variables.e0.indexOf(':'));
      try {
        return json(
          await answerFilesQuery(init.body, async (path): Promise<FakeBlob> => {
            const response = await contents(`${origin}${new URL(`${repo}/contents/${path}`).pathname}?ref=${ref}`, { method: 'GET' });
            if (response.status === 404) return null;
            if (!response.ok) throw response;
            const body = (await response.json()) as { content: string; sha: string };
            return { content: decodeBase64Utf8(body.content), sha: body.sha };
          }),
        );
      } catch (refused) {
        if (refused instanceof Response) return refused;
        throw refused;
      }
    }

    return contents(url, init);
  };
}
