/**
 * What GitHub answers for a listing of the data branch's root (§10.2): every master file with a version.
 * For tests that serve each file from their own `fetch` stub. A first open compares nothing, so the versions
 * only need to be present.
 */
export function rootListing(): Response {
  const names = ['dataset', 'roles', 'countries', 'teams', 'people', 'memberships'].map((n) => `${n}.json`);
  return new Response(JSON.stringify(names.map((name) => ({ name, path: name, sha: `sha-${name}`, type: 'file' }))), { status: 200 });
}
