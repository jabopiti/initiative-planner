// Moves Vite's single produced HTML file to the shipped filename and clears
// the temporary build directory. Kept separate from vite.config.js so the
// dev server never touches the shipped artifact (DESIGN.md §1).
import { rename, rm, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const built = `${root}.build-tmp/index.html`;
const shipped = `${root}initiative-planner.html`;

try {
  await access(built);
} catch {
  console.error(`build failed: expected ${built} to exist`);
  process.exit(1);
}

await rename(built, shipped);
await rm(`${root}.build-tmp`, { recursive: true, force: true });
console.log('built initiative-planner.html');
