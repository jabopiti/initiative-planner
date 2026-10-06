// GraphQL spike for slice 064 (scope item 0). Needs Node 18+ and a fine-grained token with Contents read and write,
// in GITHUB_TOKEN or VITE_DEV_TOKEN:
//   node scripts/spike-graphql.mjs > spike-report.txt
// Behind a proxy (HTTPS_PROXY), add NODE_USE_ENV_PROXY=1. A Claude Code cloud session cannot run it: its proxy refuses
// api.github.com/graphql.
// It works only on a throwaway branch `spike-graphql`, copied from `data` and deleted at the end (also on failure).
// The `data` branch is read, never written. The token is read from the environment and never printed.
import { createHash } from 'node:crypto';

const OWNER = 'jabopiti';
const REPO = 'initiative-planner';
const DATA = 'data';
const SPIKE = 'spike-graphql';
const ORIGIN = 'https://jabopiti.github.io'; // the Pages origin the app runs on
const TOKEN = process.env.GITHUB_TOKEN || process.env.VITE_DEV_TOKEN;
if (!TOKEN) throw new Error('Set GITHUB_TOKEN or VITE_DEV_TOKEN');

const REST = `https://api.github.com/repos/${OWNER}/${REPO}`;
const report = (q, ...lines) => console.log(`\n## ${q}\n${lines.map((l) => `- ${l}`).join('\n')}`);
const short = (v) => JSON.stringify(v)?.slice(0, 300);
const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');
const blobSha = (s) => createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${Buffer.byteLength(s)}\0`), Buffer.from(s)])).digest('hex');
const rateHeaders = (h) => `resource=${h.get('x-ratelimit-resource')} used=${h.get('x-ratelimit-used')} remaining=${h.get('x-ratelimit-remaining')}`;

async function rest(method, path, body) {
  const r = await fetch(`${REST}/${path}`, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
    body: body && JSON.stringify(body),
  });
  const text = await r.text();
  return { status: r.status, json: text ? JSON.parse(text) : null, h: r.headers };
}

async function gql(query, variables = {}) {
  const t0 = Date.now();
  const r = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const text = await r.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 300) }; }
  return { status: r.status, json, h: r.headers, ms: Date.now() - t0, bytes: JSON.stringify({ query, variables }).length };
}

const commitOnBranch = (expectedHeadOid, headline, body, additions, deletions = []) =>
  gql(
    `mutation($input: CreateCommitOnBranchInput!) {
      createCommitOnBranch(input: $input) { commit { oid message signature { isValid state } } }
    }`,
    {
      input: {
        branch: { repositoryNameWithOwner: `${OWNER}/${REPO}`, branchName: SPIKE },
        expectedHeadOid,
        message: { headline, body },
        fileChanges: { additions: additions.map(([path, text]) => ({ path, contents: b64(text) })), deletions: deletions.map((path) => ({ path })) },
      },
    },
  );

let spikeCreated = false;
try {
  // Q1 — can a browser on the Pages origin call /graphql? (the CORS preflight a browser sends first)
  const pre = await fetch('https://api.github.com/graphql', {
    method: 'OPTIONS',
    headers: { Origin: ORIGIN, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization,content-type' },
  });
  report('Q1 CORS preflight for /graphql',
    `status ${pre.status}`,
    `allow-origin: ${pre.headers.get('access-control-allow-origin')}`,
    `allow-headers: ${pre.headers.get('access-control-allow-headers')}`,
    `allow-methods: ${pre.headers.get('access-control-allow-methods')}`,
    `expose-headers: ${pre.headers.get('access-control-expose-headers')}`);

  // Q2 — does the fine-grained token work for GraphQL, and what does a query cost?
  const head = await gql(`query { rateLimit { cost limit remaining resetAt used }
    repository(owner: "${OWNER}", name: "${REPO}") { ref(qualifiedName: "refs/heads/${DATA}") { target { oid } } } }`);
  const dataHead = head.json.data?.repository?.ref?.target?.oid;
  report('Q2 token works for GraphQL', `status ${head.status}`, `data head ${dataHead?.slice(0, 7)}`, `rateLimit ${short(head.json.data?.rateLimit)}`, `headers ${rateHeaders(head.h)}`, `errors ${short(head.json.errors)}`);
  if (!dataHead) throw new Error('GraphQL query failed; stopping.');

  // Q4a — listing root + initiatives at one commit, in one query
  const listing = await gql(`query { rateLimit { cost }
    repository(owner: "${OWNER}", name: "${REPO}") {
      root: object(expression: "${dataHead}:") { ... on Tree { entries { name type oid } } }
      initiatives: object(expression: "${dataHead}:initiatives") { ... on Tree { entries { name type oid } } } } }`);
  const initiativeFiles = (listing.json.data?.repository?.initiatives?.entries ?? []).filter((e) => e.name.endsWith('.json'));
  report('Q4a listing in one query', `status ${listing.status}`, `root entries ${listing.json.data?.repository?.root?.entries?.length}`, `initiative files ${initiativeFiles.length}`, `cost ${listing.json.data?.rateLimit?.cost}`, `${listing.ms} ms`);

  // Q4b — many files in one query, by alias; is the text whole and is the oid the REST sha?
  const paths = ['dataset.json', 'roles.json', 'countries.json', 'teams.json', 'people.json', 'memberships.json', ...initiativeFiles.map((e) => `initiatives/${e.name}`)];
  const aliases = paths.map((p, i) => `f${i}: object(expression: ${JSON.stringify(`${dataHead}:${p}`)}) { ... on Blob { oid byteSize isTruncated isBinary text } }`).join('\n');
  const batch = await gql(`query { rateLimit { cost } repository(owner: "${OWNER}", name: "${REPO}") { ${aliases} } }`);
  const blobs = Object.values(batch.json.data?.repository ?? {}).filter(Boolean);
  const restSample = await rest('GET', `contents/${paths[0]}?ref=${DATA}`);
  const first = batch.json.data?.repository?.f0;
  report('Q4b batch read of every data file',
    `status ${batch.status}, ${paths.length} files asked, ${blobs.length} returned, cost ${batch.json.data?.rateLimit?.cost}, ${batch.ms} ms`,
    `any truncated: ${blobs.some((b) => b.isTruncated)}`,
    `oid equals REST Contents sha: ${first?.oid === restSample.json?.sha}`,
    `text equals REST content: ${first?.text === Buffer.from(restSample.json?.content ?? '', 'base64').toString('utf8')}`,
    `errors ${short(batch.json.errors)}`);

  // Spike branch from the data head (REST, as the app would)
  const mk = await rest('POST', 'git/refs', { ref: `refs/heads/${SPIKE}`, sha: dataHead });
  spikeCreated = mk.status === 201;
  report('setup', `create ${SPIKE}: ${mk.status}`);
  if (!spikeCreated) throw new Error(`Could not create ${SPIKE}: ${short(mk.json)}`);

  // Q3 — one commit: two additions, one deletion, our subject + trailer lines, with the head check
  const fileA = JSON.stringify({ spike: 'a', text: 'Zürich – € ✓' });
  const fileB = JSON.stringify({ spike: 'b' });
  const victim = initiativeFiles[0] ? `initiatives/${initiativeFiles[0].name}` : null;
  const body = 'Entity: initiative/spike\nEntity: person/spike';
  const c1 = await commitOnBranch(dataHead, 'Spike: two files added, one removed', body, [['spike/a.json', fileA], ['spike/b.json', fileB]], victim ? [victim] : []);
  const commit = c1.json.data?.createCommitOnBranch?.commit;
  const aRest = await rest('GET', `contents/spike/a.json?ref=${SPIKE}`);
  const victimGone = victim ? (await rest('GET', `contents/${victim}?ref=${SPIKE}`)).status === 404 : 'n/a';
  report('Q3 createCommitOnBranch (2 adds + 1 delete)',
    `status ${c1.status}, ${c1.ms} ms, headers ${rateHeaders(c1.h)}`,
    `commit ${commit?.oid?.slice(0, 7)}, signature ${short(commit?.signature)}`,
    `message kept with trailers: ${commit?.message === `Spike: two files added, one removed\n\n${body}`} (${short(commit?.message)})`,
    `UTF-8 round trip: ${Buffer.from(aRest.json?.content ?? '', 'base64').toString('utf8') === fileA}`,
    `Contents sha equals locally computed blob sha (no re-download needed): ${aRest.json?.sha === blobSha(fileA)}`,
    `deleted file gone: ${victimGone}`,
    `errors ${short(c1.json.errors)}`);

  // Q3b — stale expectedHeadOid: how is it refused?
  const stale = await commitOnBranch(dataHead, 'Spike: stale', '', [['spike/c.json', '{}']]);
  report('Q3b stale expectedHeadOid', `HTTP ${stale.status}`, `errors ${short(stale.json.errors)}`, `data ${short(stale.json.data)}`);

  // Q3c — a deletion of a path that does not exist; an addition with a path outside any folder that exists
  const missing = await commitOnBranch(commit?.oid, 'Spike: delete missing', '', [], ['spike/nope.json']);
  report('Q3c delete a path that does not exist', `HTTP ${missing.status}`, `errors ${short(missing.json.errors)}`, `commit ${short(missing.json.data)}`);
  let tip = missing.json.data?.createCommitOnBranch?.commit?.oid ?? commit?.oid;

  // Q4c / Q6 — big files: payload limits on write, truncation on read
  for (const mb of [1, 5, 20, 40]) {
    const big = JSON.stringify({ pad: 'x'.repeat(mb * 1024 * 1024) });
    const w = await commitOnBranch(tip, `Spike: ${mb} MB file`, '', [['spike/big.json', big]]);
    const oid = w.json.data?.createCommitOnBranch?.commit?.oid;
    let read = 'not read';
    if (oid) {
      tip = oid;
      const r = await gql(`query { repository(owner: "${OWNER}", name: "${REPO}") { object(expression: "${oid}:spike/big.json") { ... on Blob { byteSize isTruncated text } } } }`);
      const b = r.json.data?.repository?.object;
      read = `read back: byteSize ${b?.byteSize}, isTruncated ${b?.isTruncated}, text length ${b?.text?.length ?? 'null'}`;
    }
    report(`Q6 ${mb} MB file`, `write HTTP ${w.status}, request ${(w.bytes / 1048576).toFixed(1)} MB, ${w.ms} ms, ok ${Boolean(oid)}`, `errors ${short(w.json.errors ?? w.json.raw)}`, read);
  }

  // Q6b — many files in one commit (the migration case): 210 small files
  const many = Array.from({ length: 210 }, (_, i) => [`spike/many/${i}.json`, JSON.stringify({ i, pad: 'y'.repeat(20000) })]);
  const m = await commitOnBranch(tip, 'Spike: 210 files', '', many);
  report('Q6b 210 files (~4 MB) in one commit', `HTTP ${m.status}, ${m.ms} ms, ok ${Boolean(m.json.data?.createCommitOnBranch?.commit)}`, `errors ${short(m.json.errors ?? m.json.raw)}`);

  // Q5 — what the budget looks like afterwards
  const after = await gql('query { rateLimit { cost limit remaining resetAt used } }');
  report('Q5 GraphQL budget after the spike', short(after.json.data?.rateLimit), `headers ${rateHeaders(after.h)}`);
} catch (error) {
  report('stopped', String(error));
} finally {
  if (spikeCreated) report('cleanup', `delete ${SPIKE}: ${(await rest('DELETE', `git/refs/heads/${SPIKE}`)).status}`);
}
