import { expect, test } from '@playwright/test';
import { fakeGithub } from './support/fakeGithub';
import { connect, createTeam, watchCspViolations } from './support/session';

interface StoredInitiative {
  name: string;
  description?: string;
  teamId: string;
  status: string;
}

test('a team, a person and an initiative are created, saved to the repository and still there after a reload', async ({ page }) => {
  const github = fakeGithub(page);
  const csp = watchCspViolations(page);
  await github.install();
  await connect(page);

  await createTeam(page, 'Platform');
  // The screen updates first and the commit follows, so wait for the repository rather than read it at once.
  await expect.poll(() => github.read<{ name: string }[]>('teams.json')?.map((t) => t.name)).toEqual(['Platform']);

  await page.goto('/#/people');
  await page.getByLabel('Name').fill('Mara Voss');
  await page.getByRole('button', { name: 'Add person' }).click();
  await expect(page.getByRole('button', { name: 'Mara Voss', exact: true })).toBeVisible();
  await expect.poll(() => github.read<{ name: string }[]>('people.json')?.map((p) => p.name)).toEqual(['Mara Voss']);

  await page.goto('/#/initiatives');
  await page.getByRole('button', { name: 'Create your first initiative' }).click();
  await page.getByLabel('Initiative name').fill('Checkout Redesign');
  await page.getByRole('combobox', { name: 'Team' }).click();
  await page.getByRole('option', { name: 'Platform' }).click();
  await page.getByRole('button', { name: 'Create initiative' }).click();

  await expect(page.getByRole('heading', { name: 'Checkout Redesign', level: 1 })).toBeVisible();
  await expect.poll(() => github.paths('initiatives/').length).toBe(1);
  const [path] = github.paths('initiatives/');
  expect(github.read<StoredInitiative>(path)).toMatchObject({ name: 'Checkout Redesign', status: 'Active' });
  expect(github.writes.at(-1)).toEqual({ path, message: 'Checkout Redesign: created' });

  // A reload starts the app from the repository alone: everything above has to come back from there.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Checkout Redesign', level: 1 })).toBeVisible();
  await page.goto('/#/initiatives');
  await expect(page.getByRole('link', { name: 'Checkout Redesign' })).toBeVisible();
  await page.goto('/#/people');
  await expect(page.getByRole('button', { name: 'Mara Voss', exact: true })).toBeVisible();
  expect(csp).toEqual([]);
});

test('renaming an initiative and describing it are committed to its file', async ({ page }) => {
  const github = fakeGithub(page);
  const csp = watchCspViolations(page);
  await github.install();
  await connect(page);
  await createTeam(page, 'Platform');

  await page.goto('/#/initiatives/new');
  await page.getByLabel('Initiative name').fill('Checkout Redesign');
  await page.getByRole('combobox', { name: 'Team' }).click();
  await page.getByRole('option', { name: 'Platform' }).click();
  await page.getByRole('button', { name: 'Create initiative' }).click();
  await expect(page.getByRole('heading', { name: 'Checkout Redesign', level: 1 })).toBeVisible();
  await expect.poll(() => github.paths('initiatives/').length).toBe(1);
  const [path] = github.paths('initiatives/');

  await page.getByLabel('Initiative name').fill('Checkout Rebuild');
  await page.getByLabel('Description').fill('Cut abandonment in the payment step.');
  await page.getByLabel('Description').blur();

  await expect.poll(() => github.read<StoredInitiative>(path)).toMatchObject({
    name: 'Checkout Rebuild',
    description: 'Cut abandonment in the payment step.',
  });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Checkout Rebuild', level: 1 })).toBeVisible();
  await expect(page.getByLabel('Description')).toHaveValue('Cut abandonment in the payment step.');
  expect(csp).toEqual([]);
});
