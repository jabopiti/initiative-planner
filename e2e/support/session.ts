import { expect, type Page } from '@playwright/test';

/** A made-up token: the fake GitHub accepts any value, and nothing here may look like a real one. */
export const FAKE_TOKEN = 'e2e-fake-token';

/** Opens the app and submits the fake token on the Connect screen, without waiting for the outcome. */
export async function enterToken(page: Page, options: { remember?: boolean } = {}) {
  await page.goto('/');
  await page.getByLabel('GitHub token').fill(FAKE_TOKEN);
  if (options.remember) await page.getByLabel('Remember me on this device').check();
  await page.getByRole('button', { name: 'Connect' }).click();
}

/** Connects and waits for the dataset to load. */
export async function connect(page: Page, options: { remember?: boolean } = {}) {
  await enterToken(page, options);
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

/** Adds a person on the People screen and waits until they are listed. */
export async function addPerson(page: Page, name: string) {
  await page.goto('/#/people');
  await page.getByLabel('Name').fill(name);
  await page.getByRole('button', { name: 'Add person' }).click();
  await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
}

/** Creates an initiative through the new-initiative form and waits for its page. */
export async function createInitiative(page: Page, name: string, team: string) {
  await page.goto('/#/initiatives/new');
  await page.getByLabel('Initiative name').fill(name);
  await page.getByRole('combobox', { name: 'Team' }).click();
  await page.getByRole('option', { name: team }).click();
  await page.getByRole('button', { name: 'Create initiative' }).click();
  await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible();
}

/** Unlocks the Settings section that is open (Settings sections with destructive or rarely-changed fields start locked). */
export async function unlockSettings(page: Page) {
  await page.getByRole('button', { name: 'Locked' }).click();
}

/** Fills the empty dataset with the brand pack's example teams, people and initiatives (Settings → Danger zone). */
export async function loadExampleData(page: Page) {
  await page.goto('/#/settings/danger-zone');
  await unlockSettings(page);
  await page.getByRole('button', { name: 'Load example data' }).click();
  await expect(page.getByRole('link', { name: 'Checkout Redesign' }).first()).toBeVisible();
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
