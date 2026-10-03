import { expect, test } from '@playwright/test';
import { fakeGithub } from './support/fakeGithub';
import { connect } from './support/session';

// jsdom doesn't enforce CSP, so this is the only place a policy violation
// (inline script, eval, blocked style/font) in the shipped build would show.
test('production build renders under the strict CSP with no violations', async ({ page }) => {
  const problems: string[] = [];
  page.on('console', (msg) => {
    // frame-ancestors can't be set from a <meta> tag (GitHub Pages sends no
    // headers), so the browser always logs this one known notice.
    if (msg.type() === 'error' && !msg.text().includes("'frame-ancestors' is ignored")) problems.push(msg.text());
  });
  page.on('pageerror', (err) => problems.push(err.message));

  await page.goto('/');

  await expect(page.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveCount(1);
  await expect(page.locator('#root')).not.toBeEmpty();
  expect(problems).toEqual([]);
});

// §10.9: the brand typeface is bundled, so the only host the app talks to besides its own origin is the GitHub API.
test('production build loads its typeface from its own origin and requests no other host but the GitHub API', async ({ page, baseURL }) => {
  const urls: string[] = [];
  page.on('request', (request) => urls.push(request.url()));
  await fakeGithub(page).install();
  await connect(page);

  const origin = new URL(baseURL!).origin;
  await expect.poll(() => urls.some((u) => u.startsWith(origin) && u.endsWith('.woff2'))).toBe(true);
  expect([...new Set(urls.map((u) => new URL(u).origin))].sort()).toEqual([origin, 'https://api.github.com'].sort());
});
