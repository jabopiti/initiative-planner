// Fails when a shipped dependency carries a licence outside the allowed list. Reads package-lock.json.
import { readFileSync } from 'node:fs';
import { ALLOWED_LICENSES, disallowedLicenses } from './licenses.mjs';

const lockfile = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'));
const problems = disallowedLicenses(lockfile);
if (problems.length > 0) {
  console.error(`Licences outside the allowed list (${[...ALLOWED_LICENSES].join(', ')}):\n${problems.map((p) => `  ${p}`).join('\n')}`);
  process.exit(1);
}
console.log('Licences: every shipped dependency is on the allowed list.');
