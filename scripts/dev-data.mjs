// Shared by the development-dataset scripts (`dev:reset-data`, `dev:seed-data`). The target is the
// brand pack's repo and data branch, and only that; the token comes from .env.local
// (VITE_DEV_TOKEN, via `node --env-file`) and is never printed. AGENTS.md ("Development data") is
// what allows these to run on this repo.
import { readFileSync } from 'node:fs';

const token = process.env.VITE_DEV_TOKEN;
if (!token) {
  console.error('VITE_DEV_TOKEN is not set (put it in .env.local).');
  process.exit(1);
}

const brand = readFileSync(new URL('../src/brand/defaultBrand.ts', import.meta.url), 'utf8');
const pick = (key) => brand.match(new RegExp(`${key}:\\s*'([^']+)'`))?.[1];
const [owner, repo, branch, api] = [pick('owner'), pick('repo'), pick('dataBranch'), pick('apiBaseUrl')];
if (!owner || !repo || !branch || !api || branch === 'main') {
  console.error('Could not determine a safe target from src/brand/defaultBrand.ts.');
  process.exit(1);
}

export const target = `${owner}/${repo}@${branch}`;

/** One GitHub Contents API call on the data branch; a missing file on GET is `null`. */
export async function call(method, path, body) {
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

export const readJson = (file) => (file ? JSON.parse(Buffer.from(file.content, 'base64').toString('utf8')) : null);

/** Writes a master file (or creates/replaces an initiative file) as compact JSON, in one commit. */
export async function writeJson(path, value, message) {
  const current = await call('GET', path);
  await call('PUT', path, { message, content: Buffer.from(JSON.stringify(value)).toString('base64'), sha: current?.sha });
}

/** Empties teams, people and memberships and deletes every initiative file; roles, countries and dataset.json stay. */
export async function resetDevData() {
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
}
