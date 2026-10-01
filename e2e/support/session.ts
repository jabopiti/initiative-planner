import { expect, type Page } from '@playwright/test';

/** A made-up token: the fake GitHub accepts any value, and nothing here may look like a real one. */
export const FAKE_TOKEN = 'e2e-fake-token';

/** Opens the app, pastes a token on the Connect screen and waits for the dataset to load. */
export async function connect(page: Page, options: { remember?: boolean } = {}) {
  await page.goto('/');
  await page.getByLabel('GitHub token').fill(FAKE_TOKEN);
  if (options.remember) await page.getByLabel('Remember me on this device').check();
  await page.getByRole('button', { name: 'Connect' }).click();
  await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible();
}

/** Adds a team through the Teams overview and waits until it is listed. */
export async function createTeam(page: Page, name: string) {
  await page.goto('/#/teams');
  // Until the dataset has loaded the top bar's button reads "Create a team" too, so wait for the page itself.
  const empty = page.getByText('No teams yet');
  await empty.or(page.getByRole('heading', { name: 'Teams', level: 1 })).waitFor();
  if (await empty.isVisible()) await page.getByRole('button', { name: 'Create a team' }).last().click();
  else await page.getByRole('button', { name: 'New team' }).click();
  await page.getByPlaceholder('Team name').fill(name);
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByRole('link', { name })).toBeVisible();
}

/**
 * Collects every Content-Security-Policy violation the page reports while a flow runs. The CSP test only sees
 * the first render; selects, popovers and toasts are where an inline style or script would be blocked later.
 * (The `frame-ancestors` notice is the one the browser always logs for a <meta> policy.)
 */
export function watchCspViolations(page: Page): string[] {
  const violations: string[] = [];
  page.on('console', (msg) => {
    const text = msg.text();
    if (msg.type() === 'error' && /Content Security Policy|Refused to/.test(text) && !text.includes("'frame-ancestors' is ignored")) violations.push(text);
  });
  return violations;
}
