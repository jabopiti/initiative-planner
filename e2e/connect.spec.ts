import { expect, test } from '@playwright/test';
import { fakeGithub } from './support/fakeGithub';
import { connect, enterToken, FAKE_TOKEN } from './support/session';

test('connecting to an empty repository sets up the dataset and opens the app', async ({ page }) => {
  const github = fakeGithub(page, { login: 'ada' });
  await github.install();

  await connect(page);

  await expect(page.getByRole('heading', { name: /^Welcome to/ })).toBeVisible();
  // First write-capable client creates the baseline (§3): flags, roles, countries and the empty lists.
  expect(github.paths()).toEqual(['dataset.json', 'roles.json', 'countries.json', 'teams.json', 'people.json', 'memberships.json']);
  expect(github.read<unknown[]>('roles.json')?.length).toBeGreaterThan(0);

  await page.goto('/#/settings/connection');
  await expect(page.getByText('ada')).toBeVisible();
});

test('a token GitHub rejects keeps the Connect screen and says so', async ({ page }) => {
  await fakeGithub(page, { rejectedTokens: [FAKE_TOKEN] }).install();

  await enterToken(page);

  await expect(page.getByRole('alert')).toContainText("GitHub doesn't accept this token. It has probably expired or been revoked");
  await expect(page.getByRole('link', { name: /Create a new token/ })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Primary' })).toHaveCount(0);
});

test('"Remember me" survives a reload and Disconnect forgets it', async ({ page, context }) => {
  await fakeGithub(page).install();

  await connect(page, { remember: true });
  await page.reload();
  await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible();

  // Disconnect clears the remembered token: the next visit starts at the Connect screen again.
  await page.goto('/#/settings/connection');
  await page.getByRole('button', { name: 'Disconnect' }).click();
  await expect(page.getByLabel('GitHub token')).toBeVisible();
  const fresh = await context.newPage();
  await fakeGithub(fresh).install();
  await fresh.goto('/');
  await expect(fresh.getByLabel('GitHub token')).toBeVisible();
});

test('a classic token opens the app with the warning banner until it is dismissed, also after a reload', async ({ page }) => {
  await fakeGithub(page, { classicTokens: [FAKE_TOKEN] }).install();

  await connect(page);

  const banner = page.getByRole('status').filter({ hasText: 'a classic token reaches all your repositories' });
  await expect(banner).toBeVisible();
  await expect(banner.getByRole('link', { name: /Create a fine-grained one/ })).toBeVisible();

  await page.reload();
  await expect(banner).toBeVisible();

  await banner.getByRole('button', { name: 'Dismiss' }).click();
  await expect(banner).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible();
  await expect(banner).toHaveCount(0);
});
