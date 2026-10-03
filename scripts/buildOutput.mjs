// The build-output rules of §10.8: the shipped files carry the content security policy, no inline script, no
// `eval` or `new Function`, and no third-party origin. A pure function over a directory, so tests can feed it
// a made-up build; scripts/check-build-output.mjs runs it on `dist`.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Origins that may appear as text in the shipped JavaScript without being loaded or contacted: XML namespaces and
 * documentation links that React and the UI libraries carry as strings. Anything else is reported, because an
 * origin the app can reach has to be the configured GitHub host and nothing more (§10.9).
 */
export const NAMESPACE_AND_DOC_ORIGINS = new Set([
  'http://www.w3.org',
  'https://www.w3.org',
  'https://react.dev',
  'https://reactjs.org',
  'https://github.com',
  'https://docs.github.com',
]);

function filesUnder(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? filesUnder(join(dir, entry.name)) : [join(dir, entry.name)]));
}

const EXCERPT = 60;
const excerpt = (text, index) => text.slice(Math.max(0, index - 20), index + EXCERPT).replace(/\s+/g, ' ');

const isAbsoluteUrl = (value) => /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(value) && !value.startsWith('data:');

/** Every violation in the build in `dir`, as `file: rule — excerpt` lines; empty when the build is clean. */
export function checkBuildOutput(dir, { apiBaseUrl }) {
  const apiOrigin = new URL(apiBaseUrl).origin;
  const problems = [];
  const report = (file, rule, text, index) => problems.push(`${file}: ${rule} — ${excerpt(text, index)}`);

  const html = readFileSync(join(dir, 'index.html'), 'utf8');
  const policies = [...html.matchAll(/<meta[^>]+http-equiv="Content-Security-Policy"[^>]*content="([^"]*)"/gi)];
  if (policies.length !== 1) problems.push(`index.html: expected one content security policy, found ${policies.length}`);
  else {
    const scriptSrc = policies[0][1].match(/script-src([^;]*)/)?.[1] ?? '';
    if (!scriptSrc.includes("'self'") || /'unsafe-(inline|eval)'/.test(scriptSrc)) problems.push(`index.html: script-src is not limited to 'self': ${scriptSrc.trim()}`);
    if (!policies[0][1].includes(`connect-src 'self' ${apiOrigin};`)) problems.push(`index.html: connect-src does not name only ${apiOrigin}`);
  }

  for (const file of filesUnder(dir)) {
    const name = file.slice(dir.length + 1);
    if (!/\.(html|js|mjs|css)$/.test(file)) continue;
    const text = readFileSync(file, 'utf8');

    if (name.endsWith('.html')) {
      for (const tag of text.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
        if (!/\bsrc=/.test(tag[1]) || tag[2].trim()) report(name, 'inline script', text, tag.index);
      }
      for (const tag of text.matchAll(/<(?:script|link|img|iframe|source)\b[^>]*\b(?:src|href)="([^"]*)"/gi)) {
        if (isAbsoluteUrl(tag[1])) report(name, 'third-party resource', text, tag.index);
      }
      for (const handler of text.matchAll(/\son[a-z]+="/gi)) report(name, 'inline event handler', text, handler.index);
    }

    if (name.endsWith('.css')) {
      for (const ref of text.matchAll(/(?:@import\s*(?:url\()?|url\()\s*["']?([^"')\s]+)/gi)) {
        if (isAbsoluteUrl(ref[1])) report(name, 'third-party resource', text, ref.index);
      }
    }

    if (/\.m?js$/.test(name)) {
      for (const hit of text.matchAll(/(?<![\w$.])eval\s*\(/g)) report(name, 'eval', text, hit.index);
      for (const hit of text.matchAll(/new\s+Function\s*\(/g)) report(name, 'new Function', text, hit.index);
      for (const hit of text.matchAll(/https?:\/\/[^\s"'`\\/)<>]+/g)) {
        const origin = new URL(hit[0]).origin;
        if (origin !== apiOrigin && !NAMESPACE_AND_DOC_ORIGINS.has(origin)) report(name, 'third-party origin', text, hit.index);
      }
    }
  }
  return problems;
}
