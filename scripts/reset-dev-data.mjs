// Resets the development dataset: empties teams, people and memberships and deletes every
// initiative file on the data branch, keeping roles, countries and dataset.json.
// Run with `npm run dev:reset-data`; the token comes from .env.local (VITE_DEV_TOKEN) and is
// never printed. AGENTS.md ("Development data") is what allows this to run on this repo.
import { readFileSync } from 'node:fs';

const token = process.env.VITE_DEV_TOKEN;
if (!token) {
  console.error('VITE_DEV_TOKEN is not set (put it in .env.local).');
  process.exit(1);
}

// Target = the brand pack's repo and data branch, and only that.
const brand = readFileSync(new URL('../src/brand/defaultBrand.ts', import.meta.url), 'utf8');
const pick = (key) => brand.match(new RegExp(`${key}:\\s*'([^']+)'`))?.[1];
const [owner, repo, branch, api] = [pick('owner'), pick('repo'), pick('dataBranch'), pick('apiBaseUrl')];
if (!owner || !repo || !branch || !api || branch === 'main') {
  console.error('Could not determine a safe target from src/brand/defaultBrand.ts.');
  process.exit(1);
}

async function call(method, path, body) {
  const query = method === 'GET' ? `?ref=${branch}` : '';
  const res = await fetch(`${api}/repos/${owner}/${repo}/contents/${path}${query}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    body: body && JSON.stringify({ ...body, branch }),
  });
  if (res.status === 404 && method === 'GET') return null;
  if (!res.ok) throw new Error(`${method} ${path} failed: ${res.status}`);
  return res.json();
}

console.log(`Resetting ${owner}/${repo}@${branch}`);

for (const file of ['teams.json', 'people.json', 'memberships.json']) {
  const current = await call('GET', file);
  if (!current) continue;
  if (Buffer.from(current.content, 'base64').toString('utf8').trim() === '[]') continue;
  await call('PUT', file, { message: `${file.replace('.json', '')}: reset for development`, content: Buffer.from('[]').toString('base64'), sha: current.sha });
  console.log(`emptied ${file}`);
}

const initiatives = await call('GET', 'initiatives');
for (const entry of Array.isArray(initiatives) ? initiatives : []) {
  await call('DELETE', entry.path, { message: `${entry.name}: removed for development reset`, sha: entry.sha });
  console.log(`deleted ${entry.path}`);
}
console.log('Done.');
