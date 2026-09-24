import { expect, test } from '@playwright/test';

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
