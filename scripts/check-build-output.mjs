// Fails when the build in dist/ breaks a §10.8 build-output rule. Run after `npm run build`.
import { brandValue } from './brandValue.mjs';
import { checkBuildOutput } from './buildOutput.mjs';

const apiBaseUrl = brandValue('apiBaseUrl');
if (!apiBaseUrl) {
  console.error('Could not read apiBaseUrl from brand/brand.ts.');
  process.exit(1);
}

const problems = checkBuildOutput(new URL('../dist', import.meta.url).pathname, { apiBaseUrl });
if (problems.length > 0) {
  console.error(`Build output breaks ${problems.length} rule(s):\n${problems.map((p) => `  ${p}`).join('\n')}`);
  process.exit(1);
}
console.log('Build output: policy present, no inline script, no eval, no third-party origin.');
