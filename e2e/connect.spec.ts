import { expect, test } from '@playwright/test';
import { fakeGithub } from './support/fakeGithub';
import { connect, FAKE_TOKEN } from './support/session';

test('connecting to an empty repository sets up the dataset and opens the app', async ({ page }) => {
  const github = fakeGithub(page, { login: 'ada' });
  await github.install();

  await connect(page);

  await expect(page.getByText('No initiatives yet')).toBeVisible();
  // First write-capable client creates the baseline (§3): flags, roles, countries and the empty lists.
  expect(github.paths()).toEqual(['dataset.json', 'roles.json', 'countries.json', 'teams.json', 'people.json', 'memberships.json']);
  expect(github.read<unknown[]>('roles.json')?.length).toBeGreaterThan(0);

  await page.goto('/#/settings/connection');
  await expect(page.getByText('ada')).toBeVisible();
});

test('a token GitHub rejects keeps the Connect screen and says so', async ({ page }) => {
  await fakeGithub(page, { rejectedTokens: [FAKE_TOKEN] }).install();

  await page.goto('/');
  await page.getByLabel('GitHub token').fill(FAKE_TOKEN);
  await page.getByRole('button', { name: 'Connect' }).click();

  await expect(page.getByRole('alert')).toHaveText("GitHub doesn't accept this token.");
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
