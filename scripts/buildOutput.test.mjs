import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkBuildOutput } from './buildOutput.mjs';

const API = 'https://api.github.com';
const CSP = `default-src 'self'; script-src 'self'; connect-src 'self' ${API}; object-src 'none'`;
const PAGE = `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="${CSP}" /><title>x</title>
<script type="module" src="./assets/index.js"></script><link rel="stylesheet" href="./assets/index.css"></head><body></body></html>`;

/** A made-up build in a temp directory: `files` are written under it, `index.html` defaults to a clean page. */
function build(files = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'build-output-'));
  mkdirSync(join(dir, 'assets'));
  const all = { 'index.html': PAGE, 'assets/index.js': 'console.log(1)', 'assets/index.css': 'body{color:red}', ...files };
  for (const [name, content] of Object.entries(all)) writeFileSync(join(dir, name), content);
  return dir;
}
const check = (files) => checkBuildOutput(build(files), { apiBaseUrl: API });

describe('checkBuildOutput (§10.8 build output)', () => {
  it('passes a clean build, whose JavaScript may name the API host and a namespace', () => {
    expect(check({ 'assets/index.js': `fetch("${API}/user");var ns="http://www.w3.org/2000/svg";` })).toEqual([]);
  });

  it('reports a page without the policy', () => {
    expect(check({ 'index.html': PAGE.replace(/<meta[^>]*>/, '') })).toEqual(['index.html: expected one content security policy, found 0']);
  });

  it('reports a policy that allows inline script or another connect host', () => {
    const unsafe = PAGE.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'");
    expect(check({ 'index.html': unsafe }).join()).toContain('script-src is not limited');
    expect(check({ 'index.html': PAGE.replace(API, 'https://evil.example') }).join()).toContain('connect-src does not name only');
  });

  it('reports an inline script and an inline event handler', () => {
    const problems = check({ 'index.html': PAGE.replace('</body>', '<script>alert(1)</script><a onclick="x()">a</a></body>') });
    expect(problems.map((p) => p.split(' — ')[0])).toEqual(['index.html: inline script', 'index.html: inline event handler']);
  });

  it('reports an inline script whose end tag has a space, which browsers still accept', () => {
    expect(check({ 'index.html': PAGE.replace('</body>', '<script>alert(1)</script ></body>') }).join()).toContain('inline script');
  });

  it('reports a script, stylesheet or font loaded from another origin', () => {
    const page = PAGE.replace('./assets/index.js', 'https://cdn.example/lib.js');
    expect(check({ 'index.html': page }).join()).toContain('third-party resource');
    expect(check({ 'assets/index.css': '@import url("https://fonts.example/a.css");' }).join()).toContain('third-party resource');
    expect(check({ 'assets/index.css': '@font-face{src:url(//fonts.example/a.woff2)}' }).join()).toContain('third-party resource');
    expect(check({ 'assets/index.css': '@font-face{src:url(./a.woff2)}.x{background:url(data:image/png;base64,AA)}' })).toEqual([]);
  });

  it('reports eval and new Function, but not a property or a word that merely ends in eval', () => {
    expect(check({ 'assets/index.js': 'var a=eval("1");' }).join()).toContain('eval');
    expect(check({ 'assets/index.js': 'var f=new Function("return 1");' }).join()).toContain('new Function');
    expect(check({ 'assets/index.js': 'x.eval(1);retrieval(2);' })).toEqual([]);
  });

  it('reports an origin in the JavaScript that is neither the API host nor a known namespace', () => {
    expect(check({ 'assets/index.js': 'fetch("https://tracker.example/collect")' }).join()).toContain('third-party origin');
  });
});
