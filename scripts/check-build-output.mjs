// Fails when the build in dist/ breaks a §10.8 build-output rule. Run after `npm run build`.
import { readFileSync } from 'node:fs';
import { checkBuildOutput } from './buildOutput.mjs';

const brand = readFileSync(new URL('../src/brand/defaultBrand.ts', import.meta.url), 'utf8');
const apiBaseUrl = brand.match(/apiBaseUrl:\s*'([^']+)'/)?.[1];
if (!apiBaseUrl) {
  console.error('Could not read apiBaseUrl from src/brand/defaultBrand.ts.');
  process.exit(1);
}

const problems = checkBuildOutput(new URL('../dist', import.meta.url).pathname, { apiBaseUrl });
if (problems.length > 0) {
  console.error(`Build output breaks ${problems.length} rule(s):\n${problems.map((p) => `  ${p}`).join('\n')}`);
  process.exit(1);
}
console.log('Build output: policy present, no inline script, no eval, no third-party origin.');
